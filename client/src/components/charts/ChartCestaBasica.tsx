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
import { valorCestaPorAno, CESTA_BASICA_QTD, formatarPct } from '@/lib/historico';
import type { Produto } from '@/lib/types';

interface ChartCestaBasicaProps {
  itens: Produto[];
  escuro: boolean;
  carregando: boolean;
}

export default function ChartCestaBasica({ itens, escuro, carregando }: ChartCestaBasicaProps) {
  const anuais = useMemo(() => valorCestaPorAno(itens), [itens]);

  const option = useMemo(() => {
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

  const resumo = useMemo(() => {
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

  return (
    <Paper variant="outlined" sx={{ p: 2.5 }}>
      <InfoTitulo
        titulo="Valor da cesta básica · ano a ano"
        descricao={
          anuais.length
            ? `Pesos DIEESE (${anuais[0].gruposIncluidos} de ${anuais[0].gruposPossiveis} grupos): preço por unidade de cada grupo × quantidade fixa (ex.: 6 kg de carne, 15 L de leite). Grupos sem medida comparável ou anos sem cobertura suficiente ficam de fora.`
            : 'Soma dos pesos DIEESE da cesta (preço por unidade × quantidade fixa de cada item). Grupos sem medida comparável ou anos sem cobertura suficiente são ignorados automaticamente.'
        }
      />
      {!option && !carregando ? (
        <Typography color="text.secondary" variant="body2" sx={{ py: 10, textAlign: 'center' }}>
          Nenhum item da cesta básica encontrado.
        </Typography>
      ) : (
        <>
          {resumo ? (
            <Stack direction="row" spacing={0.5} useFlexGap sx={{ mb: 1.5, flexWrap: 'wrap' }}>
              <Tooltip title={`Variação total de ${resumo.anoUltimo} vs. ${anuais[0].ano}`} placement="top">
                <Chip
                  size="small"
                  label={`${resumo.anoUltimo} vs ${anuais[0].ano}: ${formatarPct(resumo.pctTotal)}`}
                  color={resumo.pctTotal > 0.5 ? 'error' : 'success'}
                  variant={Math.abs(resumo.pctTotal) > 0.5 ? 'filled' : 'outlined'}
                />
              </Tooltip>
              <Tooltip title={`Preço médio da cesta em ${resumo.anoUltimo} vs. ${resumo.anoAnterior}`} placement="top">
                <Chip
                  size="small"
                  label={`${formatarPct(resumo.yoyUltimo)} em ${String(resumo.anoUltimo).slice(2)}/${String(resumo.anoAnterior).slice(2)}`}
                  color={resumo.yoyUltimo > 0.5 ? 'error' : resumo.yoyUltimo < -0.5 ? 'success' : 'default'}
                  variant={Math.abs(resumo.yoyUltimo) > 0.5 ? 'filled' : 'outlined'}
                />
              </Tooltip>
              <Tooltip title={`Ano com a cesta mais barata: ${brl.format(resumo.melhorAno.valor)}`} placement="top">
                <Chip size="small" label={`Mais barata: ${String(resumo.melhorAno.ano).slice(2)}`} color="success" variant="outlined" />
              </Tooltip>
              <Tooltip title={`Ano com a cesta mais cara: ${brl.format(resumo.piorAno.valor)}`} placement="top">
                <Chip size="small" label={`Mais cara: ${String(resumo.piorAno.ano).slice(2)}`} color="error" variant="outlined" />
              </Tooltip>
            </Stack>
          ) : null}
          <EChart option={option ?? {}} height={340} loading={carregando} />
        </>
      )}
    </Paper>
  );
}