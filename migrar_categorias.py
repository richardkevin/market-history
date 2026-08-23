#!/usr/bin/env python3
"""Migração: adiciona a coluna `categoria` à tabela `produtos` e classifica
os produtos existentes com base em regras de palavras-chave no nome.

Uso:
    python migrar_categorias.py [caminho_do_db]

Idempotente: pode ser rodado novamente para reclassificar tudo
(útil após ajustar as regras).
"""

import re
import sqlite3
import sys
import unicodedata
from collections import Counter
from pathlib import Path

DB_PADRAO = Path(__file__).parent / "encartes_produtos.db"

OUTROS = "Outros"

# Regras em ordem de precedência: a primeira categoria cujo padrão casar vence.
# Padrões aplicados sobre o nome NORMALIZADO (maiúsculas, sem acentos,
# hífen/barra viram espaço).
CATEGORIAS = [
    (
        "Bebidas Alcoólicas",
        [
            r"\bCERVEJAS?\b",
            r"\bVINHOS?\b",
            r"\bVODKA\b",
            r"\bWHISKE?Y\b",
            r"\bCACHACA\b",
            r"\bESPUMANTE\b",
            r"\bLICOR\b",
            r"\bSAKE\b",
            r"\bTEQUILA\b",
            r"\bRUM\b",
            r"\bGIN\b",
            r"\bAPERITIVOS?\b",
            r"\bSIDRAS?\b",
            r"\bSKOL\b",
        ],
    ),
    (
        "Higiene e Beleza",
        [
            r"\bSHAMPOOS?\b",
            r"\bCONDICIONADORES?\b",
            r"CREME\s+DE\s+PENTEAR",
            r"\bCAPILARES?\b",
            r"\bTRATAMENTOS?\b",
            r"\bCOLORACAO\b",
            r"\bTINTURA\b",
            r"\bSABONETES?\b",
            r"CREME\s+DENTAL",
            r"\bABSORVENTES?\b",
            r"\bFRALDAS?\b",
            r"TOALHA\s+UMEDECIDA",
            r"LENCOS?\s+UMEDECIDOS?",
            r"\bBARBEAR\b",
            r"\bDESODORANTES?\b",
            r"\bPERFUMES?\b",
            r"\bHIDRATANTES?\b",
            r"PROTETOR\s+SOLAR",
            r"AGUA\s+MICELAR",
            r"ESCOVA\S*\s+DENTA",
            r"FIO\s+DENTAL",
            r"\bCOTONETES?\b",
            r"HASTES\s+FLEXIVEIS",
            r"\bCOLONIA\b",
            r"\bCREMES?\b(?=\s+(?:NOTURNO|DIURNO|ANTISSINAIS|HIPERALTOGENIC))",
            r"PAPEL\s+HIGIENICO",
            r"\bTALCOS?\b",
            r"\bMASCARAS?\b",
            r"\bDIFUSORES?\b",
            r"ASSADURAS",
            r"BB\s+CREAM",
            r"ANTISSEPTICO",
            r"\bAPARELHOS?\b",
        ],
    ),
    (
        "Limpeza",
        [
            r"LAVA\s*ROUPAS",
            r"SABAO",
            r"\bAMACIANTES?\b",
            r"\bALVEJANTES?\b",
            r"AGUA\s+SANITARIA",
            r"\bDETERGENTES?\b",
            r"\bLIMPADORES?\b",
            r"\bMULTIUSO\b",
            r"\bDESINFETANTES?\b",
            r"\bESPONJAS?\b",
            r"TIRA\s*MANCHAS",
            r"\bREMOVEDORES?\b",
            r"PASSA\s*ZAP",
            r"\bPANOS?\b",
            r"\bLYSOFORM\b",
            r"SACO\S*\s+DE\s+LIXO",
            r"PAPEL\s+TOALHA",
            r"\bGUARDANAPOS?\b",
            r"PAPEL\s+ALUMINIO",
            r"FILME\s+PLASTICO",
            r"PALHA\s+DE\s+ACO",
            r"PASSE?\s*ZAP",
            r"\bVASSOURAS?\b",
            r"\bMOPS?\b",
            r"LUSTRA",
            r"\bMOFO\b",
            r"\bINSETICIDAS?\b",
            r"\bAROMATIZANTES?\b",
        ],
    ),
    (
        "Bebidas",
        [
            r"\bREFRIGERANTES?\b",
            r"\bPEPSI\b",
            r"\bCOCA\b",
            r"\bGUARANA\b",
            r"\bREFRESCOS?\b",
            r"\bSUCOS?\b",
            r"\bNECTARE?S?\b",
            r"\bCONCENTRADOS?\b",
            r"AGUA\s+MINERAL",
            r"AGUA\s+COM\s+GAS",
            r"AGUA\s+DE\s+COCO",
            r"AGUA\s+SABORIZADA",
            r"H2OH",
            r"\bTONICA\b",
            r"\bENERGETICOS?\b",
            r"\bISOTONICOS?\b",
            r"GATORADE",
            r"CHA\s+(MATE|MASCARADO|PRETO|BRANCO|VERDE)",
        ],
    ),
    (
        "Pet",
        [
            r"\bRACAOS?\b",
            r"AREIA\s+SANITARIA",
        ],
    ),
    (
        "Mercearia",
        # Padrões específicos que devem vencer termos genéricos de outras
        # categorias (ex.: "Molho de Tomate" não é Hortifrúti;
        # "Tempero Minha Carne" não é carne).
        [
            r"\bMOLHOS?\b",
            r"\bEXTRATOS?\b",
            r"\bKETCHUPS?\b",
            r"\bMOSTARDAS?\b",
            r"\bMAIONESES?\b",
            r"\bTEMPEROS?\b",
            r"\bCALDOS?\b",
            r"\bCONSOMMES?\b",
            r"\bSOPAS?\b",
            r"MACARRAO\s+INSTANTANEO",
            r"\bSARDINHAS?\b",
            r"\bATUMS?\b",
            r"\bAZEITONAS?\b",
            r"\bERVILHAS?\b",
            r"MILHO\s+VERDE",
            r"\bGELEIAS?\b",
            r"\bVINAGRES?\b",
            r"\bMEL\b",
            r"\bCAFES?\b",
            r"\bCHAS?\b",
            r"\bMATES?\b",
            r"\bADOCANTES?\b",
        ],
    ),
    (
        "Ovos",
        [
            r"\bOVO(S)?\b(?!\w*MALTINE)",
        ],
    ),
    (
        "Carnes, Aves e Peixes",
        [
            r"\bCARNE(S)?\b",
            r"\bFILES?\b",
            r"\bFILEZINHOS?\b",
            r"FILE\s*MIGNON",
            r"\bSTEAKS?\b",
            r"\bBACALHAUS?\b",
            r"\bTIRINHAS?\b",
            r"\bMOELAS?\b",
            r"\bPICANHAS?\b",
            r"\bALCATRAS?\b",
            r"\bACEM\b",
            r"\bPATINHOS?\b",
            r"\bCOXAOS?\b",
            r"\bMUSCULO(S)?\b",
            r"\bCOSTELAS?\b",
            r"CONTRA\s*FILE",
            r"\bFRALDINHAS?\b",
            r"\bPERNIL(S)?\b",
            r"\bBISTECAS?\b",
            r"\bLOMBOS?\b",
            r"\bCARRE(S)?\b",
            r"\bTORRESMOS?\b",
            r"\bFIGADO(S)?\b",
            r"\bFRANGOS?\b",
            r"\bGALINHAS?\b",
            r"\bSOBRECOXAS?\b",
            r"\bCOXAS?\b",
            r"\bCHESTER\b",
            r"\bPEIXES?\b",
            r"\bTILAPIAS?\b",
            r"\bSALMAO\b",
            r"\bCAMARA(O|OES)\b",
            r"\bPOLVOS?\b",
            r"\bMARISCOS?\b",
        ],
    ),
    (
        "Embutidos e Frios",
        [
            r"\bSALSICHAS?\b",
            r"\bLINGUICAS?\b",
            r"\bMORTELAS?\b",
            r"\bMORTADELAS?\b",
            r"\bPRESUNTOS?\b",
            r"\bSALAMES?\b",
            r"\bBACONS?\b",
            r"\bPAIO(S)?\b",
            r"\bPEPPERONI\b",
            r"\bAPRESUNTADOS?\b",
            r"\bPANCETAS?\b",
            r"\bTIROLESAS?\b",
            r"\bPERUS?\b",
            r"\bTENDERS?\b",
            r"KANI",
        ],
    ),
    (
        "Leites e Derivados",
        [
            r"\bLEITES?\b",
            r"LACTE[AO]S?",
            r"\bQUEIJOS?\b",
            r"\bREQUEIJAOS?\b",
            r"\bIOGURTES?\b",
            r"PETIT\s+SUISSE",
            r"\bPETITS?\b",
            r"\bMANTEIGAS?\b",
            r"CREME\s+DE\s+LEITE",
            r"CREAM\s+CHEESE",
            r"\bCHANTILLY\b",
        ],
    ),
    (
        "Padaria",
        [
            r"\bPAO(S)?\b",
            r"\bBAGUETES?\b",
            r"\bBISNAGUINHAS?\b",
            r"\bBOLOS?\b",
            r"\bSONHOS?\b",
        ],
    ),
    (
        "Congelados",
        [
            r"\bSORVETES?\b",
            r"\bCONGELADOS?\b",
            r"BATATA\s+PALITO",
            r"\bNUGGETS?\b",
            r"\bHAMBURGUER(E)?S?\b",
            r"\bBURGERS?\b",
            r"\bCHICKEN\b",
            r"\bYAKISOBA\b",
            r"\bPIZZAS?\b",
            r"\bPOLPAS?\b",
        ],
    ),
    (
        "Biscoitos, Snacks e Doces",
        [
            r"\bBISCOITOS?\b",
            r"\bBOLACHAS?\b",
            r"WAFE?RS?\b",
            r"\bSALGADINHOS?\b",
            r"\bCHIPS\b",
            r"\bCHOCOLATES?\b",
            r"\bBOMBONS?\b",
            r"\bBALAS?\b",
            r"\bPIRULITOS?\b",
            r"\bCEREAL\b",
            r"\bPACOCAS?\b",
            r"\bACHOCOLATADOS?\b",
            r"GELATINAS?\b",
            r"CREME\s+DE\s+AVELA",
            r"SNOW\s*FLAKES",
            r"\bMUCILON\b",
            r"\bNESTON\b",
            r"\bTEKITOS\b",
            r"CREAM\s+CRACKER",
            r"\bGOIABADAS?\b",
            r"\bPIPOCAS?\b",
        ],
    ),
    (
        "Mercearia",
        [
            r"\bARROZ(ES)?\b",
            r"\bFEIJA(O|ES)\b",
            r"\bLENTILHAS?\b",
            r"GRAO\s+DE\s+BICO",
            r"\bMACARR(AO|OES)\b",
            r"\bLASANHAS?\b",
            r"\bCAPELETTIS?\b",
            r"\bRAVIOLIS?\b",
            r"\bESPAGUETES?\b",
            r"\bTALHARINS?\b",
            r"\bPENNES?\b",
            r"\bNHOQUES?\b",
            r"\bSEMOLAS?\b",
            r"\bFARINHAS?\b",
            r"\bFAROFAS?\b",
            r"\bPOLVILHOS?\b",
            r"\bFUBAS?\b",
            r"\bFLOCAOS?\b",
            r"\bFLOCOS?\b",
            r"\bAVEIAS?\b",
            r"\bTAPIOCAS?\b",
            r"\bACUCARE?S?\b",
            r"\bSAL\b",
            r"\bOLEOS?\b",
            r"\bAZEITES?\b",
            r"\bTORRADAS?\b",
            r"\bMARGARINAS?\b",
            r"\bFUBARINA\b",
            r"COCO\s+RALADO",
            r"\bPASSATAS?\b",
            r"POMODORI|PELATI",
        ],
    ),
    (
        "Frutas, Legumes e Verduras",
        [
            r"\bTOMATES?\b",
            r"\bCEBOLAS?\b",
            r"\bALHOS?\b",
            r"\bBATATAS?\b",
            r"\bCENOURAS?\b",
            r"\bABOBORAS?\b",
            r"\bABOBRINHAS?\b",
            r"\bBETERRABAS?\b",
            r"\bCHUCHUS?\b",
            r"\bPEPINOS?\b",
            r"\bPIMENTAO(E)?S?\b",
            r"\bQUIABOS?\b",
            r"\bREPOLHOS?\b",
            r"\bCOUVES?\b",
            r"\bALFACES?\b",
            r"\bRUCULAS?\b",
            r"\bBERINJELAS?\b",
            r"\bVAGENS?\b",
            r"\bBANANAS?\b",
            r"\bMACAS?\b",
            r"\bLARANJAS?\b",
            r"\bLIMAO(E)?S?\b",
            r"\bMAMAOS?\b",
            r"\bMANGAS?\b",
            r"\bMELANCIAS?\b",
            r"\bMELAO(E)?S?\b",
            r"\bGOIABAS?\b",
            r"\bABACAXIS?\b",
            r"\bMORANGOS?\b",
            r"\bUVAS?\b",
            r"\bPERAS?\b",
            r"\bPESSEGOS?\b",
            r"\bACEROLAS?\b",
            r"\bCAJUS?\b",
            r"\bABACATES?\b",
            r"\bBROCOLIS\b",
            r"\bMILHOS?\b",
        ],
    ),
]


