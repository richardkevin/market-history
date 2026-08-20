#!/usr/bin/env python3
"""Le imagens do Facebook do Prezunic usando EasyOCR, extrai produtos/precos e salva em SQLite."""

import os
import re
import sqlite3
import json
import easyocr

PASTA_IMGS = "fotos_prezunic"
BANCO_DADOS = "prezunic_produtos.db"

CONF_MINIMA = 0.15


def eh_medida(texto):
    """Verifica se o texto e uma medida (litragem, peso) e nao um preco."""
    texto = texto.strip().lower()
    # litragens: 1,75l / 473ml / 1,750 / etc
    if re.match(r"^\d+[.,]?\d*\s*(l|lt|ml|kg|g|gr|mg|un|cx|pct)\b", texto):
        return True
    # "1,751" so numero seguido de nada mas conf alta = provavelmente litragem
    if re.match(r"^\d+[.,]\d{1,3}$", texto):
        # so e medida se NAO tem 2 casas decimais (preco tem 2 casas)
        m = re.match(r"^\d+[.,](\d+)$", texto)
        if m and len(m.group(1)) == 2:
            return False  # parece preco (ex: 19,98)
        return True
    return False


def eh_preco_texto(texto):
    """Verifica se o texto contem um preco."""
    if re.search(r"\d+[.,]\d{2}", texto):
        return True
    if re.search(r"\d{1,3}\s+\d{2}\b", texto):
        return True
    if re.search(r"(?:Rs?|R\$)\s*\d", texto, re.IGNORECASE):
        return True
    return False


def eh_banner(texto):
    """Verifica se o texto e um banner/promocao generica."""
    texto_lower = texto.lower().strip()

    # primeiro verificar se parece produto
    if eh_produto_probavel(texto):
        return False

    hits_banner = sum(1 for p in [
        r"prezunic\s+tem", r"\+cashback", r"ofertas?\s*$",
        r"sexto[uu]", r"reinaugura", r"encontre\s+a\s+loja",
        r"parcele", r"vem[áa]\s+a", r"amanh[aã]",
        r"nova\s+experi", r"de\s+compras", r"preços?\s+imbat",
    ] if re.search(p, texto_lower))

    if hits_banner >= 2:
        return True

    # so classificar como banner se tiver 1 hit forte e nao parecer produto
    if hits_banner >= 1:
        return True

    # textos muito curtos sem produto = provavel banner
    linhas = [l.strip() for l in texto_lower.split("\n") if l.strip()]
    if len(linhas) <= 1 and len(texto_lower) < 20:
        return True

    return False


def eh_produto_valido(texto):
    """Verifica se o texto parece ser um nome de produto."""
    if len(texto) < 4:
        return False

    padroes_lixo = [
        r"^[^a-zA-ZÀ-ú]+$",
        r"^(Soo|prezunic|PREZUNIC|TEM|OFERTAS?)\s",
        r"(TEM|OFERTAS?|CASHBACK|PREZUNIC)$",
        r"^\d+[.,]?\d*\s*(Rs?|R\$)?\s*\d",
        r"^[A-Z]{1,3}\s+[A-Z]{1,3}$",
        r"Cotton|Coffon|FOLHAIiclA|Lsiil|Ghgupr|Veycllje|LaticiiO",
        r"(GANHE|PARCELE|APROVEITE|PAGUE|LEVE|COMPRE|RECEBA|TROQUE)",
        r"(CASHBACK|CASHBACKO|CREDito|DESCONTO|BONUS)",
        r"^(DE|OU|EM|ATE|COM)\s",
        r"(NOVA|COMPRAS?|EXPERIENCIA|OFERTA)",
    ]
    for p in padroes_lixo:
        if re.search(p, texto, re.IGNORECASE):
            return False

    if not re.search(r"[a-zA-ZÀ-ú]{3,}", texto):
        return False

    return True


