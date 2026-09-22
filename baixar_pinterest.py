#!/usr/bin/env python3
"""Baixa imagens de encartes do Pinterest (Folhetos TV) - versao rapida."""

import subprocess
import re
import os
import json
from pathlib import Path
from concurrent.futures import ThreadPoolExecutor, as_completed

BOARDS = {
    "supermarket": "encarte-ofertas-supermercado-supermarket",
    "guanabara": "encarte-ofertas-supermercado-guanabara",
    "dom-atacadista": "encarte-ofertas-supermercado-dom-atacadista",
    "vianense": "encarte-de-ofertas-supermercado-vianense",
    "super-rede": "encarte-de-ofertas-supermercados-super-rede",
    "assai": "encarte-de-ofertas-assa%c3%ad-atacadista",
    "super-compras": "encarte-ofertas-supermercado-super-compras",
    "unidos": "encarte-ofertas-supermercados-unidos",
    "multimarket": "encarte-de-ofertas-supermercado-multimarket",
    "redeconomia": "encarte-ofertas-supermercado-redeconomia",
}

BASE_URL = "https://br.pinterest.com/folhetostv/"


def fetch_html(url: str) -> str:
    result = subprocess.run(
        ["curl", "-s", "-L", "-H", "User-Agent: Mozilla/5.0", url],
        capture_output=True, text=True, timeout=30
    )
    return result.stdout


def get_board_images(board_slug: str) -> list[str]:
    url = f"{BASE_URL}{board_slug}/"
    html = fetch_html(url)
    pattern = r'https://i\.pinimg\.com/originals/[a-f0-9]{2}/[a-f0-9]{2}/[a-f0-9]{2}/[a-f0-9]+\.jpg'
    return list(dict.fromkeys(re.findall(pattern, html)))


def download_one(args: tuple) -> tuple[str, bool, str]:
    url, filepath = args
    try:
        result = subprocess.run(
            ["curl", "-s", "-L", "-o", filepath, url],
            capture_output=True, timeout=30
        )
        return (filepath, True, "")
    except Exception as e:
        return (filepath, False, str(e))


def main():
    out_dir = Path("encartes_pinterest")
    out_dir.mkdir(exist_ok=True)

    all_downloads = []
    board_counts = {}

    # Coletar URLs de todos os boards
    for name, slug in BOARDS.items():
        board_dir = out_dir / name
        board_dir.mkdir(exist_ok=True)

        print(f"Buscando board: {name}...")
        images = get_board_images(slug)
        print(f"  {len(images)} imagens encontradas")

        board_counts[name] = len(images)

        for img_url in images:
            filename = img_url.split("/")[-1]
            filepath = str(board_dir / filename)
            if not os.path.exists(filepath):
                all_downloads.append((img_url, filepath))

    print(f"\nTotal para baixar: {len(all_downloads)} imagens")
    print("Baixando em paralelo...\n")

    # Download em paralelo (10 threads)
    downloaded = 0
    with ThreadPoolExecutor(max_workers=10) as executor:
        futures = {executor.submit(download_one, item): item for item in all_downloads}
        for i, future in enumerate(as_completed(futures)):
            filepath, ok, err = future.result()
            if ok:
                downloaded += 1
            if (i + 1) % 10 == 0:
                print(f"  Progresso: {i+1}/{len(all_downloads)} ({downloaded} OK)")

    print(f"\nTotal baixado: {downloaded}/{len(all_downloads)}")

    # Salvar resumo
    summary = {name: {"images": count} for name, count in board_counts.items()}
    summary["_total"] = {"to_download": len(all_downloads), "downloaded": downloaded}
    with open(out_dir / "summary.json", "w") as f:
        json.dump(summary, f, indent=2)

    print("Resumo salvo em encartes_pinterest/summary.json")


if __name__ == "__main__":
    main()
