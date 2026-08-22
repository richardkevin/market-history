'use client';

import { useMemo } from 'react';
import Paper from '@mui/material/Paper';
import Typography from '@mui/material/Typography';
import EChart from '@/components/charts/EChart';
import { brl, chartCores } from '@/lib/utils';
import type { Produto } from '@/lib/types';

interface ChartCestaBasicaProps {
  itens: Produto[];
  escuro: boolean;
  carregando: boolean;
}

export default function ChartCestaBasica({ itens, escuro, carregando }: ChartCestaBasicaProps) {
  const option = useMemo(() => {
    const cores = escuro ? chartCores.dark : chartCores.light;
    const precos: Record<string, number> = {};
    itens.forEach((p) => {
      const nome = p.produto.substring(0, 40);
      if (!(nome in precos) && p.preco) precos[nome] = p.preco;
    });
    const itensOrdenados = Object.entries(precos)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 12)
      .reverse();

    return {
      backgroundColor: 'transparent',
      tooltip: {
        trigger: 'axis' as const,
        axisPointer: { type: 'shadow' as const },
        backgroundColor: cores.tooltipBg,
        borderWidth: 0,
        textStyle: { color: cores.text },
        valueFormatter: (v: number) => brl.format(v),
      },
      grid: { left: 8, right: 64, top: 8, bottom: 8, containLabel: true },
      xAxis: {
        type: 'value' as const,
        axisLabel: { color: cores.muted, fontSize: 11 },
        splitLine: { lineStyle: { color: cores.split } },
      },
      yAxis: {
        type: 'category' as const,
        data: itensOrdenados.map(([nome]) => nome),
        axisLabel: { color: cores.text, fontSize: 11 },
        axisLine: { show: false },
        axisTick: { show: false },
      },
      series: [
        {
          type: 'bar' as const,
          barMaxWidth: 18,
          data: itensOrdenados.map(([, preco]) => preco),
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
      <Typography variant="h6" gutterBottom>
        Cesta básica · preços
      </Typography>
      <EChart option={option} height={340} loading={carregando} />
    </Paper>
  );
}
