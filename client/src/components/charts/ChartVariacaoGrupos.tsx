'use client';

import { useMemo, useState } from 'react';
import Paper from '@mui/material/Paper';
import Stack from '@mui/material/Stack';
import Chip from '@mui/material/Chip';
import Tooltip from '@mui/material/Tooltip';
import Button from '@mui/material/Button';
import ToggleButton from '@mui/material/ToggleButton';
import ToggleButtonGroup from '@mui/material/ToggleButtonGroup';
import Typography from '@mui/material/Typography';
import Close from '@mui/icons-material/Close';
import EChart from '@/components/charts/EChart';
import InfoTitulo from '@/components/InfoTitulo';
import { chartCores } from '@/lib/utils';
import { variacaoPorGrupoCesta, rotuloPeriodo, type Granularidade } from '@/lib/historico';
import type { Produto } from '@/lib/types';

interface ChartVariacaoGruposProps {
  produtos: Produto[];
  escuro: boolean;
  carregando: boolean;
  slug?: string;
}

const fmt = (v: number) =>
  `${v > 0 ? '+' : ''}${v.toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%`;

const ROTULO_DETALHE: Record<Granularidade, string> = {
  ano: 'Ano a ano',
  mes: 'Mês a mês',
  encarte: 'Encarte a encarte',
};

