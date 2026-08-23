'use client';

import { useMemo, useState } from 'react';
import { alpha } from '@mui/material/styles';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Collapse from '@mui/material/Collapse';
import Grid from '@mui/material/Grid';
import Paper from '@mui/material/Paper';
import Skeleton from '@mui/material/Skeleton';
import Stack from '@mui/material/Stack';
import Tooltip from '@mui/material/Tooltip';
import ToggleButton from '@mui/material/ToggleButton';
import ToggleButtonGroup from '@mui/material/ToggleButtonGroup';
import Typography from '@mui/material/Typography';
import ExpandLessOutlined from '@mui/icons-material/ExpandLessOutlined';
import ExpandMoreOutlined from '@mui/icons-material/ExpandMoreOutlined';
import TrendingUpOutlined from '@mui/icons-material/TrendingUpOutlined';
import TrendingDownOutlined from '@mui/icons-material/TrendingDownOutlined';
import { brl } from '@/lib/utils';
import { formatarDataCurta, formatarPct, type Variacao } from '@/lib/historico';

interface CardsDestaqueProps {
  variacoes: Variacao[];
  carregando: boolean;
  onSelecionarProduto: (produto: string) => void;
}

type Modo = 'altas' | 'quedas';

const N_CARDS = 20;
const N_VISIVEIS = 4;

export default function CardsDestaque({ variacoes, carregando, onSelecionarProduto }: CardsDestaqueProps) {
  const [modo, setModo] = useState<Modo>('altas');
  const [expandido, setExpandido] = useState(false);

  const cards = useMemo(() => {
    const validas = variacoes.filter((v) => v.pctUnitario != null || !v.mudouEmbalagem);
    const altas = [...validas].sort((a, b) => b.pct - a.pct).slice(0, N_CARDS);
    const quedas = [...validas].sort((a, b) => a.pct - b.pct).slice(0, N_CARDS);
    return modo === 'altas' ? altas : quedas;
  }, [variacoes, modo]);

  return (
    <Paper variant="outlined" sx={{ p: 2.5 }}>
      <Stack
        direction={{ xs: 'column', sm: 'row' }}
        spacing={1.5}
        useFlexGap
        sx={{
          mb: 2,
          alignItems: { sm: 'center' },
          justifyContent: 'space-between',
          flexWrap: { sm: 'wrap' },
        }}
      >
        <Typography variant="h6">Destaques do último encarte</Typography>
        <ToggleButtonGroup
          size="small"
          exclusive
          value={modo}
          onChange={(_, v) => v && setModo(v)}
        >
          <ToggleButton value="altas">
            <Stack direction="row" spacing={0.5} sx={{ alignItems: 'center' }}>
              <TrendingUpOutlined sx={{ fontSize: 16 }} />
              <Typography variant="body2">Maiores altas</Typography>
            </Stack>
          </ToggleButton>
          <ToggleButton value="quedas">
            <Stack direction="row" spacing={0.5} sx={{ alignItems: 'center' }}>
              <TrendingDownOutlined sx={{ fontSize: 16 }} />
              <Typography variant="body2">Maiores quedas</Typography>
            </Stack>
          </ToggleButton>
        </ToggleButtonGroup>
      </Stack>

      {carregando ? (
        <Grid container spacing={1.5}>
          {Array.from({ length: N_VISIVEIS }).map((_, i) => (
            <Grid size={{ xs: 12, md: 6 }} key={i}>
              <Skeleton variant="rounded" height={64} />
            </Grid>
          ))}
        </Grid>
      ) : cards.length === 0 ? (
        <Typography color="text.secondary" variant="body2" sx={{ py: 3, textAlign: 'center' }}>
          Sem produtos com histórico em dois encartes consecutivos.
        </Typography>
      ) : (
        <>
          <Grid container spacing={1.5}>
            {cards.slice(0, N_VISIVEIS).map((v) => (
              <Grid size={{ xs: 12, md: 6 }} key={`${v.produto}-${v.dataAtual}`}>
                <CardVariacao v={v} onSelecionarProduto={onSelecionarProduto} />
              </Grid>
            ))}
          </Grid>
          {cards.length > N_VISIVEIS && (
            <>
              <Collapse in={expandido}>
                <Grid container spacing={1.5} sx={{ pt: 1.5 }}>
                  {cards.slice(N_VISIVEIS).map((v) => (
                    <Grid size={{ xs: 12, md: 6 }} key={`${v.produto}-${v.dataAtual}`}>
                      <CardVariacao v={v} onSelecionarProduto={onSelecionarProduto} />
                    </Grid>
                  ))}
                </Grid>
              </Collapse>
              <Box sx={{ mt: 2, textAlign: 'center' }}>
                <Button
                  size="small"
                  onClick={() => setExpandido((e) => !e)}
                  startIcon={expandido ? <ExpandLessOutlined /> : <ExpandMoreOutlined />}
                >
                  {expandido
                    ? 'Mostrar menos'
                    : `Ver mais ${cards.length - N_VISIVEIS} destaques`}
                </Button>
              </Box>
            </>
          )}
        </>
      )}
    </Paper>
  );
}

