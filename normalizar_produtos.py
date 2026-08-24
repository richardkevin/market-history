import difflib
import re
import shutil
import sqlite3
import unicodedata
from collections import Counter
from pathlib import Path

DB = Path("encartes_produtos.db")

PARTICULAS = {
    "de", "da", "do", "das", "dos", "em", "com", "para", "por", "ou",
    "na", "no", "nas", "nos", "ao", "aos", "sem", "ate", "até",
    "s/", "c/", "p/", "é", "e",
}
UNIDADES = {"g", "kg", "mg", "ml", "cl", "cm", "mm", "l", "un", "unids"}
TAMANHOS = {"p", "m", "g", "gg", "xg", "xxg", "rn", "tp"}
ACRONIMOS = {"sos", "s.o.s", "tv", "pa", "p.a", "ii", "iii", "iv", "vi", "hd"}

RE_VOLUME_FIM = re.compile(r"\s*\d+(?:[.,]\d+)?\s*(?:ml|l|kg|g|un)\s*$", re.IGNORECASE)
RE_MARCADOR_OUTLIER = re.compile(r"\[Outlier:[^\]]*\]\s*")

MARCA_FIX = {
    "n/a": None,
    "na": None,
    "-": None,
    "jó jóia": "Jóia",
    "pom pom": "Pompom",
    "pompom": "Pompom",
    "baby ruth care": "Ruth Care",
    "ruth": "Ruth Care",
    "rochester": "Richester",
    "lord cool": "Lord",
    "nissin lámen": "Nissin",
    "nissin lamen": "Nissin",
    "camplista": "Campista",
    "dhfish": "DH Fish",
}

PALAVRAS_GENERICAS = {
    "secar", "branco", "mega", "jumbo", "jumbinho", "pacote", "pacotão",
    "kit", "light", "fit", "granja", "care", "supreme", "premium", "baby",
    "kids", "doypack", "mac", "natural", "carne", "frango", "leve",
    "pague", "bandeja", "peça", "pedaço", "cartela", "long neck", "refil",
    "combo", "trio", "unidade", "unidades", "fraldas", "descartáveis",
}


def limpar_espacos(s):
    return re.sub(r"\s+", " ", s or "").strip()


def corrigir_decimais(s):
    return re.sub(r"(?<=\d)\.(?=\d)", ",", s)


def capitalizar_token(tok):
    m = re.search(r"[^\W\d_]", tok)
    if not m:
        return tok
    i = m.start()
    return tok[:i] + tok[i].upper() + tok[i + 1:].lower()


def token_normalizado(tok, primeiro=False):
    low = tok.lower()
    if re.search(r"\d", tok):
        def baixa_unid(m):
            unid = m.group(2).lower()
            if unid == "l":
                return m.group(0)
            return m.group(1) + unid
        tok = re.sub(r"([\d.,]+)([A-Za-zÀ-ÿ]+)", baixa_unid, tok)
        return tok
    if low == "l" and not primeiro:
        return tok.upper()
    if low in TAMANHOS:
        return tok.upper()
    if low in UNIDADES and not primeiro:
        return low
    if low in PARTICULAS and not primeiro:
        return low
    if low in ACRONIMOS and len(low) >= 2:
        return tok.upper()
    if len(tok) > 2 and tok.isupper() and tok.isalpha():
        return capitalizar_token(tok.lower())
    out = capitalizar_token(tok) if (tok.islower() or tok.isupper()) else tok
    if "-" in out:
        partes = out.split("-")
        corrigidas = []
        for j, p in enumerate(partes):
            if not p:
                corrigidas.append(p)
                continue
            if j > 0 and p.lower() in PARTICULAS_HIFEN and p[0].isalpha():
                corrigidas.append(p.lower())
            elif p[0].isalpha():
                corrigidas.append(p[0].upper() + p[1:])
            else:
                corrigidas.append(p)
        out = "-".join(corrigidas)
    return out


def title_pt(s):
    s = limpar_espacos(corrigir_decimais(s))
    if not s:
        return s
    tokens = [token_normalizado(t, i == 0) for i, t in enumerate(s.split(" "))]
    out = " ".join(tokens)
    if out and out[0].isalpha() and out[0].islower():
        out = out[0].upper() + out[1:]
    return out


