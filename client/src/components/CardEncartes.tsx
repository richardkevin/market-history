'use client';

import { useEffect, useMemo, useState } from 'react';
import Paper from '@mui/material/Paper';
import Stack from '@mui/material/Stack';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import Chip from '@mui/material/Chip';
import Skeleton from '@mui/material/Skeleton';
import TextField from '@mui/material/TextField';
import OpenInNewOutlined from '@mui/icons-material/OpenInNewOutlined';
import ImageOutlined from '@mui/icons-material/ImageOutlined';
import PictureAsPdfOutlined from '@mui/icons-material/PictureAsPdfOutlined';
import InfoTitulo from '@/components/InfoTitulo';

export interface EncarteResumo {
  arquivo: string;
  supermercado: string;
  n_produtos: number;
  data_inicio: string | null;
  data_fim: string | null;
}

interface CardEncartesProps {
  slug?: string;
}

export default function CardEncartes({ slug }: CardEncartesProps) {
  const [encartes, setEncartes] = useState<EncarteResumo[] | null>(null);
  const [filtro, setFiltro] = useState('');

  useEffect(() => {
    fetch('/api/produtos?action=encartes')
      .then((r) => r.json())
      .then((data) => setEncartes(Array.isArray(data) ? data : []))
      .catch(() => setEncartes([]));
  }, []);

  const visiveis = useMemo(() => {
    if (!encartes) return null;
    const q = filtro.trim().toLowerCase();
    if (!q) return encartes;
    return encartes.filter((e) => `${e.arquivo} ${e.supermercado}`.toLowerCase().includes(q));
  }, [encartes, filtro]);

  return (
    <Paper variant="outlined" id={slug} sx={{ p: 2.5 }}>
      <InfoTitulo
        titulo="Encartes disponíveis"
        descricao="Todos os encartes baixados, organizados por supermercado. Clique num item para abrir a imagem ou o PDF do encarte."
      />
      <TextField
        size="small"
        fullWidth
        placeholder="Filtrar encarte ou supermercado…"
        value={filtro}
        onChange={(e) => setFiltro(e.target.value)}
        sx={{ mb: 1.5 }}
      />
      {visiveis === null ? (
        <Stack spacing={1}>
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} variant="rounded" height={40} />
          ))}
        </Stack>
      ) : visiveis.length === 0 ? (
        <Typography variant="body2" color="text.secondary" sx={{ py: 4, textAlign: 'center' }}>
          {encartes?.length
            ? 'Nenhum encarte corresponde ao filtro.'
            : 'Nenhum encarte baixado ainda.'}
        </Typography>
      ) : (
        <Stack spacing={0.75} sx={{ maxHeight: 320, overflowY: 'auto', pr: 0.5 }}>
          {visiveis.map((e) => {
            const ehPdf = e.arquivo.toLowerCase().endsWith('.pdf');
            const Icone = ehPdf ? PictureAsPdfOutlined : ImageOutlined;
            return (
              <Box
                key={`${e.supermercado}/${e.arquivo}`}
                component="a"
                href={`/api/imagem?arquivo=${encodeURIComponent(e.arquivo)}`}
                target="_blank"
                rel="noreferrer"
                sx={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 1.5,
                  px: 1.25,
                  py: 0.75,
                  borderRadius: 1.5,
                  border: '1px solid',
                  borderColor: 'divider',
                  textDecoration: 'none',
                  color: 'text.primary',
                  '&:hover': { bgcolor: 'action.hover' },
                }}
              >
                <Icone sx={{ fontSize: 18, opacity: 0.7, flexShrink: 0 }} />
                <Typography variant="body2" noWrap sx={{ flex: 1, minWidth: 0 }}>
                  {e.arquivo}
                </Typography>
                <Chip size="small" variant="outlined" label={e.supermercado} sx={{ flexShrink: 0 }} />
                {e.data_fim && (
                  <Typography variant="caption" color="text.secondary" noWrap sx={{ flexShrink: 0 }}>
                    {e.data_fim}
                  </Typography>
                )}
                <Chip size="small" variant="outlined" label={`${e.n_produtos} itens`} sx={{ flexShrink: 0 }} />
                <OpenInNewOutlined sx={{ fontSize: 14, opacity: 0.6, flexShrink: 0 }} />
              </Box>
            );
          })}
        </Stack>
      )}
    </Paper>
  );
}