interface CardVariacaoProps {
  v: Variacao;
  onSelecionarProduto: (produto: string) => void;
}

function CardVariacao({ v, onSelecionarProduto }: CardVariacaoProps) {
  const alta = v.pct > 0;
  const cor = alta ? 'error' : 'success';
  const pctExibicao = v.pctUnitario ?? v.pct;

  return (
    <Box
      onClick={() => onSelecionarProduto(v.produto)}
      sx={(theme) => ({
        display: 'flex',
        alignItems: 'center',
        gap: 1.5,
        p: 1.5,
        height: '100%',
        borderRadius: 2.5,
        cursor: 'pointer',
        border: '1px solid',
        borderColor: 'divider',
        transition: theme.transitions.create(['background-color', 'border-color']),
        '&:hover': { bgcolor: 'action.hover', borderColor: `${cor}.main` },
      })}
    >
      <Box
        sx={{
          width: 40,
          height: 40,
          flexShrink: 0,
          borderRadius: 2,
          display: 'grid',
          placeItems: 'center',
          color: `${cor}.main`,
          bgcolor: (t) => alpha(t.palette[cor].main, 0.14),
        }}
      >
        {alta ? <TrendingUpOutlined /> : <TrendingDownOutlined />}
      </Box>
      <Box sx={{ minWidth: 0, flex: 1 }}>
        <Tooltip title={v.produto} placement="top">
          <Typography variant="body2" noWrap sx={{ fontWeight: 600 }}>
            {v.produto}
          </Typography>
        </Tooltip>
        <Typography variant="caption" color="text.secondary" component="div" noWrap>
          {[
            v.marca,
            brl.format(v.precoAnterior),
            '→',
            brl.format(v.precoAtual),
            formatarDataCurta(v.dataAnterior),
            '→',
            formatarDataCurta(v.dataAtual),
          ].join(' ')}
        </Typography>
        {v.pctUnitario != null && Math.abs(v.pctUnitario - v.pct) > 0.15 && (
          <Tooltip
            title={`Embalagem mudou (${v.medidaAtual}). Variação real por unidade: ${formatarPct(v.pctUnitario)}`}
            placement="bottom"
          >
            <Typography variant="caption" color="warning.main" component="div">
              ⚠ embalagem mudou · {formatarPct(v.pctUnitario)} por kg/L/un
            </Typography>
          </Tooltip>
        )}
      </Box>
      <Typography variant="h6" sx={{ color: `${cor}.main`, fontWeight: 800, whiteSpace: 'nowrap' }}>
        {formatarPct(pctExibicao)}
      </Typography>
    </Box>
  );
}
