'use client';

import Stack from '@mui/material/Stack';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import InfoOutlined from '@mui/icons-material/InfoOutlined';

interface InfoTituloProps {
  titulo: string;
  descricao: string;
}

export default function InfoTitulo({ titulo, descricao }: InfoTituloProps) {
  return (
    <Stack direction="row" spacing={0.5} sx={{ alignItems: 'center', minWidth: 0 }}>
      <Typography variant="h6">{titulo}</Typography>
      <Tooltip
        title={descricao}
        arrow
        placement="top"
        slotProps={{ tooltip: { sx: { maxWidth: 340, fontSize: '0.8rem' } } }}
      >
        <InfoOutlined
          fontSize="small"
          sx={{ color: 'text.disabled', cursor: 'help', flexShrink: 0, '&:hover': { color: 'info.main' } }}
        />
      </Tooltip>
    </Stack>
  );
}
