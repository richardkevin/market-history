#!/usr/bin/env python3
"""Analisa imagens de encartes/fotos do Prezunic usando Google Gemini Multimodal.

Extrai produtos, precos (normal e clube), medidas e condicoes com precisao.
Salva no SQLite (encartes_produtos.db) e em produtos_extraidos_gemini.json.
"""

import os
import sys
import json
import time
import sqlite3
from typing import List, Optional
from pydantic import BaseModel, Field
from PIL import Image
from google import genai
from google.genai import types

MAX_RETRIES = 5
RETRY_DELAY = 5
DELAY_ENTRE_REQUESTS = 4.5  # segundos (~13 RPM, margem para 15 RPM do free tier)

PASTA_IMGS = "encartes_prezunic"
BANCO_DADOS = "encartes_produtos.db"
MODELO_PADRAO = "gemini-3.1-flash-lite"
SUPERMERCADO_PADRAO = "prezunic"


class ProdutoExtraido(BaseModel):
    produto: str = Field(description="Nome do produto completo e padronizado, SEMPRE incluindo marca/rótulo quando visível (ex: CONTRAFILÉ BOVINO MATURATTA, CERVEJA ANTARCTICA SUBZERO, SABÃO EM PÓ OMO). Para bebidas (vinhos, cervejas, destilados) NUNCA use nome genérico: escreva 'VINHO CASILLERO DEL DIABLO CABERNET SAUVIGNON 750ML', não 'VINHO 750ML'")
    marca: Optional[str] = Field(default=None, description="Marca do produto (ex: Friboi, Seara, OMO, Antarctica, Personal)")
    medida: Optional[str] = Field(default=None, description="Litragem, peso ou unidade (ex: 1,6kg, 473ml, peça kg, 1kg, folha dupla 20m leve 12 pague 11)")
    preco: Optional[float] = Field(default=None, description="Preço normal / sem desconto de clube (ex: 59.99, 4.39, 21.29)")
    preco_clube: Optional[float] = Field(default=None, description="Preço promocional para clientes Clube Prezunic / App (ex: 49.98, 3.89, 19.29)")
    tipo_promocao: Optional[str] = Field(default=None, description="Condição promocional se houver (ex: 'LEVE 4 PAGUE 3', '20% OFF', '50% NA 2ª UN')")
    limite: Optional[str] = Field(default=None, description="Limite por cliente se especificado (ex: '10 Kg', '48 UN', '12 UN')")
    observacao: Optional[str] = Field(default=None, description="Observações relevantes (ex: 'Exclusivo Loja Física', 'Exceto biscoitos de padaria')")


class AnaliseEncarte(BaseModel):
    data_inicio: Optional[str] = Field(default=None, description="Data de início da validade (ex: 19/08/2026)")
    data_fim: Optional[str] = Field(default=None, description="Data de término da validade (ex: 21/08/2026)")
    titulo_encarte: Optional[str] = Field(default=None, description="Tema ou título do encarte (ex: 'Ofertas de Inverno', 'Sextou Prezunic')")
    produtos: List[ProdutoExtraido] = Field(default_factory=list, description="Lista de todos os produtos anunciados na imagem com seus respectivos preços")


PROMPT_SISTEMA = """Você é um especialista em OCR e extração estruturada de dados de encartes e tabloides de supermercados brasileiros.
Analise a imagem com altíssima atenção aos detalhes visuais e de layout.

INSTRUÇÕES:
1. Identifique TODOS os produtos anunciados na imagem.
2. Para cada produto, associe com precisão:
   - Nome completo do produto, incluindo marca/rótulo (em bebidas como vinhos e cervejas o nome sem a marca é inútil para comparar preços)
   - Marca (se identificável)
   - Litragem / Peso / Embalagem / Medida (ex: 473ml, 1,6kg, kg, pacote 500g)
   - Preço regular / sem desconto
   - Preço promocional / com clube / app (se houver)
   - Promoções do tipo 'Leve Mais Pague Menos' ou 'Desconto percentual' (ex: 'Leve 4 Pague 3', '20% OFF')
   - Limite por cliente (ex: 'Limite de 10 Kg por cliente')
3. Se uma imagem contiver múltiplos produtos em grade ou colunas, extraia CADA UM separadamente.
4. Se for apenas um banner institucional ou aviso sem produtos/preços, retorne a lista de produtos vazia.
"""


