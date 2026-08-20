#!/usr/bin/env python3
"""Baixa encartes historicos do Guanabara.

Estrategia:
1. Busca URLs no Wayback Machine CDX API
2. Acessa direto no site do Guanabara (mantem historico)
3. Baixa imagens das paginas
"""

import os
import re
import time
import json
import urllib.request
from datetime import datetime, timedelta

PASTA_SAIDA = "encartes_guanabara"
CDX_API = "http://web.archive.org/cdx/search/cdx"


def criar_pasta():
    os.makedirs(PASTA_SAIDA, exist_ok=True)


def buscar_urls_wayback() -> list[str]:
    """Busca URLs unicas de encartes no Wayback Machine."""
    urls_todas = set()

    for prefixo in list("0123456789") + ["e"]:
        url_api = (
            f"{CDX_API}?url=supermercadosguanabara.com.br/encarte/{prefixo}*"
            f"&output=json&fl=original&filter=statuscode:200&collapse=urlkey&limit=500"
        )
        try:
            req = urllib.request.Request(url_api, headers={"User-Agent": "Mozilla/5.0"})
            with urllib.request.urlopen(req, timeout=60) as resp:
                data = json.loads(resp.read().decode())
            if len(data) > 1:
                for row in data[1:]:
                    original = row[0]
                    if "/encarte/" in original:
                        clean = original.split("?")[0].rstrip("/")
                        urls_todas.add(clean)
        except Exception:
            pass
        time.sleep(0.3)

    return sorted(urls_todas)


def gerar_urls_por_data() -> list[str]:
    """Gera URLs possiveis baseadas no padrao de datas."""
    urls = set()

    for ano in range(2022, 2026):
        for mes in range(1, 13):
            for dia in [1, 2, 3, 4, 5, 7, 8, 9, 10, 11, 14, 15, 16, 17, 18, 21, 22, 23, 24, 25, 28, 29]:
                dia_fim = dia + 3
                if mes in [4, 6, 9, 11]:
                    max_dia = 30
                elif mes == 2:
                    max_dia = 29 if ano % 4 == 0 else 28
                else:
                    max_dia = 31

                if dia_fim > max_dia:
                    dia_fim = max_dia

                urls.add(f"https://supermercadosguanabara.com.br/encarte/{dia:02d}{mes:02d}-{dia_fim:02d}{mes:02d}{ano}")
                urls.add(f"https://supermercadosguanabara.com.br/encarte/{dia:02d}{mes:02d}{ano}-{dia_fim:02d}{mes:02d}{ano}")

    return sorted(urls)


def extrair_periodo(html: str) -> tuple[str, str]:
    match = re.search(
        r'(\d{2}/\d{2}/\d{4}).*?(?:a|até|ate).*?(\d{2}/\d{2}/\d{4})',
        html, re.IGNORECASE
    )
    if match:
        return match.group(1), match.group(2)
    return "", ""


