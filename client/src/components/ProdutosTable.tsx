'use client';

import { useState } from 'react';
import { alpha } from '@mui/material/styles';
import Paper from '@mui/material/Paper';
import Stack from '@mui/material/Stack';
import Chip from '@mui/material/Chip';
import Button from '@mui/material/Button';
import Typography from '@mui/material/Typography';
import Table from '@mui/material/Table';
import TableBody from '@mui/material/TableBody';
import TableCell from '@mui/material/TableCell';
import TableContainer from '@mui/material/TableContainer';
import TableHead from '@mui/material/TableHead';
import TablePagination from '@mui/material/TablePagination';
import TableRow from '@mui/material/TableRow';
import Avatar from '@mui/material/Avatar';
import Box from '@mui/material/Box';
import Skeleton from '@mui/material/Skeleton';
import Tooltip from '@mui/material/Tooltip';
import InboxOutlined from '@mui/icons-material/InboxOutlined';
import LocalOfferOutlined from '@mui/icons-material/LocalOfferOutlined';
import { brl, AVATAR_COLORS, iniciais } from '@/lib/utils';
import type { Produto } from '@/lib/types';

interface ProdutosTableProps {
  produtos: Produto[];
  carregando: boolean;
  onLimparFiltros: () => void;
  /** clique numa linha abre o painel de detalhe do produto */
  onAbrirDetalhe?: (produto: Produto) => void;
}

export default function ProdutosTable({ produtos, carregando, onLimparFiltros, onAbrirDetalhe }: ProdutosTableProps) {
  const [pagina, setPagina] = useState(0);
  const [porPagina, setPorPagina] = useState(10);
  const [produtosAnteriores, setProdutosAnteriores] = useState(produtos);

  if (produtos !== produtosAnteriores) {
    setProdutosAnteriores(produtos);
    setPagina(0);
  }

  const paginaSlice = produtos.slice(pagina * porPagina, pagina * porPagina + porPagina);

  return (
    <Paper variant="outlined">
      <Stack
        direction="row"
        spacing={2}
        sx={{ px: 2.5, pt: 2.5, alignItems: 'center', justifyContent: 'space-between' }}
      >
        <Typography variant="h6">Produtos</Typography>
        {!carregando && <Chip size="small" label={`${produtos.length} itens`} />}
      </Stack>

      {!carregando && produtos.length === 0 ? (
        <Stack spacing={1} sx={{ py: 8, alignItems: 'center' }}>
          <InboxOutlined sx={{ fontSize: 48, color: 'text.disabled' }} />
          <Typography color="text.secondary">
            Nenhum produto encontrado com esses filtros.
          </Typography>
          <Button size="small" onClick={onLimparFiltros}>
            Limpar filtros
          </Button>
        </Stack>
      ) : (
        <>
          <TableContainer sx={{ maxHeight: 520 }}>
            <Table stickyHeader size="small" aria-label="lista de produtos">
              <TableHead>
                <TableRow>
                  <TableCell>Produto</TableCell>
                  <TableCell>Marca</TableCell>
                  <TableCell align="right">Preço</TableCell>
                  <TableCell align="right">Clube</TableCell>
                  <TableCell>Promoção</TableCell>
                  <TableCell>Data</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {carregando
                  ? Array.from({ length: 8 }).map((_, i) => (
                      <TableRow key={i}>
                        {Array.from({ length: 6 }).map((_, j) => (
                          <TableCell key={j}>
                            <Skeleton height={24} />
                          </TableCell>
                        ))}
                      </TableRow>
                    ))
                  : paginaSlice.map((p, i) => {
                      const temDesconto =
                        p.preco && p.preco_clube && p.preco_clube < p.preco;
                      const desconto = temDesconto
                        ? Math.round((1 - (p.preco_clube as number) / (p.preco as number)) * 100)
                        : null;
                      return (
                        <TableRow
                      key={p.id}
                      hover
                      onClick={() => onAbrirDetalhe?.(p)}
                      sx={{ cursor: onAbrirDetalhe ? 'pointer' : 'default' }}
                    >
                          <TableCell>
                            <Stack direction="row" spacing={1.5} sx={{ alignItems: 'center' }}>
                              <Avatar
                                sx={{
                                  width: 34,
                                  height: 34,
                                  fontSize: 12,
                                  fontWeight: 700,
                                  bgcolor: alpha(AVATAR_COLORS[(p.id + i) % AVATAR_COLORS.length], 0.15),
                                  color: AVATAR_COLORS[(p.id + i) % AVATAR_COLORS.length],
                                }}
                              >
                                {iniciais(p.produto)}
                              </Avatar>
                              <Box sx={{ minWidth: 0, maxWidth: 320 }}>
                                <Typography variant="body2" noWrap sx={{ fontWeight: 600 }}>
                                  {p.produto}
                                </Typography>
                                {p.medida && (
                                  <Typography variant="caption" color="text.secondary">
                                    {p.medida}
                                  </Typography>
                                )}
                              </Box>
                            </Stack>
                          </TableCell>
                          <TableCell>
                            {p.marca ? (
                              <Chip label={p.marca} size="small" variant="outlined" />
                            ) : (
                              '—'
                            )}
                          </TableCell>
                          <TableCell align="right">
                            <Typography variant="body2" sx={{ fontWeight: 600 }}>
                              {p.preco != null ? brl.format(p.preco) : '—'}
                            </Typography>
                          </TableCell>
                          <TableCell align="right">
                            {temDesconto ? (
                              <Tooltip title={`${desconto}% de desconto`}>
                                <Chip
                                  size="small"
                                  color="success"
                                  label={brl.format(p.preco_clube as number)}
                                />
                              </Tooltip>
                            ) : p.preco_clube != null ? (
                              brl.format(p.preco_clube)
                            ) : (
                              '—'
                            )}
                          </TableCell>
                          <TableCell>
                            {p.tipo_promocao ? (
                              <Chip
                                size="small"
                                color="secondary"
                                variant="outlined"
                                icon={<LocalOfferOutlined sx={{ fontSize: 14 }} />}
                                label={p.tipo_promocao}
                              />
                            ) : (
                              '—'
                            )}
                          </TableCell>
                          <TableCell>
                            <Typography variant="body2" color="text.secondary">
                              {p.data_encarte || p.created_at.substring(0, 10)}
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
              count={produtos.length}
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
        </>
      )}
    </Paper>
  );
}