def normalizar_marca_bruta(marca):
    marca = limpar_espacos(marca).strip(",;/-")
    if not marca:
        return None
    cf = marca.casefold()
    if cf in MARCA_FIX:
        mapped = MARCA_FIX[cf]
        return limpar_espacos(mapped) if mapped else None
    if marca.isupper() or marca.islower():
        marca = title_pt(marca)
    return marca


def dividir_familias(marca):
    partes = re.split(r"\s*/\s*|\s+ou\s+|\s*,\s*|\s*&\s*", marca)
    return [limpar_espacos(p).strip(",;") for p in partes if limpar_espacos(p)]


def regex_marca(frase):
    palavras = [re.escape(w) for w in frase.split()]
    corpo = r"[\s]+".join(palavras)
    return re.compile(rf"(?<!\w){corpo}(?!\w)", re.IGNORECASE)


CONECTIVOS_FIM = {"ou", "e", "de", "da", "do", "com", "s/", "c/", "/", ","}

DESCRITORES_ACUCAR = {"refinado", "refinada", "especial", "extra", "fino"}

PARTICULAS_HIFEN = {"do", "da", "de", "dos", "das", "e"}

SUBSTITUICOES = [
    (re.compile(r"(?<=\d)-(?=\d)"), ","),
    (re.compile(r"\s*/\s*"), "/"),
    (re.compile(r"\bc/(?=\d)"), "c/ "),
    (re.compile(r"\bs/(?=\S)"), "s/ "),
    (re.compile(r"\bp/(?=\S)"), "p/ "),
    (re.compile(r"\b[Aa]eros[s]?ol\b"), "Aerossol"),
    (re.compile(r"\bp/[Mm]icro\s?-?[Oo]ndas\b"), "p/ Micro-Ondas"),
    (re.compile(r"\bMicroondas\b"), "Micro-Ondas"),
    (re.compile(r"\bCoxinhas da Asas\b|\bCoxinha das Asas\b"), "Coxinhas das Asas"),
    (re.compile(r"\bCoxas de Frango\b"), "Coxa de Frango"),
    (re.compile(r"\bPipocas para Micro-Ondas\b"), "Pipoca para Micro-Ondas"),
    (re.compile(r"\bSardinhas com Óleo\b"), "Sardinha com Óleo"),
    (re.compile(r"\bBolinhos de Bacalhau\b"), "Bolinho de Bacalhau"),
    (re.compile(r"\bTirinhas Tradicional\b"), "Tirinha Tradicional"),
    (re.compile(r"\bFralda\b(?!s)"), "Fraldas"),
    (re.compile(r"\bSeivas do Campo\b"), "Seiva do Campo"),
    (re.compile(r"\bDeomilk\b"), "Deo Milk"),
    (re.compile(r"\bDhfish\b"), "Dh Fish"),
    (re.compile(r"\bAlpin\b"), "Alpino"),
    (re.compile(r"\bPelouch\b"), "Pelouche"),
    (re.compile(r"\bMatte\b"), "Mate"),
    (re.compile(r"\bContra Filé\b"), "Contrafilé"),
    (re.compile(r"\bKera Form\b"), "Keraform"),
    (re.compile(r"\bSuperSeca\b"), "Supersec"),
    (re.compile(r"\bMohua\b"), "Morhua"),
    (re.compile(r"\bDmas\b"), "Dmais"),
    (re.compile(r"\bFiesta\b"), "Festa"),
    (re.compile(r"\bMantega\b"), "Manteiga"),
    (re.compile(r"\bSaith\b"), "Saithe"),
    (re.compile(r"\bPerfeito Brut\b"), "Perfetto Brut"),
    (re.compile(r"\bSense ou Caipirinha\b"), "Senses ou Caipirinha"),
    (re.compile(r"\bYo Pro\b"), "YoPRO"),
    (re.compile(r"\bCremossíssimo\b"), "Cremosíssimo"),
    (re.compile(r"\bAssaduras Amêndoa\b"), "Assaduras Amêndoas"),
    (re.compile(r"[()]"), ""),
    (re.compile(r"\s+,(\s,)"), r"\1"),
    (re.compile(r"\s+,"), ","),
    (re.compile(r",\s*,"), ","),
    (re.compile(r"\+(?=\s*\d)"), ""),
    (re.compile(r"(?<=\d)(?=[Uu]nids?\b)"), " "),
    (re.compile(r"\b[Uu]nidades?\b|\b[Uu]nids\.?|\b[Uu]nid\b|\bun\b"), "Unids."),
    (re.compile(r"\bTipo\s+(?!A\b|Único\b)"), ""),
    (re.compile(r"\bExtravirgem\b"), "Extra Virgem"),
    (re.compile(r"\bMucarela\b|\bMussarela\b"), "Muçarela"),
    (re.compile(r"\bMinasa\b"), "Minas"),
    (re.compile(r"\bMonteninas\b"), "Monteminas"),
    (re.compile(r"\bLâmen\b|\bLamen\b"), "Lámen"),
    (re.compile(r"\bCicatrí\b"), "Cicatri"),
    (re.compile(r"\bHâmburguer\b"), "Hambúrguer"),
    (re.compile(r"\bLatao\b"), "Latão"),
    (re.compile(r"\bRose\b"), "Rosé"),
    (re.compile(r"\bTempurá\b"), "Tempura"),
    (re.compile(r"\bCentenario\b"), "Centenário"),
    (re.compile(r"\bAmendoas\b"), "Amêndoas"),
    (re.compile(r"\bMaça\b"), "Maçã"),
    (re.compile(r"\bAgüinha\b"), "Aguinha"),
    (re.compile(r"\bSemola\b"), "Sêmola"),
    (re.compile(r"\bLinguica\b"), "Linguiça"),
    (re.compile(r"\bCafé Pele\b"), "Café Pelé"),
    (re.compile(r"\bPresident\b"), "Président"),
    (re.compile(r"\bTrad\b(?!\.)"), "Trad."),
    (re.compile(r"\bD\.o\.c\.?(?=\s|$)"), "D.o.c."),
    (re.compile(r"\bLava Roupas\b"), "Lava-Roupas"),
    (re.compile(r"\bLimpa Vidros\b"), "Limpa-Vidros"),
    (re.compile(r"\bLustra Móveis\b"), "Lustra-Móveis"),
]

