'use client';

import { ComponentProps } from 'react';
import dynamic from 'next/dynamic';
import Skeleton from '@mui/material/Skeleton';

const ReactECharts = dynamic(() => import('echarts-for-react'), { ssr: false });

type EChartsOption = NonNullable<ComponentProps<typeof ReactECharts>['option']>;

interface EChartProps {
  option: EChartsOption;
  height: number;
  loading?: boolean;
  /** callback no clique em um elemento do gráfico (ex.: barra) */
  onClick?: (params: { dataIndex?: number; name?: string; value?: number | number[] }) => void;
  /** callback quando o usuário mostra/oculta itens pela legenda */
  onLegendSelectChanged?: (selected: Record<string, boolean>) => void;
}

export default function EChart({
  option,
  height,
  loading = false,
  onClick,
  onLegendSelectChanged,
}: EChartProps) {
  if (loading) {
    return <Skeleton variant="rounded" height={height} />;
  }
  const events = {
    ...(onClick
      ? {
          click: (p: { dataIndex?: number; name?: string; value?: number | number[] }) =>
            onClick(p),
        }
      : {}),
    ...(onLegendSelectChanged
      ? {
          legendselectchanged: (p: { selected: Record<string, boolean> }) =>
            onLegendSelectChanged(p.selected),
        }
      : {}),
  };
  return (
    <ReactECharts
      option={option}
      style={{ height }}
      notMerge
      onEvents={Object.keys(events).length ? events : undefined}
    />
  );
}
