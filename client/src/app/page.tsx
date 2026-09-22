'use client';

import { useMemo, useState } from 'react';
import { useColorScheme } from '@mui/material/styles';
import Container from '@mui/material/Container';
import Stack from '@mui/material/Stack';
import Grid from '@mui/material/Grid';
import Typography from '@mui/material/Typography';
import Box from '@mui/material/Box';
import FiltrosBar from '@/components/FiltrosBar';
import KpiCards from '@/components/KpiCards';
import ProdutosTable from '@/components/ProdutosTable';
import CardsDestaque from '@/components/CardsDestaque';
import TabelaVariacao from '@/components/TabelaVariacao';
import PainelProduto from '@/components/PainelProduto';
import MenuGraficos from '@/components/MenuGraficos';
import CardDieeseCesta from '@/components/CardDieeseCesta';
import ChartPrecoLinha from '@/components/charts/ChartPrecoLinha';
import ChartPrecoAnual from '@/components/charts/ChartPrecoAnual';
import ChartVariacaoCesta from '@/components/charts/ChartVariacaoCesta';
import ChartVariacaoGrupos from '@/components/charts/ChartVariacaoGrupos';
import ChartHeatmapCategoria from '@/components/charts/ChartHeatmapCategoria';
import { useProdutos } from '@/hooks/useProdutos';
import { useHistoricoProduto } from '@/hooks/useHistoricoProduto';
import { variacoesDesdeUltimoEncarte } from '@/lib/historico';
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
    graficosSelecionados,
    alternarGraficoSelecionado,
    produtosSelecionados,
  } = useProdutos();

  const { historico, carregando: carregandoHistorico } =
    useHistoricoProduto(produtoSelecionado);

  // gráficos refletem os produtos marcados na tabela; sem marcação, a cesta completa
  const produtosGrafico = graficosSelecionados.length ? produtosSelecionados : produtosCesta;
  const variacoesGrafico = useMemo(
    () => variacoesDesdeUltimoEncarte(produtosGrafico),
    [produtosGrafico]
  );

  return (
    <Box sx={{ minHeight: '100dvh' }}>
      <Container maxWidth="lg" sx={{ py: { xs: 3, md: 4 } }}>
        <Stack
          direction={{ xs: 'column', sm: 'row' }}
          spacing={1}
          sx={{ mb: 3, justifyContent: 'space-between', alignItems: { xs: 'flex-start', sm: 'center' } }}
        >
          <Box>
            <Typography variant="h4">Mercadometro</Typography>
            <Typography variant="body2" color="text.secondary">
              Acompanhe a evolução de preços dos encartes
            </Typography>
          </Box>

          <section>
            <MenuGraficos />
          </section>
        </Stack>

        <KpiCards
          carregando={carregando}
          totalProdutos={produtos.length}
          produtosCesta={produtosGrafico}
          carregandoCesta={carregandoCesta}
        />

        <Stack spacing={2} sx={{ mb: 3 }}>
          <CardsDestaque
            variacoes={variacoes}
            carregando={carregandoCesta}
            onSelecionarProduto={setProdutoSelecionado}
          />

          <Grid container spacing={2}>
            <Grid size={{ xs: 12, lg: 8 }}>
              <ChartVariacaoCesta
                itens={produtosGrafico}
                escuro={escuro}
                carregando={carregandoCesta}
                slug="variacao-cesta-basica"
              />
            </Grid>
            <Grid size={{ xs: 12, lg: 4 }}>
              <CardDieeseCesta
                itens={produtos}
                escuro={escuro}
                carregando={carregandoCesta}
                slug="dieese-cesta-basica"
              />
            </Grid>
            <Grid size={{ xs: 12 }}>
              <ChartVariacaoGrupos
                produtos={produtosGrafico}
                escuro={escuro}
                carregando={carregandoCesta}
                slug="variacao-grupos"
              />
            </Grid>
          </Grid>

          {/* <Grid container spacing={2}>
            <Grid > */}
              <ChartPrecoLinha
                produtoSelecionado={produtoSelecionado}
                onSelecionarProduto={setProdutoSelecionado}
                historico={historico}
                carregandoHistorico={carregandoHistorico}
                produtosCesta={produtosGrafico}
                modoSelecao={graficosSelecionados.length > 0}
                escuro={escuro}
                slug="preco-produto"
              />
            {/* </Grid> */}
            {/* <Grid size={{ xs: 12, lg: 5 }}>
              <ChartPrecoAnual
                nomeProduto={produtoSelecionado}
                historico={historico}
                carregando={carregandoHistorico}
                produtosCesta={produtosGrafico}
                modoSelecao={graficosSelecionados.length > 0}
                escuro={escuro}
                slug="preco-anual"
              />
            </Grid> */}
          {/* </Grid> */}

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

          <ProdutosTable
            produtos={produtos}
            carregando={carregando}
            onLimparFiltros={limparFiltros}
            selecionados={graficosSelecionados}
            onToggleSelecionado={alternarGraficoSelecionado}
            onAbrirDetalhe={setProdutoDetalhe}
          />

          <TabelaVariacao
            variacoes={variacoesGrafico}
            carregando={carregandoCesta}
            onSelecionarProduto={setProdutoSelecionado}
          />

          <ChartHeatmapCategoria
            produtos={produtosGrafico}
            escuro={escuro}
            carregando={carregandoCesta}
            slug="heatmap-categorias"
          />
        </Stack>

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
