'use client';

import { useEffect, useState } from 'react';
import type { Produto } from '@/lib/types';

/**
 * Histórico completo (todas as linhas do banco) do produto selecionado,
 * com cache por nome para não refazer o fetch ao voltar num produto já visto.
 */
export function useHistoricoProduto(produtoSelecionado: string | null) {
  const [cache, setCache] = useState<Record<string, Produto[]>>({});

  useEffect(() => {
    if (!produtoSelecionado || cache[produtoSelecionado]) return;
    let vigente = true;
    fetch(`/api/produtos?action=historico-produto&produto=${encodeURIComponent(produtoSelecionado)}`)
      .then((r) => r.json())
      .then((data) => {
        if (vigente) {
          setCache((prev) => ({
            ...prev,
            [produtoSelecionado]: Array.isArray(data) ? data : [],
          }));
        }
      })
      .catch(() => {});
    return () => {
      vigente = false;
    };
  }, [produtoSelecionado, cache]);

  const historico = produtoSelecionado ? (cache[produtoSelecionado] ?? []) : [];
  const carregando = produtoSelecionado != null && cache[produtoSelecionado] == null;

  return { historico, carregando };
}