FRASE_FIX = {
    "Lava-Roupas Líquido Odd ou 3 Litros": "Lava-Roupas Líquido Odd ou Uau 3 Litros",
    "Lava-Roupas Líquido ou Odd 3 Litros": "Lava-Roupas Líquido Odd ou Uau 3 Litros",
    "Azeite Extravirgem O-Live ou 400ml": "Azeite Extravirgem O-Live ou Gallo 400ml",
}

# Preço de unidade explícito informado pelo encarte (ex.: "Cada unidade sai por 2,09").
# Exige menção a unidade para não pegar notas de conteúdo ("embalagem 1kg sai por")
# nem promos de volume ("Leve 1 Pague 750ml").
RE_SAI_POR_UNIDADES = [
    re.compile(r"(?:cada\s+)?uni[dv](?:ade)?s?\.?,?\s+sai\w*\s+por\s+(?:R\$\s*)?([\d.,]+)", re.I),
    re.compile(r"pre[çc]o\s+unit[áa]rio\b[\w\s]{0,30}?sai\w*\s+por\s+(?:R\$\s*)?([\d.,]+)", re.I),
    re.compile(r"sai\w*\s+por\s+(?:R\$\s*)?([\d.,]+)\s*a\s*unidad", re.I),
]
MARCADOR_DIVISAO = "[Divisão embalagem]"
VOLUME_PROMO_RX = re.compile(r"\bp?ague?\s+\d+[.,]?\d*\s*(ml|l\b|litro)", re.I)
RE_LEVE_PAGUE = re.compile(r"\bleve\s+(\d{1,2})\s+pague\s+(\d{1,2})\b", re.I)
# contagem declarada na embalagem: "c/ 6 Unids.", "Pack c/ 18 Unids.", "Kit 3 Unids."
RE_N_EMBALAGEM = re.compile(r"(?:c/\s*)?(\d{1,2})\s*unids?\b", re.I)
RE_COUNT_MEDIDA = re.compile(r"c?/?\s*\d{1,2}\s*unids?\b\.?|leve\s+\d{1,2}\s+pague\s+\d{1,2}", re.I)
RE_PALAVRA_PACK = re.compile(r"\b(?:pack|kit|cartela)\b", re.I)


