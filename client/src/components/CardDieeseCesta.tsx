'use client';

import { useMemo } from 'react';
import Paper from '@mui/material/Paper';
import Stack from '@mui/material/Stack';
import Chip from '@mui/material/Chip';
import Tooltip from '@mui/material/Tooltip';
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
} from '@/lib/dieese';
import type { Produto } from '@/lib/types';

interface CardDieeseCestaProps {
  itens: Produto[];
  escuro: boolean;
  carregando?: boolean;
  slug?: string;
}

export default function CardDieeseCesta({ itens, escuro, carregando = false, slug }: CardDieeseCestaProps) {
  const serie = useMemo(() => serieDieeseNoPeriodo(itens), [itens]);
  const resumo = useMemo(() => resumoDieese(serie), [serie]);
  const cores = escuro ? chartCores.dark : chartCores.light;
  const corLinha = escuro ? '#fb923c' : '#ea580c';

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

  const option = useMemo(() => {
    if (serie.length < 2) return null;
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
          return `<b>${d.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })}</b><br/>Cesta DIEESE: <b>${brl.format(v)}</b>`;
        },
      },
      grid: { left: 8, right: 10, top: 28, bottom: 4, containLabel: true },
      xAxis: {
        type: 'time' as const,
        axisLabel: {
          color: cores.muted,
          fontSize: 10,
          formatter: (v: number) =>
            new Date(v).toLocaleDateString('pt-BR', { month: 'short', year: '2-digit' }),
        },
        axisLine: { lineStyle: { color: cores.split } },
        splitLine: { show: false },
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
          type: 'line',
          data: serie.map((p) => [new Date(`${p.data}-01T12:00:00`).getTime(), p.valor] as [number, number]),
          symbolSize: 3,
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
        },
      ],
    };
  }, [serie, cores, corLinha]);

  return (
    <Paper variant="outlined" id={slug} sx={{ p: 2.5, height: '100%' }}>
      <Stack sx={{ mb: 1 }}>
        <InfoTitulo
          titulo="Cesta básica RJ · DIEESE"
          descricao="Valor oficial mensal da cesta básica do Rio de Janeiro apurado pelo DIEESE (PNCBA), no mesmo período dos encartes do gráfico ao lado. Referência nacional: 13 alimentos com pesos fixos — compare com a nossa cesta calculada dos encartes."
        />
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
            {deltaChip('vs mês anterior', resumo.variacaoMensal, 'Variação da cesta no mês mais recente')}
            {deltaChip('12 meses', resumo.variacao12m, 'Variação em 12 meses (mesmo mês do ano anterior)')}
            {deltaChip('no ano', resumo.variacaoNoAno, 'Variação acumulada desde o início do ano')}
            {variacaoPeriodo != null
              ? deltaChip('no período', variacaoPeriodo, `Variação de ${rotuloMes(serie[0].data)} a ${rotuloMes(serie[serie.length - 1].data)} (mesmo período dos encartes)`)
              : null}
          </Stack>

          {option ? (
            <EChart option={option} height={190} loading={carregando} />
          ) : (
            <Typography color="text.secondary" variant="body2" sx={{ py: 6, textAlign: 'center' }}>
              Período dos encartes sem dados DIEESE.
            </Typography>
          )}

          {ultimos.length > 0 ? (
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

          <Typography variant="caption" color="text.disabled" component="div" sx={{ mt: 1 }}>
            Fonte: DIEESE — Pesquisa Nacional da Cesta Básica de Alimentos (via SGS/Banco Central e boletins mensais). Valor em R$ da cesta da Região 1 (RJ).
          </Typography>
        </>
      ) : (
        <Typography color="text.secondary" variant="body2" sx={{ py: 8, textAlign: 'center' }}>
          Sem dados DIEESE no período.
        </Typography>
      )}
    </Paper>
  );
}