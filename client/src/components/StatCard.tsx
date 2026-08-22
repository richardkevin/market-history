import type { ReactNode } from 'react';
import { alpha, useTheme } from '@mui/material/styles';
import Paper from '@mui/material/Paper';
import Stack from '@mui/material/Stack';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';

interface StatCardProps {
  titulo: string;
  valor: string;
  sub?: string;
  icon: ReactNode;
  cor: 'primary' | 'secondary' | 'info' | 'warning';
}

export default function StatCard({ titulo, valor, sub, icon, cor }: StatCardProps) {
  const theme = useTheme();
  const main = theme.palette[cor].main;

  return (
    <Paper variant="outlined" sx={{ p: 2.5, height: '100%' }}>
      <Stack direction="row" spacing={2} sx={{ alignItems: 'center', height: '100%' }}>
        <Box
          sx={{
            width: 48,
            height: 48,
            flexShrink: 0,
            borderRadius: 3,
            display: 'grid',
            placeItems: 'center',
            color: main,
            bgcolor: alpha(main, 0.14),
          }}
        >
          {icon}
        </Box>
        <Box sx={{ minWidth: 0 }}>
          <Typography variant="caption" color="text.secondary" noWrap component="div">
            {titulo}
          </Typography>
          <Typography variant="h5" sx={{ fontWeight: 800, lineHeight: 1.2 }}>
            {valor}
          </Typography>
          <Typography variant="caption" color="text.secondary" noWrap component="div">
            {sub ?? '\u00A0'}
          </Typography>
        </Box>
      </Stack>
    </Paper>
  );
}
