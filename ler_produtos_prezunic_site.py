#!/usr/bin/env python3
"""Coleta produtos do catálogo online do Prezunic (VTEX) e insere na tabela produtos.

Fontes consultadas:
  - Cluster de Ofertas:   https://www.prezunic.com.br/1479?map=productClusterIds&order=OrderByTopSaleDESC
  - Departamento Carnes e Aves: https://www.prezunic.com.br/carnes-e-aves

Comportamento:
  - Idempotente: ignora produtos já cadastrados (dedup por productId nos textos).
  - Paginação em lotes pequenos com retries e pausas, para não sobrecarregar a API.
  - Por padrão percorre todas as páginas do cluster de Ofertas e a 1ª página de
    Carnes e Aves; use --tudo para percorrer o departamento inteiro.
"""

import argparse
import json
import sys
import time
import urllib.parse
import urllib.request
from datetime import date

BANCO_DADOS = "encartes_produtos.db"
BASE_API = "https://www.prezunic.com.br/api/catalog_system/pub/products/search"
PAGINA_TAMANHO = 50
MAX_RETRIES = 4
RETRY_DELAY = 3.0
DELAY_ENTRE_PAGINAS = 2.0
SUPERMERCADO = "prezunic"
MODELO = "catálogo online Prezunic"

FONTES = {
    "ofertas": {
        "caminho": "",
        "params": {
            "map": "productClusterIds",
            "O": "OrderByTopSaleDESC",
            "fq": "productClusterIds:1479",
        },
    },
    "carnes-e-aves": {
        "caminho": "/carnes-e-aves",
        "params": {"map": "c,c", "O": "OrderByTopSaleDESC"},
    },
    "mercearia": {
        "caminho": "/mercearia",
        "params": {"map": "c,c", "O": "OrderByTopSaleDESC"},
    },
    "hortifruti": {
        "caminho": "/hortifruti",
        "params": {"map": "c,c", "O": "OrderByTopSaleDESC"},
    },
    "refrigerante": {
        "caminho": "/bebida-nao-alcoolica/refrigerante",
        "params": {"map": "c,c", "O": "OrderByTopSaleDESC"},
    },
    "cerveja": {
        "caminho": "/bebida-alcoolica/cerveja",
        "params": {"map": "c,c", "O": "OrderByTopSaleDESC"},
    },
    "vinhos": {
        "caminho": "/bebida-alcoolica/vinhos-e-espumantes",
        "params": {"map": "c,c", "O": "OrderByTopSaleDESC"},
    },
    "frios-e-laticinios": {
        "caminho": "/frios-e-laticinios",
        "params": {"map": "c,c", "O": "OrderByTopSaleDESC"},
    },
    "padaria": {
        "caminho": "/padaria/pao",
        "params": {"map": "c,c", "O": "OrderByTopSaleDESC"},
    },
}

GENERICOS = {"Fresco", "Alimentação", "Outros", "Outras", "Convencional"}


def http_get(url: str, tentativas: int = MAX_RETRIES):
    ultimo_erro = None
    for i in range(1, tentativas + 1):
        try:
            req = urllib.request.Request(url, headers={"Accept": "application/json"})
            with urllib.request.urlopen(req, timeout=30) as resp:
                return json.loads(resp.read().decode("utf-8"))
        except Exception as e:
            ultimo_erro = e
            if i < tentativas:
                time.sleep(RETRY_DELAY * i)
    raise ultimo_erro


def buscar_pagina(fonte, desloc: int) -> list:
    cfg = FONTES[fonte]
    params = dict(cfg["params"])
    params["_from"] = desloc
    params["_to"] = desloc + PAGINA_TAMANHO - 1
    url = BASE_API + cfg["caminho"] + "?" + urllib.parse.urlencode(params)
    dados = http_get(url)
    if not isinstance(dados, list):
        raise RuntimeError(f"Resposta inesperada: {str(dados)[:120]}")
    return dados


def categoria_de(p):
    cats = p.get("categories") or []
    if not cats:
        return None
    partes = [c.strip("/") for c in cats if c.strip("/")]
    folha = partes[0].split("/")[-1] if partes else None
    if folha and folha in GENERICOS and len(partes) > 1:
        folha = partes[0].split("/")[-2]
    return folha


def extrair(p, hoje):
    it = p.get("items") or [{}]
    it = it[0]
    oferta = (it.get("sellers") or [{}])[0].get("commertialOffer") or {}
    mult = float(it.get("unitMultiplier") or 1)
    preco_original = round((oferta.get("ListPrice") or 0) * mult, 2)
    preco_venda = oferta.get("FullSellingPrice") or oferta.get("Price") or 0
    if preco_venda and preco_venda >= preco_original:
        preco, preco_clube = preco_venda, None
    else:
        preco = preco_original if preco_original else preco_venda
        preco_clube = preco_venda if preco_venda else None

    link = (
        p.get("link")
        or f"https://www.prezunic.com.br/{p.get('linkText') or p.get('productId')}/p"
    )
    produto_id = p.get("productId")
    imagem = (it.get("images") or [{}])[0].get("imageUrl") or f"id-{produto_id}"

    return {
        "imagem": imagem,
        "supermercado": SUPERMERCADO,
        "produto": p.get("productName") or p.get("productTitle"),
        "marca": p.get("brand"),
        "medida": it.get("complementName") or None,
        "preco": preco,
        "preco_clube": preco_clube,
        "tipo_promocao": (
            f"-15%" if preco_clube and preco and preco_clube < preco else None
        ),
        "limite": None,
        "data_encarte": hoje,
        "observacao": f"Origem: {link} | produtoId {produto_id}",
        "texto_ocr": f"{MODELO} | Id {produto_id}",
        "erro_identificacao": 0,
        "categoria": categoria_de(p),
    }


