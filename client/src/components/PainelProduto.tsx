'use client';

import { useMemo, useState } from 'react';
import { alpha } from '@mui/material/styles';import Box from '@mui/material/Box';
import Chip from '@mui/material/Chip';
import Divider from '@mui/material/Divider';
import Drawer from '@mui/material/Drawer';
import IconButton from '@mui/material/IconButton';
import Link from '@mui/material/Link';
import Skeleton from '@mui/material/Skeleton';
import Stack from '@mui/material/Stack';
import ToggleButton from '@mui/material/ToggleButton';
import ToggleButtonGroup from '@mui/material/ToggleButtonGroup';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import CloseOutlined from '@mui/icons-material/CloseOutlined';
import OpenInNewOutlined from '@mui/icons-material/OpenInNewOutlined';
import LocalOfferOutlined from '@mui/icons-material/LocalOfferOutlined';
import EChart from '@/components/charts/EChart';
import { brl, chartCores } from '@/lib/utils';
import { useHistoricoProduto } from '@/hooks/useHistoricoProduto';
import {
  serieProduto,
  dataReferencia,
  formatarPct,
  rotuloPeriodo,
  grupoCesta,
  type Granularidade,
  type Variacao,
} from '@/lib/historico';
import type { Produto } from '@/lib/types';

interface PainelProdutoProps {
  produto: Produto | null;
  onClose: () => void;
  /** troca o produto exibido (clicar num similar) */
  onSelecionarProduto: (nome: string) => void;
  produtosCesta: Produto[];
  variacoes: Variacao[];
  escuro: boolean;
}

const LARGURA = 440;

