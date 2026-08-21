'use client';

import { useState, useEffect, useMemo } from 'react';
import dynamic from 'next/dynamic';
import { useColorScheme, alpha } from '@mui/material/styles';
import Container from '@mui/material/Container';
import Stack from '@mui/material/Stack';
import Grid from '@mui/material/Grid';
import Paper from '@mui/material/Paper';
import Typography from '@mui/material/Typography';
import Chip from '@mui/material/Chip';
import Button from '@mui/material/Button';
import Autocomplete from '@mui/material/Autocomplete';
import TextField from '@mui/material/TextField';
import InputAdornment from '@mui/material/InputAdornment';
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
import Search from '@mui/icons-material/Search';
import Inventory2Outlined from '@mui/icons-material/Inventory2Outlined';
import PaymentsOutlined from '@mui/icons-material/PaymentsOutlined';
import SavingsOutlined from '@mui/icons-material/SavingsOutlined';
import ShoppingBasketOutlined from '@mui/icons-material/ShoppingBasketOutlined';
import RestartAlt from '@mui/icons-material/RestartAlt';
import CalendarMonth from '@mui/icons-material/CalendarMonth';
import InboxOutlined from '@mui/icons-material/InboxOutlined';
import LocalOfferOutlined from '@mui/icons-material/LocalOfferOutlined';
import AppHeader from '@/components/AppHeader';
import StatCard from '@/components/StatCard';

const ReactECharts = dynamic(() => import('echarts-for-react'), { ssr: false });

interface Produto {
  id: number;
  imagem: string;
  produto: string;
  marca: string | null;
  medida: string | null;
  preco: number | null;
  preco_clube: number | null;
  tipo_promocao: string | null;
  limite: string | null;
  data_encarte: string | null;
  observacao: string | null;
  created_at: string;
}

interface Filtros {
  produtos: string[];
  datas: string[];
  marcas: string[];
}

const CESTA_BASICA = [
  'ARROZ',
  'FEIJÃO',
  'ÓLEO',
  'AÇÚCAR',
  'CAFÉ',
  'LEITE',
  'FARINHA',
  'MACARRÃO',
  'SAL',
  'BATATA',
  'CEBOLA',
  'ALHO',
  'TOMATE',
];

const brl = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });

const chartCores = {
  light: {
    text: '#334155',
    muted: '#94a3b8',
    split: '#e2e8f0',
    tooltipBg: '#ffffff',
    series: ['#16a34a', '#ea580c', '#0ea5e9', '#8b5cf6', '#eab308', '#ec4899', '#14b8a6', '#f97316'],
  },
  dark: {
    text: '#cbd5e1',
    muted: '#64748b',
    split: '#253046',
    tooltipBg: '#1a2439',
    series: ['#4ade80', '#fb923c', '#38bdf8', '#a78bfa', '#facc15', '#f472b6', '#2dd4bf', '#fdba74'],
  },
} as const;

const AVATAR_COLORS = ['#16a34a', '#0ea5e9', '#ea580c', '#8b5cf6', '#eab308', '#ec4899', '#14b8a6'];

function iniciais(nome: string): string {
  return nome
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0])
    .join('')
    .toUpperCase();
}

