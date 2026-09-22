'use client';

import { useMemo, useState } from 'react';
import Paper from '@mui/material/Paper';
import Stack from '@mui/material/Stack';
import Chip from '@mui/material/Chip';
import Tooltip from '@mui/material/Tooltip';
import ToggleButton from '@mui/material/ToggleButton';
import ToggleButtonGroup from '@mui/material/ToggleButtonGroup';
import Typography from '@mui/material/Typography';
import Table from '@mui/material/Table';
import TableBody from '@mui/material/TableBody';
import TableCell from '@mui/material/TableCell';
import TableRow from '@mui/material/TableRow';
import EChart from '@/components/charts/EChart';
import InfoTitulo from '@/components/InfoTitulo';
import { brl, chartCores } from '@/lib/utils';
import { formatarPct } from '@/lib/historico';
import {
  serieDieeseNoPeriodo,
  resumoDieese,
  rotuloMes,
  mediaAnualDieese,
} from '@/lib/dieese';
import type { Produto } from '@/lib/types';

interface CardDieeseCestaProps {
  itens: Produto[];
  escuro: boolean;
  carregando?: boolean;
  slug?: string;
}

export default function CardDieeseCesta({ itens, escuro, carregando = false, slug }: CardDieeseCestaProps) {
  const [vista, setVista] = useState<'ano' | 'mes'>('ano');

  const serie = useMemo(() => serieDieeseNoPeriodo(itens), [itens]);
  const resumo = useMemo(() => resumoDieese(serie), [serie]);
  const anuais = useMemo(() => mediaAnualDieese(serie), [serie]);
  const cores = escuro ? chartCores.dark : chartCores.light;

  const corDelta = (v: number | null | undefined) =>
    v == null || Math.abs(v) <= 0.5 ? 'default' : v > 0.5 ? 'error' : 'success';

  const deltaChip = (rotulo: string, v: number | null | undefined, dica: string) =>
    v == null ? null : (
      <Tooltip title={dica} placement="top">
        <Chip
          size="small"
          label={`${rotulo}: ${formatarPct(v)}`}
          color={corDelta(v)}
          variant={Math.abs(v) > 0.5 ? 'filled' : 'outlined'}
        />
      </Tooltip>
    );

  const variacaoPeriodo =
    serie.length >= 2 ? (serie[serie.length - 1].valor / serie[0].valor - 1) * 100 : null;

  const ultimos = serie.slice(-6).reverse();

  const optionAno = useMemo(() => {
    if (anuais.length === 0) return null;
    return {
      backgroundColor: 'transparent',
      tooltip: {
        trigger: 'axis' as const,
        axisPointer: { type: 'shadow' as const },
        backgroundColor: cores.tooltipBg,
        borderWidth: 0,
        textStyle: { color: cores.text },
        formatter: (params: { dataIndex: number }[]) => {
          const a = anuais[params[0]?.dataIndex ?? 0];
          if (!a) return '';
          const idx = anuais.findIndex((x) => x.ano === a.ano);
          const ant = idx > 0 ? anuais[idx - 1] : null;
          const yoy = ant ? (a.media / ant.media - 1) * 100 : null;
          const linhas = [
            `<b>${a.ano}</b>`,
            `Cesta DIEESE (média anual): <b>${brl.format(a.media)}</b>`,
          ];
          if (yoy != null)
            linhas.push(
              `${yoy > 0 ? '▲' : yoy < 0 ? '▼' : '='} ${formatarPct(yoy)} vs. ${ant!.ano}`
            );
          return linhas.join('<br/>');
        },
      },
      grid: { left: 8, right: 8, top: 28, bottom: 8, containLabel: true },
      xAxis: {
        type: 'category' as const,
        data: anuais.map((a) => String(a.ano)),
        axisLabel: { color: cores.text, fontSize: 11, fontWeight: 'bold' as const },
        axisLine: { lineStyle: { color: cores.split } },
        axisTick: { show: false },
      },
      yAxis: {
        type: 'value' as const,
        scale: true,
        axisLabel: { color: cores.muted, fontSize: 10, formatter: (v: number) => brl.format(v) },
        splitLine: { lineStyle: { color: cores.split } },
      },
      series: [
        {
          name: 'Cesta DIEESE (média anual)',
          type: 'bar',
          barMaxWidth: 36,
          data: anuais.map((a) => Number(a.media.toFixed(2))),
          itemStyle: {
            borderRadius: [4, 4, 0, 0],
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
            fontSize: 9,
            fontWeight: 'bold' as const,
            color: cores.text,
            formatter: (p: { value: number }) => brl.format(p.value),
          },
          labelLayout: { hideOverlap: true },
        },
      ],
    };
  }, [anuais, cores, escuro]);

  const optionMes = useMemo(() => {
    if (serie.length < 1) return null;
    const muitos = serie.length > 14;
    return {
      backgroundColor: 'transparent',
      tooltip: {
        trigger: 'axis' as const,
        axisPointer: { type: 'shadow' as const },
        backgroundColor: cores.tooltipBg,
        borderWidth: 0,
        textStyle: { color: cores.text },
        formatter: (params: { dataIndex: number }[]) => {
          const p = serie[params[0]?.dataIndex ?? 0];
          if (!p) return '';
          const ant = serie[serie.indexOf(p) - 1];
          const delta = ant ? (p.valor / ant.valor - 1) * 100 : null;
          return `<b>${rotuloMes(p.data)}</b><br/>Cesta DIEESE: <b>${brl.format(p.valor)}</b>${
            delta != null ? `<br/><span style="opacity:.6">${formatarPct(delta)} vs. mês anterior</span>` : ''
          }`;
        },
      },
      grid: { left: 8, right: 8, top: 28, bottom: 8, containLabel: true },
      xAxis: {
        type: 'category' as const,
        data: serie.map((p) => rotuloMes(p.data)),
        axisLabel: {
          color: cores.muted,
          fontSize: 10,
          interval: muitos ? 'auto' : 0,
          rotate: muitos ? 45 : 0,
        },
        axisLine: { lineStyle: { color: cores.split } },
        axisTick: { show: false },
      },
      yAxis: {
        type: 'value' as const,
        scale: true,
        axisLabel: { color: cores.muted, fontSize: 10, formatter: (v: number) => brl.format(v) },
        splitLine: { lineStyle: { color: cores.split } },
      },
      series: [
        {
          name: 'Cesta básica RJ (DIEESE)',
          type: 'bar',
          barMaxWidth: 28,
          data: serie.map((p) => Number(p.valor.toFixed(2))),
          itemStyle: {
            borderRadius: [4, 4, 0, 0],
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
            show: !muitos,
            position: 'top' as const,
            fontSize: 9,
            fontWeight: 'bold' as const,
            color: cores.text,
            formatter: (p: { value: number }) => brl.format(p.value),
          },
          labelLayout: { hideOverlap: true },
        },
      ],
    };
  }, [serie, cores, escuro]);

  return (
    <Paper variant="outlined" id={slug} sx={{ p: 2.5, height: '100%' }}>
      <Stack direction="row" spacing={1} useFlexGap sx={{ mb: 1, alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap' }}>
        <InfoTitulo
          titulo="Cesta básica RJ · DIEESE"
          descricao={
            vista === 'ano'
              ? 'Valor oficial médio anual da cesta básica do Rio de Janeiro apurado pelo DIEESE (PNCBA), no mesmo período dos encartes do gráfico ao lado. Média dos meses do ano com dados — compare com a nossa cesta calculada dos encartes.'
              : 'Valor oficial mensal da cesta básica do Rio de Janeiro apurado pelo DIEESE (PNCBA), no mesmo período dos encartes do gráfico ao lado. Referência nacional: 13 alimentos com pesos fixos — compare com a nossa cesta calculada dos encartes.'
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

      {resumo ? (
        <>
          <Stack direction="row" spacing={2} useFlexGap sx={{ alignItems: 'baseline', flexWrap: 'wrap' }}>
            <Typography variant="h4" sx={{ fontWeight: 800, lineHeight: 1.1, color: 'text.primary' }}>
              {brl.format(resumo.valor)}
            </Typography>
            <Typography variant="body2" color="text.secondary">
              {resumo.rotulo} · DIEESE
            </Typography>
          </Stack>

          <Stack direction="row" spacing={0.5} useFlexGap sx={{ mt: 1, mb: 1, flexWrap: 'wrap' }}>
            {deltaChip('12 meses', resumo.variacao12m, 'Variação em 12 meses (mesmo mês do ano anterior)')}
            {deltaChip('no ano', resumo.variacaoNoAno, 'Variação acumulada desde o início do ano')}
            {variacaoPeriodo != null
              ? deltaChip('no período', variacaoPeriodo, `Variação de ${rotuloMes(serie[0].data)} a ${rotuloMes(serie[serie.length - 1].data)} (mesmo período dos encartes)`)
              : null}
          </Stack>

          {vista === 'ano' ? (
            optionAno ? (
              <EChart option={optionAno} height={240} loading={carregando} />
            ) : (
              <Typography color="text.secondary" variant="body2" sx={{ py: 6, textAlign: 'center' }}>
                Período dos encartes sem dados DIEESE.
              </Typography>
            )
          ) : optionMes ? (
            <EChart option={optionMes} height={240} loading={carregando} />
          ) : (
            <Typography color="text.secondary" variant="body2" sx={{ py: 6, textAlign: 'center' }}>
              Período dos encartes sem dados DIEESE.
            </Typography>
          )}

          {vista === 'mes' && ultimos.length > 0 ? (
            <Table size="small" sx={{ mt: 1 }}>
              <TableBody>
                {ultimos.map((p) => {
                  const prox = serie.find((x) => x.data === p.data);
                  const ant = serie[serie.indexOf(prox!) - 1];
                  const delta = ant ? (p.valor / ant.valor - 1) * 100 : null;
                  return (
                    <TableRow key={p.data}>
                      <TableCell sx={{ border: 0, py: 0.3, color: 'text.secondary' }}>{rotuloMes(p.data)}</TableCell>
                      <TableCell sx={{ border: 0, py: 0.3, textAlign: 'right' }}>
                        <Typography variant="body2" sx={{ fontWeight: 700 }}>{brl.format(p.valor)}</Typography>
                      </TableCell>
                      <TableCell sx={{ border: 0, py: 0.3, textAlign: 'right' }}>
                        {delta != null ? (
                          <Typography
                            variant="caption"
                            sx={{
                              fontWeight: 700,
                              color: Math.abs(delta) <= 0.5 ? 'text.secondary' : delta > 0 ? 'error.main' : 'success.main',
                            }}
                          >
                            {formatarPct(delta)}
                          </Typography>
                        ) : null}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          ) : null}
        </>
      ) : (
        <Typography color="text.secondary" variant="body2" sx={{ py: 8, textAlign: 'center' }}>
          Sem dados DIEESE no período.
        </Typography>
      )}
    </Paper>
  );
}