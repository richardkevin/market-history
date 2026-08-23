'use client';

import { useMemo, useState } from 'react';
import Paper from '@mui/material/Paper';
import Stack from '@mui/material/Stack';
import Chip from '@mui/material/Chip';
import Typography from '@mui/material/Typography';
import Table from '@mui/material/Table';
import TableBody from '@mui/material/TableBody';
import TableCell from '@mui/material/TableCell';
import TableContainer from '@mui/material/TableContainer';
import TableHead from '@mui/material/TableHead';
import TablePagination from '@mui/material/TablePagination';
import TableRow from '@mui/material/TableRow';
import TableSortLabel from '@mui/material/TableSortLabel';
import Box from '@mui/material/Box';
import Skeleton from '@mui/material/Skeleton';
import Tooltip from '@mui/material/Tooltip';
import { brl } from '@/lib/utils';
import { formatarDataCurta, formatarPct } from '@/lib/historico';
import type { Variacao } from '@/lib/historico';

interface TabelaVariacaoProps {
  variacoes: Variacao[];
  carregando: boolean;
  onSelecionarProduto: (produto: string) => void;
}

type Coluna =
  | 'produto'
  | 'categoria'
  | 'precoAnterior'
  | 'precoAtual'
  | 'delta'
  | 'pct';

const CABECALHOS: Record<Coluna, string> = {
  produto: 'Produto',
  categoria: 'Categoria',
  precoAnterior: 'Anterior',
  precoAtual: 'Atual',
  delta: 'Δ (R$)',
  pct: 'Δ (%)',
};

type Direcao = 'asc' | 'desc';