def eh_texto_lixo(texto):
    """Verifica se o texto e lixo/irrelevante (nao produto, nao preco)."""
    t = texto.strip()

    # so numeros, simbolos, espacos
    if not re.search(r"[a-zA-ZÀ-ú]{2,}", t):
        return True

    t_lower = t.lower().rstrip(".)")

    # textos de embalagem incorretos (OCR garbled)
    lixo_ocr = {
        "garpto", "gorpte", "correl", "lbnie", "slege", "carr", "juilri",
        "tio mingote", "pet soom", "prrnc", "tqvoi", "mimmc", "geora)",
        "geara)", "perdigagbresa", "rapmy", "cokclube", "crncosud", "toacal",
        "sem jurds", "dcuue", "formapanco", "todos 05iocurtes", "nneline",
        "quimportado", "remoso", "rieieralves", "brilhante", "deunc",
        "doniitgo.", "gorolo", "cachepo", "cong 2k9", "cotlon",
        "file qufilezinko", "ipote", "moípo", "cervena",
        "cerviea", "fubei", "dricima", "nestakgbalacem", "ribcralcs",
        "rlhcralves", "maibade", "fuhudpl", "coxae", "sobrecoxn",
        "ceraçso", "coraçso", "fuboi", "iscoitos", "pedaço ou mo",
        "garatc", "papl", "limuo", "latuo",
        "sobzero", "sen clube", "comdue", "comcube", "comwdube",
        "clientede", "amfort", "ypel",
    }
    if t_lower in lixo_ocr:
        return True

    # banners promocionais
    if re.search(r"(GANHE|PARCELE|APROVEITE|PAGUE|LEVE|COMPRE|RECEBA|TROQUE)", t, re.IGNORECASE):
        return True
    if re.search(r"(CASHBACK|CASHBACKO|CREDito|DESCONTO|BONUS)", t, re.IGNORECASE):
        return True
    if re.search(r"^(OFERTAS?|PREZUNIC|PREZUNI|SEXTOU|REINAUGURA)", t, re.IGNORECASE):
        return True
    if re.search(r"(NOVA EXPERIÊNCIA|DE COMPRAS|PREÇOS?\s+IMBAT|economize)", t, re.IGNORECASE):
        return True
    if re.match(r"^(SEM CLUBE|COM\s*[`('c]|COM dube|coMduae|COMcube)", t, re.IGNORECASE):
        return True
    if re.match(r"^(Limite|ExcLUSIVo|ExcluSiVo|ExCeTO|Válido|Valido)", t, re.IGNORECASE):
        return True
    if re.search(r"(por cliente|mesma marca|linha ou volumetria)", t, re.IGNORECASE):
        return True
    if re.search(r"(clientes? Clube|App Prazunic|informoçoes|OFERTAS EXCLUSIVAS)", t, re.IGNORECASE):
        return True

    # textos muito longos sao frases, nao produtos
    if len(t) > 50:
        return True

    # textos com datas
    if re.search(r"\d{2}/\d{2}/\d{4}", t):
        return True

    # siglas curtas
    if re.match(r"^[A-Z]{1,3}\s+[A-Z]{1,3}$", t):
        return True

    # so numeros e espacos
    if re.match(r"^[\d\s.,]+$", t):
        return True

    # marcas conhecidas que aparecem sozias sem contexto
    if t_lower in ("club", "off", "inverno", "páscoa", "pascua", "loja",
                    "site", "app", "zap", "sem clube", "com clube",
                    "peça", "peca", "cong.", "cong", "gramatura.", "gramatura",
                    "amfort", "ypel"):
        return True

    # categorias genericas (nao sao nomes de produto)
    if t_lower in ("amaciantes", "linha riberalves", "vinhos importados e",
                    "sem oss0 ikg", "cong 6729", "riberalves",
                    "espumantes", "ceraçso da", "coraçso da",
                    "pedaço ou moído kg", "pedaço ou moído", "tipos cong. 300g /"):
        return True

    return False


