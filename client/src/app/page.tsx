'use client';

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
import ChartPrecoProduto from '@/components/charts/ChartPrecoProduto';
import ChartEconomia from '@/components/charts/ChartEconomia';
import ChartCategoria from '@/components/charts/ChartCategoria';
import ChartCestaBasica from '@/components/charts/ChartCestaBasica';
import { useProdutos } from '@/hooks/useProdutos';

export default function Home() {
  const { mode, systemMode } = useColorScheme();
  const modoResolvido = mode === 'system' || mode == null ? systemMode : mode;
  const escuro = modoResolvido === 'dark';

  const {
    produtos,
    produtosCestaBasica,
    filtros,
    filtroProduto,
    setFiltroProduto,
    filtroAnos,
    setFiltroAnos,
    filtroMeses,
    setFiltroMeses,
    filtroMarca,
    setFiltroMarca,
    filtroCategoria,
    setFiltroCategoria,
    carregando,
    carregandoCesta,
    limparFiltros,
    totalComPreco,
    precoMedio,
    totalEconomia,
    ultimaData,
  } = useProdutos();

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

        <KpiCards
          carregando={carregando}
          totalProdutos={produtos.length}
          precoMedio={precoMedio}
          totalComPreco={totalComPreco}
          economia={totalEconomia}
          itensCesta={produtosCestaBasica.length}
        />

        <FiltrosBar
          opcoes={filtros}
          filtroProduto={filtroProduto}
          filtroAnos={filtroAnos}
          filtroMeses={filtroMeses}
          filtroMarca={filtroMarca}
          filtroCategoria={filtroCategoria}
          onChangeProduto={setFiltroProduto}
          onChangeAnos={setFiltroAnos}
          onChangeMeses={setFiltroMeses}
          onChangeMarca={setFiltroMarca}
          onChangeCategoria={setFiltroCategoria}
          onLimpar={limparFiltros}
        />

        <Grid container spacing={2} sx={{ mb: 3 }}>
          <Grid size={{ xs: 12, md: 7 }}>
            <ChartPrecoProduto produtos={produtos} escuro={escuro} carregando={carregando} />
          </Grid>
          <Grid size={{ xs: 12, md: 5 }}>
            <ChartEconomia produtos={produtos} escuro={escuro} carregando={carregando} />
          </Grid>
          <Grid size={{ xs: 12, md: 4 }}>
            <ChartCategoria produtos={produtos} escuro={escuro} carregando={carregando} />
          </Grid>
          <Grid size={{ xs: 12, md: 8 }}>
            <ChartCestaBasica itens={produtosCestaBasica} escuro={escuro} carregando={carregandoCesta} />
          </Grid>
        </Grid>

        <ProdutosTable produtos={produtos} carregando={carregando} onLimparFiltros={limparFiltros} />
      </Container>
    </Box>
  );
}
