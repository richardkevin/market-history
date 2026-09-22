import difflib
import re
import shutil
import sqlite3
import statistics
import unicodedata
from collections import Counter, defaultdict
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

# Preço de unidade explícito informado pelo encarte (ex.: "Cada unidade sai por 2,09",
# "preço unitário 3,89", "4,39 a unidade"). Exige menção a unidade para não pegar
# notas de conteúdo ("embalagem 1kg sai por") nem promos de volume ("Leve 1 Pague 750ml").
RE_UNIDADES_PRECO = [
    re.compile(r"(?:cada\s+)?uni[dv](?:ade)?s?\.?,?\s+sai\w*\s+por\s+(?:R\$\s*)?([\d.,]+)", re.I),
    re.compile(r"pre[çc]o\s+unit[áa]ri[oa]\b[^\d]{0,26}?(?:R\$\s*)?([\d.,]+)", re.I),
    re.compile(r"pre[çc]o\s+por\s+uni[dv]ade\b[^\d]{0,26}?(?:R\$\s*)?([\d.,]+)", re.I),
    re.compile(r"uni[dv]ade\s+sai\w*\s+(?:a\s+|por\s+)?(?:R\$\s*)?([\d.,]+)", re.I),
    re.compile(r"sai\w*\s+por\s+(?:R\$\s*)?([\d.,]+)\s*(?:a\s+)?uni[dv]ade\b", re.I),
    re.compile(r"(?:por|a)\s+uni[dv]ade\s+sai\w*\s+(?:por\s+)?(?:R\$\s*)?([\d.,]+)", re.I),
    re.compile(r"(?:^|[\s.,;:\(])(?:R\$\s*)?([\d.,]+)\s+(?:a|por)\s+uni[dv]ade\b", re.I),
]
MARCADOR_DIVISAO = "[Divisão embalagem]"
RE_MARCADOR_N = re.compile(r"embalagem\s+c/\s*(\d+)\s*unids", re.I)
VOLUME_PROMO_RX = re.compile(r"\bp?ague?\s+\d+[.,]?\d*\s*(ml|l\b|litro)", re.I)
RE_LEVE_PAGUE = re.compile(r"\bleve\s+(\d{1,2})\s+pague\s+(\d{1,2})\b", re.I)
RE_PAGUE_MENOS = re.compile(r"\bleve\s+(\d{1,2})\s+(?:e\s+)?pague\s+(?:menos|mais)\b", re.I)

# Contagem declarada na embalagem: "C/ 6 Unids.", "12 Unidades", "Pack c/ 18", "PACK COM 12", "Kit 3".
RE_CONTA_EXP_1 = re.compile(r"(?:^|[\(\s])c?/?\s*(\d{1,2})\s*unids?\.?(?=\s|$|\))", re.I)
RE_CONTA_EXP_2 = re.compile(r"(?:^|[\(\s])\s*(\d{1,2})\s*unidad(?:e|es)\b", re.I)
RE_CONTA_EXP_3 = re.compile(r"\b(?:pack|kit|cartela|engradado|caixa|cx)\s*(?:com\b|de\b|c/|/|:)?\s*(\d{1,2})\b", re.I)
# "Embalagem com 12 unidades" (só em nome/embalagem, nunca em condições promocionais).
RE_CONTA_EXP_4 = re.compile(r"\bembalagem\s+(?:com\s+|c/\s*)?(\d{1,2})\s*unidad(?:e|es|s)?\b", re.I)
RE_CONTA_NOME = (RE_CONTA_EXP_1, RE_CONTA_EXP_2, RE_CONTA_EXP_3)
# Condições que descrevem a compra (não o tamanho da embalagem do produto):
# a contagem nelas não autoriza dividir o preço.
RE_CONDICAO_PROMO = re.compile(
    r"na\s+compra|a\s+partir|ganhe|gratis|gr[áa]tis|levando|"
    r"no\s+2[ºo°]|2[ªa]\s*(?:pack|un)|segunda\s+un|segundo\s+produto",
    re.I,
)
RE_COUNT_MEDIDA = re.compile(
    r"c?/?\s*\d{1,2}\s*unids?\b\.?|leve\s+\d{1,2}\s+pague\s+\d{1,2}|"
    r"(?:pack|kit|cartela|engradado|cx|caixa)\s*(?:com\b|de\b|c/|/|:)?\s*\d{1,2}\b|"
    r"(?:com\s+|c/\s*)?\d{1,2}\s*unidad(?:e|es)\b",
    re.I,
)
RE_PALAVRA_PACK = re.compile(r"\b(?:pack|kit|cartela|engradado|cx|caixa)\b", re.I)
# Indício de embalagem coletiva (para não tratar como preço de prateleira).
RE_HINT_EMBALAGEM = re.compile(
    r"\b(?:pack|kit|cartela|engradado|caixa|cx)\b|\bunid(?:ade|ades|s)?\.?\b|"
    r"\bleve\s+\d|\bpague\b|\bsai\w*\s+por|\bc/?\s*\d{1,2}\s*unid|"
    r"pre[çc]o\s+unit[áa]rio|gr[áa]tis|gratis",
    re.I,
)


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


