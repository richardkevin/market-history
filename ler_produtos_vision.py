#!/usr/bin/env python3
"""Le imagens do Facebook do Prezunic usando Google Vision API, extrai produtos/precos e salva em SQLite."""

import os
import re
import sqlite3
import json
import base64
import urllib.request
import urllib.error

PASTA_IMGS = "fotos_prezunic"
BANCO_DADOS = "prezunic_produtos.db"


def google_vision_ocr(api_key, caminho_imagem):
    """Chama Google Vision API pra extrair texto de uma imagem."""
    with open(caminho_imagem, "rb") as f:
        conteudo = base64.b64encode(f.read()).decode("utf-8")

    url = f"https://vision.googleapis.com/v1/images:annotate?key={api_key}"
    payload = json.dumps({
        "requests": [{
            "image": {"content": conteudo},
            "features": [{"type": "TEXT_DETECTION", "maxResults": 1}],
            "imageContext": {"languageHints": ["pt"]},
        }]
    }).encode("utf-8")

    req = urllib.request.Request(
        url,
        data=payload,
        headers={"Content-Type": "application/json"},
        method="POST",
    )

    with urllib.request.urlopen(req, timeout=30) as resp:
        resultado = json.loads(resp.read().decode("utf-8"))

    anotacoes = resultado.get("responses", [{}])[0].get("textAnnotations", [])
    if anotacoes:
        return anotacoes[0].get("description", "")
    return ""


def extrair_precos(texto):
    precos = []
    padroes = [
        r"R\$\s*(\d+[.,]\d{2})",
        r"(\d+[.,]\d{2})",
    ]
    for padrao in padroes:
        for m in re.finditer(padrao, texto, re.IGNORECASE):
            s = m.group(1).replace(".", "").replace(",", ".")
            try:
                val = float(s)
                if 0.10 < val < 10000:
                    precos.append(val)
            except ValueError:
                pass
    return precos


def extrair_produtos(texto):
    """Extrai nomes de produtos do texto Vision."""
    produtos = []
    linhas = texto.split("\n")

    padrao_produto = re.compile(
        r"^([A-ZÀ-Ú][A-ZÀ-Ú\s\d.,'&-]{4,})$"
    )
    padrao_produto_misto = re.compile(
        r"([A-ZÀ-Ú][a-zà-ú]+\s+(?:de\s+|do\s+|da\s+)?[A-ZÀ-Ú][a-zA-Zà-ú]+(?:\s+[a-zA-Zà-ú]+){0,3})"
    )

    ignorar = re.compile(
        r"^(OFERTAS?|PREZUNIC|PREZUNI|CASHBACK|SEXTOU|REINAUGURACAO|"
        r"PREÇOS IMBATIVIEIS|UMA NOVA|DE COMPRAS|ENCONTRE|GANHE|"
        r"PARCELE|VEM[AÁ]|AMANH[AÃ]|AMANHÃ|EXPERIENCIA|"
        r"DELIVERY|APP|LOJA|CAFETERIA|PADARIA|ACOUGUE|"
        r"PREZUNIC\s+TEM|OFERTA\s+DO\s+DIA)$",
        re.IGNORECASE,
    )

    for linha in linhas:
        linha = linha.strip()
        if not linha or len(linha) < 5:
            continue

        m = padrao_produto.match(linha)
        if m:
            nome = m.group(1).strip()
            if len(nome) > 4 and not ignorar.match(nome):
                produtos.append(nome)
            continue

        m = padrao_produto_misto.search(linha)
        if m:
            nome = m.group(1).strip()
            if len(nome) > 5 and not ignorar.match(nome):
                produtos.append(nome)

    return produtos


def extrair_data(texto):
    padroes = [
        (r"(\d{1,2})\s*(?:de\s+)?(jan|fev|mar|abr|mai|jun|jul|ago|set|out|nov|dez)[a-z]*\.?\s*(?:de\s+)?(\d{4})", "mes_ext"),
        (r"(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{4})", "data_completa"),
        (r"(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{2})", "data_curta"),
        (r"(\d{1,2})\s+a\s+(\d{1,2})\s*(?:de\s+)?(jan|fev|mar|abr|mai|jun|jul|ago|set|out|nov|dez)[a-z]*\.?", "periodo"),
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
                mes_str = m.group(3)[:3].lower()
                return f"{m.group(1)}-{m.group(2)} de {mes_str}"
    return None


def eh_banner(texto):
    texto_lower = texto.lower().strip()
    linhas = [l.strip() for l in texto_lower.split("\n") if l.strip()]

    if not linhas or len(linhas) <= 1:
        return True

    hits_banner = sum(1 for p in [
        r"prezunic\s+tem", r"\+cashback", r"ofertas?\s*$",
        r"sexto[uu]", r"reinaugura", r"encontre\s+a\s+loja",
        r"parcele", r"vem[áa]\s+a", r"amanh[aã]", r"experience",
        r"nova experience", r"um nova", r"de compras",
        r"preços?\s+imbat", r"ganhe", r"delivery",
        r"prezunic prime", r"aplicativo",
    ] if re.search(p, texto_lower))

    tem_produto = any(re.search(p, texto_lower) for p in [
        r"\d+[.,]\d{2}", r"kg\b", r"ml\b", r"lata\b",
        r"garrafa", r"long\s*neck", r"pote\b", r"caixa\b",
        r"cerveja", r"whisky", r"vinho", r"café", r"azeite",
    ])

    if tem_produto:
        return False

    if hits_banner >= 2:
        return True

    if len(linhas) <= 2 and not tem_produto:
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
    api_key = os.environ.get("GOOGLE_VISION_API_KEY")
    if not api_key:
        api_key = input("Cole sua Google Vision API key: ").strip()
    if not api_key:
        print("API key obrigatoria.")
        return

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
            texto = google_vision_ocr(api_key, caminho)
        except Exception as e:
            print(f"  [{i}/{total}] ERRO Vision API: {e}")
            erros += 1
            continue

        if not texto.strip():
            sem_produto += 1
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
            print(f"  [{i}/{total}] {prod[:55]} | {preco_fmt:12s} | {data or 's/data'}")

        print(f"    OCR: {texto[:120].replace(chr(10), ' ')}...")

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
