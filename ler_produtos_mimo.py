#!/usr/bin/env python3
"""Analisa imagens de encartes usando mimo-v2.5-free (OpenAI-compatible API)."""

import os
import sys
import json
import time
import sqlite3
import base64
import requests
from typing import List, Optional
from pydantic import BaseModel, Field

MAX_RETRIES = 5
RETRY_DELAY = 5
DELAY_ENTRE_REQUESTS = 4.5

PASTA_IMGS = "fotos_prezunic"
BANCO_DADOS = "encartes_produtos.db"
SUPERMERCADO_PADRAO = "prezunic"

API_BASE = os.environ.get("MIMO_API_BASE", "https://api.opencode.ai/v1")
API_KEY_ENV = "MIMO_API_KEY"


class ProdutoExtraido(BaseModel):
    produto: str = Field(description="Nome do produto completo")
    marca: Optional[str] = Field(default=None, description="Marca do produto")
    medida: Optional[str] = Field(default=None, description="Litragem, peso ou unidade")
    preco: Optional[float] = Field(default=None, description="Preco normal")
    preco_clube: Optional[float] = Field(default=None, description="Preco promocional")
    tipo_promocao: Optional[str] = Field(default=None, description="Condicao promocional")
    limite: Optional[str] = Field(default=None, description="Limite por cliente")
    observacao: Optional[str] = Field(default=None, description="Observacoes")


class AnaliseEncarte(BaseModel):
    data_inicio: Optional[str] = Field(default=None, description="Data inicio (dd/mm/yyyy)")
    data_fim: Optional[str] = Field(default=None, description="Data fim (dd/mm/yyyy)")
    titulo_encarte: Optional[str] = Field(default=None, description="Titulo do encarte")
    produtos: List[ProdutoExtraido] = Field(default_factory=list)


SYSTEM_PROMPT = """Voce e um especialista em OCR e extracao de dados de encartes de supermercados brasileiros.
Analise a imagem e extraia TODOS os produtos anunciados com:
- Nome completo do produto
- Marca (se identificavel)
- Medida (peso, litragem, unidade)
- Preco regular
- Preco promocional (se houver)
- Promocao (ex: LEVE 4 PAGUE 3)
- Limite por cliente
Se nao houver produtos, retorne lista vazia."""

RESPONSE_SCHEMA = AnaliseEncarte.model_json_schema()


def criar_banco():
    conn = sqlite3.connect(BANCO_DADOS)
    c = conn.cursor()
    c.execute("""
        CREATE TABLE IF NOT EXISTS produtos (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            imagem TEXT NOT NULL,
            supermercado TEXT NOT NULL DEFAULT 'prezunic',
            produto TEXT, marca TEXT, medida TEXT,
            preco REAL, preco_clube REAL,
            tipo_promocao TEXT, limite TEXT,
            data_encarte TEXT, observacao TEXT,
            texto_ocr TEXT, erro_identificacao INTEGER DEFAULT 0,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    """)
    c.execute("PRAGMA table_info(produtos)")
    colunas = {row[1] for row in c.fetchall()}
    if "supermercado" not in colunas:
        c.execute("ALTER TABLE produtos ADD COLUMN supermercado TEXT NOT NULL DEFAULT 'prezunic'")
    conn.commit()
    return conn


def get_api_key():
    key = os.environ.get(API_KEY_ENV)
    if not key:
        key = input(f"Cole sua chave de API ({API_KEY_ENV}): ").strip()
    if not key:
        print("Erro: API Key obrigatoria.")
        sys.exit(1)
    return key


def encode_image(caminho: str) -> str:
    with open(caminho, "rb") as f:
        return base64.b64encode(f.read()).decode("utf-8")


def analisar_imagem(api_key: str, caminho_imagem: str) -> AnaliseEncarte:
    if not os.path.exists(caminho_imagem):
        raise FileNotFoundError(f"Imagem nao encontrada: {caminho_imagem}")

    ext = os.path.splitext(caminho_imagem)[1].lower()
    mime = {"jpg": "image/jpeg", "jpeg": "image/jpeg", "png": "image/png", "webp": "image/webp"}.get(ext.lstrip("."), "image/jpeg")
    b64 = encode_image(caminho_imagem)

    payload = {
        "model": "mimo-v2.5-free",
        "messages": [
            {"role": "system", "content": SYSTEM_PROMPT},
            {
                "role": "user",
                "content": [
                    {"type": "text", "text": "Extraia todos os produtos, precos e detalhes deste encarte."},
                    {"type": "image_url", "image_url": {"url": f"data:{mime};base64,{b64}"}},
                ],
            },
        ],
        "temperature": 0.1,
        "response_format": {"type": "json_schema", "json_schema": {"name": "analise_encarte", "schema": RESPONSE_SCHEMA}},
    }

    headers = {"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"}

    ultimo_erro = None
    for tentativa in range(1, MAX_RETRIES + 1):
        try:
            resp = requests.post(f"{API_BASE}/chat/completions", json=payload, headers=headers, timeout=120)
            resp.raise_for_status()
            data = resp.json()
            texto = data["choices"][0]["message"]["content"]
            return AnaliseEncarte(**json.loads(texto))
        except Exception as e:
            ultimo_erro = e
            msg = str(e).lower()
            if tentativa < MAX_RETRIES and ("429" in msg or "rate" in msg or "503" in msg):
                espera = RETRY_DELAY * tentativa * 2 if "429" in msg else RETRY_DELAY * tentativa
                print(f"      Retry {tentativa}/{MAX_RETRIES} em {espera}s...")
                time.sleep(espera)
                continue
            raise e

    raise ultimo_erro


