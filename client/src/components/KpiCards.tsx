'use client';

import Grid from '@mui/material/Grid';
import Skeleton from '@mui/material/Skeleton';
import Inventory2Outlined from '@mui/icons-material/Inventory2Outlined';
import PaymentsOutlined from '@mui/icons-material/PaymentsOutlined';
import SavingsOutlined from '@mui/icons-material/SavingsOutlined';
import ShoppingBasketOutlined from '@mui/icons-material/ShoppingBasketOutlined';
import StatCard from '@/components/StatCard';
import { brl } from '@/lib/utils';

interface KpiCardsProps {
  carregando: boolean;
  totalProdutos: number;
  precoMedio: number;
  totalComPreco: number;
  economia: number;
  itensCesta: number;
}

export default function KpiCards({
  carregando,
  totalProdutos,
  precoMedio,
  totalComPreco,
  economia,
  itensCesta,
}: KpiCardsProps) {
  return (
    <Grid container spacing={2} sx={{ mb: 3 }}>
      <Grid size={{ xs: 12, sm: 6, md: 3 }}>
        {carregando ? (
          <Skeleton variant="rounded" height={96} />
        ) : (
          <StatCard
            titulo="Total de produtos"
            valor={String(totalProdutos)}
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
            valor={brl.format(economia)}
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
            valor={String(itensCesta)}
            sub="itens encontrados"
            icon={<ShoppingBasketOutlined />}
            cor="warning"
          />
        )}
      </Grid>
    </Grid>
  );
}
