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

        if marca_nova:
            familias = dividir_familias(marca_nova)
            if len(familias) == 1 and familias[0].casefold() not in PALAVRAS_GENERICAS:
                prod_tentativa, ok = remover_frase(prod_novo, familias[0])
                if ok:
                    prod_novo = prod_tentativa
                    stats["marca_removida_do_nome"] += 1
        else:
            encontradas = {}
            for rx, frase, cf in vocab_rx:
                ms = rx.findall(prod_novo)
                if ms:
                    encontradas.setdefault(cf, frase)
            if len(encontradas) == 1:
                cf, frase = next(iter(encontradas.items()))
                prod_tentativa, ok = remover_frase(prod_novo, frase)
                if ok:
                    prod_novo = prod_tentativa
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
    conn.close()

    total = len(rows)
    print(f"\nTotal de registros: {total}")
    print(f"Registros alterados: {len(updates) + n}")
    for k, v in sorted(stats.items()):
        print(f"  {k}: {v}")


if __name__ == "__main__":
    main()
