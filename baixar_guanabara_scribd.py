#!/usr/bin/env python3
"""Baixa PDFs de encartes do Mercado Guanabara do Scribd.

Padrao de nome: supermercados_guanabara_-_encarte_DD_MM_YYYY.pdf

Scribd tem forte protecao anti-bot. Estrategias:
1. Tenta download direto (raramente funciona sem auth)
2. Tenta via Playwright com stealth
3. Gera lista de links para download manual
4. Tenta via archive.org/web se disponivel
"""

import os
import sys
import time
import re
import json
from datetime import datetime

PASTA_SAIDA = "encartes_guanabara"

ENCARTES = [
    {"doc_id": "518491687", "inicio": "22/07/2021", "fim": "24/07/2021"},
    {"doc_id": "637892271", "inicio": "04/11/2021", "fim": "06/11/2021"},
    {"doc_id": "563196688", "inicio": "29/12/2021", "fim": "03/01/2022"},
    {"doc_id": "762263898", "inicio": "17/12/2022", "fim": "17/12/2022"},
    {"doc_id": "625061900", "inicio": "22/10/2022", "fim": "25/10/2022"},
    {"doc_id": "625876976", "inicio": "04/02/2023", "fim": "07/02/2023"},
    {"doc_id": "627237483", "inicio": "15/02/2023", "fim": "17/02/2023"},
    {"doc_id": "669580360", "inicio": "26/08/2023", "fim": "28/08/2023"},
    {"doc_id": "716531577", "inicio": "09/03/2024", "fim": "12/03/2024"},
    {"doc_id": "724987407", "inicio": "29/03/2024", "fim": "01/04/2024"},
    {"doc_id": "785707653", "inicio": "21/09/2024", "fim": "24/09/2024"},
    {"doc_id": "791528415", "inicio": "02/10/2024", "fim": "04/10/2024"},
    {"doc_id": "846702212", "inicio": "02/01/2025", "fim": "03/01/2025"},
    {"doc_id": "824116501", "inicio": "04/02/2025", "fim": "07/02/2025"},
    {"doc_id": "833023546", "inicio": "19/02/2025", "fim": "23/02/2025"},
    {"doc_id": "837800516", "inicio": "28/02/2025", "fim": "11/03/2025"},
    {"doc_id": "917932639", "inicio": "10/09/2025", "fim": "12/09/2025"},
    {"doc_id": "927057125", "inicio": "20/09/2025", "fim": "23/09/2025"},
    {"doc_id": "974810072", "inicio": "17/12/2025", "fim": "19/12/2025"},
]


def gerar_nome_arquivo(data_inicio: str, data_fim: str) -> str:
    inicio = datetime.strptime(data_inicio, "%d/%m/%Y")
    fim = datetime.strptime(data_fim, "%d/%m/%Y")

    if inicio == fim:
        periodo = f"{inicio.day:02d}_{inicio.month:02d}_{inicio.year}"
    elif inicio.month == fim.month and inicio.year == fim.year:
        periodo = f"{inicio.day:02d}_{fim.day:02d}_{inicio.month:02d}_{inicio.year}"
    elif inicio.year == fim.year:
        periodo = f"{inicio.day:02d}_{inicio.month:02d}_{fim.day:02d}_{fim.month:02d}_{inicio.year}"
    else:
        periodo = f"{inicio.day:02d}_{inicio.month:02d}_{inicio.year}_{fim.day:02d}_{fim.month:02d}_{fim.year}"

    return f"supermercados_guanabara_-_encarte_{periodo}.pdf"


def criar_pasta():
    os.makedirs(PASTA_SAIDA, exist_ok=True)


