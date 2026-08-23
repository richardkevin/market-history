'use client';

import { useMemo } from 'react';
import Paper from '@mui/material/Paper';
import Typography from '@mui/material/Typography';
import EChart from '@/components/charts/EChart';
import { chartCores } from '@/lib/utils';
import type { Produto } from '@/lib/types';

interface ChartCategoriaProps {
  produtos: Produto[];
  escuro: boolean;
  carregando: boolean;
}

export default function ChartCategoria({ produtos, escuro, carregando }: ChartCategoriaProps) {
  const option = useMemo(() => {
    const cores = escuro ? chartCores.dark : chartCores.light;
    const contagem: Record<string, number> = {};
    produtos.forEach((p) => {
      if (!p.categoria) return;
      contagem[p.categoria] = (contagem[p.categoria] ?? 0) + 1;
    });
    const ordenados = Object.entries(contagem)
      .sort(([, a], [, b]) => b - a)
      .reverse();

    return {
      backgroundColor: 'transparent',
      tooltip: {
        trigger: 'axis' as const,
        axisPointer: { type: 'shadow' as const },
        backgroundColor: cores.tooltipBg,
        borderWidth: 0,
        textStyle: { color: cores.text },
      },
      grid: { left: 8, right: 48, top: 8, bottom: 8, containLabel: true },
      xAxis: {
        type: 'value' as const,
        minInterval: 1,
        axisLabel: { color: cores.muted, fontSize: 11 },
        splitLine: { lineStyle: { color: cores.split } },
      },
      yAxis: {
        type: 'category' as const,
        data: ordenados.map(([categoria]) => categoria),
        axisLabel: { color: cores.text, fontSize: 11 },
        axisLine: { show: false },
        axisTick: { show: false },
      },
      series: [
        {
          type: 'bar' as const,
          barMaxWidth: 16,
          data: ordenados.map(([, qtd]) => qtd),
          itemStyle: {
            borderRadius: [0, 8, 8, 0],
            color: {
              type: 'linear' as const,
              x: 0, y: 0, x2: 1, y2: 0,
              colorStops: [
                { offset: 0, color: escuro ? '#38bdf8' : '#0ea5e9' },
                { offset: 1, color: escuro ? '#a78bfa' : '#8b5cf6' },
              ],
            },
          },
          label: {
            show: true,
            position: 'right' as const,
            fontSize: 10,
            color: cores.muted,
          },
        },
      ],
    };
  }, [produtos, escuro]);

  return (
    <Paper variant="outlined" sx={{ p: 2.5 }}>
      <Typography variant="h6" gutterBottom>
        Produtos por categoria
      </Typography>
      <EChart option={option} height={340} loading={carregando} />
    </Paper>
  );
}
