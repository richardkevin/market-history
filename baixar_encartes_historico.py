#!/usr/bin/env python3
"""Recupera encartes antigos do Prezunic (2019–2021) via Wayback Machine.

O site atual lista só uma janela de ~3 meses. A geração antiga (WordPress)
publicava cada campanha como página em /encartes/<slug>/ com as lâminas em
/cms/wp-content/uploads/. Este script:
  1. Consulta a API CDX do Wayback e mapeia TODAS as capturas de páginas
     de campanha (/encartes/*);
  2. Em cada captura, extrai as URLs exatas das imagens de lâmina/capa;
  3. Baixa os bytes originais pelo proxy im_ do Wayback;
  4. Salva em encartes_prezunic_historico/ com nome <slug>__<arquivo>.ext,
     idempotente (pula arquivos já baixados);
  5. Gera indice_historico.json com slug, data da captura e metadados.

Só usa biblioteca padrão, como baixar_encartes.py.
"""

import json
import os
import re
import sys
import time
import urllib.parse
import urllib.request

PASTA_SAIDA = "encartes_prezunic_historico"
CDX_URL = (
    "https://web.archive.org/cdx/search/cdx"
    "?url=prezunic.com.br/encartes*"
    "&output=json&fl=timestamp,original,statuscode"
    "&filter=statuscode:200"
    "&collapse=digest"  # capturas repetidas com conteúdo igual são redundantes
)
USER_AGENT = (
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
    "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
)
# Slugs que não são páginas de campanha
SLUGS_IGNORAR = {"/encartes", "/encartes/feed", "/encartes/page"}
RX_IMAGENS = re.compile(
    r'https://web\.archive\.org/web/\d+im_/(https?://[^\s"\'<>]+?\.(?:jpg|jpeg|png))',
    re.I,
)
# Interessa apenas conteúdo publicado pelo site (uploads do CMS), não assets de tema
RX_UPLOADS = re.compile(r"/wp-content/uploads/", re.I)
RX_TEMA = re.compile(r"/wp-content/themes/|/aplicativo/|logo|icon|banner-topo", re.I)


def get(url, timeout=90):
    """GET com retries/backoff — o Wayback recusa conexão sob rajadas."""
    ultima = None
    for tentativa in range(1, 5):
        try:
            req = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
            with urllib.request.urlopen(req, timeout=timeout) as resp:
                return resp.read()
        except Exception as e:
            ultima = e
            espera = min(15 * tentativa, 45)
            print(f"    retry {tentativa}/4 em {espera}s ({e})")
            time.sleep(espera)
    raise ultima


def sanitizar(nome):
    return re.sub(r'[\\/:*?"<>|\s]+', "_", nome)[:80]


def main():
    print("Consultando CDX do Wayback Machine...")
    try:
        linhas = json.loads(get(CDX_URL).decode("utf-8", errors="replace"))
    except Exception as e:
        print(f"Erro na CDX: {e}")
        sys.exit(1)

    capturas_paginas = [
        (ts, original)
        for ts, original, _status in linhas[1:]
        if original.rstrip("/").endswith(tuple(f"{s}" for s in SLUGS_IGNORAR)) is False
        and original.count("/") >= 4  # /encartes/<slug>/ — descarta a home /encartes
    ]
    print(f"{len(linhas)-1} capturas no total | {len(capturas_paginas)} páginas de campanha\n")

    os.makedirs(PASTA_SAIDA, exist_ok=True)
    indice_path = os.path.join(PASTA_SAIDA, "indice_historico.json")
    indice = {}
    if os.path.exists(indice_path):
        indice = json.load(open(indice_path, encoding="utf-8"))

    baixados = erros = 0
    vistos_imagens = {
        item["original"] for itens in indice.values() for item in itens
    }

    for n_capt, (ts, pagina) in enumerate(capturas_paginas, 1):
        slug = pagina.rstrip("/").split("/")[-1]
        if slug in {"feed", "page"} or not slug:
            continue
        wayback = f"https://web.archive.org/web/{ts}im_/"
        try:
            html = get(f"https://web.archive.org/web/{ts}/{pagina}").decode(
                "utf-8", errors="replace"
            )
        except Exception as e:
            print(f"[{n_capt}/{len(capturas_paginas)}] {pagina}@{ts}: erro {e}")
            continue

        imagens = []
        for original in RX_IMAGENS.findall(html):
            if not RX_UPLOADS.search(original) or RX_TEMA.search(original):
                continue
            if original not in vistos_imagens:
                imagens.append(original)
        imagens = list(dict.fromkeys(imagens))
        time.sleep(1.5)
        if not imagens:
            continue

        print(f"[{n_capt}/{len(capturas_paginas)}] {pagina}@{ts}: {len(imagens)} imagem(ns)")
        for original in imagens:
            nome_base = sanitizar(os.path.basename(original))
            caminho = os.path.join(PASTA_SAIDA, f"{slug}__{nome_base}")
            if os.path.exists(caminho):
                ok = True
            else:
                try:
                    dados = get(wayback + original)
                    with open(caminho, "wb") as f:
                        f.write(dados)
                    ok = True
                    time.sleep(0.7)
                except Exception as e:
                    print(f"    ERRO {original[:80]}: {e}")
                    ok = False
                    erros += 1
            if ok:
                baixados += 1
                vistos_imagens.add(original)
                indice.setdefault(slug, []).append({
                    "original": original,
                    "captura": ts,
                    "arquivo": os.path.basename(caminho),
                })

    # Página inicial /encartes também pode listar capas de campanhas sem sub-página
    for ts, original, _status in [l for l in linhas[1:] if l[1].rstrip("/") == "/encartes"][:1]:
        pass  # home já processada acima se cair no filtro; mantido por clareza

    with open(indice_path, "w", encoding="utf-8") as f:
        json.dump(indice, f, ensure_ascii=False, indent=2)

    total_arq = len([
        f for f in os.listdir(PASTA_SAIDA)
        if f.lower().endswith((".jpg", ".jpeg", ".png"))
    ])
    print(f"\n--- Resumo ---")
    print(f"Downloads nesta execução: {baixados} | Erros: {erros}")
    print(f"Imagens na pasta: {total_arq} | Campanhas no índice: {len(indice)}")
    print(f"Pasta: {PASTA_SAIDA}/ | Índice: {indice_path}")


if __name__ == "__main__":
    main()