DESLOC_MAXIMO = 2500


def coletar(conn, fonte, paginas_max=None):
    cursor = conn.cursor()
    cursor.execute(
        "SELECT texto_ocr FROM produtos WHERE supermercado = ? AND texto_ocr LIKE ?",
        (SUPERMERCADO, f"{MODELO} | Id %"),
    )
    existentes = {row[0] for row in cursor.fetchall()}

    registros = []
    vistos = set()
    desloc = 0
    falhas_seguidas = 0
    paginas_ok = 0

    while True:
        if paginas_max is not None and paginas_ok >= paginas_max:
            break
        if desloc > DESLOC_MAXIMO:
            print(f"  Fonte '{fonte}': limite de paginação atingido em {desloc}.")
            break
        try:
            dados = buscar_pagina(fonte, desloc)
            falhas_seguidas = 0
        except Exception as e:
            falhas_seguidas += 1
            if falhas_seguidas >= MAX_RETRIES or (
                paginas_max is not None and paginas_ok >= paginas_max
            ):
                print(f"  Fonte '{fonte}': falha ao paginar em {desloc}: {e}")
                break
            print(f"  Fonte '{fonte}': retry paginação {desloc}: {e}")
            time.sleep(RETRY_DELAY)
            continue

        novos_ids = 0
        novos_registros = 0
        for p in dados:
            prod_id = p.get("productId")
            if prod_id in vistos:
                continue
            vistos.add(prod_id)
            novos_ids += 1
            row = extrair(p, date.today().strftime("%d/%m/%Y"))
            if row["texto_ocr"] in existentes:
                continue
            registros.append(row)
            novos_registros += 1
            existentes.add(row["texto_ocr"])

        print(
            f"  Fonte '{fonte}' pág {paginas_ok + 1} (offset {desloc}): "
            f"+{novos_registros} registros | {novos_ids} produtos inéditos na execução",
            flush=True,
        )
        paginas_ok += 1

        if len(dados) < PAGINA_TAMANHO or novos_ids == 0:
            break
        desloc += PAGINA_TAMANHO
        time.sleep(DELAY_ENTRE_PAGINAS)

    return registros


def inserir(conn, registros):
    if not registros:
        return 0
    cursor = conn.cursor()
    cursor.executemany(
        """
        INSERT INTO produtos (
            imagem, supermercado, produto, marca, medida, preco, preco_clube,
            tipo_promocao, limite, data_encarte, observacao, texto_ocr, erro_identificacao, categoria
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """,
        [
            (
                r["imagem"],
                r["supermercado"],
                r["produto"],
                r["marca"],
                r["medida"],
                r["preco"],
                r["preco_clube"],
                r["tipo_promocao"],
                r["limite"],
                r["data_encarte"],
                r["observacao"],
                r["texto_ocr"],
                r["erro_identificacao"],
                r["categoria"],
            )
            for r in registros
        ],
    )
    conn.commit()
    return len(registros)


def main():
    parser = argparse.ArgumentParser(
        description="Coleta produtos do catálogo online do Prezunic (VTEX)."
    )
    parser.add_argument(
        "--tudo",
        action="store_true",
        help="Percorre todas as páginas de todas as fontes (pode ser lento).",
    )
    parser.add_argument(
        "--paginas",
        type=int,
        default=2,
        help="Máximo de páginas por fonte (default: 2 = ~50 produtos por fonte).",
    )
    parser.add_argument("--fontes", help="Subconjunto de fontes: ofertas,carnes-e-aves")
    args = parser.parse_args()

    import sqlite3

    conn = sqlite3.connect(BANCO_DADOS)
    fontes = (
        [f.strip() for f in args.fontes.split(",")]
        if args.fontes
        else ["ofertas", "carnes-e-aves"]
    )

    total = 0
    for fonte in fontes:
        if fonte not in FONTES:
            print(f"Fonte desconhecida: {fonte}")
            continue
        print(f"Coletando: {fonte}")
        paginas_max = None if args.tudo else args.paginas
        registros = coletar(conn, fonte, paginas_max=paginas_max)
        inseridos = inserir(conn, registros)
        total += inseridos
        print(f"  {fonte}: {inseridos} novos registros inseridos.")

    conn.close()
    print(f"\nConcluído! {total} novos registros para o supermercado '{SUPERMERCADO}'.")


if __name__ == "__main__":
    main()
