#!/usr/bin/env python3
"""Baixa encartes do Supermercado Mundial.

Duas fontes:
1. API GraphQL (mundial-api.supermercadosmundial.com.br) - ultimos ~10 encartes
2. Scan direto de IDs (1-53) - PDFs antigos ainda acessiveis no servidor

Total disponivel: ~46 encartes (IDs 1-53, com gaps).
Sem dependencias externas - usa urllib padrao.
"""

import json
import os
import re
import sys
import time
import urllib.request
from datetime import datetime, timezone
from typing import Optional

URL_API = "https://mundial-api.supermercadosmundial.com.br/encartes"
URL_PDF_BASE = "https://mundial-api.supermercadosmundial.com.br/encartes"
PASTA_SAIDA = "encartes_mundial"
USER_AGENT = (
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
    "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
)

QUERIES = [
    """
    { encartes { id description thumbnail file background priority status
      publishedIn unpublishedIn createdAt updatedAt } }
    """,
    """
    { encartes { id description thumbnail { url ext } file { url ext }
      background priority status publishedIn unpublishedIn createdAt updatedAt } }
    """,
]

# Range de IDs para scan direto (PDFs podem existir fora da API)
ID_MIN = 1
ID_MAX = 53


def criar_pasta():
    os.makedirs(PASTA_SAIDA, exist_ok=True)


def post_graphql(query: str, tentativas: int = 4) -> Optional[dict]:
    for tentativa in range(1, tentativas + 1):
        try:
            req = urllib.request.Request(
                URL_API,
                data=json.dumps({"query": query}).encode("utf-8"),
                headers={
                    "User-Agent": USER_AGENT,
                    "Content-Type": "application/json",
                    "Accept": "application/json",
                },
                method="POST",
            )
            with urllib.request.urlopen(req, timeout=30) as resp:
                data = json.loads(resp.read().decode("utf-8"))
            if data.get("errors"):
                raise RuntimeError("; ".join(e.get("message", "") for e in data["errors"]))
            return data.get("data")
        except Exception as e:
            print(f"    Tentativa {tentativa}/{tentativas} falhou: {e}")
            if tentativa < tentativas:
                time.sleep(2)
    return None


def buscar_encartes_api() -> list[dict]:
    """Busca encartes via GraphQL API (retorna apenas os recentes)."""
    for query in QUERIES:
        data = post_graphql(query)
        if data and data.get("encartes"):
            return data["encartes"]
    return []


def scan_ids_disponiveis() -> list[int]:
    """Verifica quais IDs de PDF existem no servidor (scan direto)."""
    print("Scanning IDs disponiveis no servidor...")
    ids = []
    for id_enc in range(ID_MIN, ID_MAX + 1):
        url = f"{URL_PDF_BASE}/{id_enc}.pdf"
        try:
            req = urllib.request.Request(url, method="HEAD", headers={
                "User-Agent": USER_AGENT,
                "Referer": "https://www.supermercadosmundial.com.br/encarte",
            })
            with urllib.request.urlopen(req, timeout=10) as resp:
                if resp.status == 200:
                    ids.append(id_enc)
        except urllib.error.HTTPError:
            pass
        except Exception:
            pass
    return ids


def extrair_validade(descricao: str) -> str:
    match = re.search(r"(\d{2}/\d{2}) a (\d{2}/\d{2}/\d{4})", descricao)
    if match:
        dia_inicio, mes_inicio = match.group(1).split("/")
        dia_fim, mes_fim, ano = match.group(2).split("/")
        return f"{dia_inicio}-{mes_inicio}-{ano}-{dia_fim}-{mes_fim}-{ano}"
    return ""


def formatar_data(iso_str: str) -> str:
    if not iso_str:
        return ""
    try:
        dt = datetime.fromisoformat(iso_str.replace("Z", "+00:00"))
        return dt.strftime("%d-%m-%Y")
    except Exception:
        return iso_str


def download_arquivo(url: str, caminho: str, minimo: int = 1000, magic: bytes = b"") -> bool:
    try:
        req = urllib.request.Request(url, headers={
            "User-Agent": USER_AGENT,
            "Accept": "application/pdf,image/*",
            "Referer": "https://www.supermercadosmundial.com.br/encarte",
        })
        with urllib.request.urlopen(req, timeout=60) as resp:
            data = resp.read()
        if len(data) < minimo:
            return False
        if magic and not data.startswith(magic):
            return False
        with open(caminho, "wb") as f:
            f.write(data)
        return True
    except Exception as e:
        print(f"    Erro: {e}")
        return False


def encartes_da_semana(encartes_api: list[dict]) -> list[dict]:
    """Filtra os encartes da API que estao vigentes hoje.

    Usados em modo --atual (apenas a semana, sem scan/backfill historico).
    Se nenhum tiver data de vigencia valida, assume o mais recente.
    """
    agora = datetime.now(timezone.utc)

    def parse(iso: str):
        if not iso:
            return None
        try:
            return datetime.fromisoformat(iso.replace("Z", "+00:00"))
        except (TypeError, ValueError):
            return None

    vigentes = [
        e for e in encartes_api
        if (parse(e.get("publishedIn")) or datetime.min.replace(tzinfo=timezone.utc))
        <= agora <= (parse(e.get("unpublishedIn")) or datetime.max.replace(tzinfo=timezone.utc))
    ]
    if vigentes:
        return vigentes
    # fallback: encarte publicado mais recentemente (lista ja vem desc por publishedIn)
    return encartes_api[:1]