def download_direto(doc_id: str, caminho: str) -> bool:
    """Tenta download direto via URLs conhecidas do Scribd."""
    import urllib.request

    urls = [
        f"https://www.scribd.com/gk/lean_downloads/{doc_id}?type=document",
        f"https://dl.scribd.com/{doc_id}",
    ]

    for url in urls:
        try:
            req = urllib.request.Request(url, headers={
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
                "Accept": "application/pdf,*/*",
                "Referer": f"https://www.scribd.com/document/{doc_id}",
            })
            with urllib.request.urlopen(req, timeout=30) as resp:
                data = resp.read()
                if b"%PDF" in data[:1024]:
                    with open(caminho, "wb") as f:
                        f.write(data)
                    return True
        except Exception:
            pass
    return False


def download_playwright(doc_id: str, caminho: str) -> bool:
    """Tenta via Playwright com stealth."""
    try:
        from playwright.sync_api import sync_playwright
    except ImportError:
        return False

    url = f"https://www.scribd.com/document/{doc_id}"

    with sync_playwright() as p:
        browser = p.chromium.launch(
            headless=True,
            args=[
                "--disable-blink-features=AutomationControlled",
                "--no-sandbox",
            ]
        )
        context = browser.new_context(
            user_agent="Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
            viewport={"width": 1920, "height": 1080},
        )
        page = context.new_page()

        try:
            page.goto(url, wait_until="domcontentloaded", timeout=30000)
            time.sleep(5)

            page.evaluate("""
                Object.defineProperty(navigator, 'webdriver', { get: () => false });
            """)

            frames = page.frames
            for frame in frames:
                pdf_urls = re.findall(r'https?://[^"\']+\.pdf[^"\']*', frame.url)
                if pdf_urls:
                    import urllib.request
                    for pdf_url in pdf_urls[:2]:
                        try:
                            req = urllib.request.Request(pdf_url, headers={
                                "User-Agent": page.evaluate("navigator.userAgent"),
                            })
                            with urllib.request.urlopen(req, timeout=30) as resp:
                                data = resp.read()
                                if b"%PDF" in data[:1024]:
                                    with open(caminho, "wb") as f:
                                        f.write(data)
                                    return True
                        except Exception:
                            continue

            content = page.content()
            pdf_matches = re.findall(r'"(https?://[^"]*?\.pdf[^"]*?)"', content)
            for match in pdf_matches[:3]:
                try:
                    import urllib.request
                    req = urllib.request.Request(match, headers={
                        "User-Agent": page.evaluate("navigator.userAgent"),
                    })
                    with urllib.request.urlopen(req, timeout=30) as resp:
                        data = resp.read()
                        if b"%PDF" in data[:1024]:
                            with open(caminho, "wb") as f:
                                f.write(data)
                            return True
                except Exception:
                    continue

        except Exception as e:
            print(f"    Erro Playwright: {e}")
        finally:
            browser.close()

    return False


def download_archive_org(doc_id: str, caminho: str) -> bool:
    """Tenta via archive.org."""
    import urllib.request

    scribd_url = f"https://www.scribd.com/document/{doc_id}"
    archive_url = f"https://web.archive.org/web/2024/{scribd_url}"

    try:
        req = urllib.request.Request(archive_url, headers={
            "User-Agent": "Mozilla/5.0",
        })
        with urllib.request.urlopen(req, timeout=30) as resp:
            content = resp.read().decode("utf-8", errors="ignore")
            pdf_urls = re.findall(r'https?://[^"\']+\.pdf[^"\']*', content)
            if pdf_urls:
                req2 = urllib.request.Request(pdf_urls[0], headers={"User-Agent": "Mozilla/5.0"})
                with urllib.request.urlopen(req2, timeout=60) as resp2:
                    data = resp2.read()
                    if b"%PDF" in data[:1024]:
                        with open(caminho, "wb") as f:
                            f.write(data)
                        return True
    except Exception:
        pass
    return False


