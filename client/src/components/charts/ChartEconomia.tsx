'use client';

import { useMemo } from 'react';
import Paper from '@mui/material/Paper';
import Typography from '@mui/material/Typography';
import EChart from '@/components/charts/EChart';
import { brl, chartCores } from '@/lib/utils';
import type { Produto } from '@/lib/types';

interface ChartEconomiaProps {
  produtos: Produto[];
  escuro: boolean;
  carregando: boolean;
}

export default function ChartEconomia({ produtos, escuro, carregando }: ChartEconomiaProps) {
  const option = useMemo(() => {
    const cores = escuro ? chartCores.dark : chartCores.light;
    const comDesconto = produtos.filter((p) => p.preco && p.preco_clube && p.preco_clube < p.preco);
    const marcasEconomia: Record<string, number> = {};
    comDesconto.forEach((p) => {
      const marca = p.marca || 'Sem marca';
      marcasEconomia[marca] =
        (marcasEconomia[marca] || 0) + ((p.preco || 0) - (p.preco_clube || 0));
    });
    const dados = Object.entries(marcasEconomia)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 8);

    return {
      backgroundColor: 'transparent',
      tooltip: {
        trigger: 'item' as const,
        backgroundColor: cores.tooltipBg,
        borderWidth: 0,
        textStyle: { color: cores.text },
        valueFormatter: (v: number) => brl.format(v),
      },
      legend: { type: 'scroll' as const, bottom: 0, textStyle: { color: cores.muted } },
      series: [
        {
          type: 'pie' as const,
          radius: ['52%', '74%'],
          center: ['50%', '44%'],
          avoidLabelOverlap: true,
          itemStyle: { borderRadius: 8, borderColor: cores.tooltipBg, borderWidth: 3 },
          label: { show: false },
          emphasis: {
            label: { show: true, fontSize: 13, fontWeight: 'bold' as const, color: cores.text },
          },
          labelLine: { show: false },
          color: cores.series,
          data: dados.map(([marca, valor]) => ({ value: Number(valor.toFixed(2)), name: marca })),
        },
      ],
    };
  }, [produtos, escuro]);

  return (
    <Paper variant="outlined" sx={{ p: 2.5 }}>
      <Typography variant="h6" gutterBottom>
        Economia por marca
      </Typography>
      <EChart option={option} height={360} loading={carregando} />
    </Paper>
  );
}
