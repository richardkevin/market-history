'use client';

import { useMemo } from 'react';
import Paper from '@mui/material/Paper';
import Stack from '@mui/material/Stack';
import Chip from '@mui/material/Chip';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import EChart from '@/components/charts/EChart';
import InfoTitulo from '@/components/InfoTitulo';
import { brl, chartCores } from '@/lib/utils';
import { mediasAnuais, formatarPct, grupoCesta } from '@/lib/historico';
import type { Produto } from '@/lib/types';

interface ChartPrecoAnualProps {
  nomeProduto: string | null;
  historico: Produto[];
  carregando: boolean;
  /** base completa para o modo default (cesta básica) */
  produtosCesta: Produto[];
  /** true quando há itens marcados na tabela — usa todos, sem filtrar pela cesta */
  modoSelecao?: boolean;
  escuro: boolean;
}

export default function ChartPrecoAnual({
  nomeProduto,
  historico,
  carregando,
  produtosCesta,
  modoSelecao = false,
  escuro,
}: ChartPrecoAnualProps) {
  const modoCesta = nomeProduto == null;

  const anuais = useMemo(() => {
    if (modoCesta) {
      return mediasAnuais(
        produtosCesta.filter((p) => modoSelecao || grupoCesta(p.produto)),
        { porUnidade: true }
      );
    }
    return mediasAnuais(historico);
  }, [modoCesta, modoSelecao, produtosCesta, historico]);

  const temClube = anuais.some((a) => a.precoClube != null);

  const option = useMemo(() => {
    if (anuais.length === 0) return null;
    const cores = escuro ? chartCores.dark : chartCores.light;
    const nomeSerieNormal = modoCesta
      ? modoSelecao
        ? 'Seleção (média R$/kg·L·un)'
        : 'Cesta básica (média R$/kg·L·un)'
      : 'Preço médio';

    const dadosNormal = anuais.map((a) => ({
      value: Number(a.preco.toFixed(2)),
      meta: a,
    }));
    const dadosClube = anuais.map((a) => ({
      value: a.precoClube != null ? Number(a.precoClube.toFixed(2)) : null,
      meta: a,
    }));

    const series: Record<string, unknown>[] = [
      {
        name: nomeSerieNormal,
        type: 'bar',
        barMaxWidth: 42,
        data: dadosNormal,
        itemStyle: { borderRadius: [6, 6, 0, 0], color: escuro ? '#4ade80' : '#16a34a' },
        label: {
          show: true,
          position: 'top' as const,
          fontSize: 10,
          color: cores.muted,
          formatter: ({ value }: { value: number }) =>
            value.toLocaleString('pt-BR', {
              style: 'currency',
              currency: 'BRL',
              maximumFractionDigits: value >= 100 ? 0 : 2,
            }),
        },
      },
    ];
    if (temClube) {
      series.push({
        name: modoCesta ? 'Clube da cesta' : 'Clube (média)',
        type: 'bar',
        barMaxWidth: 42,
        data: dadosClube,
        itemStyle: {
          borderRadius: [6, 6, 0, 0],
          color: escuro ? '#fb923c' : '#ea580c',
          opacity: 0.85,
        },
      });
    }

    return {
      backgroundColor: 'transparent',
      tooltip: {
        trigger: 'axis' as const,
        axisPointer: { type: 'shadow' as const },
        backgroundColor: cores.tooltipBg,
        borderWidth: 0,
        textStyle: { color: cores.text },
        formatter: (
          params: {
            seriesName: string;
            marker: string;
            value: number;
            data: { meta?: (typeof anuais)[number] };
          }[]
        ) => {
          const meta = params[0]?.data?.meta;
          if (!meta) return '';
          const idx = anuais.findIndex((a) => a.ano === meta.ano);
          const anterior = idx > 0 ? anuais[idx - 1] : null;
          const yoy = anterior ? ((meta.preco - anterior.preco) / anterior.preco) * 100 : null;
          const linhas = [
            `<b>${meta.ano}</b>`,
            `${params[0].marker} Média: <b>${brl.format(meta.preco)}</b>${modoCesta ? ' /kg·L/un' : ''}`,
            `Faixa: ${brl.format(meta.precoMin)} – ${brl.format(meta.precoMax)}`,
          ];
          if (meta.precoClube != null)
            linhas.push(`🧡 Clube: ${brl.format(meta.precoClube)} em média`);
          if (yoy != null)
            linhas.push(`${yoy > 0 ? '▲' : yoy < 0 ? '▼' : '='} ${formatarPct(yoy)} vs. ${anterior!.ano}`);
          linhas.push(`<span style="opacity:.6">${meta.nRegistros} registros</span>`);
          return linhas.join('<br/>');
        },
      },
      grid: { left: 8, right: 8, top: 28, bottom: 8, containLabel: true },
      legend: { top: 0, textStyle: { color: cores.muted } },
      xAxis: {
        type: 'category' as const,
        data: anuais.map((a) => String(a.ano)),
        axisLabel: { color: cores.text, fontSize: 12, fontWeight: 'bold' as const },
        axisLine: { lineStyle: { color: cores.split } },
        axisTick: { show: false },
      },
      yAxis: {
        type: 'value' as const,
        scale: true,
        axisLabel: { color: cores.muted, fontSize: 11, formatter: (v: number) => brl.format(v) },
        splitLine: { lineStyle: { color: cores.split } },
      },
      series,
    };
  }, [anuais, temClube, escuro, modoCesta, modoSelecao]);

  const resumo = useMemo(() => {
    if (anuais.length < 2) return null;
    const primeiro = anuais[0];
    const ultimo = anuais[anuais.length - 1];
    const anterior = anuais[anuais.length - 2];
    return {
      pctTotal: ((ultimo.preco - primeiro.preco) / primeiro.preco) * 100,
      yoyUltimo: ((ultimo.preco - anterior.preco) / anterior.preco) * 100,
      anoUltimo: ultimo.ano,
      anoAnterior: anterior.ano,
      melhorAno: [...anuais].sort((a, b) => a.preco - b.preco)[0],
      piorAno: [...anuais].sort((a, b) => b.preco - a.preco)[0],
    };
  }, [anuais]);

  return (
    <Paper variant="outlined" sx={{ p: 2.5 }}>
      <InfoTitulo
        titulo="Comparação anual"
      descricao={
        modoCesta
          ? modoSelecao
            ? 'Média por unidade (R$/kg·L·un) dos produtos marcados na tabela em cada ano — mostra o ano em que estiveram, em média, mais baratos ou caros.'
            : 'Média por unidade (R$/kg·L·un) dos grupos da cesta básica em cada ano — mostra o ano em que o carrinho estava, em média, mais barato ou caro.'
          : 'Preço médio do produto selecionado em cada ano-calendário. O tooltip traz a faixa mín–máx do período e a variação vs. o ano anterior.'
      }
      />
      {carregando && !modoCesta ? (
        <Typography color="text.secondary" variant="body2" sx={{ py: 10, textAlign: 'center' }}>
          Carregando histórico…
        </Typography>
      ) : option && resumo ? (
        <>
          <Stack direction="row" spacing={0.5} useFlexGap sx={{ mb: 1.5, flexWrap: 'wrap' }}>
            <Tooltip title={`Preço médio de ${resumo.anoUltimo} vs. ${resumo.anoAnterior}`} placement="top">
              <Chip
                size="small"
                label={`${formatarPct(resumo.yoyUltimo)} em ${String(resumo.anoUltimo).slice(2)}/${String(resumo.anoAnterior).slice(2)}`}
                color={resumo.yoyUltimo > 0.5 ? 'error' : resumo.yoyUltimo < -0.5 ? 'success' : 'default'}
                variant={Math.abs(resumo.yoyUltimo) > 0.5 ? 'filled' : 'outlined'}
              />
            </Tooltip>
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
