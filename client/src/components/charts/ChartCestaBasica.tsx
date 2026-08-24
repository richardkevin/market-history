'use client';

import { useMemo } from 'react';
import Paper from '@mui/material/Paper';
import Typography from '@mui/material/Typography';
import EChart from '@/components/charts/EChart';
import InfoTitulo from '@/components/InfoTitulo';
import { brl, chartCores } from '@/lib/utils';
import { grupoCesta } from '@/lib/historico';
import type { Produto } from '@/lib/types';

interface ChartCestaBasicaProps {
  itens: Produto[];
  escuro: boolean;
  carregando: boolean;
}

interface GrupoPreco {
  grupo: string;
  precoMedio: number;
  nProdutos: number;
  exemplos: string[];
}

/**
 * Agrupa produtos similares da cesta básica (todos os arrozes, todos os leites…)
 * e calcula o preço médio do grupo a partir do registro mais recente de cada produto.
 */
export function precosGruposCesta(itens: Produto[]): GrupoPreco[] {
  const grupos = new Map<string, Map<string, number>>();
  for (const p of itens) {
    const g = grupoCesta(p.produto);
    if (!g || !p.produto) continue;
    let porProduto = grupos.get(g);
    if (!porProduto) {
      porProduto = new Map();
      grupos.set(g, porProduto);
    }
    // mantém só o preço mais recente de cada produto dentro do grupo
    if (!porProduto.has(p.produto)) porProduto.set(p.produto, p.preco ?? 0);
  }
  return [...grupos.entries()]
    .map(([grupo, porProduto]) => {
      const precos = [...porProduto.values()].filter((v) => v > 0);
      return {
        grupo,
        precoMedio: precos.reduce((a, b) => a + b, 0) / (precos.length || 1),
        nProdutos: precos.length,
        exemplos: [...porProduto.keys()].slice(0, 3),
      };
    })
    .filter((g) => g.nProdutos > 0)
    .sort((a, b) => b.precoMedio - a.precoMedio);
}

export default function ChartCestaBasica({ itens, escuro, carregando }: ChartCestaBasicaProps) {
  const nGrupos = useMemo(() => precosGruposCesta(itens).length, [itens]);
  const option = useMemo(() => {
    if (!itens.length) return null;
    const cores = escuro ? chartCores.dark : chartCores.light;
    const grupos = precosGruposCesta(itens).reverse();

    return {
      backgroundColor: 'transparent',
      tooltip: {
        trigger: 'item' as const,
        backgroundColor: cores.tooltipBg,
        borderWidth: 0,
        textStyle: { color: cores.text },
        formatter: (p: { name: string }) => {
          const g = precosGruposCesta(itens).find((x) => x.grupo === p.name);
          if (!g) return '';
          return [
            `<b>${g.grupo}</b>`,
            `Média de ${g.nProdutos} produto${g.nProdutos > 1 ? 's' : ''}: <b>${brl.format(g.precoMedio)}</b>`,
            g.exemplos.length ? `<span style="opacity:.7">${g.exemplos.join(' · ')}</span>` : '',
          ]
            .filter(Boolean)
            .join('<br/>');
        },
      },
      grid: { left: 8, right: 64, top: 8, bottom: 8, containLabel: true },
      xAxis: {
        type: 'value' as const,
        axisLabel: { color: cores.muted, fontSize: 11 },
        splitLine: { lineStyle: { color: cores.split } },
      },
      yAxis: {
        type: 'category' as const,
        data: grupos.map((g) => `${g.grupo} (${g.nProdutos})`),
        axisLabel: { color: cores.text, fontSize: 11 },
        axisLine: { show: false },
        axisTick: { show: false },
      },
      series: [
        {
          type: 'bar' as const,
          barMaxWidth: 18,
          data: grupos.map((g) => Number(g.precoMedio.toFixed(2))),
          itemStyle: {
            borderRadius: [0, 9, 9, 0],
            color: {
              type: 'linear' as const,
              x: 0, y: 0, x2: 1, y2: 0,
              colorStops: [
                { offset: 0, color: escuro ? '#4ade80' : '#22c55e' },
                { offset: 1, color: escuro ? '#fb923c' : '#f97316' },
              ],
            },
          },
          label: {
            show: true,
            position: 'right' as const,
            formatter: ({ value }: { value: number }) => brl.format(value),
            fontSize: 10,
            color: cores.muted,
          },
        },
      ],
    };
  }, [itens, escuro]);

  return (
    <Paper variant="outlined" sx={{ p: 2.5 }}>
      <InfoTitulo
        titulo="Cesta básica · preço médio por grupo"
        descricao="Itens similares são agrupados (ex.: todos os arrozes viram “ARROZ”) e o valor é a média do preço mais recente de cada produto do grupo. O número ao lado do grupo indica quantos produtos entraram na média."
      />
      {!option && !carregando ? (
        <Typography color="text.secondary" variant="body2" sx={{ py: 10, textAlign: 'center' }}>
          Nenhum item da cesta básica encontrado.
        </Typography>
      ) : (
        <EChart option={option ?? {}} height={Math.max(300, nGrupos * 26)} loading={carregando} />
      )}
    </Paper>
  );
}
