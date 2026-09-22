#!/usr/bin/env python3
"""Analisa encartes (imagens e PDFs) de varios supermercados usando Google Gemini.

Suporta imagens (jpg/png/webp) e PDFs (converte paginas para imagens).
Salva no SQLite (encartes_produtos.db) e em produtos_extraidos_gemini.json.

Uso:
  python ler_produtos_gemini.py --todas              # processa todas as pastas
  python ler_produtos_gemini.py --pasta encartes_assai
  python ler_produtos_gemini.py imagem.jpg
  python ler_produtos_gemini.py arquivo.pdf           # processa todas as paginas
"""

import os
import sys
import json
import glob
import time
import sqlite3
import tempfile
from typing import List, Optional
from pydantic import BaseModel, Field
from PIL import Image
from google import genai
from google.genai import types

MAX_RETRIES = 5
RETRY_DELAY = 5
DELAY_ENTRE_REQUESTS = 4.5

BANCO_DADOS = "encartes_produtos.db"
MODELO_PADRAO = "gemini-3.1-flash-lite"

# Mapeamento pasta -> nome do supermercado
PASTA_SUPERMERCADO = {
    "encartes_prezunic": "prezunic",
    "encartes_prezunic_historico": "prezunic",
    "encartes_guanabara": "guanabara",
    "encartes_mundial": "mundial",
    "encartes_assai": "assai",
    "encartes_atacadao": "atacadao",
    "encartes_supermarket": "supermarket",
}

# Boards do Pinterest (Folhetos TV) -> supermercado
BOARD_SUPERMERCADO = {
    "supermarket": "supermarket",
    "guanabara": "guanabara",
    "dom-atacadista": "dom-atacadista",
    "vianense": "vianense",
    "super-rede": "super-rede",
    "assai": "assai",
    "super-compras": "super-compras",
    "unidos": "unidos",
    "multimarket": "multimarket",
    "redeconomia": "redeconomia",
}

# Deteccao de fonte pela pasta (override com --fonte)
def resolver_fonte(pasta: str) -> str:
    nome = os.path.basename(os.path.normpath(pasta))
    if nome.startswith("encartes_pinterest"):
        return "pinterest"
    return "site_oficial"

EXTENSOES_IMAGEM = (".jpg", ".jpeg", ".png", ".webp")
EXTENSOES_PDF = (".pdf",)


class ProdutoExtraido(BaseModel):
    produto: str = Field(description="Nome do produto completo e padronizado, SEMPRE incluindo marca/rótulo quando visível (ex: CONTRAFILÉ BOVINO MATURATTA, CERVEJA ANTARCTICA SUBZERO, SABÃO EM PÓ OMO). Para bebidas (vinhos, cervejas, destilados) NUNCA use nome genérico: escreva 'VINHO CASILLERO DEL DIABLO CABERNET SAUVIGNON 750ML', não 'VINHO 750ML'")
    marca: Optional[str] = Field(default=None, description="Marca do produto (ex: Friboi, Seara, OMO, Antarctica, Personal)")
    medida: Optional[str] = Field(default=None, description="Litragem, peso ou unidade (ex: 1,6kg, 473ml, peça kg, 1kg, folha dupla 20m leve 12 pague 11)")
    preco: Optional[float] = Field(default=None, description="Preço normal / sem desconto de clube (ex: 59.99, 4.39, 21.29)")
    preco_clube: Optional[float] = Field(default=None, description="Preço promocional para clientes Clube / App (ex: 49.98, 3.89, 19.29)")
    tipo_promocao: Optional[str] = Field(default=None, description="Condição promocional se houver (ex: 'LEVE 4 PAGUE 3', '20% OFF', '50% NA 2ª UN')")
    limite: Optional[str] = Field(default=None, description="Limite por cliente se especificado (ex: '10 Kg', '48 UN', '12 UN')")
    observacao: Optional[str] = Field(default=None, description="Observações relevantes (ex: 'Exclusivo Loja Física', 'Exceto biscoitos de padaria')")