def gerar_lista_manual(encartes: list):
    """Gera arquivo HTML com links para download manual."""
    html_path = os.path.join(PASTA_SAIDA, "links_download.html")

    with open(html_path, "w", encoding="utf-8") as f:
        f.write("""<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <title>Links Guanabara - Scribd</title>
    <style>
        body { font-family: Arial; max-width: 900px; margin: 40px auto; padding: 20px; }
        .item { padding: 15px; border: 1px solid #ddd; margin: 10px 0; border-radius: 8px; }
        .item:hover { background: #f5f5f5; }
        a { color: #0066cc; text-decoration: none; font-size: 18px; }
        a:hover { text-decoration: underline; }
        .datas { color: #666; margin-top: 5px; }
        .nome { color: #333; font-family: monospace; font-size: 12px; margin-top: 5px; }
        h1 { color: #333; }
        .instrucoes { background: #fff3cd; padding: 15px; border-radius: 8px; margin-bottom: 20px; }
    </style>
</head>
<body>
    <h1>Encartes Guanabara - Download Manual</h1>
    <div class="instrucoes">
        <h3>Instrucoes:</h3>
        <ol>
            <li>Clique no link para abrir o documento no Scribd</li>
            <li>Clique em "Download" ou use Ctrl+P > Salvar como PDF</li>
            <li>Salve com o nome indicado na pasta <code>encartes_guanabara</code></li>
        </ol>
    </div>
""")

        for encarte in encartes:
            nome = gerar_nome_arquivo(encarte["inicio"], encarte["fim"])
            url = f"https://www.scribd.com/document/{encarte['doc_id']}"
            f.write(f"""    <div class="item">
        <a href="{url}" target="_blank">{url}</a>
        <div class="datas">{encarte['inicio']} a {encarte['fim']}</div>
        <div class="nome">Salvar como: {nome}</div>
    </div>
""")

        f.write("</body></html>")

    print(f"\n  Lista HTML gerada: {html_path}")


def main():
    criar_pasta()
    log_path = os.path.join(PASTA_SAIDA, "download_log.json")
    log = []

    print(f"=== Download encartes Guanabara (Scribd) ===\n")

    for i, encarte in enumerate(ENCARTES, 1):
        nome = gerar_nome_arquivo(encarte["inicio"], encarte["fim"])
        caminho = os.path.join(PASTA_SAIDA, nome)

        if os.path.exists(caminho) and os.path.getsize(caminho) > 1000:
            print(f"[{i}/{len(ENCARTES)}] {nome} - OK (ja existe)")
            log.append({"doc_id": encarte["doc_id"], "arquivo": nome, "status": "ok"})
            continue

        print(f"[{i}/{len(ENCARTES)}] {encarte['inicio']} a {encarte['fim']}")
        print(f"  Doc: {encarte['doc_id']}")

        sucesso = False

        print("  [1/4] Download direto...")
        sucesso = download_direto(encarte["doc_id"], caminho)

        if not sucesso:
            print("  [2/4] Archive.org...")
            sucesso = download_archive_org(encarte["doc_id"], caminho)

        if not sucesso:
            print("  [3/4] Playwright...")
            sucesso = download_playwright(encarte["doc_id"], caminho)

        status = "ok" if sucesso else "falhou"
        log.append({
            "doc_id": encarte["doc_id"],
            "arquivo": nome,
            "status": status,
            "url": f"https://www.scribd.com/document/{encarte['doc_id']}",
        })

        with open(log_path, "w") as f:
            json.dump(log, f, indent=2)

        print(f"  Resultado: {'OK' if sucesso else 'FALHOU'}\n")
        time.sleep(2)

    gerar_lista_manual(ENCARTES)

    ok = sum(1 for r in log if r["status"] == "ok")
    falhou = sum(1 for r in log if r["status"] == "falhou")
    print(f"\n=== Resultado: {ok} ok, {falhou} falhou de {len(ENCARTES)} ===")

    if falhou > 0:
        print("\nDocs que falharam (baixe manualmente):")
        for r in log:
            if r["status"] == "falhou":
                print(f"  {r['url']}")


if __name__ == "__main__":
    main()
