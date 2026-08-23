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
import Chip from '@mui/material/Chip';
import Button from '@mui/material/Button';
import RestartAlt from '@mui/icons-material/RestartAlt';
import EChart from '@/components/charts/EChart';
import { brl, chartCores } from '@/lib/utils';
import { serieProduto, extrairUnidade } from '@/lib/historico';
import type { Produto } from '@/lib/types';

interface ChartPrecoLinhaProps {
  /** produto pré-selecionado (ex.: clique na tabela/cards) */
  produtoSelecionado: string | null;
  onSelecionarProduto: (produto: string | null) => void;
  /** histórico do produto selecionado (compartilhado com outros gráficos) */
  historico: Produto[];
  carregandoHistorico: boolean;
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
  escuro,
}: ChartPrecoLinhaProps) {
  const [sugestoes, setSugestoes] = useState<Sugerido[]>([]);
  const [porUnidade, setPorUnidade] = useState(false);

  useEffect(() => {
    fetch('/api/produtos?action=produtos-populares')
      .then((r) => r.json())
      .then(setSugestoes)
      .catch(() => setSugestoes([]));
  }, []);

  const pontos = useMemo(() => serieProduto(historico), [historico]);

  const unidade = useMemo(() => {
    const comMedida = [...pontos].reverse().find((p) => p.medida);
    if (!comMedida?.medida || comMedida.precoUnit == null) return null;
    const u = extrairUnidade(comMedida.medida);
    return u && u.quantidade > 0 ? u : null;
  }, [pontos]);
  const podeNormalizar = unidade != null;

  const option = useMemo(() => {
    if (!pontos.length) return null;
    const cores = escuro ? chartCores.dark : chartCores.light;
    const usarUnitario = porUnidade && podeNormalizar;
    const sufixo = usarUnitario
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
      backgroundColor: 'transparent',
      tooltip: {
        trigger: 'axis' as const,
        backgroundColor: cores.tooltipBg,
        borderWidth: 0,
        textStyle: { color: cores.text },
        formatter: (
          params: {
            marker?: string;
            seriesName: string;
            value: [number, number];
            data: { medida?: string | null; promocao?: boolean };
          }[]
        ) => {
          const d = new Date(params[0].value[0]);
          const linhas = params.map(
            (p) =>
              `${p.marker} ${p.seriesName}: <b>${brl.format(p.value[1])}</b>${p.data?.medida ? ` <span style="opacity:.6">(${p.data.medida})</span>` : ''}`
          );
          if (params[0]?.data?.promocao) linhas.push('🏷️ encarte com promoção');
          return `<b>${d.toLocaleDateString('pt-BR')}</b><br/>${linhas.join('<br/>')}`;
        },
      },
      legend: { top: 0, textStyle: { color: cores.muted } },
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
        axisLabel: { color: cores.muted, fontSize: 11, formatter: (v: number) => brl.format(v) },
        splitLine: { lineStyle: { color: cores.split } },
      },
      series,
    };
  }, [pontos, porUnidade, podeNormalizar, unidade, escuro]);

  const resumo = useMemo(() => {
    if (!pontos.length) return null;
    const usarUnitario = porUnidade && podeNormalizar;
    const valor = (p: (typeof pontos)[number]) => (usarUnitario ? p.precoUnit : p.preco);
    const v1 = valor(pontos[0]);
    const v2 = valor(pontos[pontos.length - 1]);
    if (v1 == null || v2 == null || !v1) return null;
    const valores = pontos.map((p) => valor(p)).filter((v): v is number => v != null);
    return {
      pct: ((v2 - v1) / v1) * 100,
      minimo: Math.min(...valores),
      maximo: Math.max(...valores),
      nEncartes: pontos.length,
    };
  }, [pontos, porUnidade, podeNormalizar]);

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
        <Typography variant="h6">Evolução de preço</Typography>
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
          <Button
            size="small"
            variant="text"
            startIcon={<RestartAlt />}
            disabled={!produtoSelecionado && !porUnidade}
            onClick={() => {
              setPorUnidade(false);
              onSelecionarProduto(null);
            }}
          >
            Reset
          </Button>
        </Stack>
      </Stack>

      {!produtoSelecionado ? (
        <Typography color="text.secondary" variant="body2" sx={{ py: 10, textAlign: 'center' }}>
          Selecione um produto para ver a evolução do preço ao longo dos encartes.
        </Typography>
      ) : carregandoHistorico ? (
        <Typography color="text.secondary" variant="body2" sx={{ py: 10, textAlign: 'center' }}>
          Carregando histórico…
        </Typography>
      ) : option && resumo ? (
        <>
          <Stack direction="row" spacing={0.5} useFlexGap sx={{ mb: 1.5, flexWrap: 'wrap' }}>
            <Chip
              size="small"
              label={`${resumo.pct > 0 ? '▲' : resumo.pct < 0 ? '▼' : '='} ${Math.abs(resumo.pct).toLocaleString('pt-BR', { maximumFractionDigits: 1 })}% desde o primeiro encarte`}
              color={resumo.pct > 0.5 ? 'error' : resumo.pct < -0.5 ? 'success' : 'default'}
              variant={Math.abs(resumo.pct) > 0.5 ? 'filled' : 'outlined'}
            />
            <Chip size="small" variant="outlined" label={`mín ${brl.format(resumo.minimo)}`} />
            <Chip size="small" variant="outlined" label={`máx ${brl.format(resumo.maximo)}`} />
            <Chip size="small" variant="outlined" label={`${resumo.nEncartes} encartes`} />
          </Stack>
          <EChart option={option} height={360} loading={false} />
        </>
      ) : (
        <Typography color="text.secondary" variant="body2" sx={{ py: 10, textAlign: 'center' }}>
          Sem preços registrados para este produto.
        </Typography>
      )}
    </Paper>
  );
}