class AnaliseEncarte(BaseModel):
    data_inicio: Optional[str] = Field(default=None, description="Data de início da validade (ex: 19/08/2026)")
    data_fim: Optional[str] = Field(default=None, description="Data de término da validade (ex: 21/08/2026)")
    titulo_encarte: Optional[str] = Field(default=None, description="Tema ou título do encarte (ex: 'Ofertas de Inverno', 'Sextou')")
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
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            categoria TEXT
        )
    """)
    c.execute("PRAGMA table_info(produtos)")
    colunas = {row[1] for row in c.fetchall()}
    if "supermercado" not in colunas:
        c.execute("ALTER TABLE produtos ADD COLUMN supermercado TEXT NOT NULL DEFAULT 'prezunic'")
    if "categoria" not in colunas:
        c.execute("ALTER TABLE produtos ADD COLUMN categoria TEXT")
    if "fonte" not in colunas:
        c.execute("ALTER TABLE produtos ADD COLUMN fonte TEXT")
    if "origem" not in colunas:
        c.execute("ALTER TABLE produtos ADD COLUMN origem TEXT")
    if "lote_id" not in colunas:
        c.execute("ALTER TABLE produtos ADD COLUMN lote_id INTEGER")
    # Backfill: origem antiga = "supermercado/imagem" (desambiguiza basenames repetidos)
    c.execute("UPDATE produtos SET origem = supermercado || '/' || imagem WHERE origem IS NULL OR origem = ''")
    c.execute("""
        CREATE TABLE IF NOT EXISTS lotes (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            fonte TEXT NOT NULL,
            modelo TEXT NOT NULL,
            comando TEXT,
            n_arquivos INTEGER,
            n_produtos INTEGER,
            criado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    """)
    conn.commit()
    return conn


def criar_lote(conn: sqlite3.Connection, fonte: str, modelo: str, comando: str, n_arquivos: int) -> int:
    """Cria um lote de processamento e retorna seu id."""
    cur = conn.cursor()
    cur.execute(
        "INSERT INTO lotes (fonte, modelo, comando, n_arquivos) VALUES (?, ?, ?, ?)",
        (fonte, modelo, comando, n_arquivos),
    )
    conn.commit()
    return cur.lastrowid


def finalizar_lote(conn: sqlite3.Connection, lote_id: int, n_arquivos: int, n_produtos: int):
    """Atualiza contadores do lote ao fim da execucao."""
    cur = conn.cursor()
    cur.execute(
        "UPDATE lotes SET n_arquivos = ?, n_produtos = ? WHERE id = ?",
        (n_arquivos, n_produtos, lote_id),
    )
    conn.commit()


def obter_clientes_gemini() -> list[genai.Client]:
    env_keys = ["GEMINI_API_KEY", "MERCADO_GEMINI_API_KEY"]
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


def pdf_para_imagens(caminho_pdf: str) -> list[tuple[int, Image.Image]]:
    """Converte cada pagina do PDF em imagem PIL. Retorna lista (numero_pagina, imagem)."""
    import pymupdf
    doc = pymupdf.open(caminho_pdf)
    imagens = []
    for i, page in enumerate(doc):
        # Renderiza a pagina em 200 DPI (bom equilibrio qualidade/tamanho)
        mat = pymupdf.Matrix(200 / 72, 200 / 72)
        pix = page.get_pixmap(matrix=mat)
        img = Image.frombytes("RGB", [pix.width, pix.height], pix.samples)
        imagens.append((i + 1, img))
    doc.close()
    return imagens


def analisar_imagem(client: genai.Client, caminho_imagem: str, modelo: str = MODELO_PADRAO, imagem_pil: Image.Image = None) -> AnaliseEncarte:
    """Analisa uma imagem (arquivo ou PIL Image) com Gemini."""
    if imagem_pil:
        img = imagem_pil
    else:
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


def salvar_resultados(identificador: str, origem: str, analise: AnaliseEncarte, conn: sqlite3.Connection, supermercado: str, modelo: str = MODELO_PADRAO, fonte: str = "site_oficial", lote_id: int = None) -> List[dict]:
    """Salva resultados no banco. identificador = nome do arquivo (ou arquivo:pag_N para PDFs).
    origem = caminho unico do arquivo (usado para dedup/versionamento)."""
    cursor = conn.cursor()
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
            "imagem": identificador,
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
                tipo_promocao, limite, data_encarte, observacao, texto_ocr, erro_identificacao,
                fonte, origem, lote_id
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                identificador,
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
                f"Gemini {modelo}: {analise.titulo_encarte or ''}",
                0,
                fonte,
                origem,
                lote_id,
            )
        )

    conn.commit()
    return registros


def resolver_supermercado(pasta: str) -> str:
    """Retorna o nome do supermercado baseado no caminho da pasta."""
    nome_pasta = os.path.basename(os.path.normpath(pasta))
    return PASTA_SUPERMERCADO.get(nome_pasta, nome_pasta)


def coletar_arquivos(pasta: str) -> list[str]:
    """Coleta todos os arquivos de imagem e PDF de uma pasta."""
    arquivos = []
    if not os.path.exists(pasta):
        return arquivos
    for f in sorted(os.listdir(pasta)):
        ext = f.lower()
        if ext.endswith(EXTENSOES_IMAGEM) or ext.endswith(EXTENSOES_PDF):
            arquivos.append(os.path.join(pasta, f))
    return arquivos


def coletar_todas_pastas() -> list[tuple[str, str]]:
    """Coleta todas as pastas encartes_*. Expande encartes_pinterest por board.
    Retorna lista (caminho_pasta, supermercado)."""
    pastas = []
    for item in sorted(glob.glob("encartes_*")):
        if not os.path.isdir(item):
            continue
        if item == "encartes_pinterest":
            for board in sorted(os.listdir(item)):
                caminho_board = os.path.join(item, board)
                if os.path.isdir(caminho_board):
                    sup = BOARD_SUPERMERCADO.get(board, board)
                    pastas.append((caminho_board, sup))
        else:
            sup = resolver_supermercado(item)
            pastas.append((item, sup))
    return pastas


def processar_arquivo(client: genai.Client, caminho: str, supermercado: str, modelo: str, conn: sqlite3.Connection, imagens_ja: set, fonte: str = "site_oficial", lote_id: int = None) -> tuple[int, list]:
    """Processa um arquivo (imagem ou PDF). Retorna (qtd_processadas, registros)."""
    nome = os.path.basename(caminho)
    caminho_norm = os.path.normpath(caminho)
    ext = nome.lower()
    total_proc = 0
    todos_regs = []

    if ext.endswith(EXTENSOES_PDF):
        # PDF: converter paginas e processar cada uma
        try:
            paginas = pdf_para_imagens(caminho)
        except Exception as e:
            print(f"  [ERRO] Falha ao ler PDF: {e}")
            return 0, []

        for num_pag, img_pil in paginas:
            id_pdf = f"{nome}:pag{num_pag:02d}"
            origem_pdf = f"{caminho_norm}:pag{num_pag:02d}"
            if id_pdf in imagens_ja:
                print(f"  PDF {nome} pagina {num_pag} - ja processada")
                continue

            print(f"  PDF {nome} pagina {num_pag}/{len(paginas)}...", end=" ")
            try:
                analise = analisar_imagem(client, None, modelo=modelo, imagem_pil=img_pil)
                regs = salvar_resultados(id_pdf, origem_pdf, analise, conn, supermercado, modelo, fonte=fonte, lote_id=lote_id)
                todos_regs.extend(regs)
                total_proc += 1
                print(f"{len(analise.produtos)} produto(s)")
            except Exception as e:
                print(f"[ERRO] {e}")

            time.sleep(DELAY_ENTRE_REQUESTS)
    else:
        # Imagem normal
        if nome in imagens_ja:
            return 0, []

        origem = caminho_norm
        try:
            analise = analisar_imagem(client, caminho, modelo=modelo)
            regs = salvar_resultados(nome, origem, analise, conn, supermercado, modelo, fonte=fonte, lote_id=lote_id)
            todos_regs.extend(regs)
            total_proc = 1

            print(f"  -> {len(analise.produtos)} produto(s) identificado(s):")
            for p in analise.produtos:
                p_norm = f"R$ {p.preco:.2f}" if p.preco else "s/preço"
                p_clube = f" | Clube: R$ {p.preco_clube:.2f}" if p.preco_clube else ""
                med = f" ({p.medida})" if p.medida else ""
                prom = f" [{p.tipo_promocao}]" if p.tipo_promocao else ""
                print(f"     • {p.produto}{med}: {p_norm}{p_clube}{prom}")
        except Exception as e:
            print(f"  [ERRO] Falha ao processar {caminho}: {e}")

    return total_proc, todos_regs


def main():
    import argparse
    parser = argparse.ArgumentParser(description="Analisa encartes com Gemini Vision")
    parser.add_argument("imagem", nargs="?", help="Caminho de uma imagem ou PDF específico")
    parser.add_argument("--pasta", help="Pasta contendo imagens/PDFs para processar")
    parser.add_argument("--todas", action="store_true", help="Processa todas as pastas encartes_*")
    parser.add_argument("--supermercado", help="Nome do supermercado (auto-detectado da pasta)")
    parser.add_argument("--modelo", default=MODELO_PADRAO, help="Modelo Gemini (default: gemini-3.1-flash-lite)")
    parser.add_argument("--reset-db", action="store_true", help="Recria o banco antes de processar")
    parser.add_argument("--fonte", help="Origem dos dados (pinterest, site_oficial, wayback, api_graphql, encarte_br.com)")
    args = parser.parse_args()

    clientes = obter_clientes_gemini()
    conn = criar_banco()

    # Coletar arquivos a processar
    tarefas = []  # lista de (caminho, supermercado)

    if args.imagem:
        sup = args.supermercado or resolver_supermercado(os.path.dirname(args.imagem) or ".")
        tarefas = [(args.imagem, sup)]
    elif args.todas:
        pastas = coletar_todas_pastas()
        for pasta, sup in pastas:
            for arq in coletar_arquivos(pasta):
                tarefas.append((arq, sup))
        print(f"Pastas encontradas: {len(pastas)}")
        for pasta, sup in pastas:
            n = len(coletar_arquivos(pasta))
            print(f"  {pasta} -> {sup} ({n} arquivos)")
        print()
    elif args.pasta:
        sup = args.supermercado or resolver_supermercado(args.pasta)
        for arq in coletar_arquivos(args.pasta):
            tarefas.append((arq, sup))
    else:
        # Default: apenas prezunic (comportamento original)
        pasta_default = "encartes_prezunic"
        sup = args.supermercado or "prezunic"
        for arq in coletar_arquivos(pasta_default):
            tarefas.append((arq, sup))

    if not tarefas:
        print("Nenhum arquivo encontrado para processar.")
        return

    # Fonte dos dados: --fonte override, senao detecta da primeira pasta
    primeira_pasta = os.path.dirname(tarefas[0][0]) or "."
    fonte = args.fonte or resolver_fonte(primeira_pasta)

    # Carregar ja processados
    cursor = conn.cursor()
    cursor.execute("SELECT DISTINCT imagem FROM produtos")
    ja_processadas = {row[0] for row in cursor.fetchall()}

    # Filtrar pendentes (para imagens; PDFs usam id "arquivo:pagN")
    pendentes = []
    for caminho, sup in tarefas:
        nome = os.path.basename(caminho)
        ext = nome.lower()
        if ext.endswith(EXTENSOES_PDF):
            # Para PDFs, verificar se ALGUMA pagina ja foi processada
            # (se todas processadas, pula; senao, processa paginas faltantes)
            try:
                import pymupdf
                doc = pymupdf.open(caminho)
                num_paginas = len(doc)
                doc.close()
                todas_processadas = all(
                    f"{nome}:pag{p:02d}" in ja_processadas
                    for p in range(1, num_paginas + 1)
                )
                if not todas_processadas:
                    pendentes.append((caminho, sup))
            except Exception:
                pendentes.append((caminho, sup))
        else:
            if nome not in ja_processadas:
                pendentes.append((caminho, sup))

    print(f"Total: {len(tarefas)} | Ja processados: {len(tarefas) - len(pendentes)} | Pendentes: {len(pendentes)}")
    print(f"API keys: {len(clientes)} | Modelo: {args.modelo}\n")

    if not pendentes:
        print("Nada pendente.")
        conn.close()
        return

    # Criar lote (versao desta execucao)
    comando = " ".join(sys.argv[1:])
    lote_id = criar_lote(conn, fonte, args.modelo, comando, len(pendentes))
    print(f"Lote #{lote_id} | Fonte: {fonte} | Arquivos: {len(pendentes)}\n")

    todos_registros = []
    processados = 0

    for i, (caminho, sup) in enumerate(pendentes, 1):
        nome = os.path.basename(caminho)
        client = clientes[(i - 1) % len(clientes)]
        print(f"[{i}/{len(pendentes)}] {sup} | {nome}")

        qtd, regs = processar_arquivo(client, caminho, sup, args.modelo, conn, ja_processadas, fonte=fonte, lote_id=lote_id)
        todos_registros.extend(regs)
        processados += qtd

        # Tratar rate limit global
        if i < len(pendentes):
            time.sleep(DELAY_ENTRE_REQUESTS)

    finalizar_lote(conn, lote_id, processados, len(todos_registros))
    conn.close()

    saida_json = "produtos_extraidos_gemini.json"
    with open(saida_json, "w", encoding="utf-8") as f:
        json.dump(todos_registros, f, ensure_ascii=False, indent=2)

    print(f"\nConcluido! {len(todos_registros)} produtos novos de {processados} arquivos/paginas processados.")
    print(f"Total no banco: {len(ja_processadas) + processados} arquivos.")


if __name__ == "__main__":
    main()