export default function PainelProduto({
  produto,
  onClose,
  onSelecionarProduto,
  produtosCesta,
  variacoes,
  escuro,
}: PainelProdutoProps) {
  const [granularidade, setGranularidade] = useState<Granularidade>('mes');

  const nome = produto?.produto ?? '';
  const { historico, carregando: carregandoHistorico } = useHistoricoProduto(nome);

  const pontos = useMemo(
    () => (nome ? serieProduto(historico, { granularidade }) : []),
    [historico, granularidade, nome]
  );

  const maisRecente = useMemo(() => {
    if (!historico.length) return null;
    let melhor: Produto | null = null;
    let melhorTs = -Infinity;
    for (const p of historico) {
      const ts = dataReferencia(p)?.getTime() ?? -Infinity;
      if (ts > melhorTs) {
        melhorTs = ts;
        melhor = p;
      }
    }
    return melhor;
  }, [historico]);

  const similares = useMemo(() => {
    if (!produto || !produtosCesta.length) return [];
    const grupoAlvo = grupoCesta(produto.produto);
    const categoriaAlvo = produto.categoria;
    const pctPorNome = new Map(variacoes.map((v) => [v.produto, v.pct]));

    const vistos = new Set<string>();
    const lista: { nome: string; preco: number; medida: string | null; marca: string | null; pct: number | null }[] = [];
    for (const p of produtosCesta) {
      if (!p.produto || p.preco == null || p.produto === produto.produto) continue;
      if (vistos.has(p.produto)) continue;
      const mesmoGrupo = grupoAlvo != null && grupoCesta(p.produto) === grupoAlvo;
      const mesmaCategoria =
        categoriaAlvo != null && p.categoria != null && p.categoria === categoriaAlvo;
      if (!mesmoGrupo && !mesmaCategoria) continue;
      vistos.add(p.produto);
      lista.push({
        nome: p.produto,
        preco: p.preco,
        medida: p.medida,
        marca: p.marca,
        pct: pctPorNome.get(p.produto) ?? null,
      });
    }
    return lista.sort((a, b) => a.preco - b.preco).slice(0, 8);
  }, [produto, produtosCesta, variacoes]);

  const optionGrafico = useMemo(() => {
    if (!pontos.length) return null;
    const cores = escuro ? chartCores.dark : chartCores.light;
    return {
      backgroundColor: 'transparent',
      tooltip: {
        trigger: 'axis' as const,
        backgroundColor: cores.tooltipBg,
        borderWidth: 0,
        textStyle: { color: cores.text },
        valueFormatter: (v: number) => brl.format(v),
      },
      grid: { left: 8, right: 8, top: 16, bottom: 0, containLabel: true },
      xAxis: {
        type: 'category' as const,
        data: pontos.map((p) => rotuloPeriodo(p.data)),
        axisLabel: { color: cores.muted, fontSize: 9, rotate: 45, interval: Math.max(0, Math.floor(pontos.length / 8)) },
        axisLine: { lineStyle: { color: cores.split } },
        axisTick: { show: false },
      },
      yAxis: {
        type: 'value' as const,
        scale: true,
        axisLabel: { color: cores.muted, fontSize: 9, formatter: (v: number) => brl.format(v) },
        splitLine: { lineStyle: { color: cores.split } },
      },
      series: [
        {
          type: 'line',
          data: pontos.map((p) => Number((p.preco ?? 0).toFixed(2))),
          connectNulls: true,
          symbolSize: 5,
          lineStyle: { width: 2, color: cores.series[0] },
          itemStyle: { color: cores.series[0] },
          areaStyle: {
            color: {
              type: 'linear' as const,
              x: 0, y: 0, x2: 0, y2: 1,
              colorStops: [
                { offset: 0, color: `${cores.series[0]}30` },
                { offset: 1, color: `${cores.series[0]}00` },
              ],
            },
          },
        },
      ],
    };
  }, [pontos, escuro]);

  return (
    <Drawer
      anchor="right"
      open={Boolean(produto)}
      onClose={onClose}
      slotProps={{ paper: { sx: { width: { xs: '100vw', sm: LARGURA } } } }}
    >
      {produto && (
        <Stack sx={{ height: '100%' }}>
          {/* Cabeçalho */}
          <Stack direction="row" spacing={1} sx={{ p: 2, pb: 1.5, alignItems: 'flex-start', justifyContent: 'space-between' }}>
            <Box sx={{ minWidth: 0 }}>
              <Typography variant="h6" sx={{ lineHeight: 1.25 }}>
                {produto.produto}
              </Typography>
              <Typography variant="caption" color="text.secondary">
                {[produto.marca, produto.medida, produto.categoria].filter(Boolean).join(' · ') || '—'}
              </Typography>
            </Box>
            <IconButton size="small" onClick={onClose} aria-label="Fechar painel">
              <CloseOutlined fontSize="small" />
            </IconButton>
          </Stack>

          <Stack spacing={2.5} sx={{ px: 2, pb: 3, overflowY: 'auto' }}>
            {/* Último registro */}
            {maisRecente ? (
              <Stack direction="row" spacing={1} useFlexGap sx={{ flexWrap: 'wrap', alignItems: 'center' }}>
                <Chip
                  size="small"
                  color="primary"
                  label={brl.format(maisRecente.preco ?? 0)}
                />
                {maisRecente.preco_clube != null &&
                  maisRecente.preco != null &&
                  maisRecente.preco_clube < maisRecente.preco && (
                    <Tooltip title={`Clube: ${formatarPct(((maisRecente.preco - maisRecente.preco_clube) / maisRecente.preco) * 100)} de desconto`}>
                      <Chip size="small" color="success" variant="outlined" label={`${brl.format(maisRecente.preco_clube)} no clube`} />
                    </Tooltip>
                  )}
                {maisRecente.tipo_promocao && (
                  <Chip
                    size="small"
                    color="secondary"
                    variant="outlined"
                    icon={<LocalOfferOutlined sx={{ fontSize: 14 }} />}
                    label={maisRecente.tipo_promocao}
                  />
                )}
                <Chip size="small" variant="outlined" label={maisRecente.data_encarte ?? '—'} />
              </Stack>
            ) : carregandoHistorico ? (
              <Skeleton height={32} />
            ) : null}

            {/* Encarte */}
            <section>
              <Typography variant="subtitle2" gutterBottom>Encarte</Typography>
              {maisRecente?.imagem ? (
                <Link
                  href={`/api/imagem?arquivo=${encodeURIComponent(maisRecente.imagem)}`}
                  target="_blank"
                  underline="none"
                  sx={{ display: 'block', position: 'relative' }}
                >
                  <Box
                    component="img"
                    src={`/api/imagem?arquivo=${encodeURIComponent(maisRecente.imagem)}`}
                    alt={`Encarte ${maisRecente.data_encarte ?? ''}`}
                    loading="lazy"
                    sx={{
                      width: '100%',
                      maxHeight: 320,
                      objectFit: 'cover',
                      objectPosition: 'top',
                      borderRadius: 2,
                      border: '1px solid',
                      borderColor: 'divider',
                      display: 'block',
                    }}
                  />
                  <Tooltip title="Abrir página do encarte">
                    <IconButton
                      size="small"
                      onClick={(e) => e.preventDefault()}
                      href={`/api/imagem?arquivo=${encodeURIComponent(maisRecente.imagem)}`}
                      sx={(t) => ({
                        position: 'absolute',
                        top: 8,
                        right: 8,
                        bgcolor: alpha(t.palette.background.paper, 0.85),
                        '&:hover': { bgcolor: t.palette.background.paper },
                      })}
                    >
                      <OpenInNewOutlined fontSize="small" />
                    </IconButton>
                  </Tooltip>
                </Link>
              ) : carregandoHistorico ? (
                <Skeleton variant="rounded" height={180} />
              ) : (
                <Typography variant="body2" color="text.secondary">
                  Imagem não disponível para este produto.
                </Typography>
              )}
            </section>

            {/* Evolução de preço */}
            <section>
              <Stack direction="row" spacing={1} sx={{ mb: 1, alignItems: 'center', justifyContent: 'space-between' }}>
                <Typography variant="subtitle2">Variação de preço</Typography>
                <ToggleButtonGroup
                  size="small"
                  exclusive
                  value={granularidade}
                  onChange={(_, v) => v && setGranularidade(v)}
                >
                  <ToggleButton value="mes">
                    <Typography variant="caption">Mês</Typography>
                  </ToggleButton>
                  <ToggleButton value="encarte">
                    <Typography variant="caption">Encarte</Typography>
                  </ToggleButton>
                </ToggleButtonGroup>
              </Stack>
              {!optionGrafico ? (
                <Typography variant="body2" color="text.secondary" sx={{ py: 3, textAlign: 'center' }}>
                  Sem histórico suficiente.
                </Typography>
              ) : (
                <EChart option={optionGrafico} height={210} loading={false} />
              )}
            </section>

            <Divider />

            {/* Similares */}
            <section>
              <Typography variant="subtitle2" gutterBottom>
                Produtos similares {similares.length > 0 && `(${similares.length})`}
              </Typography>
              {similares.length === 0 ? (
                <Typography variant="body2" color="text.secondary">
                  Nada encontrado na mesma categoria/grupo da cesta.
                </Typography>
              ) : (
                <Stack spacing={0.75}>
                  {similares.map((s) => (
                    <Box
                      key={s.nome}
                      onClick={() => onSelecionarProduto(s.nome)}
                      sx={(t) => ({
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        gap: 1,
                        px: 1.25,
                        py: 0.75,
                        borderRadius: 2,
                        cursor: 'pointer',
                        border: '1px solid',
                        borderColor: 'divider',
                        transition: t.transitions.create(['background-color', 'border-color']),
                        '&:hover': {
                          bgcolor: alpha(t.palette.primary.main, 0.06),
                          borderColor: 'primary.main',
                        },
                      })}
                    >
                      <Box sx={{ minWidth: 0 }}>
                        <Typography variant="body2" noWrap sx={{ fontWeight: 600, maxWidth: 220 }}>
                          {s.nome}
                        </Typography>
                        <Typography variant="caption" color="text.secondary" noWrap component="div">
                          {[s.marca, s.medida].filter(Boolean).join(' · ') || '—'}
                        </Typography>
                      </Box>
                      <Box sx={{ textAlign: 'right', flexShrink: 0 }}>
                        <Typography variant="body2" sx={{ fontWeight: 700 }} component="div">
                          {brl.format(s.preco)}
                        </Typography>
                        {s.pct != null && (
                          <Typography
                            variant="caption"
                            component="div"
                            sx={{ color: s.pct > 0 ? 'error.main' : 'success.main', fontWeight: 700 }}
                          >
                            {formatarPct(s.pct)}
                          </Typography>
                        )}
                      </Box>
                    </Box>
                  ))}
                </Stack>
              )}
            </section>
          </Stack>
        </Stack>
      )}
    </Drawer>
  );
}
