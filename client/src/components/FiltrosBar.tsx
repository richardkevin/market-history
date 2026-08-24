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
  filtroProduto: string[];
  filtroAnos: number[];
  filtroMarca: string | null;
  filtroCategoria: string | null;
  onChangeProduto: (v: string[]) => void;
  onChangeAnos: (v: number[]) => void;
  onChangeMarca: (v: string | null) => void;
  onChangeCategoria: (v: string | null) => void;
  onLimpar: () => void;
}

export default function FiltrosBar({
  opcoes,
  filtroProduto,
  filtroAnos,
  filtroMarca,
  filtroCategoria,
  onChangeProduto,
  onChangeAnos,
  onChangeMarca,
  onChangeCategoria,
  onLimpar,
}: FiltrosBarProps) {
  const temFiltro = Boolean(
    filtroProduto.length || filtroAnos.length || filtroMarca || filtroCategoria
  );

  return (
    <Paper variant="outlined" sx={{ p: 2.5, mb: 3 }}>
      <Stack
        direction={{ xs: 'column', md: 'row' }}
        spacing={1.5}
        sx={{ flexWrap: { md: 'wrap' }, rowGap: 1.5 }}
      >
        <Autocomplete
          sx={{ flex: '2 1 260px' }}
          multiple
          freeSolo
          limitTags={2}
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
          multiple
          limitTags={1}
          options={opcoes.anos}
          value={filtroAnos}
          onChange={(_, v) => onChangeAnos(v)}
          getOptionLabel={(ano) => String(ano)}
          renderInput={(params) => (
            <TextField {...params} label="Ano do encarte" size="small" />
          )}
          sx={{ flex: '0.8 1 130px' }}
        />
        <Autocomplete
          sx={{ flex: '1 1 160px' }}
          options={opcoes.marcas}
          value={filtroMarca}
          onChange={(_, v) => onChangeMarca(v)}
          renderInput={(params) => <TextField {...params} label="Marca" size="small" />}
        />
        <Autocomplete
          sx={{ flex: '1 1 180px' }}
          options={opcoes.categorias}
          value={filtroCategoria}
          onChange={(_, v) => onChangeCategoria(v)}
          renderInput={(params) => <TextField {...params} label="Categoria" size="small" />}
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
