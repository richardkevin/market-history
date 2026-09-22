#!/usr/bin/env python3
"""Baixa encartes do Supermarket.

Duas fontes:
1. Oficial (redesupermarket.com.br): PDFs direto no WordPress (2024+ ainda vivos)
2. Wayback Machine: historico de PDFs (2016-2020, quando original retorna 404)

Estrategia: tenta baixar do site original primeiro (rapido), so usa Wayback se 404.
Sem dependencias externas - usa curl via subprocess.
"""

import json
import os
import re
import subprocess
import time
import urllib.request

from encarte_br import baixar_encarte_br, download_arquivo, USER_AGENT

URL_OFICIAL = "https://redesupermarket.com.br"
URL_CDX = "https://web.archive.org/cdx/search/cdx"
PASTA_SAIDA = "encartes_supermarket"


def buscar_pdf_oficial() -> str:
    """Busca link do PDF no site oficial (WordPress)."""
    print(f"Acessando: {URL_OFICIAL}")

    req = urllib.request.Request(URL_OFICIAL, headers={
        "User-Agent": USER_AGENT,
        "Accept": "text/html",
    })

    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            html = resp.read().decode("utf-8", errors="ignore")
    except Exception as e:
        print(f"  Sem acesso ao site oficial ({e}).")
        return ""

    match = re.search(
        r'href="(https?://redesupermarket\.com\.br/wp-content/uploads/[^"]*encarte-\d+-\d+\.pdf)"',
        html
    )
    return match.group(1) if match else ""


def buscar_historico_wayback() -> list[dict]:
    """Busca PDFs historicos no Wayback Machine via CDX API."""
    cache_path = os.path.join(PASTA_SAIDA, "wayback_index.json")

    if os.path.exists(cache_path):
        age = time.time() - os.path.getmtime(cache_path)
        if age < 7 * 86400:
            print("Usando indice Wayback em cache...")
            with open(cache_path) as f:
                return json.load(f)

    print("Consultando Wayback Machine...")

    params = (
        f"url=redesupermarket.com.br/wp-content/uploads/*"
        f"&output=json&fl=timestamp,original,statuscode,mimetype"
        f"&filter=mimetype:application/pdf&limit=500"
    )

    data = None
    for tentativa in range(1, 5):
        try:
            req = urllib.request.Request(
                f"{URL_CDX}?{params}",
                headers={"User-Agent": USER_AGENT}
            )
            with urllib.request.urlopen(req, timeout=30) as resp:
                data = json.loads(resp.read().decode("utf-8"))
            break
        except Exception as e:
            print(f"  Tentativa {tentativa}/4 falhou: {e}")
            if tentativa < 4:
                time.sleep(5 * tentativa)

    if not data or len(data) <= 1:
        return []

    por_url = {}
    for row in data[1:]:
        ts, url, status, _ = row
        if status != "200":
            continue
        url = url.replace(":80/", "/").replace("www.", "")
        if url not in por_url or ts > por_url[url]["timestamp"]:
            por_url[url] = {"timestamp": ts, "url": url}

    encartes = []
    for info in por_url.values():
        url = info["url"]
        fn = url.split("/")[-1].lower()
        if re.match(r"(encarte[-.]|lamina[-.]|guia[-.])", fn):
            encartes.append(info)
        elif fn in ("encarte.pdf", "encarte.php"):
            encartes.append(info)

    encartes.sort(key=lambda e: e["timestamp"])

    os.makedirs(PASTA_SAIDA, exist_ok=True)
    with open(cache_path, "w") as f:
        json.dump(encartes, f, indent=2, ensure_ascii=False)

    return encartes


def download_curl(url: str, caminho: str, minimo: int = 1000, timeout: int = 60) -> bool:
    """Download via curl."""
    try:
        result = subprocess.run(
            ["curl", "-sL", "-o", caminho, "--max-time", str(timeout), url],
            capture_output=True, timeout=timeout + 30
        )
        if os.path.exists(caminho) and os.path.getsize(caminho) >= minimo:
            return True
        if os.path.exists(caminho):
            os.remove(caminho)
        return False
    except Exception as e:
        print(f"    Erro curl: {e}")
        return False


