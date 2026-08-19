#!/usr/bin/env python3
"""Script para baixar encartes do Prezunic."""

import json
import os
import re
import sys
import time
import urllib.request
import urllib.error
from datetime import datetime
from html import unescape


URL_PAGINA = "https://www.prezunic.com.br/encartes"
PASTA_SAIDA = "encartes_prezunic"
USER_AGENT = (
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
    "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
)


def buscar_pagina(url):
    req = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
    with urllib.request.urlopen(req, timeout=30) as resp:
        return resp.read().decode("utf-8", errors="replace")


def extrair_encartes(html):
    idx = html.find('"encartes":[')
    if idx == -1:
        return []

    start = html.index("[", idx)
    depth = 0
    for i in range(start, len(html)):
        if html[i] == "[":
            depth += 1
        elif html[i] == "]":
            depth -= 1
            if depth == 0:
                json_str = html[start:i + 1]
                json_str = json_str.replace("\\u002F", "/")
                return json.loads(json_str)
    return []


def sanitizar_nome(nome):
    nome = re.sub(r'[\\/:*?"<>|]', "_", nome)
    nome = nome.strip(". ")
    return nome[:120]


def baixar_arquivo(url, caminho):
    if os.path.exists(caminho):
        return True
    try:
        req = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
        with urllib.request.urlopen(req, timeout=60) as resp:
            dados = resp.read()
        with open(caminho, "wb") as f:
            f.write(dados)
        return True
    except Exception as e:
        print(f"  ERRO ao baixar: {e}")
        return False


def formatar_data(iso_str):
    if not iso_str:
        return ""
    try:
        dt = datetime.fromisoformat(iso_str.replace("Z", "+00:00"))
        return dt.strftime("%d/%m/%Y")
    except Exception:
        return iso_str


def main():
    print("Buscando pagina de encartes...")
    try:
        html = buscar_pagina(URL_PAGINA)
    except Exception as e:
        print(f"Erro ao acessar pagina: {e}")
        sys.exit(1)

    encartes = extrair_encartes(html)
    if not encartes:
        print("Nenhum encarte encontrado.")
        sys.exit(1)

    print(f"Encontrados {len(encartes)} encartes.\n")

    os.makedirs(PASTA_SAIDA, exist_ok=True)

    pdfs_ok = 0
    pdfs_erro = 0
    capas_ok = 0
    capas_erro = 0

    for i, enc in enumerate(encartes, 1):
        titulo = enc.get("title", f"encarte_{i}")
        inicio = formatar_data(enc.get("startAt", ""))
        fim = formatar_data(enc.get("endAt", ""))
        estado = enc.get("state", "")
        ativo = enc.get("active", False)

        nome_pasta = sanitizar_nome(titulo)
        if estado:
            nome_pasta = f"{nome_pasta}_{estado}"
        nome_pasta = f"{i:02d}_{nome_pasta}"

        caminho_pasta = os.path.join(PASTA_SAIDA, nome_pasta)
        os.makedirs(caminho_pasta, exist_ok=True)

        status = "ATIVO" if ativo else "inativo"
        print(f"[{i}/{len(encartes)}] {titulo}")
        print(f"  Periodo: {inicio} a {fim} | Estado: {estado} | {status}")

        # Baixar PDF
        pdf_url = enc.get("pdfUrl", "")
        if pdf_url:
            ext = ".pdf"
            if ".jpeg" in pdf_url.lower() or ".jpg" in pdf_url.lower():
                ext = ".jpg"
            elif ".png" in pdf_url.lower():
                ext = ".png"
            nome_pdf = sanitizar_nome(titulo) + ext
            caminho_pdf = os.path.join(caminho_pasta, nome_pdf)
            if baixar_arquivo(pdf_url, caminho_pdf):
                print(f"  PDF salvo: {caminho_pdf}")
                pdfs_ok += 1
            else:
                pdfs_erro += 1

        # Baixar capa
        capa_url = enc.get("coverImageUrl", "")
        if capa_url:
            ext_capa = ".jpg"
            if ".png" in capa_url.lower():
                ext_capa = ".png"
            elif ".webp" in capa_url.lower():
                ext_capa = ".webp"
            nome_capa = "capa" + ext_capa
            caminho_capa = os.path.join(caminho_pasta, nome_capa)
            if baixar_arquivo(capa_url, caminho_capa):
                capas_ok += 1
            else:
                capas_erro += 1

        time.sleep(0.5)

    # Salvar indice
    indice_path = os.path.join(PASTA_SAIDA, "indice.json")
    with open(indice_path, "w", encoding="utf-8") as f:
        json.dump(encartes, f, ensure_ascii=False, indent=2)

    print(f"\n--- Resumo ---")
    print(f"PDFs baixados: {pdfs_ok} | Erros: {pdfs_erro}")
    print(f"Capas baixadas: {capas_ok} | Erros: {capas_erro}")
    print(f"Indice salvo em: {indice_path}")
    print(f"Pasta de saida: {PASTA_SAIDA}/")


if __name__ == "__main__":
    main()