def baixar_encarte(url: str) -> dict:
    """Tenta baixar um encarte do site direto."""
    try:
        req = urllib.request.Request(url, headers={
            "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
            "Accept": "text/html",
        })
        with urllib.request.urlopen(req, timeout=15) as resp:
            html = resp.read().decode("utf-8", errors="ignore")
    except Exception:
        return {"status": "404"}

    imgs = re.findall(
        r'<img[^>]+src="(https?://[^"]*encarte[^"]*\.jpg[^"]*)"',
        html
    )

    imgs = [i for i in imgs if "adaptive-image" not in i and "webdoor" not in i.lower()]
    imgs = list(dict.fromkeys(imgs))

    if not imgs:
        return {"status": "sem_img"}

    periodo_inicio, periodo_fim = extrair_periodo(html)

    try:
        if periodo_inicio:
            dt = datetime.strptime(periodo_inicio, "%d/%m/%Y")
        else:
            parts = url.split("/encarte")[-1].strip("/").replace("-", "").replace("ate", "")
            dt = datetime.strptime(parts[:8], "%d%m%Y")
        data_fmt = dt.strftime("%Y-%m-%d")
    except (ValueError, IndexError):
        data_fmt = "unknown"

    slug = url.split("/encarte")[-1].strip("/").replace("/", "_")[:50]

    baixadas = 0
    for j, img_url in enumerate(imgs, 1):
        nome = f"guanabara_{data_fmt}_{slug}_pag{j:02d}.jpg"
        caminho = os.path.join(PASTA_SAIDA, nome)

        if os.path.exists(caminho) and os.path.getsize(caminho) > 5000:
            baixadas += 1
            continue

        try:
            req = urllib.request.Request(img_url, headers={
                "User-Agent": "Mozilla/5.0",
                "Accept": "image/*",
                "Referer": url,
            })
            with urllib.request.urlopen(req, timeout=30) as resp:
                data = resp.read()
                if len(data) > 5000:
                    with open(caminho, "wb") as f:
                        f.write(data)
                    baixadas += 1
        except Exception:
            pass

        time.sleep(0.2)

    return {
        "status": "ok" if baixadas > 0 else "falhou",
        "periodo": f"{periodo_inicio} a {periodo_fim}" if periodo_inicio else "",
        "paginas": len(imgs),
        "baixadas": baixadas,
        "data": data_fmt,
    }


def carregar_log_existente() -> list[dict]:
    """Carrega log existente para evitar testar URLs repetidas."""
    log_path = os.path.join(PASTA_SAIDA, "log_historico.json")
    if os.path.exists(log_path):
        try:
            with open(log_path) as f:
                return json.load(f)
        except Exception:
            pass
    return []


def main():
    criar_pasta()

    print("=== Encartes Guanabara - Historico ===\n")

    print("1. Buscando URLs no Wayback Machine...")
    urls_wayback = buscar_urls_wayback()
    print(f"   {len(urls_wayback)} URLs encontradas")

    print("\n2. Gerando URLs por padrao de datas...")
    urls_geradas = gerar_urls_por_data()
    print(f"   {len(urls_geradas)} URLs geradas")

    urls_todas = list(dict.fromkeys(urls_wayback + urls_geradas))
    print(f"\n   Total: {len(urls_todas)} URLs para testar\n")

    log = carregar_log_existente()
    urls_ja_testadas = {entry["url"] for entry in log}
    pendentes = [u for u in urls_todas if u not in urls_ja_testadas]

    print(f"   Ja testadas: {len(urls_ja_testadas)}")
    print(f"   Pendentes: {len(pendentes)}\n")

    ok_count = sum(1 for e in log if e.get("status") == "ok")
    total_imgs = sum(e.get("baixadas", 0) for e in log)

    for i, url in enumerate(pendentes, 1):
        slug = url.split("/encarte")[-1].strip("/").replace("/", "_")[:60]
        print(f"[{i}/{len(pendentes)}] {slug}...", end=" ")

        result = baixar_encarte(url)

        if result["status"] == "ok":
            ok_count += 1
            total_imgs += result["baixadas"]
            print(f"OK ({result['baixadas']} imgs)")
        elif result["status"] == "404":
            print("404")
        else:
            print(result["status"])

        log.append({"url": url, **result})

        if i % 20 == 0:
            log_path = os.path.join(PASTA_SAIDA, "log_historico.json")
            with open(log_path, "w") as f:
                json.dump(log, f, indent=2, ensure_ascii=False)
            print(f"  --- Progresso: {ok_count} encartes, {total_imgs} imagens ---")

        time.sleep(0.5)

    log_path = os.path.join(PASTA_SAIDA, "log_historico.json")
    with open(log_path, "w") as f:
        json.dump(log, f, indent=2, ensure_ascii=False)

    print(f"\n=== Resultado ===")
    print(f"Encartes encontrados: {ok_count}")
    print(f"Total imagens: {total_imgs}")
    print(f"Log: {log_path}")


if __name__ == "__main__":
    main()