def extrair_produto_linha(texto):
    """Extrai nome de produto de uma linha de texto."""
    texto = texto.strip()

    ignorar = re.compile(
        r"^(OFERTAS?|PREZUNIC|PREZUNI|CASHBACK|SEXTOU|REINAUGURA|"
        r"PREÇOS IMBATIVIEIS|UMA NOVA|DE COMPRAS|ENCONTRE|GANHE|"
        r"PARCELE|VEM[AÁ]|AMANH[AÃ]|EXPERIENCIA|DELIVERY|APP|LOJA|"
        r"CAFETERIA|PADARIA|ACOUGUE|PREZUNIC\s+TEM|OFERTA\s+DO\s+DIA|"
        r"CARTA(M|ÕES)|TODOS|OPÇÕES|COM\s+20|DESCONTO|"
        r"DIA\s+DE|SABIA|NORUEGA|BARRA|CATUMBI|CAMPINHO|"
        r"VARSÓVIA|MARAPENDI|REINAUGURAÇÃO|NOVA EXPERIÊNCIA|"
        r"PREÇOS?\s+IMBAT|NATAL|PÁSCOA|SÃO|PAUL|"
        r"RS|SP|RJ|CE|MG|BA|PR|SC|GO|ES|PE|PA|"
        r"Soo\s+Prezun|PREZUNIC\s+TEM|Coffon|FOLHAIiclA)$",
        re.IGNORECASE,
    )

    if ignorar.match(texto):
        return None

    # produtos em caixa alta
    if re.match(r"^[A-ZÀ-Ú][A-ZÀ-Ú\s\d.,'&/-]{3,}$", texto):
        return texto

    # produtos com mistura de caixa (comeca com maiuscula)
    m = re.search(
        r"([A-ZÀ-Ú][a-zà-ú]+(?:\s+(?:de|do|da|e|ou|com)\s+)?[A-ZÀ-Ú][a-zA-Zà-ú]+(?:\s+[a-zA-Zà-ú]+){0,3})",
        texto,
    )
    if m:
        return m.group(1).strip()

    # produtos comeca com maiuscula
    if re.match(r"^[A-ZÀ-Ú][a-zà-ú]+", texto) and len(texto) > 4:
        return texto

    # produtos comeca com minuscula (ex: "azeite de oliva")
    if re.match(r"^[a-zà-ú]", texto) and len(texto) > 4:
        texto_limpo = re.sub(r"\s*\d[\d.,\s]*$", "", texto).strip()
        if len(texto_limpo) > 4:
            return texto_limpo
        return texto

    return None


def classificar_item(texto, conf):
    """Classifica um item OCR como 'preco', 'produto', 'banner', 'lixo', 'medida', ou 'desc'.

    Retorna (tipo, texto_limpo).
    """
    texto = texto.strip()

    if eh_medida(texto):
        return "medida", texto

    if eh_preco_texto(texto):
        return "preco", texto

    if eh_texto_lixo(texto):
        return "lixo", texto

    if eh_banner(texto):
        return "banner", texto

    nome = extrair_produto_linha(texto)
    if nome and eh_produto_valido(nome):
        return "produto", nome

    return "desc", texto


def eh_produto_probavel(texto):
    """Verifica rapidamente se um texto parece produto (sem extrair)."""
    if len(texto) < 4:
        return False
    if eh_preco_texto(texto) or eh_medida(texto):
        return False
    if eh_texto_lixo(texto):
        return False
    # deve ter pelo menos 3 letras seguidas
    return bool(re.search(r"[a-zA-ZÀ-ú]{3,}", texto))


def ler_imagem_detalhado(reader, caminho):
    """Le imagem com EasyOCR retornando texto, confianca e bounding box."""
    resultados = reader.readtext(caminho, detail=1, paragraph=False)
    itens = []
    for bbox, texto, conf in resultados:
        if conf < CONF_MINIMA:
            if re.search(r"\d+[.,]?\d*\s*(?:Rs?|R\$)\s*\d", texto, re.IGNORECASE):
                pass
            elif re.search(r"\d+[.,]\d{2}", texto):
                pass
            else:
                continue
        y_medio = sum(p[1] for p in bbox) / 4
        x_medio = sum(p[0] for p in bbox) / 4
        itens.append({
            "texto": texto.strip(),
            "conf": conf,
            "y": y_medio,
            "x": x_medio,
            "bbox": bbox,
        })

    # classificar cada item
    for item in itens:
        tipo, texto_limpo = classificar_item(item["texto"], item["conf"])
        item["tipo"] = tipo
        item["texto_limpo"] = texto_limpo

    return itens