def conta_no_nome(prod, med):
    """Quantidade de unidades na própria descrição do produto (2..60) ou None.
    Só nome/medida: condições promocionais ('na compra de 12 unidades',
    'a partir de 7 unids') NÃO são tamanho de embalagem."""
    texto = f"{prod or ''} {med or ''}"
    for rx in RE_CONTA_NOME:
        m = rx.search(texto)
        if m and 2 <= int(m.group(1)) <= 60:
            return int(m.group(1))
    return None


def conta_no_promo(promo, obs):
    """Quantidade declarada em embalagem/pack na promoção/observação, ou None.
    Restrito a 'pack/kit/caixa/engradado N' e 'embalagem com N unidades' —
    nunca 'na compra de N unidades' / 'a partir de N unids' nem 'Leve N Pague M'
    (essa é inferida à parte, com validação por irmãos)."""
    texto = f"{promo or ''} {obs or ''}"
    if RE_CONDICAO_PROMO.search(texto):
        return None
    for rx in (RE_CONTA_EXP_3, RE_CONTA_EXP_4):
        m = rx.search(texto)
        if m and 2 <= int(m.group(1)) <= 24:
            return int(m.group(1))
    return None


def _conta_no_texto(prod_med, promo):
    """true se o irmão declara quantidade de unidades (nome/medida/pack)."""
    n = conta_no_nome(prod_med, "")
    if n:
        return True
    if conta_no_promo(promo, ""):
        return True
    return bool(RE_LEVE_PAGUE.search(promo or "") or RE_PAGUE_MENOS.search(promo or ""))


def _hint_embalagem(texto):
    """true quando o texto (promo/obs) indica embalagem coletiva ou preço
    unitário promocional — tais registros não servem de base 'de prateleira'."""
    t = texto or ""
    if MARCADOR_DIVISAO in t:
        return True
    return bool(RE_HINT_EMBALAGEM.search(t))


def _mapa_minimos(conn):
    """produto -> ([preços distintos em ordem], total de registros erro=0).
    Evita uma consulta por linha ao calcular o mínimo dos irmãos."""
    rows = conn.execute(
        "SELECT produto, preco, COUNT(*) FROM produtos "
        "WHERE preco IS NOT NULL AND erro_identificacao=0 "
        "GROUP BY produto, preco"
    ).fetchall()
    agrupado = defaultdict(lambda: [[], 0])
    for prod, preco, n in rows:
        if prod is None:
            continue
        agrupado[prod][0].append(preco)
        agrupado[prod][1] += n
    return {prod: (sorted(precos), total) for prod, (precos, total) in agrupado.items()}


def _min_irmao(mins, prod, preco):
    """Menor preço de outro registro do mesmo produto (ou None)."""
    dados = mins.get(prod)
    if not dados:
        return None
    precos, total = dados
    if total <= 1:
        return None
    if preco > precos[0]:
        return precos[0]
    # o próprio registro é o mínimo: usa o próximo distinto (ou outro igual)
    return precos[1] if len(precos) > 1 else precos[0]


