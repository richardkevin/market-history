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


def detectar_zonas(itens):
    """Detecta zonas Y da imagem: banner, produto, imagem, preco."""
    if not itens:
        return {"banner_max": 120, "produto_min": 120, "produto_max": 220,
                "preco_min": 300, "imagem_min": 220, "imagem_max": 300}

    # encontrar cluster de precos (textos com numeros na parte de baixo)
    y_precos = []
    y_produtos = []
    for item in itens:
        t = item["texto"]
        y = item["y"]
        # detectar precos: "17,99" / "18 99" / "Rs15,99"
        tem_preco = bool(re.search(r"\d+[.,]\d{2}", t))
        tem_preco_espaco = bool(re.search(r"\d{1,3}\s+\d{2}\b", t))
        tem_rs = bool(re.search(r"(?:Rs?|R\$)\s*\d", t, re.IGNORECASE))
        if (tem_preco or tem_preco_espaco or tem_rs) and y > 250:
            y_precos.append(y)
        elif not tem_preco and not tem_preco_espaco and item["conf"] > 0.2 and re.search(r"[a-zA-ZÀ-ú]{3,}", t):
            y_produtos.append(y)

    if y_precos:
        preco_min = min(y_precos) - 30
    else:
        preco_min = 320

    # produtos ficam acima dos precos
    produtos_acima = [y for y in y_produtos if y < preco_min - 30]
    if produtos_acima:
        produto_max = max(produtos_acima) + 30
    else:
        produto_max = preco_min - 30

    return {
        "banner_max": 120,
        "produto_min": 100,
        "produto_max": produto_max,
        "imagem_min": produto_max,
        "imagem_max": preco_min,
        "preco_min": preco_min,
        "preco_max": 420,
    }


def ler_imagem_detalhado(reader, caminho):
    """Le imagem com EasyOCR retornando texto, confianca e bounding box."""
    resultados = reader.readtext(caminho, detail=1, paragraph=False)
    itens = []
    for bbox, texto, conf in resultados:
        if conf < CONF_MINIMA:
            # manter textos com padrao de preco mesmo com confianca baixa
            if re.search(r"\d+[.,]?\d*\s*(?:Rs?|R\$)\s*\d", texto, re.IGNORECASE):
                pass
            elif re.search(r"\d+[.,]\d{2}", texto):
                pass
            else:
                continue
        # centro Y do bounding box
        y_medio = sum(p[1] for p in bbox) / 4
        x_medio = sum(p[0] for p in bbox) / 4
        itens.append({
            "texto": texto.strip(),
            "conf": conf,
            "y": y_medio,
            "x": x_medio,
            "bbox": bbox,
        })

    # classificar zonas
    zonas = detectar_zonas(itens)
    for item in itens:
        y = item["y"]
        t = item["texto"]
        # detectar qualquer tipo de preco
        tem_preco = bool(re.search(r"\d+[.,]\d{2}", t))
        tem_preco_espaco = bool(re.search(r"\d{1,3}\s+\d{2}\b", t))
        tem_rs = bool(re.search(r"(?:Rs?|R\$)\s*\d", t, re.IGNORECASE))
        eh_preco = tem_preco or tem_preco_espaco or tem_rs

        if y < zonas["banner_max"]:
            item["zona"] = "banner"
        elif y < zonas["produto_max"] and not eh_preco:
            item["zona"] = "produto"
        elif eh_preco and y >= zonas["preco_min"]:
            item["zona"] = "preco"
        elif eh_preco and y < zonas["preco_min"]:
            item["zona"] = "preco_outras"
        else:
            item["zona"] = "imagem"

    return itens


