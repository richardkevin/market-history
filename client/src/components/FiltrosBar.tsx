'use client';

import Paper from '@mui/material/Paper';
import Stack from '@mui/material/Stack';
import Button from '@mui/material/Button';
import Autocomplete from '@mui/material/Autocomplete';
import TextField from '@mui/material/TextField';
import InputAdornment from '@mui/material/InputAdornment';
import Search from '@mui/icons-material/Search';
import RestartAlt from '@mui/icons-material/RestartAlt';
import type { Filtros } from '@/lib/types';

interface FiltrosBarProps {
  opcoes: Filtros;
  filtroProduto: string | null;
  filtroData: string | null;
  filtroMarca: string | null;
  onChangeProduto: (v: string | null) => void;
  onChangeData: (v: string | null) => void;
  onChangeMarca: (v: string | null) => void;
  onLimpar: () => void;
}

export default function FiltrosBar({
  opcoes,
  filtroProduto,
  filtroData,
  filtroMarca,
  onChangeProduto,
  onChangeData,
  onChangeMarca,
  onLimpar,
}: FiltrosBarProps) {
  const temFiltro = Boolean(filtroProduto || filtroData || filtroMarca);

  return (
    <Paper variant="outlined" sx={{ p: 2.5, mb: 3 }}>
      <Stack direction={{ xs: 'column', md: 'row' }} spacing={1.5}>
        <Autocomplete
          fullWidth
          freeSolo
          options={opcoes.produtos}
          value={filtroProduto}
          onChange={(_, v) => onChangeProduto(v)}
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
          options={opcoes.datas}
          value={filtroData}
          onChange={(_, v) => onChangeData(v)}
          renderInput={(params) => (
            <TextField {...params} label="Data do encarte" size="small" />
          )}
        />
        <Autocomplete
          fullWidth
          options={opcoes.marcas}
          value={filtroMarca}
          onChange={(_, v) => onChangeMarca(v)}
          renderInput={(params) => <TextField {...params} label="Marca" size="small" />}
        />
        <Button
          onClick={onLimpar}
          disabled={!temFiltro}
          startIcon={<RestartAlt />}
          variant="text"
          sx={{ whiteSpace: 'nowrap', flexShrink: 0 }}
        >
          Limpar
        </Button>
      </Stack>
    </Paper>
  );
}
