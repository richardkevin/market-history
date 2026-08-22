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
}

export default function EChart({ option, height, loading = false }: EChartProps) {
  if (loading) {
    return <Skeleton variant="rounded" height={height} />;
  }
  return <ReactECharts option={option} style={{ height }} notMerge />;
}