export default function Home() {
  const { mode, systemMode } = useColorScheme();
  const modoResolvido = mode === 'system' || mode == null ? systemMode : mode;
  const escuro = modoResolvido === 'dark';

  const [produtos, setProdutos] = useState<Produto[]>([]);
  const [produtosCesta, setProdutosCesta] = useState<Produto[]>([]);
  const [filtros, setFiltros] = useState<Filtros>({ produtos: [], datas: [], marcas: [] });
  const [filtroProduto, setFiltroProduto] = useState<string | null>(null);
  const [filtroData, setFiltroData] = useState<string | null>(null);
  const [filtroMarca, setFiltroMarca] = useState<string | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [carregandoCesta, setCarregandoCesta] = useState(true);
  const [pagina, setPagina] = useState(0);
  const [porPagina, setPorPagina] = useState(10);

  useEffect(() => {
    async function carregarFiltros() {
      const res = await fetch('/api/produtos?action=filtros');
      const data = await res.json();
      setFiltros(data);
    }
    carregarFiltros();
  }, []);

  useEffect(() => {
    async function carregarCesta() {
      const res = await fetch('/api/produtos');
      setProdutosCesta(await res.json());
      setCarregandoCesta(false);
    }
    carregarCesta();
  }, []);

  useEffect(() => {
    async function carregarProdutos() {
      setCarregando(true);
      setPagina(0);
      const params = new URLSearchParams();
      if (filtroProduto) params.set('produto', filtroProduto);
      if (filtroData) params.set('data_encarte', filtroData);
      if (filtroMarca) params.set('marca', filtroMarca);

      const res = await fetch(`/api/produtos?${params.toString()}`);
      const data = await res.json();
      setProdutos(data);
      setCarregando(false);
    }
    carregarProdutos();
  }, [filtroProduto, filtroData, filtroMarca]);

  const temFiltro = Boolean(filtroProduto || filtroData || filtroMarca);

  const limparFiltros = () => {
    setFiltroProduto(null);
    setFiltroData(null);
    setFiltroMarca(null);
  };

  const produtosCestaBasica = useMemo(
    () =>
      produtosCesta.filter((p) =>
        CESTA_BASICA.some((item) => p.produto.toUpperCase().includes(item))
      ),
    [produtosCesta]
  );

  const totalEconomia = useMemo(
    () =>
      produtos.reduce(
        (acc, p) =>
          acc + (p.preco && p.preco_clube && p.preco_clube < p.preco ? p.preco - p.preco_clube : 0),
        0
      ),
    [produtos]
  );

  const totalComPreco = produtos.filter((p) => p.preco).length;
  const precoMedio =
    produtos.reduce((acc, p) => acc + (p.preco || 0), 0) / (totalComPreco || 1);
  const ultimaData = filtros.datas.length ? filtros.datas[filtros.datas.length - 1] : null;

  const chartPrecoProduto = useMemo(() => {
    const cores = escuro ? chartCores.dark : chartCores.light;
    const agrupado: Record<string, Record<string, { preco: number; clube: number }>> = {};
    const contagem: Record<string, number> = {};

    produtos.forEach((p) => {
      const nome = p.produto.substring(0, 32);
      const data = p.data_encarte || p.created_at.substring(0, 10);
      contagem[nome] = (contagem[nome] || 0) + 1;
      agrupado[nome] ??= {};
      agrupado[nome][data] = { preco: p.preco || 0, clube: p.preco_clube || 0 };
    });

    const topNomes = Object.entries(contagem)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 6)
      .map(([nome]) => nome);
    const datas = [...new Set(produtos.map((p) => p.data_encarte || p.created_at.substring(0, 10)))].sort();

    const series = topNomes.map((nome, i) => ({
      name: nome,
      type: 'bar' as const,
      barMaxWidth: 28,
      itemStyle: { color: cores.series[i % cores.series.length], borderRadius: [5, 5, 0, 0] },
      data: datas.map((d) => agrupado[nome][d]?.preco ?? null),
    }));

    return {
      backgroundColor: 'transparent',
      tooltip: {
        trigger: 'axis' as const,
        axisPointer: { type: 'shadow' as const },
        backgroundColor: cores.tooltipBg,
        borderWidth: 0,
        textStyle: { color: cores.text },
        valueFormatter: (v: number) => brl.format(v),
      },
      legend: { data: topNomes, type: 'scroll' as const, bottom: 0, textStyle: { color: cores.muted } },
      grid: { left: 8, right: 16, top: 24, bottom: 56, containLabel: true },
      xAxis: {
        type: 'category' as const,
        data: datas,
        axisLabel: { rotate: 45, color: cores.muted, fontSize: 11 },
        axisLine: { lineStyle: { color: cores.split } },
        axisTick: { show: false },
      },
      yAxis: {
        type: 'value' as const,
        axisLabel: { color: cores.muted, fontSize: 11 },
        splitLine: { lineStyle: { color: cores.split } },
      },
      series,
    };
  }, [produtos, escuro]);

  const chartEconomia = useMemo(() => {
    const cores = escuro ? chartCores.dark : chartCores.light;
    const comDesconto = produtos.filter((p) => p.preco && p.preco_clube && p.preco_clube < p.preco);
    const marcasEconomia: Record<string, number> = {};
    comDesconto.forEach((p) => {
      const marca = p.marca || 'Sem marca';
      marcasEconomia[marca] =
        (marcasEconomia[marca] || 0) + ((p.preco || 0) - (p.preco_clube || 0));
    });
    const dados = Object.entries(marcasEconomia)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 8);

    return {
      backgroundColor: 'transparent',
      tooltip: {
        trigger: 'item' as const,
        backgroundColor: cores.tooltipBg,
        borderWidth: 0,
        textStyle: { color: cores.text },
        valueFormatter: (v: number) => brl.format(v),
      },
      legend: { type: 'scroll' as const, bottom: 0, textStyle: { color: cores.muted } },
      series: [
        {
          type: 'pie' as const,
          radius: ['52%', '74%'],
          center: ['50%', '44%'],
          avoidLabelOverlap: true,
          itemStyle: { borderRadius: 8, borderColor: cores.tooltipBg, borderWidth: 3 },
          label: { show: false },
          emphasis: {
            label: { show: true, fontSize: 13, fontWeight: 'bold' as const, color: cores.text },
          },
          labelLine: { show: false },
          color: cores.series,
          data: dados.map(([marca, valor]) => ({ value: Number(valor.toFixed(2)), name: marca })),
        },
      ],
    };
  }, [produtos, escuro]);

  const chartCestaBasica = useMemo(() => {
    const cores = escuro ? chartCores.dark : chartCores.light;
    const itens: Record<string, number> = {};
    produtosCestaBasica.forEach((p) => {
      const nome = p.produto.substring(0, 40);
      if (!(nome in itens) && p.preco) itens[nome] = p.preco;
    });
    const itensOrdenados = Object.entries(itens)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 12)
      .reverse();

    return {
      backgroundColor: 'transparent',
      tooltip: {
        trigger: 'axis' as const,
        axisPointer: { type: 'shadow' as const },
        backgroundColor: cores.tooltipBg,
        borderWidth: 0,
        textStyle: { color: cores.text },
        valueFormatter: (v: number) => brl.format(v),
      },
      grid: { left: 8, right: 64, top: 8, bottom: 8, containLabel: true },
      xAxis: {
        type: 'value' as const,
        axisLabel: { color: cores.muted, fontSize: 11 },
        splitLine: { lineStyle: { color: cores.split } },
      },
      yAxis: {
        type: 'category' as const,
        data: itensOrdenados.map(([nome]) => nome),
        axisLabel: { color: cores.text, fontSize: 11 },
        axisLine: { show: false },
        axisTick: { show: false },
      },
      series: [
        {
          type: 'bar' as const,
          barMaxWidth: 18,
          data: itensOrdenados.map(([, preco]) => preco),
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
            formatter: ({ value }: { value: number }) => brl.format(value),
            fontSize: 10,
            color: cores.muted,
          },
        },
      ],
    };
  }, [produtosCestaBasica, escuro]);

  const paginaSlice = produtos.slice(pagina * porPagina, pagina * porPagina + porPagina);

  return (
    <Box sx={{ minHeight: '100dvh' }}>
      <AppHeader />
      <Container maxWidth="lg" sx={{ py: { xs: 3, md: 4 } }}>
        <Stack
          direction={{ xs: 'column', sm: 'row' }}
          spacing={1}
          sx={{ mb: 3, justifyContent: 'space-between', alignItems: { xs: 'flex-start', sm: 'center' } }}
        >
          <Box>
            <Typography variant="h4">Painel de Preços</Typography>
            <Typography variant="body2" color="text.secondary">
              Acompanhe a evolução de preços dos encartes
            </Typography>
          </Box>
          {ultimaData && (
            <Chip
              icon={<CalendarMonth />}
              label={`Último encarte: ${ultimaData}`}
              variant="outlined"
              size="small"
            />
          )}
        </Stack>

        {/* KPIs */}
        <Grid container spacing={2} sx={{ mb: 3 }}>
          <Grid size={{ xs: 12, sm: 6, md: 3 }}>
            {carregando ? (
              <Skeleton variant="rounded" height={96} />
            ) : (
              <StatCard
                titulo="Total de produtos"
                valor={String(produtos.length)}
                icon={<Inventory2Outlined />}
                cor="primary"
              />
            )}
          </Grid>
          <Grid size={{ xs: 12, sm: 6, md: 3 }}>
            {carregando ? (
              <Skeleton variant="rounded" height={96} />
            ) : (
              <StatCard
                titulo="Preço médio"
                valor={brl.format(precoMedio)}
                sub={`${totalComPreco} produtos com preço`}
                icon={<PaymentsOutlined />}
                cor="info"
              />
            )}
          </Grid>
          <Grid size={{ xs: 12, sm: 6, md: 3 }}>
            {carregando ? (
              <Skeleton variant="rounded" height={96} />
            ) : (
              <StatCard
                titulo="Economia no Clube"
                valor={brl.format(totalEconomia)}
                sub="Clube vs. preço regular"
                icon={<SavingsOutlined />}
                cor="secondary"
              />
            )}
          </Grid>
          <Grid size={{ xs: 12, sm: 6, md: 3 }}>
            {carregando ? (
              <Skeleton variant="rounded" height={96} />
            ) : (
              <StatCard
                titulo="Cesta básica"
                valor={String(produtosCestaBasica.length)}
                sub="itens encontrados"
                icon={<ShoppingBasketOutlined />}
                cor="warning"
              />
            )}
          </Grid>
        </Grid>

        {/* Filtros */}
        <Paper variant="outlined" sx={{ p: 2.5, mb: 3 }}>
          <Stack direction={{ xs: 'column', md: 'row' }} spacing={1.5}>
            <Autocomplete
              fullWidth
              freeSolo
              options={filtros.produtos}
              value={filtroProduto}
              onChange={(_, v) => setFiltroProduto(v)}
              renderInput={(params) => (
                <TextField
                  {...params}
                  label="Buscar produto"
                  placeholder="Ex.: arroz, café..."
                  size="small"
                  slotProps={{
                    ...params.slotProps,
                    input: {
                      ...params.slotProps.input,
                      startAdornment: (
                        <InputAdornment position="start">
                          <Search fontSize="small" />
                        </InputAdornment>
                      ),
                    },
                  }}
                />
              )}
            />
            <Autocomplete
              fullWidth
              options={filtros.datas}
              value={filtroData}
              onChange={(_, v) => setFiltroData(v)}
              renderInput={(params) => (
                <TextField {...params} label="Data do encarte" size="small" />
              )}
            />
            <Autocomplete
              fullWidth
              options={filtros.marcas}
              value={filtroMarca}
              onChange={(_, v) => setFiltroMarca(v)}
              renderInput={(params) => <TextField {...params} label="Marca" size="small" />}
            />
            <Button
              onClick={limparFiltros}
              disabled={!temFiltro}
              startIcon={<RestartAlt />}
              variant="text"
              sx={{ whiteSpace: 'nowrap', flexShrink: 0 }}
            >
              Limpar
            </Button>
          </Stack>
        </Paper>

        {/* Gráficos */}
        <Grid container spacing={2} sx={{ mb: 3 }}>
          <Grid size={{ xs: 12, md: 7 }}>
            <Paper variant="outlined" sx={{ p: 2.5 }}>
              <Typography variant="h6" gutterBottom>
                Preços por encarte
              </Typography>
              {carregando ? (
                <Skeleton variant="rounded" height={360} />
              ) : (
                <ReactECharts option={chartPrecoProduto} style={{ height: 360 }} notMerge />
              )}
            </Paper>
          </Grid>
          <Grid size={{ xs: 12, md: 5 }}>
            <Paper variant="outlined" sx={{ p: 2.5 }}>
              <Typography variant="h6" gutterBottom>
                Economia por marca
              </Typography>
              {carregando ? (
                <Skeleton variant="rounded" height={360} />
              ) : (
                <ReactECharts option={chartEconomia} style={{ height: 360 }} notMerge />
              )}
            </Paper>
          </Grid>
          <Grid size={{ xs: 12 }}>
            <Paper variant="outlined" sx={{ p: 2.5 }}>
              <Typography variant="h6" gutterBottom>
                Cesta básica · preços
              </Typography>
              {carregandoCesta ? (
                <Skeleton variant="rounded" height={340} />
              ) : (
                <ReactECharts option={chartCestaBasica} style={{ height: 340 }} notMerge />
              )}
            </Paper>
          </Grid>
        </Grid>

        {/* Tabela */}
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
              <Button size="small" onClick={limparFiltros}>
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
                            <TableRow key={p.id} hover>
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
      </Container>
    </Box>
  );
}
