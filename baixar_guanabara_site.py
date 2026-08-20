#!/usr/bin/env python3
"""Baixa encartes do Mercado Guanabara do site oficial.

Busca imagens em supermercadosguanabara.com.br/encarte e baixa todas as paginas.
Sem dependencias externas - usa urllib padrao.
"""

import os
import re
import time
import json
import urllib.request

BASE_URL = "https://supermercadosguanabara.com.br"
PASTA_SAIDA = "encartes_guanabara"


def criar_pasta():
    os.makedirs(PASTA_SAIDA, exist_ok=True)


def buscar_encarte() -> dict:
    url = f"{BASE_URL}/encarte"
    print(f"Acessando: {url}")

    req = urllib.request.Request(url, headers={
        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
        "Accept": "text/html",
    })

    with urllib.request.urlopen(req, timeout=30) as resp:
        html = resp.read().decode("utf-8", errors="ignore")

    imgs = re.findall(
        r'<img[^>]+src="(https?://[^"]+encarte/[^"]+\.jpg[^"]*)"',
        html
    )

    validade_match = re.search(
        r'Válido de (\d{2}/\d{2}/\d{4}) (?:até|a) (\d{2}/\d{2}/\d{4})',
        html, re.IGNORECASE
    )
    if not validade_match:
        validade_match = re.search(
            r'(\d{2}/\d{2}/\d{4})\s*(?:a|até)\s*(\d{2}/\d{2}/\d{4})',
            html
        )

    validade = ""
    if validade_match:
        validade = f"{validade_match.group(1)}_{validade_match.group(2)}"

    return {"url": url, "validade": validade, "imagens": imgs}


def download_imagem(url: str, caminho: str) -> bool:
    try:
        req = urllib.request.Request(url, headers={
            "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
            "Accept": "image/*",
            "Referer": f"{BASE_URL}/encarte",
        })
        with urllib.request.urlopen(req, timeout=30) as resp:
            data = resp.read()
            if len(data) > 5000:
                with open(caminho, "wb") as f:
                    f.write(data)
                return True
    except Exception as e:
        print(f"    Erro: {e}")
    return False


def main():
    criar_pasta()

    print("=== Encartes Guanabara - Download ===\n")

    encarte = buscar_encarte()

    if not encarte["imagens"]:
        print("Nenhuma imagem encontrada.")
        return

    validade_fmt = encarte["validade"].replace("/", "-") if encarte["validade"] else "atual"
    print(f"Validade: {encarte['validade'] or 'N/A'}")
    print(f"Paginas: {len(encarte['imagens'])}\n")

    baixadas = 0
    log = []

    for i, url in enumerate(encarte["imagens"], 1):
        nome = f"guanabara_encarte_{validade_fmt}_pag{i:02d}.jpg"
        caminho = os.path.join(PASTA_SAIDA, nome)

        if os.path.exists(caminho) and os.path.getsize(caminho) > 5000:
            print(f"[{i}/{len(encarte['imagens'])}] {nome} - ja existe")
            log.append({"url": url, "arquivo": nome, "status": "ja_existe"})
            baixadas += 1
            continue

        print(f"[{i}/{len(encarte['imagens'])}] Pagina {i}...", end=" ")

        if download_imagem(url, caminho):
            print("OK")
            log.append({"url": url, "arquivo": nome, "status": "ok"})
            baixadas += 1
        else:
            log.append({"url": url, "arquivo": nome, "status": "falhou"})
            print("FALHOU")

        time.sleep(0.5)

    log_path = os.path.join(PASTA_SAIDA, "log.json")
    with open(log_path, "w") as f:
        json.dump(log, f, indent=2, ensure_ascii=False)

    print(f"\n=== Resultado: {baixadas}/{len(encarte['imagens'])} paginas ===")
    print(f"Pasta: {PASTA_SAIDA}/")


if __name__ == "__main__":
    main()