def download_origem_ou_wayback(url_original: str, caminho: str) -> bool:
    """Tenta baixar do site original; se 404, tenta Wayback Machine."""
    # 1. Site original (rapido)
    if download_curl(url_original, caminho, minimo=1000, timeout=30):
        return True

    # 2. Wayback Machine (lento, pode dar 429)
    url_wb = f"https://web.archive.org/web/2025id_/{url_original}"
    return download_curl(url_wb, caminho, minimo=1000, timeout=60)


def extrair_validade(filename: str) -> str:
    """Tenta extrair periodo do nome do arquivo."""
    m = re.search(r"encarte-(\d{2})-(\d{2})\.pdf", filename)
    if m:
        return f"{m.group(1)}-{m.group(2)}"

    m = re.search(r"(?:lamina|guia)-(\d{2})-(\d{2})\.pdf", filename)
    if m:
        return f"{m.group(1)}-{m.group(2)}"

    m = re.search(r"Validade-(\d{2})-(\d{2})-a-(\d{2})-(\d{2})-(\d{2})", filename)
    if m:
        return f"{m.group(1)}-{m.group(2)}-{m.group(3)}-{m.group(4)}"

    return ""


def main():
    import argparse

    parser = argparse.ArgumentParser(description="Baixa encartes do Supermarket.")
    parser.add_argument(
        "--atual",
        action="store_true",
        help="Baixa apenas o encarte atual (pula historico do Wayback Machine).",
    )
    args = parser.parse_args()

    os.makedirs(PASTA_SAIDA, exist_ok=True)

    print("=== Encartes Supermarket - Download ===\n")

    # 1. PDF do site oficial (atual)
    pdf_url = buscar_pdf_oficial()
    if pdf_url:
        nome_pdf = "supermarket_encarte.pdf"
        caminho_pdf = os.path.join(PASTA_SAIDA, nome_pdf)

        if os.path.exists(caminho_pdf) and os.path.getsize(caminho_pdf) > 1000:
            print(f"PDF ja existe: {nome_pdf}")
        else:
            print(f"Baixando PDF oficial: {pdf_url}")
            print(f"  -> {nome_pdf}", end=" ")
            if download_arquivo(pdf_url, caminho_pdf, minimo=1000):
                print("OK")
            else:
                print("FALHOU")
    else:
        print("PDF oficial nao encontrado.\n")

    # 2. Imagens do encarte.br.com (atual)
    print()
    baixar_encarte_br("supermarket", PASTA_SAIDA, "supermarket")

    # 3. Historico via Wayback Machine (desligado em modo --atual)
    if args.atual:
        print("\nModo 'atual': pulando historico do Wayback Machine.")
        return

    print()
    historico = buscar_historico_wayback()
    if not historico:
        print("Nenhum encarte historico encontrado no Wayback Machine.")
        return

    print(f"Encontrados {len(historico)} encartes historicos.\n")

    baixados = 0
    log = []

    for i, item in enumerate(historico, 1):
        ts = item["timestamp"]
        url_original = item["url"]
        fn_original = url_original.split("/")[-1]
        ano = ts[:4]
        mes = ts[4:6]
        validade = extrair_validade(fn_original)

        nome_pdf = f"supermarket_encarte_{ano}-{mes}_{validade or fn_original}.pdf"
        caminho_pdf = os.path.join(PASTA_SAIDA, nome_pdf)

        print(f"[{i}/{len(historico)}] {ts[:8]} | {fn_original}")

        if os.path.exists(caminho_pdf) and os.path.getsize(caminho_pdf) > 1000:
            print(f"  ja existe: {nome_pdf}")
            log.append({"timestamp": ts, "url": url_original, "arquivo": nome_pdf, "status": "ja_existe"})
            baixados += 1
            continue

        print(f"  baixando...", end=" ")

        if download_origem_ou_wayback(url_original, caminho_pdf):
            print("OK")
            log.append({"timestamp": ts, "url": url_original, "arquivo": nome_pdf, "status": "ok"})
            baixados += 1
        else:
            print("FALHOU")
            log.append({"timestamp": ts, "url": url_original, "arquivo": nome_pdf, "status": "falhou"})

        time.sleep(0.3)

    log_path = os.path.join(PASTA_SAIDA, "log_historico.json")
    with open(log_path, "w") as f:
        json.dump({"historico": log}, f, indent=2, ensure_ascii=False)

    print(f"\n=== Historico: {baixados}/{len(historico)} PDFs ===")
    print(f"Pasta: {PASTA_SAIDA}/")


if __name__ == "__main__":
    main()
