'use client';

import { useMemo, useState } from 'react';
import { alpha } from '@mui/material/styles'; import Box from '@mui/material/Box';
import Chip from '@mui/material/Chip';
import Collapse from '@mui/material/Collapse';
import Divider from '@mui/material/Divider';
import Drawer from '@mui/material/Drawer';
import IconButton from '@mui/material/IconButton';
import Skeleton from '@mui/material/Skeleton';
import Stack from '@mui/material/Stack';
import Tab from '@mui/material/Tab';
import Tabs from '@mui/material/Tabs';
import ToggleButton from '@mui/material/ToggleButton';
import ToggleButtonGroup from '@mui/material/ToggleButtonGroup';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import CloseOutlined from '@mui/icons-material/CloseOutlined';
import ExpandMoreOutlined from '@mui/icons-material/ExpandMoreOutlined';
import OpenInNewOutlined from '@mui/icons-material/OpenInNewOutlined';
import LocalOfferOutlined from '@mui/icons-material/LocalOfferOutlined';
import EChart from '@/components/charts/EChart';
import { brl, chartCores, CESTA_BASICA } from '@/lib/utils';
import { useHistoricoProduto } from '@/hooks/useHistoricoProduto';
import {
  serieProduto,
  dataReferencia,
  chaveMes,
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
  const [aba, setAba] = useState<'similares' | 'relacionados'>('similares');
  const [listaAberta, setListaAberta] = useState(true);
  const [encartesAberto, setEncartesAberto] = useState(false);

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

  /**
   * Produtos relacionados: um representante recente de cada outro grupo da
   * cesta básica (ex.: para um arroz → feijão, macarrão, café…).
   */
  const relacionados = useMemo(() => {
    if (!produto || !produtosCesta.length) return [];
    const grupoAlvo = grupoCesta(produto.produto);
    const porGrupo = new Map<string, { nome: string; preco: number; marca: string | null; medida: string | null }>();
    for (const p of produtosCesta) {
      if (!p.produto || p.preco == null || p.produto === produto.produto) continue;
      const g = grupoCesta(p.produto);
      if (!g || g === grupoAlvo || porGrupo.has(g)) continue;
      porGrupo.set(g, { nome: p.produto, preco: p.preco, marca: p.marca, medida: p.medida });
    }
    return [...porGrupo.entries()]
      .map(([grupo, info]) => ({ grupo, ordem: CESTA_BASICA.indexOf(grupo), ...info }))
      .sort((a, b) => a.ordem - b.ordem)
      .slice(0, 6);
  }, [produto, produtosCesta]);

  /** Encartes em que o produto apareceu, do mais recente para o mais antigo. */
  const encartes = useMemo(() => {
    return historico
      .map((p) => ({ registro: p, data: dataReferencia(p) }))
      .filter((x): x is { registro: Produto; data: Date } => x.data != null)
      .sort((a, b) => b.data.getTime() - a.data.getTime());
  }, [historico]);

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

              </Stack>
            ) : carregandoHistorico ? (
              <Skeleton height={32} />
            ) : null}

            {/* Encartes em que apareceu */}
            <section>
              <Stack direction="row" sx={{ alignItems: 'center', justifyContent: 'space-between' }}>
                <Typography variant="subtitle2" gutterBottom>
                  Encartes {encartes.length > 0 && `(${encartes.length})`}
                </Typography>
                {encartes.length > 1 && (
                  <Box sx={{ display: 'flex', justifyContent: 'center', mt: 0.25 }}>
                    <Tooltip title={encartesAberto ? 'Ver menos' : `Ver mais (${encartes.length - 1})`}>
                      <IconButton
                        size="small"
                        onClick={() => setEncartesAberto((v) => !v)}
                        aria-label="Alternar lista de encartes"
                        sx={(t) => ({
                          transform: encartesAberto ? 'rotate(180deg)' : 'none',
                          transition: t.transitions.create('transform'),
                        })}
                      >
                        <ExpandMoreOutlined fontSize="small" />
                      </IconButton>
                    </Tooltip>
                  </Box>
                )}
              </Stack>

              {carregandoHistorico ? (
                <Skeleton variant="rounded" height={56} />
              ) : encartes.length === 0 ? (
                <Typography variant="body2" color="text.secondary">
                  Nenhum encarte encontrado para este produto.
                </Typography>
              ) : (
                <>
                  <Stack
                    spacing={0.5}
                    sx={encartesAberto ? { maxHeight: 150, overflowY: 'auto', pr: 0.5 } : undefined}
                  >
                    {(encartesAberto ? encartes : encartes.slice(0, 1)).map(({ registro, data }) => (
                      <Box
                        key={registro.id}
                        sx={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          gap: 1,
                          px: 1.25,
                          py: 0.6,
                          borderRadius: 1.5,
                          border: '1px solid',
                          borderColor: 'divider',
                        }}
                      >
                        <Typography variant="body2" noWrap component="div">
                          {rotuloPeriodo(chaveMes(data))}
                        </Typography>
                        <Stack direction="row" spacing={0.75} sx={{ alignItems: 'center', flexShrink: 0 }}>
                          <Typography variant="body2" sx={{ fontWeight: 700 }} component="div">
                            {registro.preco != null ? brl.format(registro.preco) : '—'}
                          </Typography>
                          {registro.imagem && (
                            <Tooltip title={`Abrir imagem do encarte · ${registro.data_encarte ?? ''}`}>
                              <IconButton
                                size="small"
                                href={`/api/imagem?arquivo=${encodeURIComponent(registro.imagem)}`}
                                target="_blank"
                                aria-label="Abrir imagem do encarte"
                              >
                                <OpenInNewOutlined sx={{ fontSize: 16 }} />
                              </IconButton>
                            </Tooltip>
                          )}
                        </Stack>
                      </Box>
                    ))}
                  </Stack>
                </>
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

            {/* Similares e relacionados em abas, recolhíveis */}
            <section>
              <Stack direction="row" sx={{ alignItems: 'center', justifyContent: 'space-between' }}>
                <Tabs
                  value={aba}
                  onChange={(_, v: 'similares' | 'relacionados') => setAba(v)}
                  aria-label="Produtos similares e relacionados"
                  sx={{ minHeight: 36, '& .MuiTab-root': { minHeight: 36, py: 0.5 } }}
                >
                  <Tab value="similares" label={`Similares (${similares.length})`} />
                  <Tab value="relacionados" label={`Relacionados (${relacionados.length})`} />
                </Tabs>
                <Tooltip title={listaAberta ? 'Recolher lista' : 'Expandir lista'}>
                  <IconButton
                    size="small"
                    onClick={() => setListaAberta((v) => !v)}
                    aria-label="Alternar lista de produtos"
                    sx={(t) => ({
                      transform: listaAberta ? 'rotate(180deg)' : 'none',
                      transition: t.transitions.create('transform'),
                    })}
                  >
                    <ExpandMoreOutlined fontSize="small" />
                  </IconButton>
                </Tooltip>
              </Stack>

              <Collapse in={listaAberta}>
                {aba === 'similares' ? (
                  similares.length === 0 ? (
                    <Typography variant="body2" color="text.secondary" sx={{ py: 2 }}>
                      Nada encontrado na mesma categoria/grupo da cesta.
                    </Typography>
                  ) : (
                    <Stack spacing={0.75} sx={{ pt: 1 }}>
                      {similares.slice(0, 4).map((s) => (
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
                            <Typography variant="body2" noWrap sx={{ fontWeight: 600, maxWidth: 220 }} component="div">
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
                  )
                ) : relacionados.length === 0 ? (
                  <Typography variant="body2" color="text.secondary" sx={{ py: 2 }}>
                    Nenhum grupo relacionado da cesta básica.
                  </Typography>
                ) : (
                  <Stack spacing={0.5} sx={{ pt: 1 }}>
                    {relacionados.slice(0, 4).map((r) => (
                      <Box
                        key={r.grupo}
                        onClick={() => onSelecionarProduto(r.nome)}
                        sx={(t) => ({
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          gap: 1,
                          px: 1.25,
                          py: 0.6,
                          borderRadius: 2,
                          cursor: 'pointer',
                          border: '1px solid',
                          borderColor: 'divider',
                          transition: t.transitions.create(['background-color', 'border-color']),
                          '&:hover': {
                            bgcolor: alpha(t.palette.secondary.main, 0.06),
                            borderColor: 'secondary.main',
                          },
                        })}
                      >
                        <Box sx={{ minWidth: 0 }}>
                          <Typography
                            variant="caption"
                            color="text.secondary"
                            noWrap
                            component="div"
                            sx={{ fontWeight: 700, letterSpacing: 0.5 }}
                          >
                            {r.grupo}
                          </Typography>
                          <Typography variant="body2" noWrap sx={{ maxWidth: 230 }} component="div">
                            {r.nome}
                          </Typography>
                        </Box>
                        <Typography variant="body2" sx={{ fontWeight: 700, flexShrink: 0 }} component="div">
                          {brl.format(r.preco)}
                        </Typography>
                      </Box>
                    ))}
                  </Stack>
                )}
              </Collapse>
            </section>
          </Stack>
        </Stack>
      )}
    </Drawer>
  );
}