def criar_banco():
    conn = sqlite3.connect(BANCO_DADOS)
    c = conn.cursor()
    c.execute("""
        CREATE TABLE IF NOT EXISTS produtos (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            imagem TEXT NOT NULL,
            supermercado TEXT NOT NULL DEFAULT 'prezunic',
            produto TEXT,
            marca TEXT,
            medida TEXT,
            preco REAL,
            preco_clube REAL,
            tipo_promocao TEXT,
            limite TEXT,
            data_encarte TEXT,
            observacao TEXT,
            texto_ocr TEXT,
            erro_identificacao INTEGER DEFAULT 0,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    """)
    # Migracao: adicionar coluna supermercado se nao existir (banco antigo)
    c.execute("PRAGMA table_info(produtos)")
    colunas = {row[1] for row in c.fetchall()}
    if "supermercado" not in colunas:
        c.execute("ALTER TABLE produtos ADD COLUMN supermercado TEXT NOT NULL DEFAULT 'prezunic'")
    conn.commit()
    return conn


def obter_clientes_gemini() -> list[genai.Client]:
    """Coleta todas as API keys disponíveis e retorna lista de clientes."""
    env_keys = [
        "GEMINI_API_KEY",
        "MERCADO_GEMINI_API_KEY",
    ]
    clientes = []
    vistos = set()
    for env in env_keys:
        key = os.environ.get(env)
        if key and key not in vistos:
            clientes.append(genai.Client(api_key=key))
            vistos.add(key)
    if not clientes:
        print("Nenhuma chave de API do Gemini encontrada.")
        key = input("Cole sua chave de API Gemini: ").strip()
        if not key:
            print("Erro: API Key é obrigatória.")
            sys.exit(1)
        clientes.append(genai.Client(api_key=key))
    return clientes


MODELOS_FALLBACK = ["gemini-3.1-flash-lite", "gemini-flash-lite-latest", "gemini-2.5-flash-lite", "gemini-3.5-flash"]


def analisar_imagem(client: genai.Client, caminho_imagem: str, modelo: str = MODELO_PADRAO) -> AnaliseEncarte:
    if not os.path.exists(caminho_imagem):
        raise FileNotFoundError(f"Imagem não encontrada: {caminho_imagem}")

    img = Image.open(caminho_imagem)

    modelos_tentar = [modelo] + [m for m in MODELOS_FALLBACK if m != modelo]
    ultimo_erro = None

    for mod in modelos_tentar:
        for tentativa in range(1, MAX_RETRIES + 1):
            try:
                chat = client.chats.create(
                    model=mod,
                    config=types.GenerateContentConfig(
                        system_instruction=PROMPT_SISTEMA,
                        response_mime_type="application/json",
                        response_schema=AnaliseEncarte,
                        temperature=0.1,
                    ),
                )
                response = chat.send_message([
                    "Extraia todos os produtos, preços regulares, preços clube e detalhes deste encarte conforme o schema estruturado.",
                    img,
                ])
                dados_json = json.loads(response.text)
                return AnaliseEncarte(**dados_json)
            except Exception as e:
                ultimo_erro = e
                msg = str(e).lower()
                if "404" in msg or "not_found" in msg:
                    break
                if tentativa < MAX_RETRIES and ("503" in msg or "unavailable" in msg or "rate" in msg or "429" in msg):
                    espera = RETRY_DELAY * tentativa * 2 if "429" in msg or "rate" in msg else RETRY_DELAY * tentativa
                    print(f"      Tentativa {tentativa}/{MAX_RETRIES} falhou ({e.__class__.__name__}), retry em {espera}s...")
                    time.sleep(espera)
                    continue
                raise e

    raise ultimo_erro