def limpar_medida_multipack(medida):
    """Remove a contagem do pack da medida (ex.: 'C/4 Unids.' -> None,
    'Pack c/ 18 Unids. 350ml' -> '350ml') para o cliente não dividir 2x."""
    if not medida:
        return medida
    novo = RE_COUNT_MEDIDA.sub(" ", medida)
    novo = RE_PALAVRA_PACK.sub(" ", novo)
    novo = re.sub(r"\(\s*\)", " ", novo)
    novo = limpar_espacos(novo).strip(",;/-")
    return novo or None


def parse_preco_br(s):
    try:
        return float(s.replace(".", "").replace(",", ".")) if "," in s else float(s)
    except ValueError:
        return None


def dividir_precos_embalagem(conn):
    """Divide preco (e preco_clube proporcional) quando o encarte informa o
    preço por unidade de um multipack ex.: embalagem com 6 lámens por R$ 12,54,
    "cada unid. sai por 2,09" -> preco vira 2,09 e a observacao documenta a troca."""
    rows = conn.execute(
        "SELECT id, produto, preco, preco_clube, observacao, tipo_promocao "
        "FROM produtos WHERE tipo_promocao LIKE '%sai por%' OR observacao LIKE '%sai por%'"
    ).fetchall()

    backup = DB.with_suffix(".precos_embalagem.backup.db")
    if not backup.exists():
        shutil.copy2(DB, backup)
        print(f"Backup dedicado: {backup}")

    stats = Counter()
    updates = []
    for rid, prod, preco, clube, obs, promo in rows:
        if preco is None or (obs and MARCADOR_DIVISAO in obs):
            continue
        texto = f"{obs or ''} {promo or ''}"
        if VOLUME_PROMO_RX.search(texto):
            continue
        m = next((mm for rx in RE_SAI_POR_UNIDADES for mm in [rx.search(texto)] if mm), None)
        if not m:
            continue
        unit = parse_preco_br(m.group(1))
        if not unit or unit <= 0 or unit >= preco * 0.98:
            continue
        n = preco / unit
        if not (2 <= n <= 60) or abs(n - round(n)) > max(0.08, n * 0.03):
            continue
        n_int = round(n)
        novo_obs = (
            f"{MARCADOR_DIVISAO} embalagem c/ {n_int} unids.: R$ {preco:.2f} -> R$ {unit:.2f}. "
            + (obs or "")
        ).strip()
        novo_clube = round(clube / n_int, 2) if clube is not None else None
        updates.append((round(unit, 2), novo_clube, novo_obs[:1000], rid))
        stats[f"dividido_por_{n_int}"] += 1
        print(f"  divisao: {prod[:45]} | {preco:.2f}/{n_int} = {unit:.2f}"
              + (f" (clube {clube:.2f} -> {novo_clube:.2f})" if clube is not None else ""))

    if updates:
        with conn:
            conn.executemany(
                "UPDATE produtos SET preco=?, preco_clube=?, observacao=? WHERE id=?",
                updates,
            )
    print(f"Registros com preco dividido: {len(updates)}")
    return len(updates)


def corrigir_medida_divididas(conn):
    """Registros já divididos cuja medida ainda traz a contagem do pack
    ('C/4 Unids.') fariam o cliente dividir o preço 2x — limpa a medida."""
    rows = conn.execute(
        "SELECT id, medida FROM produtos WHERE observacao LIKE ? AND medida IS NOT NULL",
        (MARCADOR_DIVISAO + "%",),
    ).fetchall()
    updates = []
    for rid, med in rows:
        nova = limpar_medida_multipack(med)
        if nova != med:
            updates.append((nova, rid))
            print(f"  medida corrigida: '{med}' -> '{nova}'")
    if updates:
        with conn:
            conn.executemany("UPDATE produtos SET medida=? WHERE id=?", updates)
    print(f"Medidas de registros divididos corrigidas: {len(updates)}")
    return len(updates)