def extrair_todos_precos(texto):
    """Extrai todos os precos de um texto, incluindo '18 99' como 18.99."""
    precos = []

    if texto.strip() and not re.match(r"^\s*\d", texto):
        if not re.search(r"(?:R\$|RS?|por)\s*\d", texto, re.IGNORECASE):
            return precos

    if eh_medida(texto):
        return precos

    texto_limpo = re.sub(r"(?:R\$|RS?|r)\s*", " ", texto, flags=re.IGNORECASE)

    for m in re.finditer(r"(\d+[.,]\d{2})", texto_limpo):
        raw = m.group(1)
        if "," in raw and "." in raw:
            s = raw.replace(".", "").replace(",", ".")
        elif "," in raw:
            s = raw.replace(",", ".")
        else:
            s = raw
        try:
            val = float(s)
            if 0.50 < val < 500:
                precos.append(val)
        except ValueError:
            pass

    for m in re.finditer(r"(?<!\d)[,.\s](\d{1,3})\s+(\d{2})\b", " " + texto_limpo):
        try:
            inteiro = int(m.group(1))
            decimal = int(m.group(2))
            if 1 <= inteiro <= 500 and 0 <= decimal <= 99:
                val = inteiro + decimal / 100
                if 0.50 < val < 5000 and val not in precos:
                    precos.append(val)
        except ValueError:
            pass

    return precos


def extrair_litragem(textos_proximos):
    """Procura litragem/medida em lista de textos. Retorna string ou None."""
    for t in textos_proximos:
        t_lower = t.strip().lower()
        m = re.search(r"(\d+[.,]?\d*)\s*(ml|l|lt|kg|g|gr|mg|un|cx|pct)\b", t_lower)
        if m:
            return f"{m.group(1)}{m.group(2)}"
        # formatos como "80g" sem espaco
        m = re.search(r"(\d+)\s*(ml|l|kg|g)\b", t_lower)
        if m:
            return f"{m.group(1)}{m.group(2)}"
    return None


def eh_clube_texto(texto):
    """Verifica se o texto indica preco clube (SEM CLUBE, COM CLUBE, etc)."""
    t = texto.lower().strip()
    if re.match(r"^sem\s+clube$", t):
        return "sem_clube"
    if re.match(r"^com\s*[`(c].*clube", t) or re.match(r"^com\s*dube", t) or re.match(r"^com\s*cube", t):
        return "com_clube"
    return None


def detectar_colunas(itens, tipo_filtro=None):
    """Agrupa itens por coluna baseado no X. Retorna lista de colunas ordenadas por X."""
    xs = [it["x"] for it in itens]
    if not xs:
        return []

    xs.sort()
    colunas = []
    col_atual = [xs[0]]

    for i in range(1, len(xs)):
        if xs[i] - col_atual[-1] < 100:
            col_atual.append(xs[i])
        else:
            colunas.append(sum(col_atual) / len(col_atual))
            col_atual = [xs[i]]
    colunas.append(sum(col_atual) / len(col_atual))
    return colunas


def encontrar_coluna(x, centros):
    """Encontra a coluna mais proxima para um X dado."""
    if not centros:
        return -1
    melhor = min(range(len(centros)), key=lambda i: abs(centros[i] - x))
    if abs(centros[melhor] - x) < 150:
        return melhor
    return -1


