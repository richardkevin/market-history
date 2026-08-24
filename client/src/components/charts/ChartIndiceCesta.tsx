'use client';

import { useMemo, useState } from 'react';
import Paper from '@mui/material/Paper';
import Stack from '@mui/material/Stack';
import Chip from '@mui/material/Chip';
import ToggleButton from '@mui/material/ToggleButton';
import ToggleButtonGroup from '@mui/material/ToggleButtonGroup';
import Typography from '@mui/material/Typography';
import EChart from '@/components/charts/EChart';
import InfoTitulo from '@/components/InfoTitulo';
import { chartCores } from '@/lib/utils';
import { indiceCestaEncadeada, type Granularidade } from '@/lib/historico';
import type { Produto } from '@/lib/types';

interface ChartIndiceCestaProps {
  produtos: Produto[];
  escuro: boolean;
  carregando: boolean;
}

export default function ChartIndiceCesta({ produtos, escuro, carregando }: ChartIndiceCestaProps) {
  const [granularidade, setGranularidade] = useState<Granularidade>('mes');
  const serie = useMemo(
    () => indiceCestaEncadeada(produtos, { granularidade }),
    [produtos, granularidade]
  );

  const option = useMemo(() => {
    if (serie.length < 2) return null;
    const cores = escuro ? chartCores.dark : chartCores.light;
    const corLinha = escuro ? '#fb923c' : '#ea580c';

    return {
      backgroundColor: 'transparent',
      tooltip: {
        trigger: 'axis' as const,
        backgroundColor: cores.tooltipBg,
        borderWidth: 0,
        textStyle: { color: cores.text },
        formatter: (params: { value: [number, number] }[]) => {
          const d = new Date(params[0].value[0]);
          const v = params[0].value[1];
          const vsBase = ((v - 100) / 100) * 100;
          const titulo =
            granularidade === 'mes'
              ? d.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })
              : d.toLocaleDateString('pt-BR');
          return `<b>${titulo}</b><br/>Índice: <b>${v.toFixed(1)}</b> (${vsBase > 0 ? '+' : ''}${vsBase.toLocaleString('pt-BR', { maximumFractionDigits: 1 })}% vs. base)`;
        },
      },
      grid: { left: 8, right: 16, top: 32, bottom: 8, containLabel: true },
      xAxis: {
        type: 'time' as const,
        axisLabel: {
          color: cores.muted,
          fontSize: 11,
          formatter: (v: number) =>
            new Date(v).toLocaleDateString('pt-BR', { month: 'short', year: '2-digit' }),
        },
        axisLine: { lineStyle: { color: cores.split } },
        splitLine: { show: false },
      },
      yAxis: {
        type: 'value' as const,
        scale: true,
        axisLabel: { color: cores.muted, fontSize: 11 },
        splitLine: { lineStyle: { color: cores.split } },
      },
      series: [
        {
          name: 'Índice da cesta',
          type: 'line',
          data: serie.map(
            (p) =>
              [
                new Date(
                  p.data.length === 7 ? `${p.data}-01T12:00:00` : `${p.data}T12:00:00`
                ).getTime(),
                p.indice,
              ] as [number, number]
          ),
          symbolSize: 5,
          lineStyle: { width: 2.5, color: corLinha },
          itemStyle: { color: corLinha },
          areaStyle: {
            color: {
              type: 'linear' as const,
              x: 0, y: 0, x2: 0, y2: 1,
              colorStops: [
                { offset: 0, color: `${corLinha}33` },
                { offset: 1, color: `${corLinha}00` },
              ],
            },
          },
          markLine: {
            silent: true,
            symbol: 'none',
            label: {
              formatter: 'base 100',
              position: 'insideEndTop' as const,
              color: cores.muted,
              fontSize: 10,
            },
            lineStyle: { type: 'dashed' as const, color: cores.muted, opacity: 0.6 },
            data: [{ yAxis: 100 }],
          },
        },
      ],
    };
  }, [serie, escuro, granularidade]);

  return (
    <Paper variant="outlined" sx={{ p: 2.5 }}>
      <Stack direction="row" spacing={1} useFlexGap sx={{ mb: 0.5, alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap' }}>
        <InfoTitulo
          titulo="Índice de preços · cesta do encarte"
          descricao="Mini-IPCA caseiro: base 100 no primeiro período. Cada ponto compara apenas os produtos presentes em dois períodos consecutivos (índice encadeado), então itens que somem ou entram não distorcem a série."
        />
        <ToggleButtonGroup
          size="small"
          exclusive
          value={granularidade}
          onChange={(_, v) => v && setGranularidade(v)}
        >
          <ToggleButton value="mes">
            <Typography variant="caption">Mês</Typography>
          </ToggleButton>
          <ToggleButton value="encarte">
            <Typography variant="caption">Encarte</Typography>
          </ToggleButton>
        </ToggleButtonGroup>
        {serie.length >= 2 && (
          <Chip
            size="small"
            variant={serie[serie.length - 1].indice >= 100 ? 'filled' : 'outlined'}
            color={serie[serie.length - 1].indice > 101 ? 'error' : serie[serie.length - 1].indice < 99 ? 'success' : 'default'}
            label={`${serie[serie.length - 1].indice >= 100 ? '+' : ''}${(serie[serie.length - 1].indice - 100).toLocaleString('pt-BR', { maximumFractionDigits: 1 })}% desde a base`}
          />
        )}
      </Stack>
      <Typography variant="caption" color="text.secondary" component="div" sx={{ mb: 1.5 }}>
        Base 100 no primeiro período · comparação encadeada entre períodos consecutivos (ignora itens que somem)
      </Typography>
      {!option && !carregando ? (
        <Typography color="text.secondary" variant="body2" sx={{ py: 8, textAlign: 'center' }}>
          Dados insuficientes para montar o índice.
        </Typography>
      ) : option ? (
        <EChart option={option} height={320} loading={carregando} />
      ) : null}
    </Paper>
  );
}
