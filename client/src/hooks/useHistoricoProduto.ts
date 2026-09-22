'use client';

import { useEffect, useState } from 'react';
import type { Produto } from '@/lib/types';

/**
 * Histórico completo (todas as linhas do banco) do produto selecionado,
 * com cache por nome para não refazer o fetch ao voltar num produto já visto.
 * Com `exato: false`, agrega todos os produtos que contêm o termo (LIKE).
 */
export function useHistoricoProduto(
  produtoSelecionado: string | null,
  opcoes?: { exato?: boolean }
) {
  const exato = opcoes?.exato ?? true;
  const [cache, setCache] = useState<Record<string, Produto[]>>({});
  const chave = produtoSelecionado ? `${exato ? 'e' : 't'}:${produtoSelecionado}` : null;

  useEffect(() => {
    if (!chave || !produtoSelecionado || cache[chave]) return;
    let vigente = true;
    fetch(
      `/api/produtos?action=historico-produto&exato=${exato ? 1 : 0}&produto=${encodeURIComponent(produtoSelecionado)}`
    )
      .then((r) => r.json())
      .then((data) => {
        if (vigente) {
          setCache((prev) => ({
            ...prev,
            [chave]: Array.isArray(data) ? data : [],
          }));
        }
      })
      .catch(() => {});
    return () => {
      vigente = false;
    };
  }, [chave, produtoSelecionado, exato, cache]);

  const historico = chave ? (cache[chave] ?? []) : [];
  const carregando = chave != null && cache[chave] == null;

  return { historico, carregando };
}
