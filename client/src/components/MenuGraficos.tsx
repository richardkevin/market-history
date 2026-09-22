'use client';

import Chip from '@mui/material/Chip';
import Stack from '@mui/material/Stack';
import { GRAFICOS } from '@/lib/graficos';

export default function MenuGraficos() {
  return (
    <Stack direction="row" spacing={0.5} useFlexGap sx={{ flexWrap: 'wrap', rowGap: 0.5 }}>
      {GRAFICOS.map((g) => (
        <Chip
          key={g.slug}
          size="small"
          variant="outlined"
          clickable
          component="a"
          href={`#${g.slug}`}
          label={g.rotulo}
          aria-label={`Ir para o gráfico: ${g.rotulo}`}
        />
      ))}
    </Stack>
  );
}