def dividir_multipacks_por_nome(conn):
    """Terceira passada: multipacks sem preço unitário informado, mas com a
    quantidade declarada no próprio nome/medida ('Pack c/ 6 Unids.', 'Kit 3
    Unids.') ou no promo 'Leve N Pague M'. Valida contra o mínimo histórico
    do próprio produto para não dividir preços que já eram unitários."""
    rows = conn.execute(
        "SELECT id, produto, medida, preco, preco_clube, observacao, tipo_promocao "
        "FROM produtos WHERE erro_identificacao=0"
    ).fetchall()
    stats = Counter()
    updates = []
    for rid, prod, med, preco, clube, obs, promo in rows:
        if preco is None or (obs and MARCADOR_DIVISAO in obs):
            continue
        texto_promo = f"{promo or ''} {obs or ''}"
        low = texto_promo.lower()
        if "sai por" in low or VOLUME_PROMO_RX.search(texto_promo):
            continue
        n = None
        origem_leve = False
        m_nome = RE_N_EMBALAGEM.search(f"{prod or ''} {med or ''}")
        if m_nome:
            n = int(m_nome.group(1))
        else:
            m_leve = RE_LEVE_PAGUE.search(texto_promo)
            if m_leve and int(m_leve.group(2)) >= 2:
                n = int(m_leve.group(1))
                origem_leve = True
        if not n or not (2 <= n <= 24):
            continue
        irmaos = conn.execute(
            "SELECT id, preco, COALESCE(observacao,''), "
            "COALESCE(produto,'')||' '||COALESCE(medida,''), COALESCE(tipo_promocao,'') "
            "FROM produtos WHERE produto=? AND id<>? AND preco IS NOT NULL",
            (prod, rid),
        ).fetchall()
        if len(irmaos) < 2:
            continue
        # só divide quando a família é mista: algum irmão já foi dividido
        # (marcado) ou algum irmão não declara quantidade — senão todos são
        # consistentemente pack e a série bruta já é comparável
        tem_marcado = any(MARCADOR_DIVISAO in o[2] for o in irmaos)
        tem_livre = any(
            not RE_N_EMBALAGEM.search(o[3]) and not RE_LEVE_PAGUE.search(o[4])
            for o in irmaos
        )
        if not (tem_marcado or tem_livre):
            continue
        smin = min(o[1] for o in irmaos)
        if smin <= 0.5:
            continue
        unit = round(preco / n, 2)
        piso = (0.60 if origem_leve else 0.45) * smin
        if not (piso <= unit <= 2.5 * smin):
            stats["rejeitado"] += 1
            print(f"  rejeitado: {prod[:40]} | {preco:.2f}/{n}={unit:.2f} fora do mínimo {smin:.2f}")
            continue
        novo_obs = (
            f"{MARCADOR_DIVISAO} embalagem c/ {n} unids. (qtd. no nome/embalagem): "
            f"R$ {preco:.2f} -> R$ {unit:.2f}. " + (obs or "")
        ).strip()
        novo_clube = round(clube / n, 2) if clube is not None else None
        updates.append((unit, novo_clube, limpar_medida_multipack(med), novo_obs[:1000], rid))
        stats[f"dividido_por_{n}"] += 1
        print(f"  divisao: {prod[:45]} | {preco:.2f}/{n} = {unit:.2f} (min sibs {smin:.2f})")

    if updates:
        with conn:
            conn.executemany(
                "UPDATE produtos SET preco=?, preco_clube=?, medida=?, observacao=? WHERE id=?",
                updates,
            )
    print(f"Divisões por quantidade no nome/embalagem: {len(updates)}")
    return len(updates)


# O nome sem marca/rótulo mescla produtos distintos (Casillero x Sangue de
# Boi, Buchanan's x White Horse, Tio João x Carreteiro...) — o histórico de
# preço só faz sentido por rótulo completo.
STOP_TOKEN_MARCA = {"ou", "e", "y", "de", "do", "da", "dos", "das", "del", "the"}