def salvar_resultados(caminho_imagem: str, analise: AnaliseEncarte, conn: sqlite3.Connection, supermercado: str) -> List[dict]:
    cursor = conn.cursor()
    nome_arquivo = os.path.basename(caminho_imagem)
    registros = []

    data_encarte = None
    if analise.data_inicio and analise.data_fim:
        data_encarte = f"{analise.data_inicio} a {analise.data_fim}"
    elif analise.data_inicio:
        data_encarte = analise.data_inicio

    for prod in analise.produtos:
        nome_completo = prod.produto
        if prod.medida and prod.medida.lower() not in nome_completo.lower():
            nome_completo = f"{nome_completo} {prod.medida}"

        registro = {
            "imagem": nome_arquivo, "supermercado": supermercado,
            "produto": nome_completo, "marca": prod.marca, "medida": prod.medida,
            "preco": prod.preco, "preco_clube": prod.preco_clube,
            "tipo_promocao": prod.tipo_promocao, "limite": prod.limite,
            "data_encarte": data_encarte, "observacao": prod.observacao,
        }
        registros.append(registro)

        cursor.execute(
            """INSERT INTO produtos (imagem, supermercado, produto, marca, medida, preco, preco_clube,
               tipo_promocao, limite, data_encarte, observacao, texto_ocr, erro_identificacao)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
            (nome_arquivo, supermercado, nome_completo, prod.marca, prod.medida,
             prod.preco, prod.preco_clube, prod.tipo_promocao, prod.limite,
             data_encarte, prod.observacao, "mimo-v2.5-free", 0)
        )

    conn.commit()
    return registros


def main():
    import argparse
    parser = argparse.ArgumentParser(description="Analisa encartes com mimo-v2.5-free")
    parser.add_argument("imagem", nargs="?", help="Imagem especifica (opcional)")
    parser.add_argument("--pasta", default=PASTA_IMGS, help="Pasta com imagens")
    parser.add_argument("--supermercado", default=SUPERMERCADO_PADRAO, help="Nome do supermercado")
    args = parser.parse_args()

    api_key = get_api_key()
    conn = criar_banco()

    if args.imagem:
        arquivos = [args.imagem]
    else:
        if not os.path.exists(args.pasta):
            print(f"Pasta '{args.pasta}' nao encontrada.")
            return
        arquivos = sorted([
            os.path.join(args.pasta, f) for f in os.listdir(args.pasta)
            if f.lower().endswith((".jpg", ".jpeg", ".png", ".webp"))
        ])

    cursor = conn.cursor()
    cursor.execute("SELECT DISTINCT imagem FROM produtos WHERE supermercado = ?", (args.supermercado,))
    ja_processadas = {row[0] for row in cursor.fetchall()}
    pendentes = [arq for arq in arquivos if os.path.basename(arq) not in ja_processadas]

    print(f"Supermercado: {args.supermercado}")
    print(f"API: {API_BASE} | Modelo: mimo-v2.5-free")
    print(f"Total: {len(arquivos)} | Ja processadas: {len(ja_processadas)} | Pendentes: {len(pendentes)}\n")

    todos_registros = 0
    for i, arq in enumerate(pendentes, 1):
        print(f"[{i}/{len(pendentes)}] {arq}")
        try:
            analise = analisar_imagem(api_key, arq)
            regs = salvar_resultados(arq, analise, conn, args.supermercado)
            todos_registros += len(regs)
            print(f"  -> {len(analise.produtos)} produto(s)")
            for p in analise.produtos:
                p_norm = f"R$ {p.preco:.2f}" if p.preco else "s/preco"
                p_clube = f" | Clube: R$ {p.preco_clube:.2f}" if p.preco_clube else ""
                print(f"     {p.produto}: {p_norm}{p_clube}")
        except Exception as e:
            msg = str(e).lower()
            if "429" in msg or "rate" in msg:
                print(f"  [RATE LIMIT] Aguardando 60s...")
                time.sleep(60)
                try:
                    analise = analisar_imagem(api_key, arq)
                    regs = salvar_resultados(arq, analise, conn, args.supermercado)
                    todos_registros += len(regs)
                    print(f"  -> {len(analise.produtos)} produto(s) (retry OK)")
                except Exception as e2:
                    print(f"  [ERRO] {e2}")
            else:
                print(f"  [ERRO] {e}")

        if i < len(pendentes):
            time.sleep(DELAY_ENTRE_REQUESTS)

    conn.close()
    print(f"\nConcluido! {todos_registros} produtos de {len(pendentes)} imagens.")


if __name__ == "__main__":
    main()
