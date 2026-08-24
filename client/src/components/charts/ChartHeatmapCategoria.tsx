'use client';

import { useMemo, useState } from 'react';
import Paper from '@mui/material/Paper';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import Slider from '@mui/material/Slider';
import ToggleButton from '@mui/material/ToggleButton';
import ToggleButtonGroup from '@mui/material/ToggleButtonGroup';
import Box from '@mui/material/Box';
import EChart from '@/components/charts/EChart';
import InfoTitulo from '@/components/InfoTitulo';
import { chartCores } from '@/lib/utils';
import { heatmapCategorias, rotuloPeriodo, type Granularidade } from '@/lib/historico';
import type { Produto } from '@/lib/types';

interface ChartHeatmapCategoriaProps {
  produtos: Produto[];
  escuro: boolean;
  carregando: boolean;
}

export default function ChartHeatmapCategoria({ produtos, escuro, carregando }: ChartHeatmapCategoriaProps) {
  const [nDatas, setNDatas] = useState(12);
  const [granularidade, setGranularidade] = useState<Granularidade>('mes');

  const { datas, categorias } = useMemo(
    () => heatmapCategorias(produtos, { granularidade }),
    [produtos, granularidade]
  );
  const maxDatas = Math.max(4, Math.min(30, datas.length));
  const datasVisiveis = datas.slice(-Math.min(nDatas, maxDatas));

  const option = useMemo(() => {
    if (!datasVisiveis.length || !categorias.length) return null;
    const cores = escuro ? chartCores.dark : chartCores.light;

    const dados: [number, number, number | null][] = [];
    categorias.forEach((cat, i) => {
      cat.valores.slice(-nDatas).forEach((v, j) => {
        dados.push([j, i, v]);
      });
    });

    return {
      backgroundColor: 'transparent',
      tooltip: {
        position: 'top' as const,
        backgroundColor: cores.tooltipBg,
        borderWidth: 0,
        textStyle: { color: cores.text },
        formatter: (p: { value: [number, number, number | null] }) => {
          const [x, y, v] = p.value;
          const cat = categorias[y]?.nome ?? '';
          const data = datasVisiveis[x] ? rotuloPeriodo(datasVisiveis[x]) : '';
          const texto =
            v == null
              ? 'sem base comparável'
              : v > 0
                ? `▲ alta de ${v.toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%`
                : v < 0
                  ? `▼ queda de ${Math.abs(v).toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%`
                  : 'estável (0%)';
          return `<b>${cat}</b> · ${data}<br/>${texto}`;
        },
      },
      grid: { left: 8, right: 96, top: 8, bottom: 48, containLabel: true },
      xAxis: {
        type: 'category' as const,
        data: datasVisiveis.map((d) => rotuloPeriodo(d)),
        splitArea: { show: true },
        axisLabel: { color: cores.muted, fontSize: 10, rotate: 45 },
        axisLine: { show: false },
        axisTick: { show: false },
      },
      yAxis: {
        type: 'category' as const,
        data: categorias.map((c) => c.nome),
        splitArea: { show: true },
        axisLabel: { color: cores.text, fontSize: 11 },
        axisLine: { show: false },
        axisTick: { show: false },
      },
      visualMap: {
        min: -15,
        max: 15,
        calculable: true,
        orient: 'vertical' as const,
        right: 0,
        top: 'center',
        itemHeight: 120,
        textStyle: { color: cores.muted, fontSize: 10 },
        formatter: (v: number) => `${v > 0 ? '+' : ''}${v}%`,
        inRange: {
          color: escuro ? ['#166534', '#14532d', '#1f2937', '#7f1d1d', '#b91c1c'] : ['#bbf7d0', '#86efac', '#f1f5f9', '#fca5a5', '#dc2626'],
        },
      },
      series: [
        {
          type: 'heatmap',
          data: dados,
          label: {
            show: datasVisiveis.length <= 14,
            fontSize: 9,
            color: escuro ? '#e2e8f0' : '#1e293b',
            formatter: (p: { value: [number, number, number | null] }) =>
              p.value[2] == null ? '' : `${p.value[2] > 0 ? '+' : ''}${Math.round(p.value[2])}`,
          },
          emphasis: { itemStyle: { shadowBlur: 6, shadowColor: 'rgba(0,0,0,0.4)' } },
        },
      ],
    };
  }, [categorias, datasVisiveis, nDatas, escuro]);

  return (
    <Paper variant="outlined" sx={{ p: 2.5 }}>
      <Stack direction="row" spacing={1} useFlexGap sx={{ mb: 0.5, alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap' }}>
        <InfoTitulo
          titulo="Variação por categoria"
          descricao="Percentual de variação do preço médio da categoria entre um período e o anterior. Verde = mais barato, vermelho = mais caro. Célula vazia = categoria ausente naquele período."
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
      </Stack>
      <Stack direction="row" spacing={2} sx={{ mb: 1, alignItems: 'center' }}>
        <Typography variant="caption" color="text.secondary" sx={{ whiteSpace: 'nowrap' }}>
          Períodos visíveis: {datasVisiveis.length}
        </Typography>
        <Slider
          size="small"
          min={4}
          max={maxDatas}
          marks={nDatas === maxDatas ? [{ value: maxDatas, label: 'todos' }] : false}
          value={Math.min(nDatas, maxDatas)}
          onChange={(_, v) => setNDatas(v as number)}
          sx={{ maxWidth: 260 }}
        />
      </Stack>
      {!option && !carregando ? (
        <Typography color="text.secondary" variant="body2" sx={{ py: 6, textAlign: 'center' }}>
          Sem categorias suficientes para o mapa.
        </Typography>
      ) : (
        <Box>
          <EChart option={option ?? {}} height={Math.max(280, categorias.length * 26 + 80)} loading={carregando} />
        </Box>
      )}
    </Paper>
  );
}