def _tokens_marca_fora_do_nome(produto, marca):
    """Palavras da marca que ainda não estão no nome do produto."""
    pl = produto.lower()
    fora = []
    for palavra in re.split(r"[\s/,]+", marca.strip()):
        low = palavra.lower()
        if len(low) >= 2 and low not in STOP_TOKEN_MARCA and low not in pl:
            fora.append(palavra)
    return fora


def completar_nomes_com_marca(conn):
    """Nome genérico (ex.: 'Vinho 750ml', 'Whisky 1 Litro', 'Arroz 5kg')
    mescla rótulos distintos — vira 'outlier' falso ao comparar marcas de
    faixas de preço diferentes. Reconstrói o nome completo inserindo antes da
    medida os tokens da marca que faltam. Registros marcados como outlier sob
    o nome genérico são liberados para reavaliação com as famílias por rótulo."""
    rows = conn.execute(
        """SELECT id, produto, marca, observacao, erro_identificacao FROM produtos
           WHERE preco IS NOT NULL AND marca IS NOT NULL AND marca != ''
             AND produto IS NOT NULL AND produto != ''"""
    ).fetchall()
    renomes, liberados = [], []
    for rid, prod, marca, obs, erro in rows:
        faltam = _tokens_marca_fora_do_nome(prod, marca)
        if not faltam:
            continue
        m = RE_VOLUME_FIM.search(prod)
        novo = (
            f"{prod[:m.start()].rstrip()} {' '.join(faltam)} {m.group().strip()}"
            if m
            else f"{prod} {' '.join(faltam)}"
        )
        novo = re.sub(r"\s+", " ", novo).strip()
        renomes.append((novo, rid))
        if erro and obs and "[outlier:" in obs.lower():
            limpo = RE_MARCADOR_OUTLIER.sub("", obs).strip()
            liberados.append((limpo or None, 0, rid))
        if len(renomes) <= 30:
            print(f"  nome completo: {prod!r} + {marca!r} -> {novo!r}")

    with conn:
        conn.executemany("UPDATE produtos SET produto=? WHERE id=?", renomes)
        conn.executemany(
            "UPDATE produtos SET observacao=?, erro_identificacao=? WHERE id=?",
            liberados,
        )
    print(f"Nomes completados com a marca: {len(renomes)}")
    return len(renomes)


def marcar_outliers_sem_nota(conn):
    """Preços muito acima do mínimo do mesmo produto sem nenhuma nota de
    promoção/embalagem que explique — provável embalagem coletiva não
    documentada ou produto distinto mesclado no mesmo nome.
    Marca erro_identificacao=1 para revisão manual (some dos gráficos)."""
    rows = conn.execute(
        """
        WITH stats AS (
          SELECT produto, MIN(preco) mn, COUNT(*) n
          FROM produtos WHERE preco IS NOT NULL AND erro_identificacao=0
          GROUP BY produto HAVING n>=3 AND mn>0
        )
        SELECT p.id, p.produto, p.preco, s.mn,
               COALESCE(p.tipo_promocao,'')||' '||COALESCE(p.observacao,''),
               COALESCE(p.observacao,'')
        FROM produtos p JOIN stats s
          ON s.produto=p.produto AND p.preco>s.mn*3.5
        """
    ).fetchall()
    updates = []
    for rid, prod, preco, mn, texto, obs in rows:
        low = texto.lower()
        if MARCADOR_DIVISAO in texto or "sai por" in low or RE_LEVE_PAGUE.search(texto):
            continue
        if "[outlier:" in low:
            continue
        novo_obs = (
            f"[Outlier: R$ {preco:.2f} vs min R$ {mn:.2f} do mesmo produto, sem nota "
            f"de embalagem/promo — precisa revisão] " + obs
        ).strip()
        updates.append((novo_obs[:1000], rid))
        print(f"  marcado: id={rid} {prod[:45]} | R$ {preco:.2f} vs min R$ {mn:.2f}")

    if updates:
        with conn:
            conn.executemany(
                "UPDATE produtos SET erro_identificacao=1, observacao=? WHERE id=?",
                updates,
            )
    print(f"Registros marcados para revisão: {len(updates)}")
    return len(updates)


