#!/usr/bin/env python3
"""Orquestra o download dos encartes da semana de todos os mercados.

Roda, em sequencia, os scripts de download de cada mercado usando o proprio
interpretador Python (subprocess). Cada script baixa apenas o que falta
(idempotente), salva na sua pasta `encartes_*` e escreve um indice local.

Uso:
  python baixar_semana.py                            # todos os mercados semanais
  python baixar_semana.py --mercados prezunic guanabara
  python baixar_semana.py --skip atacadao supermarket
  python baixar_semana.py --todos                    # inclui facebook + pinterest
  python baixar_semana.py --pinterest                # so adiciona pinterest
  python baixar_semana.py --extrair                  # baixa e atualiza o banco
  python baixar_semana.py --extrair --sem-normalizar # so extrai (sem dedupe)

Observacoes:
  - Baixa apenas o encarte da semana de cada mercado (sem wayback/historico).
  - `supermarket` e `mundial` rodam com `--atual`, que pula backfill historico.
  - `facebook` exige login manual no navegador (Playwright visivel) e nao vai
    no modo padrao; `pinterest` baixa boards do perfil Folhetos TV (arquivo,
    nao "a semana"). Ambos ficam fora por padrao, ativos com `--todos`.
  - Com `--extrair`, apos os downloads roda em sequencia:
      1. ler_produtos_gemini.py --todas   (OCR/vision -> encartes_produtos.db)
      2. migrar_categorias.py             (reconstroi a coluna `categoria`)
      3. normalizar_produtos.py           (dedupe/normaliza; faz backup do DB)
    O extrator e idempotente: so processa imagens/PDFs ainda pendentes, cobrindo
    todas as pastas `encartes_*` (inclusive pinned boards). Precisa de
    GEMINI_API_KEY (ou MERCADO_GEMINI_API_KEY) e de rede.
"""

import argparse
import subprocess
import sys
import time
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent

SCRIPTS = {
    "prezunic": "baixar_encartes.py",
    "guanabara": "baixar_guanabara_site.py",
    "assai": "baixar_encartes_assai.py",
    "atacadao": "baixar_encartes_atacadao.py",
    "supermarket": "baixar_encartes_supermarket.py",
    "mundial": "baixar_encartes_mundial.py",
    "facebook": "baixar_fotos_facebook.py",
    "pinterest": "baixar_pinterest.py",
}

# Mercados com encarte "da semana" baixado automaticamente (sem login manual).
# supermarket e mundial rodam com --atual para nao consultar historico/wayback.
SEMANAIS = ["prezunic", "guanabara", "assai", "atacadao", "supermarket", "mundial"]

# Argumentos extras passados ao downloader alem do caminho do script.
FLAGS = {
    "supermarket": ["--atual"],
    "mundial": ["--atual"],
}

# Pos-processamento rodado com --extrair: (rotulo, script, argumentos).
POS_SCRIPTS = [
    ("extrair", "ler_produtos_gemini.py", ["--todas"]),
    ("categorias", "migrar_categorias.py", []),
    ("normalizar", "normalizar_produtos.py", []),
]


def rodar_script(rotulo: str, script: str, flags: list[str]) -> dict:
    """Executa um script do pipeline e devolve o resultado."""
    t0 = time.monotonic()
    cmd = " ".join([script, *flags])
    print(f"\n{'=' * 70}\n>>> {rotulo.upper()}  ({cmd})\n{'=' * 70}", flush=True)
    proc = subprocess.run([sys.executable, script, *flags], cwd=BASE_DIR)
    duracao = time.monotonic() - t0
    ok = proc.returncode == 0
    resultado = f"OK em {duracao:.0f}s" if ok else f"FALHA (exit={proc.returncode}) em {duracao:.0f}s"
    print(f"\n>>> {rotulo}: {resultado}")
    return {"rotulo": rotulo, "script": script, "ok": ok, "duracao": duracao}


def rodar_mercado(nome: str) -> dict:
    """Executa o downloader de um mercado e devolve o resultado."""
    return rodar_script(nome, SCRIPTS[nome], FLAGS.get(nome, []))


def rodar_pos_processamento(sem_normalizar: bool) -> list[dict]:
    """Roda extracao (e normalizacao) apos os downloads."""
    etapas = POS_SCRIPTS[:1] if sem_normalizar else POS_SCRIPTS
    return [rodar_script(rotulo, script, flags) for rotulo, script, flags in etapas]


