'use client';

import { useState } from 'react';
import { useColorScheme } from '@mui/material/styles';
import Container from '@mui/material/Container';
import Stack from '@mui/material/Stack';
import Grid from '@mui/material/Grid';
import Chip from '@mui/material/Chip';
import Typography from '@mui/material/Typography';
import Box from '@mui/material/Box';
import CalendarMonth from '@mui/icons-material/CalendarMonth';
import AppHeader from '@/components/AppHeader';
import FiltrosBar from '@/components/FiltrosBar';
import KpiCards from '@/components/KpiCards';
import ProdutosTable from '@/components/ProdutosTable';
import CardsDestaque from '@/components/CardsDestaque';
import TabelaVariacao from '@/components/TabelaVariacao';
import CardInflacao from '@/components/CardInflacao';
import PainelProduto from '@/components/PainelProduto';
import ChartPrecoLinha from '@/components/charts/ChartPrecoLinha';
import ChartPrecoAnual from '@/components/charts/ChartPrecoAnual';
import ChartCestaBasica from '@/components/charts/ChartCestaBasica';
import ChartIndiceCesta from '@/components/charts/ChartIndiceCesta';
import ChartHeatmapCategoria from '@/components/charts/ChartHeatmapCategoria';
import { useProdutos } from '@/hooks/useProdutos';
import { useHistoricoProduto } from '@/hooks/useHistoricoProduto';
import type { Produto } from '@/lib/types';

export default function Home() {
  const { mode, systemMode } = useColorScheme();
  const modoResolvido = mode === 'system' || mode == null ? systemMode : mode;
  const escuro = modoResolvido === 'dark';

  const [produtoSelecionado, setProdutoSelecionado] = useState<string | null>(null);
  const [produtoDetalhe, setProdutoDetalhe] = useState<Produto | null>(null);

  const {
    produtos,
    produtosCesta,
    variacoes,
    filtros,
    filtroProduto,
    setFiltroProduto,
    filtroAnos,
    setFiltroAnos,
    filtroMarca,
    setFiltroMarca,
    filtroCategoria,
    setFiltroCategoria,
    carregando,
    carregandoCesta,
    limparFiltros,
    ultimaData,
  } = useProdutos();

  const { historico, carregando: carregandoHistorico } =
    useHistoricoProduto(produtoSelecionado);

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

        <KpiCards carregando={carregando} totalProdutos={produtos.length} />

        <FiltrosBar
          opcoes={filtros}
          filtroProduto={filtroProduto}
          filtroAnos={filtroAnos}
          filtroMarca={filtroMarca}
          filtroCategoria={filtroCategoria}
          onChangeProduto={setFiltroProduto}
          onChangeAnos={setFiltroAnos}
          onChangeMarca={setFiltroMarca}
          onChangeCategoria={setFiltroCategoria}
          onLimpar={limparFiltros}
        />

        <Stack spacing={2} sx={{ mb: 3 }}>
          <CardsDestaque
            variacoes={variacoes}
            carregando={carregandoCesta}
            onSelecionarProduto={setProdutoSelecionado}
          />

          <Grid container spacing={2}>
            <Grid size={{ xs: 12, lg: 7 }}>
              <ChartPrecoLinha
                produtoSelecionado={produtoSelecionado}
                onSelecionarProduto={setProdutoSelecionado}
                historico={historico}
                carregandoHistorico={carregandoHistorico}
                produtosCesta={produtosCesta}
                escuro={escuro}
              />
            </Grid>
            <Grid size={{ xs: 12, lg: 5 }}>
              <ChartPrecoAnual
                nomeProduto={produtoSelecionado}
                historico={historico}
                carregando={carregandoHistorico}
                produtosCesta={produtosCesta}
                escuro={escuro}
              />
            </Grid>
          </Grid>

          <Grid container spacing={2}>
            <Grid size={{ xs: 12, lg: 5 }}>
              <Stack spacing={2}>
                <CardInflacao produtos={produtosCesta} carregando={carregandoCesta} />
                <ChartIndiceCesta
                  produtos={produtosCesta}
                  escuro={escuro}
                  carregando={carregandoCesta}
                />
              </Stack>
            </Grid>
            <Grid size={{ xs: 12, lg: 7 }}>
              <ChartCestaBasica
                itens={produtosCesta}
                escuro={escuro}
                carregando={carregandoCesta}
              />
            </Grid>
          </Grid>

          <ChartHeatmapCategoria
            produtos={produtosCesta}
            escuro={escuro}
            carregando={carregandoCesta}
          />

          <TabelaVariacao
            variacoes={variacoes}
            carregando={carregandoCesta}
            onSelecionarProduto={setProdutoSelecionado}
          />
        </Stack>

        <ProdutosTable
          produtos={produtos}
          carregando={carregando}
          onLimparFiltros={limparFiltros}
          onAbrirDetalhe={setProdutoDetalhe}
        />
      </Container>

      <PainelProduto
        produto={produtoDetalhe}
        onClose={() => setProdutoDetalhe(null)}
        onSelecionarProduto={(nome) => {
          const registro = produtosCesta.find((p) => p.produto === nome);
          if (registro) setProdutoDetalhe(registro);
        }}
        produtosCesta={produtosCesta}
        variacoes={variacoes}
        escuro={escuro}
      />
    </Box>
  );
}