def padronizar_variacoes(produto):
    for rx, repl in SUBSTITUICOES:
        produto = rx.sub(repl, produto)
    return limpar_espacos(produto)


def chave_anagrama(produto):
    t = unicodedata.normalize("NFD", produto.lower())
    t = "".join(c for c in t if unicodedata.category(c) != "Mn")
    return " ".join(sorted(re.sub(r"[^a-z0-9]+", " ", t).split()))


def simplificar_acucar(produto):
    m = re.match(r"^Açúcar\b(.*)$", produto)
    if not m or re.search(r"\bdemerara\b", produto, re.IGNORECASE):
        return produto
    mantidos = []
    for tok in m.group(1).split(" "):
        low = re.sub(r"[^\wÀ-ÿ]", "", tok).lower()
        if low in DESCRITORES_ACUCAR:
            continue
        mantidos.append(tok)
    novo = limpar_espacos("Açúcar " + " ".join(mantidos))
    return novo


def remover_frase(produto, frase):
    rx = regex_marca(frase)
    novo = rx.sub(" ", produto, count=1)
    novo = limpar_espacos(novo)
    if not novo or not re.search(r"[^\W\d_]{2}", novo):
        return produto, False
    while True:
        toks = novo.split(" ")
        if toks and (toks[-1].casefold().rstrip(",") in CONECTIVOS_FIM or toks[-1] in {",", "/"}):
            novo = limpar_espacos(" ".join(toks[:-1]))
            continue
        break
    if not novo or not re.search(r"[^\W\d_]{2}", novo):
        return produto, False
    return novo, True


def normalizar_medida(medida):
    medida = corrigir_decimais(limpar_espacos(medida))
    if not medida:
        return medida
    medida = re.sub(r"\s*/\s*", "/", medida)
    medida = re.sub(r"\bc/(?=\d)", "c/ ", medida)
    medida = re.sub(r"\bunlds\.?\b", "Unids.", medida, flags=re.IGNORECASE)
    medida = re.sub(r"\bunidad(e|es)\b|\bunids\.?|\bun\b", "Unids.", medida, flags=re.IGNORECASE)
    tokens = [token_normalizado(t, i == 0) for i, t in enumerate(medida.split(" "))]
    out = " ".join(tokens)
    if out and out[0].isalpha() and out[0].islower():
        out = out[0].upper() + out[1:]
    if out.casefold() == "kg":
        return "1kg"
    return limpar_espacos(out)


def unificar_anagramas(conn):
    pares = conn.execute(
        "SELECT produto, COUNT(*) FROM produtos GROUP BY produto"
    ).fetchall()
    grupos = {}
    for prod, n in pares:
        grupos.setdefault(chave_anagrama(prod), []).append((prod, n))
    total = 0
    for variantes in grupos.values():
        if len(variantes) < 2:
            continue
        vencedor = max(variantes, key=lambda v: (v[1], v[0]))[0]
        outros = [p for p, _ in variantes if p != vencedor]
        placeholders = ",".join("?" * len(outros))
        cur = conn.execute(
            f"UPDATE produtos SET produto=? WHERE produto IN ({placeholders})",
            [vencedor, *outros],
        )
        if cur.rowcount:
            print(f"  anagrama: {' / '.join(outros)} -> {vencedor}")
        total += cur.rowcount
    return total


def unificar_caso(conn):
    total = 0
    for col in ("produto", "marca"):
        pares = conn.execute(
            f"SELECT LOWER({col}), {col}, COUNT(*) FROM produtos "
            f"WHERE {col} IS NOT NULL GROUP BY LOWER({col}), {col}"
        ).fetchall()
        grupos = {}
        for chave, valor, n in pares:
            grupos.setdefault(chave, {})[valor] = n
        for chave, variantes in grupos.items():
            if len(variantes) < 2:
                continue
            vencedor = max(variantes, key=variantes.get)
            outros = [v for v in variantes if v != vencedor]
            placeholders = ",".join("?" * len(outros))
            cur = conn.execute(
                f"UPDATE produtos SET {col}=? WHERE {col} IN ({placeholders})",
                [vencedor, *outros],
            )
            if cur.rowcount:
                print(f"  unificados ({col}): {' / '.join(outros)} -> {vencedor}")
            total += cur.rowcount
    return total