def confirmar_planes(mercados: list[str]) -> list[str]:
    """Marca o facebook como interativo e avisa o usuario."""
    if "facebook" in mercados:
        print("ATENCAO: `facebook` abre um navegador para login manual.")
        try:
            resp = input("Continuar? [s/N] ").strip().lower()
        except EOFError:
            resp = ""
        if resp != "s":
            mercados = [m for m in mercados if m != "facebook"]
            print("Pulando facebook.")
    return mercados


def main() -> None:
    parser = argparse.ArgumentParser(description="Baixa os encartes da semana de todos os mercados.")
    parser.add_argument(
        "--mercados", nargs="+", metavar="MERCADO",
        help="Mercados a baixar (padrao: mercados semanais).",
    )
    parser.add_argument(
        "--skip", nargs="+", metavar="MERCADO",
        help="Remove mercados da lista (ex.: --skip atacadao).",
    )
    parser.add_argument(
        "--todos", action="store_true",
        help="Inclui tambem facebook (login manual) e pinterest (boards).",
    )
    parser.add_argument(
        "--facebook", action="store_true", help="Inclui Prezunic-Facebook (login manual).",
    )
    parser.add_argument(
        "--pinterest", action="store_true", help="Inclui Pinterest (boards Folhetos TV).",
    )
    parser.add_argument(
        "--extrair", action="store_true",
        help="Apos baixar, roda extracao Gemini + categorias + normalizacao.",
    )
    parser.add_argument(
        "--sem-normalizar", action="store_true",
        help="Com --extrair, roda so a extracao (pula categorias/normalizacao).",
    )
    args = parser.parse_args()

    desconhecidos = set(SCRIPTS)
    if args.mercados:
        desconhecidos = set(args.mercados) - set(SCRIPTS)
        if desconhecidos:
            parser.error(
                f"Mercado(s) desconhecido(s): {sorted(desconhecidos)}. "
                f"Disponiveis: {sorted(SCRIPTS)}"
            )

    mercados = list(args.mercados) if args.mercados else SEMANAIS
    if args.todos:
        for m in ("facebook", "pinterest"):
            if m not in mercados:
                mercados.append(m)
    if args.facebook:
        if "facebook" not in mercados:
            mercados.append("facebook")
    if args.pinterest:
        if "pinterest" not in mercados:
            mercados.append("pinterest")
    if args.skip:
        mercados = [m for m in mercados if m not in args.skip]

    if not mercados:
        parser.error("Nenhum mercado selecionado.")

    mercados = confirmar_planes(mercados)

    print(f"\nMercados: {', '.join(mercados)}")
    print("Iniciando download em sequencia (cada mercado baixa so o que falta)...")

    resultados = [rodar_mercado(m) for m in mercados]

    resultados_pos = []
    if args.extrair:
        if args.sem_normalizar:
            print("\nIniciando extracao (sem normalizacao)...")
        else:
            print("\nIniciando extracao e normalizacao...")
        resultados_pos = rodar_pos_processamento(args.sem_normalizar)

    print("\n" + "=" * 70)
    print("RESUMO DA SEMANA")
    print("=" * 70)
    for r in resultados:
        status = "OK" if r["ok"] else "FALHA"
        print(f"  {r['rotulo']:<12} {status:<6} {r['duracao']:.0f}s  ({r['script']})")
    falhas = [r["rotulo"] for r in resultados if not r["ok"]]
    print(f"\nDownloads: {len(resultados) - len(falhas)}/{len(resultados)} OK")

    falhas_pos = []
    if resultados_pos:
        print("\nPos-processamento:")
        for r in resultados_pos:
            status = "OK" if r["ok"] else "FALHA"
            print(f"  {r['rotulo']:<12} {status:<6} {r['duracao']:.0f}s  ({r['script']})")
        falhas_pos = [r["rotulo"] for r in resultados_pos if not r["ok"]]

    if falhas or falhas_pos:
        if falhas:
            print(f"\nFalharam (download): {', '.join(falhas)}")
        if falhas_pos:
            print(f"Falharam (pos-processamento): {', '.join(falhas_pos)}")
        sys.exit(1)


if __name__ == "__main__":
    main()