def parear_produtos_precos(itens):
    """Pareia produtos com precos usando colunas verticais.

    1. Detecta colunas (clusters de X)
    2. Dentro de cada coluna, ordena por Y
    3. Pareia: produtos acima, precos abaixo
    """
    produtos_candidatos = []
    precos_todos = []
    descricoes = []
    medias = []

    for item in itens:
        tipo = item["tipo"]
        texto = item["texto_limpo"]
        y = item["y"]
        x = item["x"]

        if tipo == "preco":
            lista_precos = extrair_todos_precos(item["texto"])
            if lista_precos:
                if len(lista_precos) == 1:
                    precos_todos.append({
                        "valor": lista_precos[0],
                        "y": y, "x": x,
                        "texto": item["texto"],
                    })
                else:
                    sorted_precos = sorted(lista_precos, reverse=True)
                    precos_todos.append({
                        "valor": sorted_precos[0],
                        "y": y, "x": x,
                        "texto": item["texto"],
                    })
                    precos_todos.append({
                        "valor": sorted_precos[1],
                        "y": y, "x": x + 60,
                        "texto": item["texto"],
                        "eh_clube_do": len(precos_todos) - 1,
                    })
        elif tipo == "produto":
            produtos_candidatos.append({
                "nome": texto,
                "y": y, "x": x,
                "conf": item["conf"],
            })
        elif tipo in ("desc", "medida"):
            medias.append({"texto": texto, "y": y, "x": x})

    # detectar colunas usando todos os itens relevantes
    todos_xy = [{"x": p["x"], "y": p["y"]} for p in produtos_candidatos]
    todos_xy += [{"x": p["x"], "y": p["y"]} for p in precos_todos]
    centros_colunas = detectar_colunas(todos_xy)

    # agrupar produtos por coluna e depois por Y proximo
    produtos_candidatos.sort(key=lambda p: (p["x"], p["y"]))
    grupos = []
    usados = set()
    for i, prod in enumerate(produtos_candidatos):
        if i in usados:
            continue
        grupo = [prod]
        for j, outro in enumerate(produtos_candidatos):
            if j <= i or j in usados:
                continue
            dy = abs(prod["y"] - outro["y"])
            dx = abs(prod["x"] - outro["x"])
            if dy < 40 and dx < 100:
                grupo.append(outro)
                usados.add(j)
        grupos.append(grupo)

    # construir produtos finais com nome + litragem
    produtos = []
    for grupo in grupos:
        titulo = grupo[0]["nome"]
        y_medio = sum(p["y"] for p in grupo) / len(grupo)
        x_medio = sum(p["x"] for p in grupo) / len(grupo)
        conf_min = min(p["conf"] for p in grupo)

        textos_grupo = [p["nome"] for p in grupo]
        litragem = extrair_litragem(textos_grupo)

        if not litragem:
            textos_busca = [m["texto"] for m in medias if abs(m["x"] - x_medio) < 100 and 0 < m["y"] - y_medio < 80]
            litragem = extrair_litragem(textos_busca)

        nome_final = titulo
        if litragem and litragem.lower() not in titulo.lower():
            nome_final = f"{titulo} {litragem}"

        produtos.append({
            "nome": nome_final,
            "y": y_medio,
            "x": x_medio,
            "conf": conf_min,
            "coluna": encontrar_coluna(x_medio, centros_colunas),
        })

    if not produtos or not precos_todos:
        return [{"nome": p["nome"], "preco": None, "preco_clube": None,
                 "erro_identificacao": p["conf"] < 0.3} for p in produtos]

    # agrupar precos por coluna
    for preco in precos_todos:
        preco["coluna"] = encontrar_coluna(preco["x"], centros_colunas)

    clube_de = {}
    for idx, preco in enumerate(precos_todos):
        if "eh_clube_do" in preco:
            clube_de[preco["eh_clube_do"]] = idx

    # parear: dentro de cada coluna, produto mais proximo do preco (por Y)
    pares = []
    precos_usados = set()

    for prod in produtos:
        col_prod = prod["coluna"]
        melhor_preco = None
        melhor_dist = float("inf")
        melhor_idx = -1

        for idx, preco in enumerate(precos_todos):
            if idx in precos_usados or "eh_clube_do" in preco:
                continue
            # preco deve estar ABAIXO do produto (y do preco > y do produto)
            # e na mesma coluna (ou coluna proxima)
            if preco["coluna"] != col_prod and col_prod >= 0 and preco["coluna"] >= 0:
                continue
            dist_y = preco["y"] - prod["y"]  # positivo = preco abaixo

            if 0 < dist_y < melhor_dist:
                melhor_dist = dist_y
                melhor_preco = preco
                melhor_idx = idx

        preco_normal = None
        preco_clube = None

        # mesmo que sem coluna, so parear se preco esta abaixo e proximo
        if melhor_preco and melhor_dist < 400:
            precos_usados.add(melhor_idx)
            preco_normal = melhor_preco["valor"]

            if melhor_idx in clube_de:
                idx_clube = clube_de[melhor_idx]
                preco_clube = precos_todos[idx_clube]["valor"]
                precos_usados.add(idx_clube)
            else:
                candidatos_clube = []
                for idx, p2 in enumerate(precos_todos):
                    if idx in precos_usados or "eh_clube_do" in p2:
                        continue
                    dist2 = abs(melhor_preco["y"] - p2["y"])
                    dx = abs(melhor_preco["x"] - p2["x"])
                    if dist2 < 40 and dx > 10:
                        candidatos_clube.append((p2["valor"], idx, dx))

                candidatos_clube.sort(key=lambda c: c[0])
                for val_clube, idx_clube, _ in candidatos_clube:
                    if val_clube < preco_normal:
                        preco_clube = val_clube
                        precos_usados.add(idx_clube)
                        break

        erro = prod["conf"] < 0.3

        pares.append({
            "nome": prod["nome"],
            "preco": preco_normal,
            "preco_clube": preco_clube,
            "erro_identificacao": erro,
        })

    # estrategia 2: parear por X para produtos sem preco
    produtos_sem_preco = [i for i, p in enumerate(pares) if p["preco"] is None]
    precos_disponiveis = [p for idx, p in enumerate(precos_todos) if idx not in precos_usados]

    if produtos_sem_preco and precos_disponiveis:
        prod_x = [(i, pares[i]["nome"], produtos[i]["x"]) for i in produtos_sem_preco]
        preco_x = [(p["valor"], p["x"]) for p in precos_disponiveis]

        prod_x.sort(key=lambda t: t[2])
        preco_x.sort(key=lambda t: t[1])

        for i, (idx_prod, nome, x_prod) in enumerate(prod_x):
            if i < len(preco_x):
                pares[idx_prod]["preco"] = preco_x[i][0]

                if i + 1 < len(preco_x):
                    dist_x = abs(preco_x[i][1] - preco_x[i+1][1])
                    if dist_x < 80 and preco_x[i+1][0] < preco_x[i][0]:
                        pares[idx_prod]["preco_clube"] = preco_x[i+1][0]

    return pares