def eh_produto_valido(texto):
    """Verifica se o texto parece ser um nome de produto."""
    if len(texto) < 4:
        return False

    # Textos que sao claramente banners/lixo
    padroes_lixo = [
        r"^[^a-zA-ZÀ-ú]+$",                   # so numeros/simbolos
        r"^(Soo|prezunic|PREZUNIC|TEM|OFERTAS?)\s",
        r"(TEM|OFERTAS?|CASHBACK|PREZUNIC)$",
        r"^\d+[.,]?\d*\s*(Rs?|R\$)?\s*\d",    # mistura de numeros
        r"^[A-Z]{1,3}\s+[A-Z]{1,3}$",          # siglas curtas
        r"Cotton|Coffon|FOLHAIiclA|Lsiil|Ghgupr|Veycllje|LaticiiO",
        # banners promocionais
        r"(GANHE|PARCELE|APROVEITE|PAGUE|LEVE|COMPRE|RECEBA|TROQUE)",
        r"(CASHBACK|CASHBACKO|CREDito|DESCONTO|BONUS)",
        r"^(DE|OU|EM|ATE|COM)\s",
        r"(NOVA|COMPRAS?|EXPERIENCIA|OFERTA)",
    ]
    for p in padroes_lixo:
        if re.search(p, texto, re.IGNORECASE):
            return False

    # deve ter pelo menos uma letra
    if not re.search(r"[a-zA-ZÀ-ú]{3,}", texto):
        return False

    return True


def eh_banner(texto):
    texto_lower = texto.lower().strip()

    tem_produto = any(re.search(p, texto_lower) for p in [
        r"\d+[.,]\d{2}", r"kg\b", r"ml\b", r"lata\b",
        r"garrafa", r"long\s*neck", r"pote\b", r"caixa\b",
        r"cerveja", r"whisky", r"vinho", r"café", r"azeite",
        r"papel", r"higi[eê]nico", r"refrigerante", r"suco",
        r"leite", r"arroz", r"feij[aã]o", r"carne", r"frango",
        r"peixe", r"presunto", r"queijo", r"manteiga", r"alho",
        r"batata", r"macarr", r"lingui", r"salsicha",
    ])

    if tem_produto:
        return False

    hits_banner = sum(1 for p in [
        r"prezunic\s+tem", r"\+cashback", r"ofertas?\s*$",
        r"sexto[uu]", r"reinaugura", r"encontre\s+a\s+loja",
        r"parcele", r"vem[áa]\s+a", r"amanh[aã]",
        r"nova\s+experi", r"de\s+compras", r"preços?\s+imbat",
    ] if re.search(p, texto_lower))

    linhas = [l.strip() for l in texto_lower.split("\n") if l.strip()]

    if hits_banner >= 2:
        return True
    if len(linhas) <= 2 and not tem_produto:
        return True

    return False


def extrair_precos(texto):
    precos = []
    for m in re.finditer(r"(\d+[.,]\d{2})", texto):
        s = m.group(1).replace(".", "").replace(",", ".")
        try:
            val = float(s)
            if 0.50 < val < 5000:
                precos.append(val)
        except ValueError:
            pass
    return precos


def extrair_produto_linha(texto):
    """Extrai nome de produto de uma linha de texto."""
    texto = texto.strip()

    #ignorar textos de banner
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

    #produtos em caixa alta
    if re.match(r"^[A-ZÀ-Ú][A-ZÀ-Ú\s\d.,'&/-]{3,}$", texto):
        return texto

    #produtos com mistura de caixa
    m = re.search(
        r"([A-ZÀ-Ú][a-zà-ú]+(?:\s+(?:de|do|da|e|ou|com)\s+)?[A-ZÀ-Ú][a-zA-Zà-ú]+(?:\s+[a-zA-Zà-ú]+){0,3})",
        texto,
    )
    if m:
        return m.group(1).strip()

    #produtos comeca com maiuscula
    if re.match(r"^[A-ZÀ-Ú][a-zà-ú]+", texto) and len(texto) > 4:
        return texto

    return None


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


def eh_medida(texto):
    """Verifica se o texto e uma medida (litragem, peso) e nao um preco."""
    texto = texto.strip().lower()
    # litragens: 1,75l / 473ml / 1,750 / etc
    if re.match(r"^\d+[.,]?\d*\s*(l|lt|ml|kg|g|gr|mg|un|cx|pct)\b", texto):
        return True
    # "1,751" so numero seguido de nada mas conf alta = provavelmente litragem
    if re.match(r"^\d+[.,]\d{1,3}$", texto):
        return True
    return False


