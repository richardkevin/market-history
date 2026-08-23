'use client';

import Grid from '@mui/material/Grid';
import Skeleton from '@mui/material/Skeleton';
import Inventory2Outlined from '@mui/icons-material/Inventory2Outlined';
import StatCard from '@/components/StatCard';

interface KpiCardsProps {
  carregando: boolean;
  totalProdutos: number;
}

export default function KpiCards({ carregando, totalProdutos }: KpiCardsProps) {
  return (
    <Grid container spacing={2} sx={{ mb: 3 }}>
      <Grid size={{ xs: 12, sm: 6, md: 3 }}>
        {carregando ? (
          <Skeleton variant="rounded" height={96} />
        ) : (
          <StatCard
            titulo="Total de produtos"
            valor={String(totalProdutos)}
            sub="registros nos encartes"
            icon={<Inventory2Outlined />}
            cor="primary"
          />
        )}
      </Grid>
    </Grid>
  );
}