def extrair_data(texto):
    meses = {
        "jan": 1, "fev": 2, "mar": 3, "abr": 4, "mai": 5, "jun": 6,
        "jul": 7, "ago": 8, "set": 9, "out": 10, "nov": 11, "dez": 12,
    }

    m = re.search(r"(\d{1,2})\s*(?:a|às|-)\s*(\d{1,2})?\s*/\s*(\d{1,2})\s*/\s*(\d{4})", texto)
    if m:
        return f"{m.group(3).zfill(2)}/{m.group(1).zfill(2)}/{m.group(4)}"

    m = re.search(r"(\d{1,2})\s*/\s*(\d{1,2})\s*/\s*(\d{4})", texto)
    if m:
        return f"{m.group(2).zfill(2)}/{m.group(1).zfill(2)}/{m.group(3)}"

    m = re.search(r"(\d{1,2})\s+a\s+(\d{1,2})\s+de\s+(jan|fev|mar|abr|mai|jun|jul|ago|set|out|nov|dez)", texto, re.IGNORECASE)
    if m:
        mes = meses.get(m.group(3)[:3].lower(), 0)
        return f"{m.group(1)}-{m.group(2)}/{mes:02d}"

    return None


def criar_banco():
    conn = sqlite3.connect(BANCO_DADOS)
    c = conn.cursor()
    c.execute("""
        CREATE TABLE IF NOT EXISTS produtos (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            imagem TEXT NOT NULL,
            produto TEXT,
            preco REAL,
            preco_clube REAL,
            data_encarte TEXT,
            texto_ocr TEXT,
            erro_identificacao INTEGER DEFAULT 0,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    """)
    conn.commit()
    return conn


