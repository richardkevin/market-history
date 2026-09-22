'use client';

import { useMemo, useState } from 'react';
import Paper from '@mui/material/Paper';
import Stack from '@mui/material/Stack';
import ToggleButton from '@mui/material/ToggleButton';
import ToggleButtonGroup from '@mui/material/ToggleButtonGroup';
import Typography from '@mui/material/Typography';
import EChart from '@/components/charts/EChart';
import InfoTitulo from '@/components/InfoTitulo';
import { chartCores } from '@/lib/utils';
import { indiceCestaEncadeada, rotuloPeriodo, type Granularidade } from '@/lib/historico';
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

  const resumo = useMemo(() => {
    if (serie.length < 2) return null;
    const primeiro = serie[0];
    const anterior = serie[serie.length - 2];
    const ultimo = serie[serie.length - 1];
    return {
      total: ultimo.indice - 100,
      ultimaVariacao: (ultimo.indice / anterior.indice - 1) * 100,
      base: rotuloPeriodo(primeiro.data),
      ultimoPeriodo: rotuloPeriodo(ultimo.data),
      intervalo: `${rotuloPeriodo(ultimo.data)} vs. ${rotuloPeriodo(anterior.data)}`,
      nPeriodos: serie.length,
    };
  }, [serie]);

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
      <Stack direction="row" spacing={1} useFlexGap sx={{ mb: 1, alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap' }}>
        <InfoTitulo
          titulo="Índice de preços · cesta do encarte"
          descricao="Evolução do nível geral de preços da cesta (mini-IPCA caseiro). Base 100 no primeiro período; só compara períodos consecutivos com os produtos comuns aos dois, então itens que somem ou entram não distorcem a série."
        />
        <ToggleButtonGroup
          size="small"
          exclusive
          value={granularidade}
          onChange={(_, v) => v && setGranularidade(v)}
        >
          <ToggleButton value="mes">
            <Typography variant="caption">Por mês</Typography>
          </ToggleButton>
          <ToggleButton value="encarte">
            <Typography variant="caption">Por encarte</Typography>
          </ToggleButton>
        </ToggleButtonGroup>
      </Stack>

      {resumo ? (
        <Stack sx={{ mb: 1 }}>
          <Stack direction="row" spacing={1} sx={{ alignItems: 'baseline', flexWrap: 'wrap' }}>
            <Typography
              variant="h4"
              sx={{
                fontWeight: 800,
                lineHeight: 1.1,
                color:
                  resumo.total > 0.5
                    ? 'error.main'
                    : resumo.total < -0.5
                      ? 'success.main'
                      : 'text.primary',
              }}
            >
              {resumo.total > 0 ? '+' : ''}
              {resumo.total.toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%
            </Typography>
            <Typography variant="body2" color="text.secondary">
              {resumo.total > 0.5
                ? 'a cesta ficou mais cara'
                : resumo.total < -0.5
                  ? 'a cesta ficou mais barata'
                  : 'preços da cesta estáveis'}{' '}
              de {resumo.base} a {resumo.ultimoPeriodo}
            </Typography>
          </Stack>
          <Typography variant="caption" color="text.secondary" component="div">
            {resumo.intervalo}: {resumo.ultimaVariacao > 0 ? '+' : ''}
            {resumo.ultimaVariacao.toLocaleString('pt-BR', { maximumFractionDigits: 1 })}% · {resumo.nPeriodos} períodos analisados
          </Typography>
        </Stack>
      ) : null}

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