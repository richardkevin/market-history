'use client';

import { useMemo } from 'react';
import Paper from '@mui/material/Paper';
import Typography from '@mui/material/Typography';
import EChart from '@/components/charts/EChart';
import InfoTitulo from '@/components/InfoTitulo';
import { brl, chartCores } from '@/lib/utils';
import { dataReferencia, chaveMes, grupoCesta, rotuloPeriodo, formatarPct, precosGruposCesta, precosGruposSelecao } from '@/lib/historico';
import type { Produto } from '@/lib/types';

interface ChartCestaBasicaProps {
  itens: Produto[];
  escuro: boolean;
  carregando: boolean;
}

interface VarGrupo {
  pct: number | null;
  mesAnterior?: string;
  mesAtual?: string;
}

/**
 * Variação do preço médio do grupo entre os dois meses mais recentes em que
 * ele apareceu nos encartes (por produto, vale o registro mais recente do mês).
 */
export function variacaoMensalGrupo(itens: Produto[], grupoAlvo: string): VarGrupo {
  const medias = new Map<string, Map<string, { t: number; preco: number }>>();
  for (const p of itens) {
    if (
      !p.produto ||
      p.preco == null ||
      (grupoCesta(p.produto) !== grupoAlvo && p.produto !== grupoAlvo)
    )
      continue;
    const d = dataReferencia(p);
    if (!d) continue;
    const mes = chaveMes(d);
    let porProduto = medias.get(mes);
    if (!porProduto) {
      porProduto = new Map();
      medias.set(mes, porProduto);
    }
    const antigo = porProduto.get(p.produto);
    if (!antigo || d.getTime() > antigo.t) porProduto.set(p.produto, { t: d.getTime(), preco: p.preco });
  }

  const meses = [...medias.keys()].sort();
  if (meses.length < 2) return { pct: null };

  const media = (mes: string) => {
    const vs = [...medias.get(mes)!.values()].map((x) => x.preco).filter((v) => v > 0);
    return vs.length ? vs.reduce((a, b) => a + b, 0) / vs.length : 0;
  };
  const [mesAnterior, mesAtual] = meses.slice(-2);
  const anterior = media(mesAnterior);
  const atual = media(mesAtual);
  if (!(anterior > 0)) return { pct: null, mesAnterior, mesAtual };
  return { pct: ((atual - anterior) / anterior) * 100, mesAnterior, mesAtual };
}