def main():
    import argparse

    parser = argparse.ArgumentParser(description="Baixa encartes do Supermercado Mundial.")
    parser.add_argument(
        "--atual",
        action="store_true",
        help="Baixa apenas o encarte da semana (pula scan de IDs historicos).",
    )
    args = parser.parse_args()

    criar_pasta()

    print("=== Encartes Supermercado Mundial - Download ===\n")

    # 1. Buscar via GraphQL API
    print("Consultando API GraphQL...")
    encartes_api = buscar_encartes_api()
    api_ids = set()
    mapa_api = {}

    if encartes_api:
        encartes_api.sort(key=lambda e: e.get("publishedIn") or "", reverse=True)
        print(f"API retornou {len(encartes_api)} encartes.")
        for enc in encartes_api:
            id_enc = str(enc.get("id", ""))
            api_ids.add(int(id_enc))
            mapa_api[int(id_enc)] = enc
    else:
        print("API nao retornou encartes.")

    if args.atual:
        encartes_api = encartes_da_semana(encartes_api)
        api_ids = {int(e.get("id", "")) for e in encartes_api}
        mapa_api = {int(e.get("id", "")): e for e in encartes_api}
        print(f"Encartes da semana: {len(api_ids)}.")
        ids_scan = []
        print()
    else:
        # 2. Scan direto de IDs
        ids_scan = scan_ids_disponiveis()
        print(f"Scan encontrou {len(ids_scan)} IDs com PDF.\n")

    # Combinar: IDs da API + IDs do scan
    todos_ids = sorted(set(list(api_ids) + ids_scan))
    print(f"Total unico: {len(todos_ids)} encartes.\n")

    # 3. Ja existe
    existentes = set()
    for f in os.listdir(PASTA_SAIDA):
        m = re.search(r"_(\d+)\.(?:pdf|jpg)$", f)
        if m:
            existentes.add(int(m.group(1)))

    pendentes = [id_enc for id_enc in todos_ids if id_enc not in existentes]
    print(f"Ja baixados: {len(existentes)} | Pendentes: {len(pendentes)}\n")

    if not pendentes:
        print("Nada pendente.")
        return

    # 4. Baixar pendentes
    baixados = 0
    log = []

    for i, id_enc in enumerate(pendentes, 1):
        enc = mapa_api.get(id_enc, {})
        descricao = enc.get("description", "")
        status = enc.get("status", "")
        inicio = formatar_data(enc.get("publishedIn", ""))
        fim = formatar_data(enc.get("unpublishedIn", ""))
        validade = extrair_validade(descricao)

        pdf_url = f"{URL_PDF_BASE}/{id_enc}.pdf"
        thumb_url = f"{URL_PDF_BASE}/{id_enc}-preview.jpeg"

        base = f"mundial_encarte_{validade or inicio or f'id{id_enc}'}_{id_enc}"

        label = descricao or f"ID {id_enc}"
        print(f"[{i}/{len(pendentes)}] {label}")

        # PDF
        nome_pdf = f"{base}.pdf"
        caminho_pdf = os.path.join(PASTA_SAIDA, nome_pdf)
        print(f"  Baixando PDF...", end=" ")
        if download_arquivo(pdf_url, caminho_pdf, minimo=1000, magic=b"%PDF"):
            print("OK")
            log.append({"id": id_enc, "url": pdf_url, "arquivo": nome_pdf, "status": "ok"})
            baixados += 1
        else:
            print("FALHOU")
            log.append({"id": id_enc, "url": pdf_url, "arquivo": nome_pdf, "status": "falhou"})

        # Capa
        nome_capa = f"{base}_capa.jpg"
        caminho_capa = os.path.join(PASTA_SAIDA, nome_capa)
        if not os.path.exists(caminho_capa) or os.path.getsize(caminho_capa) < 5000:
            print(f"  Baixando capa...", end=" ")
            if download_arquivo(thumb_url, caminho_capa, minimo=5000):
                print("OK")
            else:
                print("FALHOU")

        time.sleep(0.3)

    # 5. Salvar indice completo
    indice = []
    for id_enc in sorted(existentes | set(pendentes)):
        # Encontrar arquivo correspondente
        for f in os.listdir(PASTA_SAIDA):
            m = re.search(rf"_{id_enc}\.pdf$", f)
            if m:
                enc = mapa_api.get(id_enc, {})
                indice.append({
                    "id": id_enc,
                    "description": enc.get("description", ""),
                    "publishedIn": enc.get("publishedIn", ""),
                    "arquivo": f,
                })
                break

    log_path = os.path.join(PASTA_SAIDA, "indice.json")
    with open(log_path, "w", encoding="utf-8") as f:
        json.dump({"encartes": indice, "log": log}, f, indent=2, ensure_ascii=False)

    print(f"\n=== Resultado: {baixados}/{len(pendentes)} PDFs novos ===")
    print(f"Total na pasta: {len(list(os.listdir(PASTA_SAIDA)))} arquivos")
    print(f"Indice: {log_path}")


if __name__ == "__main__":
    main()
