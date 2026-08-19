#!/usr/bin/env python3
"""Le imagens do Facebook do Prezunic, extrai produtos/precos e salva em SQLite."""

import os
import re
import sqlite3
import json
import pytesseract
from PIL import Image

PASTA_IMGS = "fotos_prezunic"
BANCO_DADOS = "prezunic_produtos.db"

# palavras que indicam que a imagem tem info de produto (alem de banner)
CHAVES_PRODUTO = [
    r"\d+[.,]\d{2}",
    r"kg\b", r"l\b", r"ml\b", r"g\b", r"un\b",
    r"r\$", r"por\b", r"ofertas?\b",
    r"pes?co", r"litro", r"duzia", r"caixa", r"pote", r"lata",
    r"lat[aã]o", r"garrafa", r"long\s*neck", r"pet\b",
]

CHAVES_BANNER = [
    r"prezunic\s+tem",
    r"\+cashback",
    r"ofertas\s*$",
    r"sexto[uu]",
    r"reinaugura",
    r"encontre\s+a\s+loja",
    r"parcele",
    r"vem[áa]\s+a",
    r"amanh[aã]",
    r"experience",
]


def normalizar_preco(preco_str):
    s = preco_str.replace(".", "").replace(",", ".")
    try:
        return float(s)
    except ValueError:
        return None


def extrair_precos(texto):
    precos = []
    # R$ 12,90 / R$12.90 / 12,90
    padroes = [
        r"R\$\s*(\d+[.,]\d{2})",
        r"(\d+[.,]\d{2})",
    ]
    for padrao in padroes:
        for m in re.finditer(padrao, texto, re.IGNORECASE):
            val = normalizar_preco(m.group(1))
            if val and 0.10 < val < 10000:
                precos.append(val)
    return precos


def extrair_produtos(texto):
    """Tenta extrair nomes de produtos do texto OCR."""
    produtos = []
    linhas = texto.split("\n")

    # padroes de nomes de produtos (caixa alta ou mista)
    padrao_produto = re.compile(
        r"^([A-ZÀ-Ú][A-ZÀ-Ú\s\d.,'&-]{4,})$"
    )
    padrao_produto_misto = re.compile(
        r"([A-ZÀ-Ú][a-zà-ú]+\s+(?:de\s+|do\s+|da\s+)?[A-ZÀ-Ú][a-zA-Zà-ú]+(?:\s+[a-zA-Zà-ú]+){0,3})"
    )

    for linha in linhas:
        linha = linha.strip()
        if not linha or len(linha) < 5:
            continue

        # skip linhas que sao so banner
        if any(re.search(p, linha, re.IGNORECASE) for p in CHAVES_BANNER):
            continue

        m = padrao_produto.match(linha)
        if m:
            nome = m.group(1).strip()
            if len(nome) > 4 and not re.match(r"^(OFERTAS?|PREZUNIC|CASHBACK)$", nome, re.IGNORECASE):
                produtos.append(nome)
            continue

        m = padrao_produto_misto.search(linha)
        if m:
            nome = m.group(1).strip()
            if len(nome) > 5:
                produtos.append(nome)

    return produtos


