'use client';

import { useEffect, useMemo, useState } from 'react';
import { alpha, useTheme } from '@mui/material/styles';
import Box from '@mui/material/Box';
import Paper from '@mui/material/Paper';
import Skeleton from '@mui/material/Skeleton';
import Stack from '@mui/material/Stack';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import TrendingUpOutlined from '@mui/icons-material/TrendingUpOutlined';
import InfoTitulo from '@/components/InfoTitulo';
import { indiceCestaEncadeada } from '@/lib/historico';
import type { Produto } from '@/lib/types';

interface CardInflacaoProps {
  produtos: Produto[];
  carregando: boolean;
}

interface PontoIpca {
  mes: string; // YYYY-MM
  pct: number;
}

/**
 * IPCA acumulado (BCB série 433) no mesmo intervalo do índice encadeado
 * dos produtos, para comparação direta.
 */
export default function CardInflacao({ produtos, carregando }: CardInflacaoProps) {
  const [serieIpca, setSerieIpca] = useState<PontoIpca[] | null>(null);
  const [erroIpca, setErroIpca] = useState(false);

  useEffect(() => {
    fetch('/api/ipca')
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((d) => setSerieIpca(d.serie ?? []))
      .catch(() => setErroIpca(true));
  }, []);

  const comparacao = useMemo(() => {
    const indice = indiceCestaEncadeada(produtos);
    if (indice.length < 2) return null;
    const inicio = indice[0].data.slice(0, 7); // YYYY-MM
    const fim = indice[indice.length - 1].data.slice(0, 7);
    const pctProdutos = indice[indice.length - 1].indice - 100;

    let pctIpca: number | null = null;
    let mesesContados = 0;
    if (serieIpca && serieIpca.length) {
      let fator = 1;
      for (const ponto of serieIpca) {
        if (ponto.mes > inicio && ponto.mes <= fim) {
          fator *= 1 + ponto.pct / 100;
          mesesContados += 1;
        }
      }
      pctIpca = (fator - 1) * 100;
    }
    return {
      inicio,
      fim,
      pctProdutos,
      pctIpca,
      mesesContados,
      diferenca: pctIpca != null ? pctProdutos - pctIpca : null,
    };
  }, [produtos, serieIpca]);

  const theme = useTheme();

  return (
    <Paper variant="outlined" sx={{ p: 2.5 }}>
      <InfoTitulo
        titulo="IPCA oficial × seus produtos"
        descricao="Acumulado do IPCA (IBGE via Banco Central) no mesmo período do índice encadeado dos produtos dos encartes. Diferença positiva significa que os encartes subiram mais que a inflação oficial."
      />
      {carregando || (!comparacao && !erroIpca) ? (
        <Skeleton variant="rounded" height={72} sx={{ mt: 1.5 }} />
      ) : !comparacao ? (
        <Typography color="text.secondary" variant="body2" sx={{ py: 3, textAlign: 'center' }}>
          Sem dados suficientes para comparar.
        </Typography>
      ) : (
        <Stack direction="row" spacing={2} sx={{ mt: 1.5, alignItems: 'stretch', flexWrap: 'wrap' }} useFlexGap>
          <ValorInflacao
            rotulo={`IPCA oficial`}
            valor={comparacao.pctIpca}
            detalhe={
              comparacao.pctIpca == null
                ? erroIpca
                  ? 'indisponível'
                  : 'carregando…'
                : `${comparacao.mesesContados} meses`
            }
            cor="secondary"
          />
          <Box sx={{ display: 'grid', placeItems: 'center', color: 'text.disabled', px: 0.5 }}>
            <Typography variant="h6" component="span">vs</Typography>
          </Box>
          <ValorInflacao
            rotulo="Produtos nos encartes"
            valor={comparacao.pctProdutos}
            detalhe={`${comparacao.inicio.replace('-', '/')} → ${comparacao.fim.replace('-', '/')}`}
            cor={comparacao.pctProdutos <= 0 ? 'success' : 'error'}
          />
          {comparacao.diferenca != null && (
            <Box
              sx={{
                ml: 'auto',
                alignSelf: 'center',
                textAlign: 'right',
                color:
                  comparacao.diferenca > 0
                    ? theme.palette.error.main
                    : theme.palette.success.main,
              }}
            >
              <Tooltip
                title={
                  comparacao.diferenca > 0
                    ? 'Os produtos acompanhados subiram mais que o IPCA no período.'
                    : 'Os produtos acompanhados subiram menos que o IPCA no período.'
                }
              >
                <Typography variant="caption" component="div" sx={{ fontWeight: 700 }}>
                  {comparacao.diferenca > 0 ? '+' : ''}
                  {comparacao.diferenca.toLocaleString('pt-BR', {
                    maximumFractionDigits: 1,
                  })} p.p.
                </Typography>
              </Tooltip>
              <Typography variant="caption" color="text.secondary" component="div">
                diferença
              </Typography>
            </Box>
          )}
        </Stack>
      )}
    </Paper>
  );
}

function ValorInflacao({
  rotulo,
  valor,
  detalhe,
  cor,
}: {
  rotulo: string;
  valor: number | null;
  detalhe: string;
  cor: 'secondary' | 'success' | 'error';
}) {
  const theme = useTheme();
  const main = theme.palette[cor].main;
  return (
    <Box
      sx={{
        flex: '1 1 160px',
        display: 'flex',
        gap: 1.25,
        alignItems: 'center',
        p: 1.25,
        borderRadius: 2.5,
        border: '1px solid',
        borderColor: 'divider',
      }}
    >
      <Box
        sx={{
          width: 40,
          height: 40,
          flexShrink: 0,
          borderRadius: 2,
          display: 'grid',
          placeItems: 'center',
          color: main,
          bgcolor: alpha(main, 0.14),
        }}
      >
        <TrendingUpOutlined />
      </Box>
      <Box sx={{ minWidth: 0 }}>
        <Typography variant="caption" color="text.secondary" component="div" noWrap>
          {rotulo}
        </Typography>
        <Typography variant="h5" sx={{ fontWeight: 800, lineHeight: 1.15 }} component="div">
          {valor != null
            ? `${valor > 0 ? '+' : ''}${valor.toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%`
            : '—'}
        </Typography>
        <Typography variant="caption" color="text.secondary" component="div" noWrap>
          {detalhe}
        </Typography>
      </Box>
    </Box>
  );
}
