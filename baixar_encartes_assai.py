#!/usr/bin/env python3
"""Baixa encartes do Assai via encarte.br.com.

Busca imagens em assai.encarte.br.com e baixa todas as paginas + PDF.
Apenas encarte atual (sem historico).
Sem dependencias externas - usa urllib padrao.
"""

from encarte_br import baixar_encarte_br

if __name__ == "__main__":
    baixar_encarte_br("assai", "encartes_assai", "assai")
