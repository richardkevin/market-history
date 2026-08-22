'use client';

import { useState, useEffect, useMemo } from 'react';
import { CESTA_BASICA } from '@/lib/utils';
import type { Produto, Filtros } from '@/lib/types';

export function useProdutos() {
  const [produtos, setProdutos] = useState<Produto[]>([]);
  const [produtosCesta, setProdutosCesta] = useState<Produto[]>([]);
  const [filtros, setFiltros] = useState<Filtros>({ produtos: [], datas: [], marcas: [] });
  const [filtroProduto, setFiltroProduto] = useState<string | null>(null);
  const [filtroData, setFiltroData] = useState<string | null>(null);
  const [filtroMarca, setFiltroMarca] = useState<string | null>(null);
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
    async function carregarProdutos() {
      setCarregando(true);
      const params = new URLSearchParams();
      if (filtroProduto) params.set('produto', filtroProduto);
      if (filtroData) params.set('data_encarte', filtroData);
      if (filtroMarca) params.set('marca', filtroMarca);

      const res = await fetch(`/api/produtos?${params.toString()}`);
      const data = await res.json();
      setProdutos(data);
      setCarregando(false);
    }
    carregarProdutos();
  }, [filtroProduto, filtroData, filtroMarca]);

  const temFiltro = Boolean(filtroProduto || filtroData || filtroMarca);

  const limparFiltros = () => {
    setFiltroProduto(null);
    setFiltroData(null);
    setFiltroMarca(null);
  };

  const produtosCestaBasica = useMemo(
    () =>
      produtosCesta.filter((p) =>
        CESTA_BASICA.some((item) => p.produto.toUpperCase().includes(item))
      ),
    [produtosCesta]
  );

  const totalEconomia = useMemo(
    () =>
      produtos.reduce(
        (acc, p) =>
          acc + (p.preco && p.preco_clube && p.preco_clube < p.preco ? p.preco - p.preco_clube : 0),
        0
      ),
    [produtos]
  );

  const totalComPreco = produtos.filter((p) => p.preco).length;
  const precoMedio =
    produtos.reduce((acc, p) => acc + (p.preco || 0), 0) / (totalComPreco || 1);
  const ultimaData = filtros.datas.length ? filtros.datas[filtros.datas.length - 1] : null;

  return {
    produtos,
    produtosCestaBasica,
    filtros,
    filtroProduto,
    setFiltroProduto,
    filtroData,
    setFiltroData,
    filtroMarca,
    setFiltroMarca,
    carregando,
    carregandoCesta,
    temFiltro,
    limparFiltros,
    totalComPreco,
    precoMedio,
    totalEconomia,
    ultimaData,
  };
}