export default function TabelaVariacao({ variacoes, carregando, onSelecionarProduto }: TabelaVariacaoProps) {
  const [ordem, setOrdem] = useState<Coluna>('pct');
  const [direcao, setDirecao] = useState<Direcao>('desc');
  const [pagina, setPagina] = useState(0);
  const [porPagina, setPorPagina] = useState(10);

  const linhas = useMemo(() => {
    const fator = direcao === 'asc' ? 1 : -1;
    return [...variacoes].sort((a, b) => {
      if (ordem === 'produto' || ordem === 'categoria') {
        const va = (ordem === 'produto' ? a.produto : a.categoria ?? '').toLowerCase();
        const vb = (ordem === 'produto' ? b.produto : b.categoria ?? '').toLowerCase();
        return va.localeCompare(vb, 'pt-BR') * fator;
      }
      return ((a[ordem] as number) - (b[ordem] as number)) * fator;
    });
  }, [variacoes, ordem, direcao]);

  const ordenar = (coluna: Coluna) => {
    if (ordem === coluna) {
      setDirecao((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setOrdem(coluna);
      setDirecao(coluna === 'produto' || coluna === 'categoria' ? 'asc' : coluna === 'pct' ? 'desc' : 'desc');
    }
    setPagina(0);
  };

  const paginaSlice = linhas.slice(pagina * porPagina, pagina * porPagina + porPagina);

  return (
    <Paper variant="outlined">
      <Stack
        direction="row"
        spacing={2}
        sx={{ px: 2.5, pt: 2.5, alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap' }}
        useFlexGap
      >
        <Typography variant="h6">O que mudou no último encarte</Typography>
        {!carregando && (
          <Stack direction="row" spacing={1}>
            <Chip size="small" color="error" variant="outlined" label={`${variacoes.filter((v) => v.pct > 0).length} em alta`} />
            <Chip size="small" color="success" variant="outlined" label={`${variacoes.filter((v) => v.pct < 0).length} em queda`} />
            <Chip size="small" variant="outlined" label={`${variacoes.length} comparados`} />
          </Stack>
        )}
      </Stack>

      <TableContainer sx={{ maxHeight: 560 }}>
        <Table stickyHeader size="small" aria-label="variação de preços">
          <TableHead>
            <TableRow>
              {(Object.keys(CABECALHOS) as Coluna[]).map((c) => (
                <TableCell key={c} align={c === 'produto' || c === 'categoria' ? 'left' : 'right'} sortDirection={ordem === c ? direcao : false}>
                  <TableSortLabel active={ordem === c} direction={ordem === c ? direcao : 'asc'} onClick={() => ordenar(c)}>
                    {CABECALHOS[c]}
                  </TableSortLabel>
                </TableCell>
              ))}
              <TableCell>Período</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {carregando
              ? Array.from({ length: 10 }).map((_, i) => (
                  <TableRow key={i}>
                    {Array.from({ length: 7 }).map((_, j) => (
                      <TableCell key={j}>
                        <Skeleton height={24} />
                      </TableCell>
                    ))}
                  </TableRow>
                ))
              : paginaSlice.map((v) => {
                  const cor = v.pct > 0.05 ? 'error.main' : v.pct < -0.05 ? 'success.main' : 'text.secondary';
                  const sinal = v.pct > 0 ? '▲ ' : v.pct < 0 ? '▼ ' : '';
                  return (
                    <TableRow
                      key={`${v.produto}-${v.dataAtual}`}
                      hover
                      onClick={() => onSelecionarProduto(v.produto)}
                      sx={{ cursor: 'pointer' }}
                    >
                      <TableCell>
                        <Box sx={{ minWidth: 0, maxWidth: 340 }}>
                          <Typography variant="body2" noWrap sx={{ fontWeight: 600 }}>
                            {v.produto}
                          </Typography>
                          <Typography variant="caption" color="text.secondary" component="div">
                            {[v.marca, v.medidaAtual].filter(Boolean).join(' · ') || '—'}
                          </Typography>
                        </Box>
                      </TableCell>
                      <TableCell>
                        {v.categoria ? (
                          <Typography variant="body2" noWrap sx={{ maxWidth: 140 }}>
                            {v.categoria}
                          </Typography>
                        ) : (
                          '—'
                        )}
                      </TableCell>
                      <TableCell align="right">
                        <Typography variant="body2">{brl.format(v.precoAnterior)}</Typography>
                        <Typography variant="caption" color="text.secondary">
                          {formatarDataCurta(v.dataAnterior)}
                        </Typography>
                      </TableCell>
                      <TableCell align="right">
                        <Typography variant="body2" sx={{ fontWeight: 600 }}>
                          {brl.format(v.precoAtual)}
                          {v.precoClubeAtual != null && (
                            <Tooltip title="Preço Clube atual">
                              <Typography variant="caption" component="span" color="success.main" sx={{ ml: 0.5 }}>
                                ({brl.format(v.precoClubeAtual)})
                              </Typography>
                            </Tooltip>
                          )}
                        </Typography>
                        <Typography variant="caption" color="text.secondary" component="div">
                          {formatarDataCurta(v.dataAtual)}
                        </Typography>
                      </TableCell>
                      <TableCell align="right" sx={{ color: cor }}>
                        {sinal}
                        {brl.format(Math.abs(v.delta))}
                      </TableCell>
                      <TableCell align="right" sx={{ color: cor, fontWeight: 700 }}>
                        {formatarPct(v.pctUnitario ?? v.pct)}
                        {v.mudouEmbalagem && v.pctUnitario != null && Math.abs(v.pctUnitario - v.pct) > 0.15 && (
                          <Tooltip title={`Embalagem mudou (${v.medidaAtual}). Valor nominal: ${formatarPct(v.pct)}`}>
                            <Typography variant="caption" component="div" color="warning.main">
                              ⚠ por unidade
                            </Typography>
                          </Tooltip>
                        )}
                      </TableCell>
                      <TableCell>
                        <Typography variant="caption" color="text.secondary" noWrap>
                          {formatarDataCurta(v.dataAnterior)} → {formatarDataCurta(v.dataAtual)}
                        </Typography>
                      </TableCell>
                    </TableRow>
                  );
                })}
          </TableBody>
        </Table>
      </TableContainer>
      {!carregando && (
        <TablePagination
          component="div"
          count={linhas.length}
          page={pagina}
          onPageChange={(_, nova) => setPagina(nova)}
          rowsPerPage={porPagina}
          onRowsPerPageChange={(e) => {
            setPorPagina(parseInt(e.target.value, 10));
            setPagina(0);
          }}
          rowsPerPageOptions={[10, 25, 50]}
          labelRowsPerPage="Linhas:"
          labelDisplayedRows={({ from, to, count }) =>
            `${from}–${to} de ${count !== -1 ? count : `mais de ${to}`}`
          }
        />
      )}
    </Paper>
  );
}
