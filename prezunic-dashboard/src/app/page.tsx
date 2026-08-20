'use client';

import { useState, useEffect, useMemo } from 'react';
import dynamic from 'next/dynamic';

const ReactECharts = dynamic(() => import('echarts-for-react'), { ssr: false });

interface Produto {
  id: number;
  imagem: string;
  produto: string;
  marca: string | null;
  medida: string | null;
  preco: number | null;
  preco_clube: number | null;
  tipo_promocao: string | null;
  limite: string | null;
  data_encarte: string | null;
  observacao: string | null;
  created_at: string;
}

interface Filtros {
  produtos: string[];
  datas: string[];
  marcas: string[];
}

const CESTA_BASICA = [
  'ARROZ',
  'FEIJÃO',
  'ÓLEO',
  'ACÚCAR',
  'CAFÉ',
  'LEITE',
    'FARINHA',
  'MACARRÃO',
  'SAL',
  'BATATA',
  'CEBOLA',
  'ALHO',
  'TOMATE',
  'CEBOLA',
];

export default function Home() {
  const [produtos, setProdutos] = useState<Produto[]>([]);
  const [filtros, setFiltros] = useState<Filtros>({ produtos: [], datas: [], marcas: [] });
  const [filtroProduto, setFiltroProduto] = useState('');
  const [filtroData, setFiltroData] = useState('');
  const [filtroMarca, setFiltroMarca] = useState('');
  const [carregando, setCarregando] = useState(true);

  useEffect(() => {
    async function carregarFiltros() {
      const res = await fetch('/api/produtos?action=filtros');
      const data = await res.json();
      setFiltros(data);
    }
    carregarFiltros();
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

  const produtosCestaBasica = useMemo(() => {
    return produtos.filter(p =>
      CESTA_BASICA.some(item => p.produto.toUpperCase().includes(item))
    );
  }, [produtos]);

  const chartPrecoProduto = useMemo(() => {
    const agrupado: Record<string, { datas: string[]; precos: number[]; precosClube: number[] }> = {};

    produtos.forEach(p => {
      const nome = p.produto.substring(0, 40);
      if (!agrupado[nome]) {
        agrupado[nome] = { datas: [], precos: [], precosClube: [] };
      }
      agrupado[nome].datas.push(p.data_encarte || p.created_at.substring(0, 10));
      agrupado[nome].precos.push(p.preco || 0);
      agrupado[nome].precosClube.push(p.preco_clube || 0);
    });

    const series: object[] = [];
    const legendData: string[] = [];

    Object.entries(agrupado).forEach(([nome, dados]) => {
      legendData.push(nome);
      series.push({
        name: nome,
        type: 'bar',
        data: dados.precos,
        itemStyle: { borderRadius: [4, 4, 0, 0] },
      });
      if (dados.precosClube.some(v => v > 0)) {
        legendData.push(`${nome} (Clube)`);
        series.push({
          name: `${nome} (Clube)`,
          type: 'bar',
          data: dados.precosClube,
          itemStyle: { borderRadius: [4, 4, 0, 0], opacity: 0.7 },
        });
      }
    });

    const todosDatas = [...new Set(produtos.map(p => p.data_encarte || p.created_at.substring(0, 10)))];

    return {
      tooltip: { trigger: 'axis' as const, axisPointer: { type: 'shadow' as const } },
      legend: { data: legendData, type: 'scroll' as const, bottom: 0 },
      grid: { left: '3%', right: '4%', bottom: '15%', containLabel: true },
      xAxis: {
        type: 'category' as const,
        data: todosDatas,
        axisLabel: { rotate: 45 },
      },
      yAxis: {
        type: 'value' as const,
        axisLabel: { formatter: 'R$ {value}' },
      },
      series,
    };
  }, [produtos]);

  const chartCestaBasica = useMemo(() => {
    const itens: Record<string, number> = {};

    produtosCestaBasica.forEach(p => {
      const nome = p.produto.substring(0, 50);
      if (!itens[nome] && p.preco) {
        itens[nome] = p.preco;
      }
    });

    const itensOrdenados = Object.entries(itens)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 15);

    return {
      tooltip: {
        trigger: 'item' as const,
        formatter: '{b}: R$ {c}',
      },
      grid: { left: '3%', right: '4%', bottom: '15%', containLabel: true },
      xAxis: {
        type: 'category' as const,
        data: itensOrdenados.map(([nome]) => nome),
        axisLabel: { rotate: 45, fontSize: 10 },
      },
      yAxis: {
        type: 'value' as const,
        axisLabel: { formatter: 'R$ {value}' },
      },
      series: [
        {
          type: 'bar',
          data: itensOrdenados.map(([, preco]) => preco),
          itemStyle: {
            color: {
              type: 'linear' as const,
              x: 0, y: 0, x2: 0, y2: 1,
              colorStops: [
                { offset: 0, color: '#f97316' },
                { offset: 1, color: '#ea580c' },
              ],
            },
            borderRadius: [6, 6, 0, 0],
          },
          label: {
            show: true,
            position: 'top' as const,
            formatter: 'R$ {c}',
            fontSize: 10,
          },
        },
      ],
    };
  }, [produtosCestaBasica]);

  const chartEconomia = useMemo(() => {
    const comDesconto = produtos.filter(p => p.preco && p.preco_clube && p.preco_clube < p.preco);
    const totalEconomia = comDesconto.reduce((acc, p) => acc + ((p.preco || 0) - (p.preco_clube || 0)), 0);

    const marcasEconomia: Record<string, number> = {};
    comDesconto.forEach(p => {
      const marca = p.marca || 'Sem marca';
      marcasEconomia[marca] = (marcasEconomia[marca] || 0) + ((p.preco || 0) - (p.preco_clube || 0));
    });

    const dados = Object.entries(marcasEconomia)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 10);

    return {
      tooltip: {
        trigger: 'item' as const,
        formatter: '{b}: R$ {c}',
      },
      series: [
        {
          type: 'pie',
          radius: ['40%', '70%'],
          avoidLabelOverlap: false,
          itemStyle: { borderRadius: 10, borderColor: '#fff', borderWidth: 2 },
          label: { show: false },
          emphasis: {
            label: { show: true, fontSize: 14, fontWeight: 'bold' as const },
          },
          labelLine: { show: false },
          data: dados.map(([marca, valor]) => ({ value: valor.toFixed(2), name: marca })),
        },
      ],
    };
  }, [produtos]);

  const totalProdutos = produtos.length;
  const totalComPreco = produtos.filter(p => p.preco).length;
  const precoMedio = produtos.reduce((acc, p) => acc + (p.preco || 0), 0) / (totalComPreco || 1);

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white shadow-sm border-b">
        <div className="max-w-7xl mx-auto px-4 py-4">
          <h1 className="text-2xl font-bold text-gray-900">Prezunic - Painel de Preços</h1>
          <p className="text-sm text-gray-500">Análise de variação de preços de encartes</p>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 py-6">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
          <div className="bg-white rounded-lg shadow p-4">
            <p className="text-sm text-gray-500">Total de Produtos</p>
            <p className="text-3xl font-bold text-blue-600">{totalProdutos}</p>
          </div>
          <div className="bg-white rounded-lg shadow p-4">
            <p className="text-sm text-gray-500">Preço Médio</p>
            <p className="text-3xl font-bold text-green-600">R$ {precoMedio.toFixed(2)}</p>
          </div>
          <div className="bg-white rounded-lg shadow p-4">
            <p className="text-sm text-gray-500">Cesta Básica Itens</p>
            <p className="text-3xl font-bold text-orange-600">{produtosCestaBasica.length}</p>
          </div>
        </div>

        <div className="bg-white rounded-lg shadow p-4 mb-6">
          <h2 className="text-lg font-semibold mb-4">Filtros</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Produto</label>
              <select
                value={filtroProduto}
                onChange={e => setFiltroProduto(e.target.value)}
                className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm"
              >
                <option value="">Todos os produtos</option>
                {filtros.produtos.map(p => (
                  <option key={p} value={p}>{p}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Data do Encarte</label>
              <select
                value={filtroData}
                onChange={e => setFiltroData(e.target.value)}
                className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm"
              >
                <option value="">Todas as datas</option>
                {filtros.datas.map(d => (
                  <option key={d} value={d}>{d}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Marca</label>
              <select
                value={filtroMarca}
                onChange={e => setFiltroMarca(e.target.value)}
                className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm"
              >
                <option value="">Todas as marcas</option>
                {filtros.marcas.map(m => (
                  <option key={m} value={m}>{m}</option>
                ))}
              </select>
            </div>
          </div>
        </div>

        {carregando ? (
          <div className="text-center py-12">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
            <p className="mt-4 text-gray-500">Carregando dados...</p>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
              <div className="bg-white rounded-lg shadow p-4">
                <h2 className="text-lg font-semibold mb-4">Preços dos Produtos</h2>
                <ReactECharts option={chartPrecoProduto} style={{ height: 400 }} />
              </div>
              <div className="bg-white rounded-lg shadow p-4">
                <h2 className="text-lg font-semibold mb-4">Economia por Marca (Clube vs Regular)</h2>
                <ReactECharts option={chartEconomia} style={{ height: 400 }} />
              </div>
            </div>

            <div className="bg-white rounded-lg shadow p-4 mb-6">
              <h2 className="text-lg font-semibold mb-4">Cesta Básica - Preços</h2>
              <ReactECharts option={chartCestaBasica} style={{ height: 400 }} />
            </div>

            <div className="bg-white rounded-lg shadow p-4">
              <h2 className="text-lg font-semibold mb-4">Lista de Produtos</h2>
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Produto</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Marca</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Preço</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Preço Clube</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Data</th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {produtos.slice(0, 50).map(p => (
                      <tr key={p.id} className="hover:bg-gray-50">
                        <td className="px-4 py-3 text-sm text-gray-900 max-w-xs truncate">{p.produto}</td>
                        <td className="px-4 py-3 text-sm text-gray-500">{p.marca || '-'}</td>
                        <td className="px-4 py-3 text-sm text-gray-900">
                          {p.preco ? `R$ ${p.preco.toFixed(2)}` : '-'}
                        </td>
                        <td className="px-4 py-3 text-sm text-green-600 font-medium">
                          {p.preco_clube ? `R$ ${p.preco_clube.toFixed(2)}` : '-'}
                        </td>
                        <td className="px-4 py-3 text-sm text-gray-500">
                          {p.data_encarte || p.created_at.substring(0, 10)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        )}
      </main>
    </div>
  );
}