export default function ChartCestaBasica({ itens, escuro, carregando }: ChartCestaBasicaProps) {
  const gruposCesta = useMemo(() => precosGruposCesta(itens), [itens]);
  const modoSelecao = gruposCesta.length === 0 && itens.length > 0;
  const grupos = useMemo(
    () => (modoSelecao ? precosGruposSelecao(itens).slice(0, 16) : gruposCesta),
    [modoSelecao, itens, gruposCesta]
  );
  const nGrupos = grupos.length;

  const variacoes = useMemo(() => {
    const mapa = new Map<string, VarGrupo>();
    for (const g of grupos) mapa.set(g.grupo, variacaoMensalGrupo(itens, g.grupo));
    return mapa;
  }, [itens, grupos]);

  const option = useMemo(() => {
    if (!grupos.length) return null;
    const cores = escuro ? chartCores.dark : chartCores.light;
    const ordenados = [...grupos].reverse();

    const rotuloVariacao = (dataIndex: number, preco: number) => {
      const g = ordenados[dataIndex];
      const v = g ? variacoes.get(g.grupo) : undefined;
      if (!v?.pct || !v.mesAnterior) return brl.format(preco);
      const seta = v.pct > 0 ? '▲' : '▼';
      const estilo = v.pct > 0 ? 'alta' : 'baixa';
      return `${brl.format(preco)}  {${estilo}|${seta} ${formatarPct(v.pct)}}`;
    };

    return {
      backgroundColor: 'transparent',
      tooltip: {
        trigger: 'item' as const,
        backgroundColor: cores.tooltipBg,
        borderWidth: 0,
        textStyle: { color: cores.text },
        formatter: (p: { dataIndex: number }) => {
          const g = ordenados[p.dataIndex];
          if (!g) return '';
          const v = variacoes.get(g.grupo);
          const linhaVar =
            v?.pct != null && v.mesAnterior && v.mesAtual
              ? `vs ${rotuloPeriodo(v.mesAnterior)}: <b style="color:${v.pct > 0 ? '#dc2626' : '#16a34a'}">${formatarPct(v.pct)}</b>`
              : 'sem mês anterior para comparar';
          return [
            `<b>${g.grupo}</b>`,
            `Média de ${g.nProdutos} produto${g.nProdutos > 1 ? 's' : ''}: <b>${brl.format(g.precoMedio)}</b>`,
            linhaVar,
            g.exemplos.length ? `<span style="opacity:.7">${g.exemplos.join(' · ')}</span>` : '',
          ]
            .filter(Boolean)
            .join('<br/>');
        },
      },
      grid: { left: 8, right: 96, top: 8, bottom: 8, containLabel: true },
      xAxis: {
        type: 'value' as const,
        axisLabel: { color: cores.muted, fontSize: 11 },
        splitLine: { lineStyle: { color: cores.split } },
      },
      yAxis: {
        type: 'category' as const,
        data: ordenados.map((g) => (modoSelecao ? g.grupo : `${g.grupo} (${g.nProdutos})`)),
        axisLabel: { color: cores.text, fontSize: 11 },
        axisLine: { show: false },
        axisTick: { show: false },
      },
      series: [
        {
          type: 'bar' as const,
          barMaxWidth: 18,
          data: ordenados.map((g) => Number(g.precoMedio.toFixed(2))),
          itemStyle: {
            borderRadius: [0, 9, 9, 0],
            color: {
              type: 'linear' as const,
              x: 0, y: 0, x2: 1, y2: 0,
              colorStops: [
                { offset: 0, color: escuro ? '#4ade80' : '#22c55e' },
                { offset: 1, color: escuro ? '#fb923c' : '#f97316' },
              ],
            },
          },
          label: {
            show: true,
            position: 'right' as const,
            fontSize: 10,
            color: cores.muted,
            formatter: (p: { dataIndex: number; value: number }) => rotuloVariacao(p.dataIndex, p.value),
            rich: {
              alta: { color: '#dc2626', fontWeight: 'bold' as const, fontSize: 10 },
              baixa: { color: '#16a34a', fontWeight: 'bold' as const, fontSize: 10 },
            },
          },
        },
      ],
    };
  }, [grupos, variacoes, escuro, modoSelecao]);

  return (
    <Paper variant="outlined" sx={{ p: 2.5 }}>
      <InfoTitulo
        titulo={modoSelecao ? 'Produtos selecionados · preço médio' : 'Cesta básica · preço médio por grupo'}
        descricao={
          modoSelecao
            ? 'Preço do registro mais recente de cada produto marcado na tabela. ▲/▼ é a variação da média mensal vs. mês anterior.'
            : 'Itens similares são agrupados (ex.: todos os arrozes viram “ARROZ”) e o valor é a média do preço mais recente de cada produto do grupo. O número ao lado do grupo indica quantos produtos entraram na média; ▲/▼ é a variação da média mensal do grupo vs. mês anterior.'
        }
      />
      {!option && !carregando ? (
        <Typography color="text.secondary" variant="body2" sx={{ py: 10, textAlign: 'center' }}>
          {modoSelecao ? 'Nenhum preço registrado para os itens selecionados.' : 'Nenhum item da cesta básica encontrado.'}
        </Typography>
      ) : (
        <EChart option={option ?? {}} height={Math.max(300, nGrupos * 26)} loading={carregando} />
      )}
    </Paper>
  );
}
