'use client';

import { useEffect, useMemo, useState } from 'react';
import Paper from '@mui/material/Paper';
import Stack from '@mui/material/Stack';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import Autocomplete from '@mui/material/Autocomplete';
import TextField from '@mui/material/TextField';
import FormControlLabel from '@mui/material/FormControlLabel';
import Switch from '@mui/material/Switch';
import ToggleButton from '@mui/material/ToggleButton';
import ToggleButtonGroup from '@mui/material/ToggleButtonGroup';
import Chip from '@mui/material/Chip';
import Button from '@mui/material/Button';
import RestartAlt from '@mui/icons-material/RestartAlt';
import EChart from '@/components/charts/EChart';
import InfoTitulo from '@/components/InfoTitulo';
import { brl, chartCores } from '@/lib/utils';
import {
  serieProduto,
  extrairUnidade,
  seriesCestaBasica,
  rotuloPeriodo,
  type Granularidade,
} from '@/lib/historico';
import type { Produto } from '@/lib/types';

interface ChartPrecoLinhaProps {
  /** produto pré-selecionado (ex.: clique na tabela/cards) */
  produtoSelecionado: string | null;
  onSelecionarProduto: (produto: string | null) => void;
  /** histórico do produto selecionado (compartilhado com outros gráficos) */
  historico: Produto[];
  carregandoHistorico: boolean;
  /** base completa para o modo default (grupos da cesta básica) */
  produtosCesta: Produto[];
  escuro: boolean;
}

interface Sugerido {
  produto: string;
  registros: number;
}

