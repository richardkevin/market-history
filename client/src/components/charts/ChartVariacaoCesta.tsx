'use client';

import { useMemo, useState } from 'react';
import Paper from '@mui/material/Paper';
import Stack from '@mui/material/Stack';
import Chip from '@mui/material/Chip';
import Tooltip from '@mui/material/Tooltip';
import ToggleButton from '@mui/material/ToggleButton';
import ToggleButtonGroup from '@mui/material/ToggleButtonGroup';
import Typography from '@mui/material/Typography';
import EChart from '@/components/charts/EChart';
import InfoTitulo from '@/components/InfoTitulo';
import { brl, chartCores } from '@/lib/utils';
import {
  valorCestaPorAno,
  CESTA_BASICA_QTD,
  formatarPct,
  indiceCestaEncadeada,
  rotuloPeriodo,
} from '@/lib/historico';
import type { Produto } from '@/lib/types';

interface ChartVariacaoCestaProps {
  itens: Produto[];
  escuro: boolean;
  carregando: boolean;
  slug?: string;
}

export default function ChartVariacaoCesta({ itens, escuro, carregando, slug }: ChartVariacaoCestaProps) {
  const [vista, setVista] = useState<'ano' | 'mes'>('ano');

  const anuais = useMemo(() => valorCestaPorAno(itens), [itens]);
  const serie = useMemo(() => indiceCestaEncadeada(itens, { granularidade: 'mes' }), [itens]);

  const optionAno = useMemo(() => {
    if (anuais.length === 0) return null;
    const cores = escuro ? chartCores.dark : chartCores.light;

    return {
      backgroundColor: 'transparent',
      tooltip: {
        trigger: 'axis' as const,
        axisPointer: { type: 'shadow' as const },
        backgroundColor: cores.tooltipBg,
        borderWidth: 0,
        textStyle: { color: cores.text },
        formatter: (params: { dataIndex: number }[]) => {
          const ano = anuais[params[0]?.dataIndex ?? 0];
          if (!ano) return '';
          const idx = anuais.findIndex((a) => a.ano === ano.ano);
          const anterior = idx > 0 ? anuais[idx - 1] : null;
          const yoy = anterior ? ((ano.valor - anterior.valor) / anterior.valor) * 100 : null;
          const linhas = [
            `<b>${ano.ano}</b>`,
            `Cesta básica: <b>${brl.format(ano.valor)}</b>`,
            ...ano.itens.map((i) => {
              const peso = CESTA_BASICA_QTD[i.grupo];
              return `${i.grupo} (${peso.qtd.toLocaleString('pt-BR')}${peso.base} · ${brl.format(i.precoUnidade)}/${peso.base}): ${brl.format(i.contribuicao)}`;
            }),
            `<span style="opacity:.6">${ano.gruposIncluidos} de ${ano.gruposPossiveis} grupos</span>`,
          ];
          if (yoy != null)
            linhas.push(
              `${yoy > 0 ? '▲' : yoy < 0 ? '▼' : '='} ${formatarPct(yoy)} vs. ${anterior!.ano}`
            );
          return linhas.join('<br/>');
        },
      },
      grid: { left: 8, right: 8, top: 28, bottom: 8, containLabel: true },
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
      series: [
        {
          name: 'Valor da cesta',
          type: 'bar' as const,
          barMaxWidth: 64,
          data: anuais.map((a) => Number(a.valor.toFixed(2))),
          itemStyle: {
            borderRadius: [6, 6, 0, 0],
            color: {
              type: 'linear' as const,
              x: 0, y: 0, x2: 0, y2: 1,
              colorStops: [
                { offset: 0, color: escuro ? '#4ade80' : '#16a34a' },
                { offset: 1, color: escuro ? '#fb923c' : '#ea580c' },
              ],
            },
          },
          label: {
            show: true,
            position: 'top' as const,
            fontSize: 11,
            fontWeight: 'bold' as const,
            color: cores.text,
            formatter: ({ value }: { value: number }) =>
              brl.format(value),
          },
        },
      ],
    };
  }, [anuais, escuro]);

  const resumoAno = useMemo(() => {
    if (anuais.length < 2) return null;
    const primeiro = anuais[0];
    const ultimo = anuais[anuais.length - 1];
    const anterior = anuais[anuais.length - 2];
    return {
      pctTotal: ((ultimo.valor - primeiro.valor) / primeiro.valor) * 100,
      yoyUltimo: ((ultimo.valor - anterior.valor) / anterior.valor) * 100,
      anoUltimo: ultimo.ano,
      anoAnterior: anterior.ano,
      melhorAno: [...anuais].sort((a, b) => a.valor - b.valor)[0],
      piorAno: [...anuais].sort((a, b) => b.valor - a.valor)[0],
    };
  }, [anuais]);

  const resumoMes = useMemo(() => {
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

  const optionMes = useMemo(() => {
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
          return `<b>${d.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })}</b><br/>Índice: <b>${v.toFixed(1)}</b> (${vsBase > 0 ? '+' : ''}${vsBase.toLocaleString('pt-BR', { maximumFractionDigits: 1 })}% vs. base)`;
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
                new Date(`${p.data}-01T12:00:00`).getTime(),
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
  }, [serie, escuro]);

  const okAno = optionAno != null;
  const okMes = optionMes != null;

  return (
    <Paper variant="outlined" id={slug} sx={{ p: 2.5, height: '100%' }}>
      <Stack direction="row" spacing={1} useFlexGap sx={{ mb: 1, alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap' }}>
        <InfoTitulo
          titulo="Variação da cesta básica"
          descricao={
            vista === 'ano'
              ? anuais.length
                ? `Pesos DIEESE (${anuais[0].gruposIncluidos} de ${anuais[0].gruposPossiveis} grupos): preço por unidade de cada grupo × quantidade fixa (ex.: 6 kg de carne, 15 L de leite). Grupos sem medida comparável ou anos sem cobertura suficiente ficam de fora.`
                : 'Soma dos pesos DIEESE da cesta (preço por unidade × quantidade fixa de cada item). Grupos sem medida comparável ou anos sem cobertura suficiente são ignorados automaticamente.'
              : 'Mini-IPCA caseiro: base 100 no primeiro mês; só compara meses consecutivos com os produtos comuns aos dois, então itens que somem ou entram não distorcem a série.'
          }
        />
        <ToggleButtonGroup
          size="small"
          exclusive
          value={vista}
          onChange={(_, v) => v && setVista(v)}
        >
          <ToggleButton value="ano">
            <Typography variant="caption">Ano a ano</Typography>
          </ToggleButton>
          <ToggleButton value="mes">
            <Typography variant="caption">Mês a mês</Typography>
          </ToggleButton>
        </ToggleButtonGroup>
      </Stack>

      {vista === 'ano' ? (
        !okAno && !carregando ? (
          <Typography color="text.secondary" variant="body2" sx={{ py: 10, textAlign: 'center' }}>
            Nenhum item da cesta básica encontrado.
          </Typography>
        ) : (
          <>
            {resumoAno ? (
              <Stack direction="row" spacing={0.5} useFlexGap sx={{ mb: 1.5, flexWrap: 'wrap' }}>
                <Tooltip title={`Variação total de ${resumoAno.anoUltimo} vs. ${anuais[0].ano}`} placement="top">
                  <Chip
                    size="small"
                    label={`${resumoAno.anoUltimo} vs ${anuais[0].ano}: ${formatarPct(resumoAno.pctTotal)}`}
                    color={resumoAno.pctTotal > 0.5 ? 'error' : 'success'}
                    variant={Math.abs(resumoAno.pctTotal) > 0.5 ? 'filled' : 'outlined'}
                  />
                </Tooltip>
                <Tooltip title={`Preço médio da cesta em ${resumoAno.anoUltimo} vs. ${resumoAno.anoAnterior}`} placement="top">
                  <Chip
                    size="small"
                    label={`${formatarPct(resumoAno.yoyUltimo)} em ${String(resumoAno.anoUltimo).slice(2)}/${String(resumoAno.anoAnterior).slice(2)}`}
                    color={resumoAno.yoyUltimo > 0.5 ? 'error' : resumoAno.yoyUltimo < -0.5 ? 'success' : 'default'}
                    variant={Math.abs(resumoAno.yoyUltimo) > 0.5 ? 'filled' : 'outlined'}
                  />
                </Tooltip>
                <Tooltip title={`Ano com a cesta mais barata: ${brl.format(resumoAno.melhorAno.valor)}`} placement="top">
                  <Chip size="small" label={`Mais barata: ${String(resumoAno.melhorAno.ano).slice(2)}`} color="success" variant="outlined" />
                </Tooltip>
                <Tooltip title={`Ano com a cesta mais cara: ${brl.format(resumoAno.piorAno.valor)}`} placement="top">
                  <Chip size="small" label={`Mais cara: ${String(resumoAno.piorAno.ano).slice(2)}`} color="error" variant="outlined" />
                </Tooltip>
              </Stack>
            ) : null}
            <EChart option={optionAno ?? {}} height={340} loading={carregando} />
          </>
        )
      ) : !okMes && !carregando ? (
        <Typography color="text.secondary" variant="body2" sx={{ py: 8, textAlign: 'center' }}>
          Dados insuficientes para o índice mensal.
        </Typography>
      ) : (
        <>
          {resumoMes ? (
            <Stack sx={{ mb: 1 }}>
              <Stack direction="row" spacing={1} sx={{ alignItems: 'baseline', flexWrap: 'wrap' }}>
                <Typography
                  variant="h4"
                  sx={{
                    fontWeight: 800,
                    lineHeight: 1.1,
                    color:
                      resumoMes.total > 0.5
                        ? 'error.main'
                        : resumoMes.total < -0.5
                          ? 'success.main'
                          : 'text.primary',
                  }}
                >
                  {resumoMes.total > 0 ? '+' : ''}
                  {resumoMes.total.toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  {resumoMes.total > 0.5
                    ? 'a cesta ficou mais cara'
                    : resumoMes.total < -0.5
                      ? 'a cesta ficou mais barata'
                      : 'preços da cesta estáveis'}{' '}
                  de {resumoMes.base} a {resumoMes.ultimoPeriodo}
                </Typography>
              </Stack>
              <Typography variant="caption" color="text.secondary" component="div">
                {resumoMes.intervalo}: {resumoMes.ultimaVariacao > 0 ? '+' : ''}
                {resumoMes.ultimaVariacao.toLocaleString('pt-BR', { maximumFractionDigits: 1 })}% · {resumoMes.nPeriodos} meses analisados
              </Typography>
            </Stack>
          ) : null}
          <EChart option={optionMes ?? {}} height={320} loading={carregando} />
        </>
      )}
    </Paper>
  );
}