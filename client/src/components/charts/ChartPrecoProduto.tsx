'use client';

import { useMemo } from 'react';
import Paper from '@mui/material/Paper';
import Typography from '@mui/material/Typography';
import EChart from '@/components/charts/EChart';
import { brl, chartCores } from '@/lib/utils';
import type { Produto } from '@/lib/types';

interface ChartPrecoProdutoProps {
  produtos: Produto[];
  escuro: boolean;
  carregando: boolean;
}

export default function ChartPrecoProduto({ produtos, escuro, carregando }: ChartPrecoProdutoProps) {
  const option = useMemo(() => {
    const cores = escuro ? chartCores.dark : chartCores.light;
    const agrupado: Record<string, Record<string, { preco: number; clube: number }>> = {};
    const contagem: Record<string, number> = {};

    produtos.forEach((p) => {
      const nome = p.produto.substring(0, 32);
      const data = p.data_encarte || p.created_at.substring(0, 10);
      contagem[nome] = (contagem[nome] || 0) + 1;
      agrupado[nome] ??= {};
      agrupado[nome][data] = { preco: p.preco || 0, clube: p.preco_clube || 0 };
    });

    const topNomes = Object.entries(contagem)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 6)
      .map(([nome]) => nome);
    const datas = [...new Set(produtos.map((p) => p.data_encarte || p.created_at.substring(0, 10)))].sort();

    const series = topNomes.map((nome, i) => ({
      name: nome,
      type: 'bar' as const,
      barMaxWidth: 28,
      itemStyle: { color: cores.series[i % cores.series.length], borderRadius: [5, 5, 0, 0] },
      data: datas.map((d) => agrupado[nome][d]?.preco ?? null),
    }));

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
      legend: { data: topNomes, type: 'scroll' as const, bottom: 0, textStyle: { color: cores.muted } },
      grid: { left: 8, right: 16, top: 24, bottom: 56, containLabel: true },
      xAxis: {
        type: 'category' as const,
        data: datas,
        axisLabel: { rotate: 45, color: cores.muted, fontSize: 11 },
        axisLine: { lineStyle: { color: cores.split } },
        axisTick: { show: false },
      },
      yAxis: {
        type: 'value' as const,
        axisLabel: { color: cores.muted, fontSize: 11 },
        splitLine: { lineStyle: { color: cores.split } },
      },
      series,
    };
  }, [produtos, escuro]);

  return (
    <Paper variant="outlined" sx={{ p: 2.5 }}>
      <Typography variant="h6" gutterBottom>
        Preços por encarte
      </Typography>
      <EChart option={option} height={360} loading={carregando} />
    </Paper>
  );
}