export default function ChartPrecoLinha({
  produtoSelecionado,
  onSelecionarProduto,
  historico,
  carregandoHistorico,
  produtosCesta,
  escuro,
}: ChartPrecoLinhaProps) {
  const [sugestoes, setSugestoes] = useState<Sugerido[]>([]);
  const [porUnidade, setPorUnidade] = useState(false);
  const [granularidade, setGranularidade] = useState<Granularidade>('mes');

  const modoCesta = produtoSelecionado == null;

  useEffect(() => {
    fetch('/api/produtos?action=produtos-populares')
      .then((r) => r.json())
      .then(setSugestoes)
      .catch(() => setSugestoes([]));
  }, []);

  const pontos = useMemo(
    () => serieProduto(historico, { granularidade }),
    [historico, granularidade]
  );

  const gruposCesta = useMemo(
    () => (modoCesta ? seriesCestaBasica(produtosCesta, { granularidade }) : []),
    [modoCesta, produtosCesta, granularidade]
  );

  const unidade = useMemo(() => {
    const comMedida = [...pontos].reverse().find((p) => p.medida);
    if (!comMedida?.medida || comMedida.precoUnit == null) return null;
    const u = extrairUnidade(comMedida.medida);
    return u && u.quantidade > 0 ? u : null;
  }, [pontos]);
  const podeNormalizar = unidade != null;

  const option = useMemo(() => {
    const cores = escuro ? chartCores.dark : chartCores.light;
    const eixoTempo = {
      type: 'time' as const,
      axisLabel: {
        color: cores.muted,
        fontSize: 11,
        formatter: (v: number) =>
          new Date(v).toLocaleDateString('pt-BR', { month: 'short', year: '2-digit' }),
      },
      axisLine: { lineStyle: { color: cores.split } },
      splitLine: { show: false },
    };
    const eixoPreco = {
      type: 'value' as const,
      scale: true,
      axisLabel: { color: cores.muted, fontSize: 11, formatter: (v: number) => brl.format(v) },
      splitLine: { lineStyle: { color: cores.split } },
    };
    const base = {
      backgroundColor: 'transparent',
      tooltip: {
        trigger: 'axis' as const,
        backgroundColor: cores.tooltipBg,
        borderWidth: 0,
        textStyle: { color: cores.text },
      },
      grid: { left: 8, right: 16, top: 32, bottom: 8, containLabel: true },
      xAxis: eixoTempo,
      yAxis: eixoPreco,
    };

    if (modoCesta) {
      if (!gruposCesta.length) return null;
      const series = gruposCesta.map((g, i) => ({
        name: g.grupo.toLowerCase(),
        type: 'line',
        data: g.pontos.map((pt) => [pt.date.getTime(), Number(pt.precoUnit!.toFixed(2))]),
        connectNulls: true,
        symbolSize: 5,
        lineStyle: { width: 2, color: cores.series[i % cores.series.length] },
        itemStyle: { color: cores.series[i % cores.series.length] },
        emphasis: { focus: 'series' },
      }));
      return {
        ...base,
        tooltip: {
          ...base.tooltip,
          valueFormatter: (v: number) => `${brl.format(v)} por kg/L/un`,
        },
        legend: { type: 'scroll' as const, top: 0, textStyle: { color: cores.muted } },
        series,
      };
    }

    if (!pontos.length) return null;
    const usarUnitario = porUnidade && podeNormalizar;
    const sufixo =
      usarUnitario
        ? unidade!.base === 'kg'
          ? '/kg'
          : unidade!.base === 'L'
            ? '/L'
            : '/un'
        : '';

    const valor = (p: (typeof pontos)[number]) =>
      usarUnitario ? p.precoUnit : p.preco;

    const serieNormal = pontos.map((p) => ({
      value: [p.date.getTime(), valor(p)] as [number, number | null],
      promocao: p.promocao,
      medida: p.medida,
    }));

    const serieClube = pontos
      .map((p) => ({
        value: [
          p.date.getTime(),
          usarUnitario ? p.precoClubeUnit : p.precoClube,
        ] as [number, number | null],
      }))
      .filter((d) => d.value[1] != null);

    const series: Record<string, unknown>[] = [
      {
        name: `Preço${sufixo}`,
        type: 'line',
        data: serieNormal,
        connectNulls: true,
        symbolSize: 9,
        lineStyle: { width: 2.5, color: cores.series[0] },
        itemStyle: { color: cores.series[0] },
        emphasis: { focus: 'series' },
      },
    ];
    if (serieClube.length) {
      series.push({
        name: `Clube${sufixo}`,
        type: 'line',
        data: serieClube,
        connectNulls: true,
        symbolSize: 7,
        lineStyle: { width: 1.5, type: 'dashed' as const, color: cores.series[1] },
        itemStyle: { color: cores.series[1] },
        emphasis: { focus: 'series' },
      });
    }

    return {
      ...base,
      tooltip: {
        ...base.tooltip,
        formatter: (
          params: {
            marker?: string;
            seriesName: string;
            value: [number, number];
            data: { medida?: string | null; promocao?: boolean };
          }[]
        ) => {
          const d = new Date(params[0].value[0]);
          const titulo =
            granularidade === 'mes'
              ? d.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })
              : d.toLocaleDateString('pt-BR');
          const linhas = params.map(
            (p) =>
              `${p.marker} ${p.seriesName}: <b>${brl.format(p.value[1])}</b>${p.data?.medida ? ` <span style="opacity:.6">(${p.data.medida})</span>` : ''}`
          );
          if (params[0]?.data?.promocao) linhas.push('🏷️ encarte com promoção');
          return `<b>${titulo}</b><br/>${linhas.join('<br/>')}`;
        },
      },
      legend: { top: 0, textStyle: { color: cores.muted } },
      series,
    };
  }, [modoCesta, gruposCesta, pontos, porUnidade, podeNormalizar, unidade, escuro, granularidade]);

  const resumo = useMemo(() => {
    if (!modoCesta) {
      if (!pontos.length) return null;
      const usarUnitario = porUnidade && podeNormalizar;
      const valor = (p: (typeof pontos)[number]) => (usarUnitario ? p.precoUnit : p.preco);
      const v1 = valor(pontos[0]);
      const v2 = valor(pontos[pontos.length - 1]);
      if (v1 == null || v2 == null || !v1) return null;
      const valores = pontos.map((p) => valor(p)).filter((v): v is number => v != null);
      return {
        tipo: 'produto' as const,
        pct: ((v2 - v1) / v1) * 100,
        minimo: Math.min(...valores),
        maximo: Math.max(...valores),
        nEncartes: pontos.length,
      };
    }
    if (!gruposCesta.length) return null;
    const datas = gruposCesta.flatMap((g) => g.pontos.map((pt) => pt.data)).sort();
    return {
      tipo: 'cesta' as const,
      nGrupos: gruposCesta.length,
      inicio: datas[0],
      fim: datas[datas.length - 1],
    };
  }, [modoCesta, pontos, porUnidade, podeNormalizar, gruposCesta]);

  const opcoes = useMemo(
    () =>
      produtoSelecionado && !sugestoes.some((s) => s.produto === produtoSelecionado)
        ? [{ produto: produtoSelecionado, registros: 0 }, ...sugestoes]
        : sugestoes,
    [sugestoes, produtoSelecionado]
  );

  return (
    <Paper variant="outlined" sx={{ p: 2.5 }}>
      <Stack
        direction={{ xs: 'column', md: 'row' }}
        spacing={1.5}
        sx={{ mb: 2, alignItems: { md: 'center' }, justifyContent: 'space-between' }}
      >
        <InfoTitulo
          titulo="Evolução de preço"
          descricao={
            modoCesta
              ? 'Visão geral: um linha por grupo da cesta básica, em preço médio por unidade (R$/kg·L·un). Selecione um produto para ver o histórico detalhado dele.'
              : 'Linha do tempo do preço do produto em cada encarte. A linha tracejada é o preço Clube; lacunas indicam que o produto não apareceu no encarte daquele período.'
          }
        />
        <Stack direction="row" spacing={1.5} useFlexGap sx={{ alignItems: 'center', flexWrap: 'wrap' }}>
          <Autocomplete
            size="small"
            sx={{ minWidth: { xs: '100%', md: 300 } }}
            options={opcoes}
            getOptionLabel={(o) => o.produto}
            value={opcoes.find((s) => s.produto === produtoSelecionado) ?? null}
            onChange={(_, v) => onSelecionarProduto(v?.produto ?? null)}
            renderInput={(params) => (
              <TextField {...params} placeholder="Buscar produto…" variant="outlined" />
            )}
            renderOption={(props, o) => {
              const { key, ...outras } = props;
              return (
                <Box component="li" key={key} {...outras}>
                  <Typography variant="body2" noWrap sx={{ flex: 1 }}>
                    {o.produto}
                  </Typography>
                  {o.registros > 0 && <Chip size="small" label={`${o.registros}x`} variant="outlined" />}
                </Box>
              );
            }}
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
          {!modoCesta && (
            <FormControlLabel
              control={
                <Switch
                  checked={porUnidade}
                  onChange={(e) => setPorUnidade(e.target.checked)}
                  size="small"
                  disabled={!podeNormalizar}
                />
              }
              label={<Typography variant="body2">R$/kg·L·un</Typography>}
            />
          )}
          <Button
            size="small"
            variant="text"
            startIcon={<RestartAlt />}
            disabled={modoCesta && !porUnidade && granularidade === 'mes'}
            onClick={() => {
              setPorUnidade(false);
              setGranularidade('mes');
              onSelecionarProduto(null);
            }}
          >
            Reset
          </Button>
        </Stack>
      </Stack>

      {carregandoHistorico && !modoCesta ? (
        <Typography color="text.secondary" variant="body2" sx={{ py: 10, textAlign: 'center' }}>
          Carregando histórico…
        </Typography>
      ) : option && resumo ? (
        <>
          <Stack direction="row" spacing={0.5} useFlexGap sx={{ mb: 1.5, flexWrap: 'wrap' }}>
            {resumo.tipo === 'cesta' ? (
              <>
                <Chip
                  size="small"
                  color="primary"
                  variant="outlined"
                  label={`${resumo.nGrupos} grupos da cesta básica`}
                />
                <Chip
                  size="small"
                  variant="outlined"
                  label={`${rotuloPeriodo(resumo.inicio)} → ${rotuloPeriodo(resumo.fim)} · R$/kg·L·un`}
                />
              </>
            ) : (
              <>
                <Chip
                  size="small"
                  label={`${resumo.pct > 0 ? '▲' : resumo.pct < 0 ? '▼' : '='} ${Math.abs(resumo.pct).toLocaleString('pt-BR', { maximumFractionDigits: 1 })}% desde o primeiro encarte`}
                  color={resumo.pct > 0.5 ? 'error' : resumo.pct < -0.5 ? 'success' : 'default'}
                  variant={Math.abs(resumo.pct) > 0.5 ? 'filled' : 'outlined'}
                />
                <Chip size="small" variant="outlined" label={`mín ${brl.format(resumo.minimo)}`} />
                <Chip size="small" variant="outlined" label={`máx ${brl.format(resumo.maximo)}`} />
                <Chip size="small" variant="outlined" label={`${resumo.nEncartes} encartes`} />
              </>
            )}
          </Stack>
          <EChart option={option} height={360} loading={false} />
        </>
      ) : (
        <Typography color="text.secondary" variant="body2" sx={{ py: 10, textAlign: 'center' }}>
          Sem preços registrados.
        </Typography>
      )}
    </Paper>
  );
}
