#!/usr/bin/env python3
"""Detecta encartes duplicados em encartes_guanabara comparando texto OCR (EasyOCR).

Duplicatas = paginas com conteudo textual quase identico (Jaccard >= LIMIAR),
mesmo que os arquivos tenham bytes diferentes (re-encode, resize).
Mantem o arquivo com data mais antiga no nome e remove os demais.
"""

import os
import re
import json
import easyocr

PASTA = "encartes_guanabara"
CACHE = "ocr_cache_guanabara.json"
LIMIAR = 0.85
MIN_TOKENS = 25


def normalizar(texto):
    texto = texto.lower()
    texto = re.sub(r"[^a-z0-9\s]", " ", texto)
    return re.sub(r"\s+", " ", texto).strip()


def carregar_cache():
    if os.path.exists(CACHE):
        with open(CACHE, encoding="utf-8") as f:
            return json.load(f)
    return {}


def fase_ocr(arquivos, cache):
    pendentes = [f for f in arquivos if f not in cache]
    print(f"{len(arquivos)} imagens | {len(cache)} em cache | {len(pendentes)} pendentes", flush=True)
    if not pendentes:
        return
    reader = easyocr.Reader(["pt", "en"], gpu=True)
    for i, nome in enumerate(pendentes, 1):
        try:
            res = reader.readtext(os.path.join(PASTA, nome), detail=0, paragraph=True)
            texto = normalizar(" ".join(res))
        except Exception as e:
            print(f"  ERRO {nome}: {e}", flush=True)
            texto = ""
        cache[nome] = texto
        if i % 10 == 0:
            with open(CACHE, "w", encoding="utf-8") as f:
                json.dump(cache, f, ensure_ascii=False)
            print(f"[OCR {i}/{len(pendentes)}]", flush=True)
    with open(CACHE, "w", encoding="utf-8") as f:
        json.dump(cache, f, ensure_ascii=False)


def fase_dedup(arquivos, cache):
    tokens = {f: set(cache.get(f, "").split()) for f in arquivos}

    pares = []
    n = len(arquivos)
    for i in range(n):
        fi = arquivos[i]
        ti = tokens[fi]
        if len(ti) < MIN_TOKENS:
            continue
        for j in range(i + 1, n):
            fj = arquivos[j]
            tj = tokens[fj]
            if len(tj) < MIN_TOKENS:
                continue
            inter = len(ti & tj)
            if inter == 0:
                continue
            jac = inter / len(ti | tj)
            if jac >= LIMIAR:
                pares.append((fi, fj, round(jac, 3)))

    if not pares:
        print("\nNenhuma duplicata encontrada por OCR.")
        return []

    pai = {f: f for f in arquivos}

    def find(x):
        while pai[x] != x:
            pai[x] = pai[pai[x]]
            x = pai[x]
        return x

    def union(a, b):
        ra, rb = find(a), find(b)
        if ra != rb:
            pai[rb] = ra

    for fi, fj, _ in pares:
        union(fi, fj)

    grupos = {}
    for f in arquivos:
        grupos.setdefault(find(f), []).append(f)

    grupos_dup = [sorted(g) for g in grupos.values() if len(g) > 1]
    grupos_dup.sort()

    print(f"\n{len(pares)} pares similares -> {len(grupos_dup)} grupos de duplicatas:\n")
    remover = []
    for g in grupos_dup:
        manter = g[0]
        extras = g[1:]
        remover.extend(extras)
        print(f"GRUPO (manter: {manter}):")
        for f in extras:
            melhor = max((j for fi, fj, j in pares if {fi, fj} <= set(g)), default=0)
            print(f"  REMOVER {f} (similaridade {melhor})")
        print()

    return remover


def main():
    arquivos = sorted(
        f for f in os.listdir(PASTA)
        if f.lower().endswith((".jpg", ".jpeg", ".png", ".webp"))
    )
    cache = carregar_cache()
    fase_ocr(arquivos, cache)
    remover = fase_dedup(arquivos, cache)

    if remover:
        print(f"Removendo {len(remover)} arquivo(s)...")
        for f in remover:
            os.remove(os.path.join(PASTA, f))
            print(f"  removido: {f}")
        restantes = len([f for f in os.listdir(PASTA) if f.lower().endswith((".jpg", ".jpeg", ".png", ".webp"))])
        print(f"\nConcluido. Imagens restantes: {restantes}")
    else:
        print("Nada a remover.")


if __name__ == "__main__":
    main()