def main():
    backup = DB.with_suffix(".backup.db")
    if not backup.exists():
        shutil.copy2(DB, backup)
        print(f"Backup criado: {backup}")

    conn = sqlite3.connect(DB)
    rows = conn.execute(
        "SELECT id, produto, marca, medida FROM produtos"
    ).fetchall()

    stats = Counter()

    marcas_limpas = {}
    for _id, _prod, marca, _med in rows:
        nova = normalizar_marca_bruta(marca)
        marcas_limpas[_id] = nova
        if (marca or "").strip() != (nova or ""):
            stats["marca_normalizada"] += 1

    vocab = Counter()
    display = {}
    for marca in set(marcas_limpas.values()):
        if not marca:
            continue
        for fam in dividir_familias(marca):
            letras = re.sub(r"[^A-Za-zÀ-ÿ]", "", fam)
            if len(letras) < 3:
                continue
            vocab[fam.casefold()] += 1
            display[fam.casefold()] = fam
    vocab_valido = {
        cf: display[cf]
        for cf, n in vocab.items()
        if n >= 3 and display[cf].casefold() not in PALAVRAS_GENERICAS
    }
    vocab_rx = [(regex_marca(f), f, cf) for cf, f in vocab_valido.items()]

    novos_prod, novas_marcas, novas_medidas = {}, {}, {}
    for _id, prod, _marca, med in rows:
        prod_novo = title_pt(prod)
        marca_nova = marcas_limpas[_id]
        prod_novo = title_pt(padronizar_variacoes(prod_novo))
        prod_novo = FRASE_FIX.get(prod_novo, prod_novo)
        prod_novo = simplificar_acucar(prod_novo)
        if prod_novo.endswith(" kg"):
            prod_novo = prod_novo[:-3] + " 1kg"
            stats["kg_convertido_1kg"] += 1

        if not marca_nova:
            # marca ausente na coluna: infere por vocabulário conhecido e
            # preenche a coluna — mas mantém o rótulo no nome (nome completo)
            encontradas = {}
            for rx, frase, cf in vocab_rx:
                ms = rx.findall(prod_novo)
                if ms:
                    encontradas.setdefault(cf, frase)
            if len(encontradas) == 1:
                cf, frase = next(iter(encontradas.items()))
                novas_marcas[_id] = display[cf]
                stats["marca_preenchida"] += 1

        med_nova = normalizar_medida(med)

        if prod_novo != (prod or "").strip():
            stats["produto_padronizado"] += 1
        if med_nova != (med or ""):
            stats["medida_padronizada"] += 1
        novos_prod[_id] = prod_novo
        novas_marcas.setdefault(_id, marca_nova)
        novas_medidas[_id] = med_nova

    updates = []
    for _id, prod, _marca_orig, med in rows:
        p = novos_prod[_id]
        m = novas_marcas.get(_id) or ""
        d = novas_medidas[_id]
        if p != (prod or "").strip() or m != (_marca_orig or "").strip() or d != (med or ""):
            updates.append((p, m or None, d, _id))

    with conn:
        conn.executemany(
            "UPDATE produtos SET produto=?, marca=?, medida=? WHERE id=?",
            updates,
        )
        n = unificar_anagramas(conn)
        n += unificar_caso(conn)
    dividir_precos_embalagem(conn)
    corrigir_medida_divididas(conn)
    dividir_multipacks_por_nome(conn)
    completar_nomes_com_marca(conn)
    marcar_outliers_sem_nota(conn)
    conn.close()

    total = len(rows)
    print(f"\nTotal de registros: {total}")
    print(f"Registros alterados: {len(updates) + n}")
    for k, v in sorted(stats.items()):
        print(f"  {k}: {v}")


if __name__ == "__main__":
    main()
