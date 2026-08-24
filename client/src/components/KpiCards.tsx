'use client';

import { useEffect, useMemo, useState } from 'react';
import Grid from '@mui/material/Grid';
import Link from '@mui/material/Link';
import Skeleton from '@mui/material/Skeleton';
import Typography from '@mui/material/Typography';
import Inventory2Outlined from '@mui/icons-material/Inventory2Outlined';
import TrendingUpOutlined from '@mui/icons-material/TrendingUpOutlined';
import ShoppingCartOutlined from '@mui/icons-material/ShoppingCartOutlined';
import CompareArrowsOutlined from '@mui/icons-material/CompareArrowsOutlined';
import StatCard from '@/components/StatCard';
import { indiceCestaEncadeada, rotuloPeriodo } from '@/lib/historico';
import type { Produto } from '@/lib/types';

interface KpiCardsProps {
  carregando: boolean;
  totalProdutos: number;
  /** registros da cesta básica, para o índice de inflação dos encartes */
  produtosCesta: Produto[];
  carregandoCesta: boolean;
}

interface PontoIpca {
  mes: string; // YYYY-MM
  pct: number;
}

interface Comparacao {
  fim: string;
  nMeses: number;
  encMensal: number;
  encAnual: number;
  ipcaMensal: number | null;
  ipcaAnual: number | null;
  diferenca: number | null;
}

const fmtPct = (v: number | null) =>
  v == null ? '—' : `${v > 0 ? '+' : ''}${v.toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%`;

/**
 * Cartões de destaque. Inclui a comparação entre o IPCA oficial (IBGE,
 * série mensal) e o inflado registrado pelos próprios encartes — mensal
 * e acumulado nos últimos 12 meses.
 */
export default function KpiCards({
  carregando,
  totalProdutos,
  produtosCesta,
  carregandoCesta,
}: KpiCardsProps) {
  const [serieIpca, setSerieIpca] = useState<PontoIpca[] | null>(null);
  const [erroIpca, setErroIpca] = useState(false);

  useEffect(() => {
    let vivo = true;
    fetch('/api/ipca')
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((d) => {
        if (vivo) setSerieIpca(d.serie ?? []);
      })
      .catch(() => {
        if (vivo) setErroIpca(true);
      });
    return () => {
      vivo = false;
    };
  }, []);

  const comparacao = useMemo<Comparacao | null>(() => {
    const indice = indiceCestaEncadeada(produtosCesta, { granularidade: 'mes' });
    if (indice.length < 2) return null;

    // último mês presente nas duas séries (ou só na dos encartes)
    const ultimoIndice = indice[indice.length - 1].data.slice(0, 7);
    const ultimoIpca = serieIpca?.length ? serieIpca[serieIpca.length - 1].mes : ultimoIndice;
    const fim = ultimoIndice < ultimoIpca ? ultimoIndice : ultimoIpca;

    // janela de até 12 variações mensais do índice encadeado
    const janela = indice.filter((p) => p.data.slice(0, 7) <= fim).slice(-13);
    if (janela.length < 2) return null;

    let fator = 1;
    for (let i = 1; i < janela.length; i++) fator *= janela[i].indice / janela[i - 1].indice;
    const encAnual = (fator - 1) * 100;
    const encMensal =
      (janela[janela.length - 1].indice / janela[janela.length - 2].indice - 1) * 100;

    let ipcaMensal: number | null = null;
    let ipcaAnual: number | null = null;
    if (serieIpca && serieIpca.length) {
      ipcaMensal = serieIpca.find((p) => p.mes === fim)?.pct ?? null;
      let fi = 1;
      for (const p of serieIpca.filter((x) => x.mes <= fim).slice(-12)) fi *= 1 + p.pct / 100;
      ipcaAnual = (fi - 1) * 100;
    }

    return {
      fim,
      nMeses: janela.length - 1,
      encMensal,
      encAnual,
      ipcaMensal,
      ipcaAnual,
      diferenca: ipcaAnual != null ? encAnual - ipcaAnual : null,
    };
  }, [produtosCesta, serieIpca]);

  const aguardandoCesta = carregandoCesta || (!comparacao && !erroIpca);

  return (
    <Grid container spacing={2} sx={{ mb: 1 }}>
      <Grid size={{ xs: 12, sm: 6, md: 3 }}>
        {carregando ? (
          <Skeleton variant="rounded" height={96} />
        ) : (
          <StatCard
            titulo="Total de produtos"
            valor={String(totalProdutos)}
            sub="registros nos encartes"
            icon={<Inventory2Outlined />}
            cor="primary"
          />
        )}
      </Grid>
      <Grid size={{ xs: 12, sm: 6, md: 3 }}>
        {aguardandoCesta ? (
          <Skeleton variant="rounded" height={96} />
        ) : (
          <StatCard
            titulo="IPCA oficial · 12 meses"
            valor={fmtPct(comparacao?.ipcaAnual ?? null)}
            sub={
              erroIpca
                ? 'indisponível'
                : comparacao
                  ? `mensal ${fmtPct(comparacao.ipcaMensal)} · até ${rotuloPeriodo(comparacao.fim)}`
                  : 'sem período comparável'
            }
            icon={<TrendingUpOutlined />}
            cor="secondary"
          />
        )}
      </Grid>
      <Grid size={{ xs: 12, sm: 6, md: 3 }}>
        {aguardandoCesta ? (
          <Skeleton variant="rounded" height={96} />
        ) : (
          <StatCard
            titulo="Seus encartes · 12 meses"
            valor={fmtPct(comparacao?.encAnual ?? null)}
            sub={
              comparacao
                ? `mensal ${fmtPct(comparacao.encMensal)} · ${comparacao.nMeses} meses`
                : 'sem período comparável'
            }
            icon={<ShoppingCartOutlined />}
            cor="info"
          />
        )}
      </Grid>
      <Grid size={{ xs: 12, sm: 6, md: 3 }}>
        {aguardandoCesta ? (
          <Skeleton variant="rounded" height={96} />
        ) : (
          <StatCard
            titulo="Diferença · 12 meses"
            valor={
              comparacao?.diferenca != null
                ? `${comparacao.diferenca > 0 ? '+' : ''}${comparacao.diferenca.toLocaleString('pt-BR', { maximumFractionDigits: 1 })} p.p.`
                : '—'
            }
            sub={
              comparacao?.diferenca != null
                ? comparacao.diferenca > 0
                  ? 'encartes acima do IPCA'
                  : comparacao.diferenca < 0
                    ? 'encartes abaixo do IPCA'
                    : 'empatados com o IPCA'
                : 'sem base de comparação'
            }
            icon={<CompareArrowsOutlined />}
            cor={(comparacao?.diferenca ?? 0) > 0 ? 'error' : 'success'}
          />
        )}
      </Grid>
      <Typography variant="caption" color="text.disabled" sx={{ display: 'block', mb: 2, px: 0.5 }}>
        Inflação dos encartes × IPCA no mesmo período · fonte oficial:{' '}
        <Link href="https://www.ibge.gov.br/explica/inflacao.php" target="_blank" rel="noopener noreferrer">
          IBGE — Inflação (IPCA)
        </Link>
      </Typography>
    </Grid>
  );
}