def main():
    if not os.path.exists(PASTA_IMGS):
        print(f"Pasta '{PASTA_IMGS}' nao encontrada.")
        return

    arquivos = sorted([
        f for f in os.listdir(PASTA_IMGS)
        if f.lower().endswith((".jpg", ".jpeg", ".png", ".webp"))
    ])

    print(f"Encontradas {len(arquivos)} imagens em '{PASTA_IMGS}/'")
    print("Carregando EasyOCR...\n")

    reader = easyocr.Reader(['pt', 'en'], gpu=True)

    if os.path.exists(BANCO_DADOS):
        os.remove(BANCO_DADOS)

    conn = criar_banco()
    cursor = conn.cursor()

    total = len(arquivos)
    com_produto = 0
    sem_produto = 0
    erros = 0
    todos_produtos = []

    for i, arquivo in enumerate(arquivos, 1):
        caminho = os.path.join(PASTA_IMGS, arquivo)

        try:
            itens = ler_imagem_detalhado(reader, caminho)
        except Exception as e:
            print(f"  [{i}/{total}] ERRO: {e}")
            erros += 1
            continue

        texto_completo = " ".join(it["texto"] for it in itens)

        if not itens:
            sem_produto += 1
            continue

        pares = parear_produtos_precos(itens)

        if not pares:
            sem_produto += 1
            continue

        com_produto += 1
        data = extrair_data(texto_completo)

        for par in pares:
            registro = {
                "imagem": arquivo,
                "produto": par["nome"],
                "preco": par["preco"],
                "preco_clube": par["preco_clube"],
                "data_encarte": data,
                "erro_identificacao": 1 if par.get("erro_identificacao") else 0,
            }
            todos_produtos.append(registro)

            cursor.execute(
                "INSERT INTO produtos (imagem, produto, preco, preco_clube, data_encarte, texto_ocr, erro_identificacao) VALUES (?, ?, ?, ?, ?, ?, ?)",
                (arquivo, par["nome"], par["preco"], par["preco_clube"], data, texto_completo.strip(), 1 if par.get("erro_identificacao") else 0),
            )

            preco_fmt = f"R$ {par['preco']:.2f}" if par["preco"] else "s/preco"
            clube_fmt = f" clube R$ {par['preco_clube']:.2f}" if par["preco_clube"] else ""
            erro_fmt = " [ERRO]" if par.get("erro_identificacao") else ""
            print(f"  [{i}/{total}] {par['nome'][:45]:45s} | {preco_fmt:12s}{clube_fmt}{erro_fmt}")

    conn.commit()
    conn.close()

    print(f"\n{'='*60}")
    print(f"RESUMO:")
    print(f"  Total imagens:     {total}")
    print(f"  Com produto:       {com_produto}")
    print(f"  Sem produto:       {sem_produto}")
    print(f"  Erros:             {erros}")
    print(f"  Registros salvos:  {len(todos_produtos)}")
    print(f"  Com erro id.:      {sum(1 for p in todos_produtos if p.get('erro_identificacao'))}")
    print(f"  Banco de dados:    {BANCO_DADOS}")

    with open("produtos_extraidos.json", "w", encoding="utf-8") as f:
        json.dump(todos_produtos, f, ensure_ascii=False, indent=2)


if __name__ == "__main__":
    main()