def extrair_todos_precos(texto, conf=1.0):
    """Extrai todos os precos de um texto, incluindo '18 99' como 18.99."""
    precos = []

    # nao extrair precos de textos comecando com nao-numero (lixo OCR)
    if texto.strip() and not re.match(r"^\s*\d", texto):
        if not re.search(r"(?:R\$|RS?|por)\s*\d", texto, re.IGNORECASE):
            return precos

    # litragem/medida? ignorar
    if eh_medida(texto):
        return precos

    # limpar prefixos de preco (R$, RS, rs, r, R)
    texto_limpo = re.sub(r"(?:R\$|RS?|r)\s*", " ", texto, flags=re.IGNORECASE)

    # precos normais: 17,99 / 17.99 / 59,90
    for m in re.finditer(r"(\d+[.,]\d{2})", texto_limpo):
        raw = m.group(1)
        if "," in raw and "." in raw:
            # ex: 1.299,99 → BR formato misto
            s = raw.replace(".", "").replace(",", ".")
        elif "," in raw:
            # ex: 17,99 → BR formato (virgula = decimal)
            s = raw.replace(",", ".")
        else:
            # ex: 17.99 → ponto e decimal
            s = raw
        try:
            val = float(s)
            if 0.50 < val < 500:
                precos.append(val)
        except ValueError:
            pass

    # precos sem separador: "18 99" -> 18.99, "50 28" -> 50.28
    # (pode ter MULTIPLOS precos no mesmo bloco, ex: "55,10  rs50 28")
    # IMPORTANTE: so matchar se o primeiro N nao faz parte de "N,NN" ou "N.NN"
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