def extrair_data(texto):
    """Tenta extrair datas do texto."""
    padroes = [
        (r"(\d{1,2})\s*(?:de\s+)?(?:jan|fev|mar|abr|mai|jun|jul|ago|set|out|nov|dez)[a-z]*\.?\s*(?:de\s+)?(\d{4})", "mes_ext"),
        (r"(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{4})", "data_completa"),
        (r"(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{2})", "data_curta"),
        (r"(\d{1,2})\s+a\s+(\d{1,2})\s*(?:de\s+)?(?:jan|fev|mar|abr|mai|jun|jul|ago|set|out|nov|dez)[a-z]*\.?", "periodo"),
    ]

    meses = {
        "jan": 1, "fev": 2, "mar": 3, "abr": 4, "mai": 5, "jun": 6,
        "jul": 7, "ago": 8, "set": 9, "out": 10, "nov": 11, "dez": 12,
    }

    for padrao, tipo in padroes:
        m = re.search(padrao, texto, re.IGNORECASE)
        if m:
            if tipo == "mes_ext":
                mes_str = m.group(2)[:3].lower()
                return f"{m.group(1).zfill(2)}/{meses.get(mes_str, 0):02d}/{m.group(3)}"
            elif tipo == "data_completa":
                return f"{m.group(1).zfill(2)}/{m.group(2).zfill(2)}/{m.group(3)}"
            elif tipo == "data_curta":
                return f"{m.group(1).zfill(2)}/{m.group(2).zfill(2)}/2025"
            elif tipo == "periodo":
                mes_str = re.search(r"(jan|fev|mar|abr|mai|jun|jul|ago|set|out|nov|dez)", texto, re.IGNORECASE)
                if mes_str:
                    return f"{m.group(1)}-{m.group(2)} de {mes_str.group(0)}"
    return None


def eh_banner(texto):
    """Verifica se a imagem e so um banner promocional sem produto."""
    linhas = [l.strip() for l in texto.split("\n") if l.strip()]
    if not linhas:
        return True

    texto_lower = texto.lower()
    hits_banner = sum(1 for p in CHAVES_BANNER if re.search(p, texto_lower))
    hits_produto = sum(1 for p in CHAVES_PRODUTO if re.search(p, texto_lower))

    # se tem precos provavelmente e produto
    if hits_produto >= 1:
        return False

    # se so tem keywords de banner
    if hits_banner >= 2 and hits_produto == 0:
        return True

    # texto muito curto e provavelmente banner
    if len(linhas) <= 2 and hits_produto == 0:
        return True

    return False


def criar_banco():
    conn = sqlite3.connect(BANCO_DADOS)
    c = conn.cursor()
    c.execute("""
        CREATE TABLE IF NOT EXISTS produtos (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            imagem TEXT NOT NULL,
            produto TEXT,
            preco REAL,
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

    print(f"Encontradas {len(arquivos)} imagens em '{PASTA_IMGS}/'\n")

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
            img = Image.open(caminho)
            texto = pytesseract.image_to_string(img, lang="por")
        except Exception as e:
            print(f"  [{i}/{total}] ERRO lendo {arquivo}: {e}")
            erros += 1
            continue

        if eh_banner(texto):
            sem_produto += 1
            continue

        produtos = extrair_produtos(texto)
        precos = extrair_precos(texto)
        data = extrair_data(texto)

        if not produtos and not precos:
            sem_produto += 1
            continue

        com_produto += 1
        produtos_enum = produtos if produtos else ["(sem nome identificado)"]

        for idx, prod in enumerate(produtos_enum):
            preco = precos[idx] if idx < len(precos) else (precos[0] if precos else None)
            registro = {
                "imagem": arquivo,
                "produto": prod,
                "preco": preco,
                "data_encarte": data,
            }
            todos_produtos.append(registro)

            cursor.execute(
                "INSERT INTO produtos (imagem, produto, preco, data_encarte, texto_ocr) VALUES (?, ?, ?, ?, ?)",
                (arquivo, prod, preco, data, texto.strip()),
            )

            preco_fmt = f"R$ {preco:.2f}" if preco else "s/preco"
            print(f"  [{i}/{total}] {prod} | {preco_fmt} | {data or 's/data'}")

    conn.commit()
    conn.close()

    print(f"\n{'='*50}")
    print(f"RESUMO:")
    print(f"  Total imagens:     {total}")
    print(f"  Com produto:       {com_produto}")
    print(f"  Sem produto:       {sem_produto}")
    print(f"  Erros:             {erros}")
    print(f"  Registros salvos:  {len(todos_produtos)}")
    print(f"  Banco de dados:    {BANCO_DADOS}")

    # salvar indice JSON tambem
    with open("produtos_extraidos.json", "w", encoding="utf-8") as f:
        json.dump(todos_produtos, f, ensure_ascii=False, indent=2)


if __name__ == "__main__":
    main()
