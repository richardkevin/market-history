'use client';

import { useState, useEffect, useMemo } from 'react';
import { CESTA_BASICA } from '@/lib/utils';
import type { Produto, Filtros } from '@/lib/types';

export function useProdutos() {
  const [produtos, setProdutos] = useState<Produto[]>([]);
  const [produtosCesta, setProdutosCesta] = useState<Produto[]>([]);
  const [filtros, setFiltros] = useState<Filtros>({
    produtos: [],
    anos: [],
    meses: [],
    marcas: [],
    categorias: [],
    ultimaData: null,
  });
  const [filtroProduto, setFiltroProduto] = useState<string | null>(null);
  const [filtroAnos, setFiltroAnos] = useState<number[]>([]);
  const [filtroMeses, setFiltroMeses] = useState<number[]>([]);
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
      if (filtroMeses.length) params.set('meses', filtroMeses.join(','));
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
  }, [filtroProduto, filtroAnos, filtroMeses, filtroMarca, filtroCategoria]);

  const temFiltro = Boolean(
    filtroProduto || filtroAnos.length || filtroMeses.length || filtroMarca || filtroCategoria
  );

  const limparFiltros = () => {
    setFiltroProduto(null);
    setFiltroAnos([]);
    setFiltroMeses([]);
    setFiltroMarca(null);
    setFiltroCategoria(null);
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
  const ultimaData = filtros.ultimaData;

  return {
    produtos,
    produtosCestaBasica,
    filtros,
    filtroProduto,
    setFiltroProduto,
    filtroAnos,
    setFiltroAnos,
    filtroMeses,
    setFiltroMeses,
    filtroMarca,
    setFiltroMarca,
    filtroCategoria,
    setFiltroCategoria,
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
