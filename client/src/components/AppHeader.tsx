'use client';

import { useColorScheme } from '@mui/material/styles';
import AppBar from '@mui/material/AppBar';
import Toolbar from '@mui/material/Toolbar';
import IconButton from '@mui/material/IconButton';
import Tooltip from '@mui/material/Tooltip';
import Box from '@mui/material/Box';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import ShoppingCart from '@mui/icons-material/ShoppingCart';
import DarkMode from '@mui/icons-material/DarkMode';
import LightMode from '@mui/icons-material/LightMode';

export default function AppHeader() {
  const { mode, systemMode, setMode } = useColorScheme();
  const modoResolvido = mode === 'system' || mode == null ? systemMode : mode;
  const isDark = modoResolvido === 'dark';

  return (
    <AppBar
      position="sticky"
      elevation={0}
      sx={{
        bgcolor: 'rgba(255, 255, 255, 0.65)',
        backdropFilter: 'blur(12px)',
        borderBottom: '1px solid',
        borderColor: 'divider',
        '.dark &': {
          bgcolor: 'rgba(17, 26, 46, 0.65)',
        },
      }}
    >
      <Toolbar sx={{ gap: 1.5 }}>
        <Box
          sx={(t) => ({
            width: 40,
            height: 40,
            borderRadius: 2.5,
            display: 'grid',
            placeItems: 'center',
            color: '#fff',
            background: `linear-gradient(135deg, ${t.palette.primary.main}, ${t.palette.secondary.main})`,
            boxShadow: `0 4px 12px ${'rgba(22, 163, 74, 0.35)'}`,
          })}
        >
          <ShoppingCart fontSize="small" />
        </Box>
        <Stack sx={{ flexGrow: 1 }}>
          <Typography variant="subtitle1" sx={{ fontWeight: 800, lineHeight: 1.2 }}>
            Market
          </Typography>
          <Typography variant="caption" color="text.secondary">
            Histórico de preços
          </Typography>
        </Stack>
        <Tooltip title={isDark ? 'Tema claro' : 'Tema escuro'}>
          <IconButton
            onClick={() => setMode(isDark ? 'light' : 'dark')}
            color="inherit"
            aria-label="alternar tema"
          >
            {isDark ? <LightMode /> : <DarkMode />}
          </IconButton>
        </Tooltip>
      </Toolbar>
    </AppBar>
  );
}