def parear_produtos_precos(itens):
    """Pareia produtos com precos usando coordenadas e zonas."""
    produtos = []
    precos_todos = []

    for item in itens:
        texto = item["texto"]
        zona = item.get("zona", "desconhecida")

        #eh preco? (um bloco pode ter multiplos precos)
        lista_precos = extrair_todos_precos(texto)
        if lista_precos and zona in ("preco", "preco_outras"):
            if len(lista_precos) == 1:
                precos_todos.append({
                    "valor": lista_precos[0],
                    "y": item["y"],
                    "x": item["x"],
                    "texto": texto,
                })
            else:
                # multiplos precos no mesmo bloco: maior=normal, menor=clube
                sorted_precos = sorted(lista_precos, reverse=True)
                precos_todos.append({
                    "valor": sorted_precos[0],
                    "y": item["y"],
                    "x": item["x"],
                    "texto": texto,
                })
                precos_todos.append({
                    "valor": sorted_precos[1],
                    "y": item["y"],
                    "x": item["x"] + 60,
                    "texto": texto,
                    "eh_clube_do": len(precos_todos) - 1,
                })
            continue

        #eh produto? (só zona de produto ou desconhecida)
        nome = extrair_produto_linha(texto)
        if nome and eh_produto_valido(nome):
            if zona in ("produto", "desconhecida"):
                produtos.append({"nome": nome, "y": item["y"], "x": item["x"]})

    if not produtos or not precos_todos:
        return [{"nome": p["nome"], "preco": None, "preco_clube": None} for p in produtos]

    #estrategia 1: parear por proximidade Y (produtos e precos na mesma linha)
    pares = []
    precos_usados = set()

    # pre-construir mapa de clube para cada preco normal
    clube_de = {}
    for idx, preco in enumerate(precos_todos):
        if "eh_clube_do" in preco:
            clube_de[preco["eh_clube_do"]] = idx

    for prod in produtos:
        melhor_preco = None
        melhor_dist = float("inf")
        melhor_idx = -1

        for idx, preco in enumerate(precos_todos):
            if idx in precos_usados:
                continue
            # pular precos que sao clube (so parear normais)
            if "eh_clube_do" in preco:
                continue
            dist_y = abs(prod["y"] - preco["y"])
            if dist_y < melhor_dist:
                melhor_dist = dist_y
                melhor_preco = preco
                melhor_idx = idx

        preco_normal = None
        preco_clube = None

        #tolerancia maior pra imagens onde produtos ficam em cima e precos embaixo
        if melhor_preco and melhor_dist < 250:
            precos_usados.add(melhor_idx)
            preco_normal = melhor_preco["valor"]

            # se este preco tem um clube associado (mesmo bloco OCR), usar direto
            if melhor_idx in clube_de:
                idx_clube = clube_de[melhor_idx]
                preco_clube = precos_todos[idx_clube]["valor"]
                precos_usados.add(idx_clube)
            else:
                #procurar segundo preco perto do primeiro (clube prezunic)
                candidatos_clube = []
                for idx, p2 in enumerate(precos_todos):
                    if idx in precos_usados:
                        continue
                    if "eh_clube_do" in p2:
                        continue
                    dist2 = abs(melhor_preco["y"] - p2["y"])
                    dx = abs(melhor_preco["x"] - p2["x"])
                    if dist2 < 30 and dx > 15:
                        candidatos_clube.append((p2["valor"], idx, dx))

                # preferir o preco MENOR que o normal (clube sempre menor)
                candidatos_clube.sort(key=lambda c: c[0])
                for val_clube, idx_clube, _ in candidatos_clube:
                    if val_clube < preco_normal:
                        preco_clube = val_clube
                        precos_usados.add(idx_clube)
                        break

        pares.append({
            "nome": prod["nome"],
            "preco": preco_normal,
            "preco_clube": preco_clube,
        })

    #estrategia 2: se algum produto ficou sem preco, parear por posicao X
    # (produtos e precos ordenados pela mesma coluna)
    produtos_sem_preco = [i for i, p in enumerate(pares) if p["preco"] is None]
    precos_disponiveis = [p for idx, p in enumerate(precos_todos) if idx not in precos_usados]

    if produtos_sem_preco and precos_disponiveis:
        #ordenar produtos e precos disponiveis por X
        prod_x = [(i, pares[i]["nome"], produtos[i]["x"]) for i in produtos_sem_preco]
        preco_x = [(p["valor"], p["x"]) for p in precos_disponiveis]

        prod_x.sort(key=lambda t: t[2])
        preco_x.sort(key=lambda t: t[1])

        for i, (idx_prod, nome, x_prod) in enumerate(prod_x):
            if i < len(preco_x):
                pares[idx_prod]["preco"] = preco_x[i][0]

                #procurar clube (proximo preco em X, MENOR que o normal)
                if i + 1 < len(preco_x):
                    dist_x = abs(preco_x[i][1] - preco_x[i+1][1])
                    if dist_x < 80 and preco_x[i+1][0] < preco_x[i][0]:
                        pares[idx_prod]["preco_clube"] = preco_x[i+1][0]

    return pares


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

    reader = easyocr.Reader(["pt", "en"], gpu=False)

    #limpar banco antigo
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

        if not itens or eh_banner(texto_completo):
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
            }
            todos_produtos.append(registro)

            cursor.execute(
                "INSERT INTO produtos (imagem, produto, preco, preco_clube, data_encarte, texto_ocr) VALUES (?, ?, ?, ?, ?, ?)",
                (arquivo, par["nome"], par["preco"], par["preco_clube"], data, texto_completo.strip()),
            )

            preco_fmt = f"R$ {par['preco']:.2f}" if par["preco"] else "s/preco"
            clube_fmt = f" clube R$ {par['preco_clube']:.2f}" if par["preco_clube"] else ""
            print(f"  [{i}/{total}] {par['nome'][:45]:45s} | {preco_fmt:12s}{clube_fmt}")

    conn.commit()
    conn.close()

    print(f"\n{'='*60}")
    print(f"RESUMO:")
    print(f"  Total imagens:     {total}")
    print(f"  Com produto:       {com_produto}")
    print(f"  Sem produto:       {sem_produto}")
    print(f"  Erros:             {erros}")
    print(f"  Registros salvos:  {len(todos_produtos)}")
    print(f"  Banco de dados:    {BANCO_DADOS}")

    with open("produtos_extraidos.json", "w", encoding="utf-8") as f:
        json.dump(todos_produtos, f, ensure_ascii=False, indent=2)


if __name__ == "__main__":
    main()
