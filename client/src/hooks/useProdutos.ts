'use client';

import { useState, useEffect, useMemo } from 'react';
import { variacoesDesdeUltimoEncarte } from '@/lib/historico';
import type { Produto, Filtros } from '@/lib/types';

export function useProdutos() {
  const [produtos, setProdutos] = useState<Produto[]>([]);
  const [produtosCesta, setProdutosCesta] = useState<Produto[]>([]);
  const [filtros, setFiltros] = useState<Filtros>({
    produtos: [],
    anos: [],
    marcas: [],
    categorias: [],
    ultimaData: null,
  });
  const [filtroProduto, setFiltroProduto] = useState<string | null>(null);
  const [filtroAnos, setFiltroAnos] = useState<number[]>([]);
  const [filtroMarca, setFiltroMarca] = useState<string | null>(null);
  const [filtroCategoria, setFiltroCategoria] = useState<string | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [carregandoCesta, setCarregandoCesta] = useState(true);

  useEffect(() => {
    async function carregarFiltros() {
      const res = await fetch('/api/produtos?action=filtros');
      const data = await res.json();
      setFiltros(data);
    }
    carregarFiltros();
  }, []);

  useEffect(() => {
    async function carregarCesta() {
      const res = await fetch('/api/produtos');
      setProdutosCesta(await res.json());
      setCarregandoCesta(false);
    }
    carregarCesta();
  }, []);

  useEffect(() => {
    let vigente = true;
    async function carregarProdutos() {
      const params = new URLSearchParams();
      if (filtroProduto) params.set('produto', filtroProduto);
      if (filtroAnos.length) params.set('anos', filtroAnos.join(','));
      if (filtroMarca) params.set('marca', filtroMarca);
      if (filtroCategoria) params.set('categoria', filtroCategoria);

      const res = await fetch(`/api/produtos?${params.toString()}`);
      const data = await res.json();
      if (vigente) {
        setProdutos(data);
        setCarregando(false);
      }
    }
    carregarProdutos();
    return () => {
      vigente = false;
    };
  }, [filtroProduto, filtroAnos, filtroMarca, filtroCategoria]);

  const limparFiltros = () => {
    setFiltroProduto(null);
    setFiltroAnos([]);
    setFiltroMarca(null);
    setFiltroCategoria(null);
  };

  const variacoes = useMemo(
    () =>
      carregandoCesta
        ? []
        : variacoesDesdeUltimoEncarte(produtosCesta),
    [produtosCesta, carregandoCesta]
  );

  return {
    produtos,
    produtosCesta,
    variacoes,
    filtros,
    filtroProduto,
    setFiltroProduto,
    filtroAnos,
    setFiltroAnos,
    filtroMarca,
    setFiltroMarca,
    filtroCategoria,
    setFiltroCategoria,
    carregando,
    carregandoCesta,
    temFiltro: Boolean(filtroProduto || filtroAnos.length || filtroMarca || filtroCategoria),
    limparFiltros,
    ultimaData: filtros.ultimaData,
  };
}