def normalizar(texto: str) -> str:
    """Maiúsculas sem acentos; hífen e barra viram espaço."""
    texto = unicodedata.normalize("NFD", texto.upper())
    texto = "".join(c for c in texto if not unicodedata.combining(c))
    return texto.replace("-", " ").replace("/", " ")


def compilar_regras() -> list[tuple[str, re.Pattern[str]]]:
    regras = []
    for categoria, padroes in CATEGORIAS:
        regex = re.compile("|".join(f"(?:{p})" for p in padroes))
        regras.append((categoria, regex))
    return regras


def classificar(nome: str, regras) -> str:
    nome_norm = normalizar(nome)
    for categoria, regex in regras:
        if regex.search(nome_norm):
            return categoria
    return OUTROS


def main() -> None:
    db_path = Path(sys.argv[1]) if len(sys.argv) > 1 else DB_PADRAO
    if not db_path.exists():
        sys.exit(f"DB não encontrado: {db_path}")

    conn = sqlite3.connect(db_path)
    try:
        colunas = {row[1] for row in conn.execute("PRAGMA table_info(produtos)")}
        if "categoria" not in colunas:
            conn.execute("ALTER TABLE produtos ADD COLUMN categoria TEXT")
            print("Coluna 'categoria' adicionada.")
        else:
            print("Coluna 'categoria' já existe.")

        regras = compilar_regras()
        linhas = conn.execute(
            "SELECT id, produto FROM produtos WHERE produto IS NOT NULL"
        ).fetchall()

        atualizacoes = [
            (classificar(produto, regras), pid) for pid, produto in linhas
        ]
        conn.executemany(
            "UPDATE produtos SET categoria = ? WHERE id = ?", atualizacoes
        )
        conn.commit()

        resumo = Counter(cat for cat, _ in atualizacoes)
        total_sem_nome = conn.execute(
            "SELECT COUNT(*) FROM produtos WHERE produto IS NULL"
        ).fetchone()[0]

        print(f"\nClassificados: {len(atualizacoes)} produtos em '{db_path}'")
        for categoria, qtd in resumo.most_common():
            print(f"  {qtd:>6}  {categoria}")
        if total_sem_nome:
            print(f"  {total_sem_nome:>6}  (sem nome — categoria nula)")
    finally:
        conn.close()


if __name__ == "__main__":
    main()