export default function ChartVariacaoGrupos({ produtos, escuro, carregando, slug }: ChartVariacaoGruposProps) {
  const [granularidade, setGranularidade] = useState<Granularidade>('ano');
  const [grupoSel, setGrupoSel] = useState<string | null>(null);

  const { datas, grupos } = useMemo(
    () => variacaoPorGrupoCesta(produtos, { granularidade }),
    [produtos, granularidade]
  );
  const sel = grupoSel ? grupos.find((g) => g.grupo === grupoSel) : null;

  const veredito = useMemo(() => {
    const comBase = grupos.filter((g) => g.acumulado != null);
    if (!comBase.length) return null;
    const maiorAlta = comBase.reduce((a, b) => Math.max(a, (b.acumulado as number)), -Infinity);
    const maiorQueda = comBase.reduce((a, b) => Math.min(a, (b.acumulado as number)), Infinity);
    const gAlta = comBase.find((g) => g.acumulado === maiorAlta);
    const gQueda = comBase.find((g) => g.acumulado === maiorQueda);
    return {
      alta: gAlta && maiorAlta > 0.5 ? { grupo: gAlta.grupo, pct: maiorAlta } : null,
      queda: gQueda && maiorQueda < -0.5 ? { grupo: gQueda.grupo, pct: maiorQueda } : null,
    };
  }, [grupos]);

  const optionBarras = useMemo(() => {
    if (!grupos.length) return null;
    const cores = escuro ? chartCores.dark : chartCores.light;
    const corAlta = escuro ? '#f87171' : '#dc2626';
    const corQueda = escuro ? '#4ade80' : '#16a34a';
    const corNeutro = cores.split;

    return {
      backgroundColor: 'transparent',
      tooltip: {
        trigger: 'axis' as const,
        axisPointer: { type: 'shadow' as const },
        backgroundColor: cores.tooltipBg,
        borderWidth: 0,
        textStyle: { color: cores.text },
        formatter: (params: { name: string; value: number | null }[]) => {
          const g = grupos.find((x) => x.grupo === params[0]?.name);
          if (!g || g.acumulado == null) return `${g?.grupo ?? ''}: sem comparável`;
          const seta = g.acumulado > 0 ? '▲' : g.acumulado < 0 ? '▼' : '=';
          const escopo =
            granularidade === 'ano' ? 'no último ano (vs. anterior)' : 'no período';
          return `<b>${g.grupo}</b><br/>${seta} ${fmt(g.acumulado)} ${escopo}<br/><span style="opacity:.6">clique para ver ${granularidade === 'ano' ? 'ano a ano' : granularidade === 'mes' ? 'mês a mês' : 'encarte a encarte'}</span>`;
        },
      },
      grid: { left: 8, right: 54, top: 8, bottom: 8, containLabel: true },
      xAxis: {
        type: 'value' as const,
        axisLabel: { color: cores.muted, fontSize: 11, formatter: (v: number) => `${v}%` },
        splitLine: { lineStyle: { color: cores.split } },
      },
      yAxis: {
        type: 'category' as const,
        inverse: true,
        data: grupos.map((g) => g.grupo),
        axisLabel: { color: cores.text, fontSize: 11 },
        axisLine: { lineStyle: { color: cores.split } },
        axisTick: { show: false },
      },
      series: [
        {
          name: granularidade === 'ano' ? 'Variação anual' : 'Variação acumulada',
          type: 'bar' as const,
          barMaxWidth: 20,
          data: grupos.map((g) => ({
            value: g.acumulado,
            name: g.grupo,
            itemStyle: {
              color:
                g.acumulado == null
                  ? cores.split
                  : g.acumulado > 0.5
                    ? corAlta
                    : g.acumulado < -0.5
                      ? corQueda
                      : corNeutro,
            },
          })),
          label: {
            show: true,
            position: 'right' as const,
            fontSize: 11,
            fontWeight: 'bold' as const,
            color: cores.muted,
            formatter: (p: { value: number | null }) => (p.value == null ? '—' : fmt(p.value)),
          },
        },
      ],
    };
  }, [grupos, escuro, granularidade]);

  const optionHeat = useMemo(() => {
    if (!sel || !datas.length) return null;
    const cores = escuro ? chartCores.dark : chartCores.light;
    const dados = sel.valores.map((v, i) => [i, 0, v] as [number, number, number | null]);

    return {
      backgroundColor: 'transparent',
      tooltip: {
        position: 'top' as const,
        backgroundColor: cores.tooltipBg,
        borderWidth: 0,
        textStyle: { color: cores.text },
        formatter: (p: { value: [number, number, number | null] }) => {
          const [, , v] = p.value;
          const data = datas[p.value[0]] ? rotuloPeriodo(datas[p.value[0]]) : '';
          const base =
            granularidade === 'ano' ? 'ano anterior' : granularidade === 'mes' ? 'mês anterior' : 'encarte anterior';
          const texto =
            v == null
              ? 'sem base comparável'
              : v > 0
                ? `▲ alta de ${fmt(v)} vs. ${base}`
                : v < 0
                  ? `▼ queda de ${fmt(v)} vs. ${base}`
                  : 'estável (0%)';
          return `<b>${sel.grupo.toLowerCase()}</b> · ${data}<br/>${texto}`;
        },
      },
      grid: { left: 8, right: 8, top: 8, bottom: 48, containLabel: true },
      xAxis: {
        type: 'category' as const,
        data: datas.map((d) => rotuloPeriodo(d)),
        splitArea: { show: true },
        axisLabel: { color: cores.muted, fontSize: 10, rotate: 45 },
        axisLine: { show: false },
        axisTick: { show: false },
      },
      yAxis: {
        type: 'category' as const,
        data: [sel.grupo.toLowerCase()],
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
        itemHeight: 80,
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
            show: true,
            fontSize: 9,
            color: escuro ? '#e2e8f0' : '#1e293b',
            formatter: (p: { value: [number, number, number | null] }) =>
              p.value[2] == null ? '' : `${p.value[2] > 0 ? '+' : ''}${Math.round(p.value[2])}`,
          },
          emphasis: { itemStyle: { shadowBlur: 6, shadowColor: 'rgba(0,0,0,0.4)' } },
        },
      ],
    };
  }, [sel, datas, granularidade, escuro]);

  return (
    <Paper variant="outlined" id={slug} sx={{ p: 2.5 }}>
      <Stack direction="row" spacing={1} useFlexGap sx={{ mb: 0.5, alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap' }}>
        <InfoTitulo
          titulo="Variação por grupo da cesta"
          descricao={
            granularidade === 'ano'
              ? 'Variação anual de cada grupo da cesta (café, tomate, óleo…): quanto o preço médio do grupo subiu ou caiu no último ano com dados vs. o ano anterior — ranqueado do maior para o menor. Troque para Mês/Encarte para ver o acumulado do período inteiro.'
              : `Quanto cada grupo da cesta (café, tomate, óleo…) subiu ou caiu em todo o período (${granularidade === 'mes' ? 'mês a mês' : 'encarte a encarte'}) — ranqueado do maior para o menor. Troque para Ano para a variação anual.`
          }
        />
        <ToggleButtonGroup
          size="small"
          exclusive
          value={granularidade}
          onChange={(_, v) => {
            if (v) {
              setGranularidade(v);
              setGrupoSel(null);
            }
          }}
        >
          <ToggleButton value="ano">
            <Typography variant="caption">Ano</Typography>
          </ToggleButton>
          <ToggleButton value="mes">
            <Typography variant="caption">Mês</Typography>
          </ToggleButton>
          <ToggleButton value="encarte">
            <Typography variant="caption">Encarte</Typography>
          </ToggleButton>
        </ToggleButtonGroup>
      </Stack>

      {veredito ? (
        <Stack direction="row" spacing={1} useFlexGap sx={{ mb: 1.5, flexWrap: 'wrap' }}>
          {veredito.alta && (
            <Tooltip title="Maior alta acumulada no período — priorize alternativas" placement="top">
              <Chip
                size="small"
                color="error"
                variant="filled"
                label={`subiu mais: ${veredito.alta.grupo.toLowerCase()} ${fmt(veredito.alta.pct)}`}
              />
            </Tooltip>
          )}
          {veredito.queda && (
            <Tooltip title="Maior queda acumulada no período — boa opção de substituição" placement="top">
              <Chip
                size="small"
                color="success"
                variant="filled"
                label={`caiu mais: ${veredito.queda.grupo.toLowerCase()} ${fmt(veredito.queda.pct)}`}
              />
            </Tooltip>
          )}
          <Typography variant="caption" color="text.secondary" component="div" sx={{ alignSelf: 'center' }}>
            {granularidade === 'ano'
              ? 'Variação anual = último ano com dado vs. o anterior · clique numa barra para a série ano a ano.'
              : `Acumulado = 1º → último período com dado do grupo (${granularidade === 'mes' ? 'mês a mês' : 'encarte a encarte'}) · clique numa barra para o detalhe período a período.`}
          </Typography>
        </Stack>
      ) : null}

      {!optionBarras && !carregando ? (
        <Typography color="text.secondary" variant="body2" sx={{ py: 8, textAlign: 'center' }}>
          Sem grupos da cesta com preço suficiente.
        </Typography>
      ) : (
        <EChart
          option={optionBarras ?? {}}
          height={grupos.length ? Math.max(220, grupos.length * 32 + 40) : 220}
          loading={carregando}
          onClick={(p) => {
            const nome = p.name;
            if (nome) setGrupoSel((atual) => (atual === nome ? null : nome));
          }}
        />
      )}

      {sel && optionHeat ? (
        <Stack sx={{ mt: 2 }}>
          <Stack direction="row" spacing={1} sx={{ mb: 0.5, alignItems: 'center', justifyContent: 'space-between' }}>
            <Typography variant="subtitle2">
              {ROTULO_DETALHE[granularidade]} · {sel.grupo.toLowerCase()}
            </Typography>
            <Button size="small" startIcon={<Close />} onClick={() => setGrupoSel(null)}>
              Fechar
            </Button>
          </Stack>
          <EChart option={optionHeat} height={120} loading={false} />
        </Stack>
      ) : null}
    </Paper>
  );
}