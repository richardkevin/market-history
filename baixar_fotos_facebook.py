#!/usr/bin/env python3
"""Script para baixar fotos da pagina Prezunic no Facebook."""

import json
import os
import time
import urllib.request
from playwright.sync_api import sync_playwright


URL_FACEBOOK = "https://web.facebook.com/Prezunic/photos"
PASTA_SAIDA = "fotos_prezunic"
USER_AGENT = (
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
    "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
)


def scroll_pagina(page, vezes=10, pausa=2):
    for i in range(vezes):
        page.evaluate("window.scrollTo(0, document.body.scrollHeight)")
        time.sleep(pausa)
        print(f"  Scroll {i+1}/{vezes}...")


def extrair_fotos(page):
    """Extrai URLs das fotos da pagina."""
    fotos = []

    # fotos nas thumbs (grid)
    imgs = page.query_selector_all('img[src*="scontent"]')
    for img in imgs:
        src = img.get_attribute("src") or ""
        if "scontent" in src and ("fbcdn" in src or "xx" in src):
            # pegar URL maior (substituir dimensoes)
            url_grande = src.split("?")[0]
            if url_grande not in [f["url"] for f in fotos]:
                fotos.append({"url": url_grande, "thumb": src})

    # tentar pegar links dos albums/tabs
    links = page.query_selector_all('a[href*="/photos/"]')
    for link in links:
        href = link.get_attribute("href") or ""
        if "/photos/" in href and href not in [f.get("href") for f in fotos]:
            fotos.append({"href": href})

    return fotos


def baixar_foto(url, caminho):
    try:
        req = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
        with urllib.request.urlopen(req, timeout=30) as resp:
            dados = resp.read()
        with open(caminho, "wb") as f:
            f.write(dados)
        return True
    except Exception as e:
        print(f"  ERRO: {e}")
        return False


def main():
    os.makedirs(PASTA_SAIDA, exist_ok=True)

    print("Iniciando Playwright...")
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=False)
        context = browser.new_context(
            viewport={"width": 1280, "height": 900},
            user_agent=USER_AGENT,
        )
        page = context.new_page()

        print(f"Acessando {URL_FACEBOOK}...")
        page.goto(URL_FACEBOOK, wait_until="domcontentloaded")
        time.sleep(5)

        # check se pediu login
        if page.query_selector('input[name="email"]'):
            print("\n Facebook esta pedindo login.")
            print(" Faca login manualmente no navegador que abriu.")
            print(" Depois de logado, pressione ENTER aqui no terminal...")
            input()
            time.sleep(3)

        print("\nCarregando mais fotos (scroll)...")
        scroll_pagina(page, vezes=15, pausa=2)

        print("\nExtraindo fotos...")
        fotos = extrair_fotos(page)

        print(f"\n{len(fotos)} elementos encontrados.")

        # separar links de paginas de fotos
        hrefs = [f for f in fotos if "href" in f]
        urls_img = [f for f in fotos if "url" in f]

        if hrefs:
            print(f"\n{len(hrefs)} links de paginas de fotos encontrados.")
            # salvar links
            with open(os.path.join(PASTA_SAIDA, "links_fotos.json"), "w") as f:
                json.dump(hrefs, f, indent=2)

        if urls_img:
            print(f"\nBaixando {len(urls_img)} imagens...")
            baixadas = 0
            for i, foto in enumerate(urls_img, 1):
                url = foto["url"]
                ext = ".jpg"
                caminho = os.path.join(PASTA_SAIDA, f"foto_{i:04d}{ext}")
                if baixar_foto(url, caminho):
                    print(f"  [{i}/{len(urls_img)}] Salva: {caminho}")
                    baixadas += 1
                time.sleep(0.3)

            print(f"\n{baixadas}/{len(urls_img)} fotos baixadas em '{PASTA_SAIDA}/'")

        # salvar indice completo
        with open(os.path.join(PASTA_SAIDA, "indice.json"), "w") as f:
            json.dump({"hrefs": hrefs, "imagens": urls_img}, f, indent=2)

        browser.close()


if __name__ == "__main__":
    main()