def dividir_precos_embalagem(conn):
    """Divide o preço quando o encarte informa o preço por UNIDADE de um multipack
    (ex.: 'Pack com 12 unidades, preço unitário 3,89', '4,39 a unidade') ou quando
    o preco_clube já traz o valor unitário (ex.: pack c/ 12 a R$ 52,68 com clube
    4,39 = 52,68/12). O preço vira o unitário e o clube, quando também é total,
    é dividido junto; a observação documenta a troca."""
    rows = conn.execute(
        "SELECT id, produto, medida, preco, preco_clube, observacao, tipo_promocao "
        "FROM produtos WHERE erro_identificacao=0"
    ).fetchall()

    backup = DB.with_suffix(".precos_embalagem.backup.db")
    if not backup.exists():
        shutil.copy2(DB, backup)
        print(f"Backup dedicado: {backup}")

    mins = _mapa_minimos(conn)
    stats = Counter()
    updates = []
    for rid, prod, med, preco, clube, obs, promo in rows:
        if preco is None or (obs and MARCADOR_DIVISAO in obs):
            continue
        texto = f"{obs or ''} {promo or ''}"
        if VOLUME_PROMO_RX.search(texto):
            continue

        unit = None
        # "preço unitário" em condição promocional ("na compra da 2ª unidade")
        # é preço da condição, não da embalagem — não autoriza dividir.
        if not RE_CONDICAO_PROMO.search(texto):
            for rx in RE_UNIDADES_PRECO:
                m = rx.search(texto)
                if m and re.search(r"[.,]", m.group(1)):
                    cand = parse_preco_br(m.group(1))
                    if cand and 0.01 <= cand < preco * 0.98:
                        unit = cand
                        break

        n = None
        smin = _min_irmao(mins, prod, preco)
        if unit is not None:
            # o tamanho declarado no nome/embalagem manda: o "preço unitário"
            # pode se referir a um sub-bundle ("8 unids. saem por 1,99")
            n = conta_no_nome(prod, med)
            if n is None:
                n_div = preco / unit
                if 2 <= n_div <= 24 and abs(n_div - round(n_div)) <= max(0.05, n_div * 0.02):
                    n = round(n_div)
                else:
                    n = conta_no_promo(promo, obs)
            if n and smin and not (0.4 * smin <= preco / n <= 2.5 * smin):
                n = None
        elif clube is not None and 0 < clube < preco * 0.98:
            # preco_clube carregando o unitário do pack (ex.: 52,68 / 4,39 = 12).
            # Exige razão >= 5 (desconto de clube raramente passa disso) e que o
            # valor do clube seja compatível com o menor irmão, para não confundir
            # "clube = preço/2" (50% off) com preço unitário.
            n_div = preco / clube
            if (smin
                    and 5 <= n_div <= 24
                    and abs(n_div - round(n_div)) <= max(0.03, n_div * 0.01)
                    and 0.4 * smin <= clube <= 2.5 * smin):
                n = round(n_div)
                unit = round(clube, 2)
        if not n:
            continue

        preco_n = round(preco / n, 2)
        if unit is not None and abs(unit - preco_n) <= max(0.03, preco_n * 0.05):
            novo_preco = round(unit, 2)
        else:
            novo_preco = preco_n

        novo_clube = clube
        if clube is not None and clube > novo_preco * 1.5:
            novo_clube = round(clube / n, 2)

        novo_obs = (
            f"{MARCADOR_DIVISAO} embalagem c/ {n} unids.: R$ {preco:.2f} -> R$ {novo_preco:.2f}. "
            + (obs or "")
        ).strip()
        updates.append((novo_preco, novo_clube, limpar_medida_multipack(med), novo_obs[:1000], rid))
        stats[f"dividido_por_{n}"] += 1
        print(f"  divisao: {prod[:45]} | {preco:.2f}/{n} = {novo_preco:.2f}"
              + (f" (clube {clube:.2f} -> {novo_clube:.2f})"
                 if clube is not None and novo_clube != clube else ""))

    if updates:
        with conn:
            conn.executemany(
                "UPDATE produtos SET preco=?, preco_clube=?, medida=?, observacao=? WHERE id=?",
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
    """Terceira passada: multipacks sem preço unitário explícito, mas com a
    quantidade declarada no nome/medida/promoção/observação ('Pack c/ 6 Unids.',
    '12 Unidades', 'Leve N Pague M'). Quantidades inferidas de 'Leve/Pague' só
    dividem quando a família é mista (algum irmão já dividido ou algum irmão sem
    quantidade declarada); quantidades explícitas no nome/embalagem dividem mesmo
    sem irmãos, usando o mínimo histórico como faixa de sanidade."""
    rows = conn.execute(
        "SELECT id, produto, medida, preco, preco_clube, observacao, tipo_promocao "
        "FROM produtos WHERE erro_identificacao=0"
    ).fetchall()
    # tamanho de embalagem inferido de irmãos já divididos do mesmo produto
    # (ex.: 'Cerveja Duplo Malte Brahma 310ml' -> marcador 'c/ 15 unids.')
    contagem_marcador = defaultdict(Counter)
    for prod_m, obs_m in conn.execute(
        "SELECT produto, observacao FROM produtos WHERE observacao LIKE ?",
        (MARCADOR_DIVISAO + "%",),
    ):
        m = RE_MARCADOR_N.search(obs_m or "")
        if m:
            contagem_marcador[prod_m][int(m.group(1))] += 1
    marcador_n = {p: c.most_common(1)[0][0] for p, c in contagem_marcador.items()}

    stats = Counter()
    updates = []
    for rid, prod, med, preco, clube, obs, promo in rows:
        if preco is None or (obs and MARCADOR_DIVISAO in obs):
            continue
        texto_promo = f"{promo or ''} {obs or ''}"
        low = texto_promo.lower()
        if "sai por" in low or VOLUME_PROMO_RX.search(texto_promo):
            continue

        n = conta_no_nome(prod, med)
        origem = "embalagem" if n else None
        if n is None:
            n = conta_no_promo(promo, obs)
        if n is None and prod in marcador_n:
            n = marcador_n[prod]
            origem = "marcador"
        if n is None:
            m = RE_LEVE_PAGUE.search(texto_promo)
            if m and int(m.group(1)) >= 2 and int(m.group(2)) >= 2:
                n = int(m.group(1))
                origem = "leve"
            else:
                m = RE_PAGUE_MENOS.search(texto_promo)
                if m and int(m.group(1)) >= 2:
                    n = int(m.group(1))
                    origem = "leve"
        if not n:
            continue

        irmaos = conn.execute(
            "SELECT id, preco, COALESCE(observacao,''), "
            "COALESCE(produto,'')||' '||COALESCE(medida,''), COALESCE(tipo_promocao,'') "
            "FROM produtos WHERE produto=? AND id<>? AND preco IS NOT NULL",
            (prod, rid),
        ).fetchall()

        if origem == "leve":
            if len(irmaos) < 2:
                continue
            # só divide quando a família é mista: algum irmão já foi dividido
            # (marcado) ou algum irmão não declara quantidade — senão todos são
            # consistentemente pack e a série bruta já é comparável
            tem_marcado = any(MARCADOR_DIVISAO in o[2] for o in irmaos)
            tem_livre = any(not _conta_no_texto(o[3], o[4]) for o in irmaos)
            if not (tem_marcado or tem_livre):
                continue

        unit = round(preco / n, 2)
        precos_irmaos = [o[1] for o in irmaos if o[1] and o[1] > 0]
        if precos_irmaos:
            smin = min(precos_irmaos)
            piso = (0.60 if origem == "leve" else 0.45) * smin
            if not (piso <= unit <= 2.5 * smin):
                stats["rejeitado"] += 1
                print(f"  rejeitado: {prod[:40]} | {preco:.2f}/{n}={unit:.2f} fora do mínimo {smin:.2f}")
                continue
        elif not (0.10 <= unit <= 99.99):
            stats["rejeitado"] += 1
            print(f"  rejeitado: {prod[:40]} | {preco:.2f}/{n}={unit:.2f} fora da faixa")
            continue

        novo_clube = clube
        if clube is not None and clube > unit * 1.5:
            novo_clube = round(clube / n, 2)
        novo_obs = (
            f"{MARCADOR_DIVISAO} embalagem c/ {n} unids. (qtd. no nome/embalagem): "
            f"R$ {preco:.2f} -> R$ {unit:.2f}. " + (obs or "")
        ).strip()
        updates.append((unit, novo_clube, limpar_medida_multipack(med), novo_obs[:1000], rid))
        stats[f"dividido_por_{n}"] += 1
        print(f"  divisao: {prod[:45]} | {preco:.2f}/{n} = {unit:.2f}")

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
    """Preços muito acima da mediana dos registros 'de prateleira' do mesmo
    produto (sem indício de embalagem/promoção) — provável embalagem coletiva
    não documentada ou produto distinto mesclado no mesmo nome. Marca
    erro_identificacao=1 para revisão manual (some dos gráficos) e libera
    registros antes marcados que hoje não se explicam pela regra (evita falsos
    positivos da regra antiga, que usava o mínimo e comparava promo × gôndola)."""
    rows = conn.execute(
        "SELECT id, produto, preco, "
        "COALESCE(tipo_promocao,'')||' '||COALESCE(observacao,''), "
        "COALESCE(observacao,''), erro_identificacao "
        "FROM produtos WHERE preco IS NOT NULL"
    ).fetchall()

    grupos = defaultdict(list)
    for rid, prod, preco, texto, obs, erro in rows:
        if not prod:
            continue
        grupos[prod].append((rid, preco, texto, obs, erro))

    marcar, desmarcar = [], []
    for prod, membros in grupos.items():
        for rid, preco, texto, obs, erro in membros:
            outros = [
                p for _rid, p, t, _o, e in membros
                if _rid != rid and e == 0 and not _hint_embalagem(t)
            ]
            med = statistics.median(outros) if outros else 0
            eh_outlier = (
                med > 0
                and preco > 3 * med
                and preco - med >= 5
                and not _hint_embalagem(texto)
            )
            if erro == 1:
                if not eh_outlier and "[outlier:" in obs.lower():
                    obs_limpo = RE_MARCADOR_OUTLIER.sub("", obs).strip() or None
                    desmarcar.append((obs_limpo, 0, rid))
            elif eh_outlier and "[outlier:" not in obs.lower():
                novo_obs = (
                    f"[Outlier: R$ {preco:.2f} vs mediana R$ {med:.2f} do mesmo produto, "
                    f"sem nota de embalagem/promo — precisa revisão] " + (obs or "")
                ).strip()
                marcar.append((novo_obs[:1000], rid))
                print(f"  marcado: id={rid} {prod[:45]} | R$ {preco:.2f} vs mediana R$ {med:.2f}")

    with conn:
        if marcar:
            conn.executemany(
                "UPDATE produtos SET erro_identificacao=1, observacao=? WHERE id=?",
                marcar,
            )
        if desmarcar:
            conn.executemany(
                "UPDATE produtos SET observacao=?, erro_identificacao=? WHERE id=?",
                desmarcar,
            )
    print(f"Registros marcados para revisão: {len(marcar)} | liberados: {len(desmarcar)}")
    return len(marcar)


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
    # Itera até estabilizar: liberar outliers muda o estado e pode habilitar
    # novas divisões (ex.: packs antes marcados), então uma passada só não basta.
    for _ in range(6):
        alterados = dividir_precos_embalagem(conn)
        corrigir_medida_divididas(conn)
        alterados += dividir_multipacks_por_nome(conn)
        completar_nomes_com_marca(conn)
        marcar_outliers_sem_nota(conn)
        if alterados == 0:
            break
    conn.close()

    total = len(rows)
    print(f"\nTotal de registros: {total}")
    print(f"Registros alterados: {len(updates) + n}")
    for k, v in sorted(stats.items()):
        print(f"  {k}: {v}")


if __name__ == "__main__":
    main()