def salvar_resultados(caminho_imagem: str, analise: AnaliseEncarte, conn: sqlite3.Connection, supermercado: str = SUPERMERCADO_PADRAO) -> List[dict]:
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
            "imagem": nome_arquivo,
            "supermercado": supermercado,
            "produto": nome_completo,
            "marca": prod.marca,
            "medida": prod.medida,
            "preco": prod.preco,
            "preco_clube": prod.preco_clube,
            "tipo_promocao": prod.tipo_promocao,
            "limite": prod.limite,
            "data_encarte": data_encarte,
            "observacao": prod.observacao,
            "erro_identificacao": 0,
        }
        registros.append(registro)

        cursor.execute(
            """
            INSERT INTO produtos (
                imagem, supermercado, produto, marca, medida, preco, preco_clube,
                tipo_promocao, limite, data_encarte, observacao, texto_ocr, erro_identificacao
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                nome_arquivo,
                supermercado,
                nome_completo,
                prod.marca,
                prod.medida,
                prod.preco,
                prod.preco_clube,
                prod.tipo_promocao,
                prod.limite,
                data_encarte,
                prod.observacao,
                f"Gemini {MODELO_PADRAO}: {analise.titulo_encarte or ''}",
                0
            )
        )

    conn.commit()
    return registros


def main():
    import argparse
    parser = argparse.ArgumentParser(description="Analisa encartes com Gemini Vision")
    parser.add_argument("imagem", nargs="?", help="Caminho de uma imagem específica (opcional)")
    parser.add_argument("--pasta", default=PASTA_IMGS, help="Pasta contendo imagens para processar")
    parser.add_argument("--supermercado", default=SUPERMERCADO_PADRAO, help="Nome do supermercado (default: prezunic)")
    parser.add_argument("--modelo", default=MODELO_PADRAO, help="Modelo Gemini a utilizar (ex: gemini-2.5-flash)")
    parser.add_argument("--reset-db", action="store_true", help="Recria o banco de dados antes de processar")
    args = parser.parse_args()

    clientes = obter_clientes_gemini()
    conn = criar_banco()

    if args.imagem:
        arquivos = [args.imagem]
    else:
        if not os.path.exists(args.pasta):
            print(f"Pasta '{args.pasta}' não encontrada.")
            return
        arquivos = sorted([
            os.path.join(args.pasta, f) for f in os.listdir(args.pasta)
            if f.lower().endswith((".jpg", ".jpeg", ".png", ".webp"))
        ])

    cursor = conn.cursor()
    cursor.execute("SELECT DISTINCT imagem FROM produtos WHERE supermercado = ?", (args.supermercado,))
    imagens_ja_processadas = {row[0] for row in cursor.fetchall()}

    pendentes = [arq for arq in arquivos if os.path.basename(arq) not in imagens_ja_processadas]

    print(f"Supermercado: {args.supermercado}")
    print(f"API keys disponíveis: {len(clientes)}")
    print(f"Total: {len(arquivos)} | Já processadas: {len(imagens_ja_processadas)} | Pendentes: {len(pendentes)}")
    print(f"Usando modelo: {args.modelo}\n")

    todos_registros = []
    processadas_nesta_execucao = 0
    for i, arq in enumerate(pendentes, 1):
        client = clientes[(i - 1) % len(clientes)]
        print(f"[{i}/{len(pendentes)}] Analisando: {arq}")
        try:
            analise = analisar_imagem(client, arq, modelo=args.modelo)
            registros = salvar_resultados(arq, analise, conn, supermercado=args.supermercado)
            todos_registros.extend(registros)
            processadas_nesta_execucao += 1

            print(f"  -> {len(analise.produtos)} produto(s) identificado(s):")
            for p in analise.produtos:
                p_norm = f"R$ {p.preco:.2f}" if p.preco else "s/preço"
                p_clube = f" | Clube: R$ {p.preco_clube:.2f}" if p.preco_clube else ""
                med = f" ({p.medida})" if p.medida else ""
                prom = f" [{p.tipo_promocao}]" if p.tipo_promocao else ""
                print(f"     • {p.produto}{med}: {p_norm}{p_clube}{prom}")
        except Exception as e:
            msg = str(e).lower()
            if "429" in msg or "quota" in msg or "rate" in msg or "resource_exhausted" in msg:
                if "rpv" in msg or "day" in msg or "daily" in msg:
                    if len(clientes) > 1:
                        clientes.remove(client)
                        if not clientes:
                            print(f"  [RPD EXCEDIDO] Todas as keys atingiram limite diário.")
                            break
                        print(f"  [RPD] Key removida. Restam {len(clientes)} keys.")
                        continue
                    print(f"  [RPD EXCEDIDO] Limite diário atingido. Reset à meia-noite Pacific Time.")
                    break
                for espera in [30, 60, 120]:
                    print(f"  [RATE LIMIT] Aguardando {espera}s...")
                    time.sleep(espera)
                    next_client = clientes[(i) % len(clientes)]
                    try:
                        analise = analisar_imagem(next_client, arq, modelo=args.modelo)
                        registros = salvar_resultados(arq, analise, conn, supermercado=args.supermercado)
                        todos_registros.extend(registros)
                        processadas_nesta_execucao += 1
                        print(f"  -> {len(analise.produtos)} produto(s) identificado(s) (retry OK)")
                        break
                    except Exception as e2:
                        msg2 = str(e2).lower()
                        if "429" in msg2 or "quota" in msg2 or "rate" in msg2:
                            continue
                        print(f"  [ERRO] {e2}")
                        break
                else:
                    print(f"  [ERRO] Limite de retries atingido. Execute novamente para continuar.")
                    break
            else:
                print(f"  [ERRO] Falha ao processar {arq}: {e}")

        if i < len(pendentes):
            time.sleep(DELAY_ENTRE_REQUESTS)

    conn.close()

    saida_json = "produtos_extraidos_gemini.json"
    with open(saida_json, "w", encoding="utf-8") as f:
        json.dump(todos_registros, f, ensure_ascii=False, indent=2)

    print(f"\nConcluído! {len(todos_registros)} produtos novos de {processadas_nesta_execucao} imagens processadas nesta execução.")
    print(f"Total no banco ({args.supermercado}): {len(imagens_ja_processadas) + processadas_nesta_execucao} imagens.")


if __name__ == "__main__":
    main()
