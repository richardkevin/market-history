export const brl = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });

export const chartCores = {
  light: {
    text: '#334155',
    muted: '#94a3b8',
    split: '#e2e8f0',
    tooltipBg: '#ffffff',
    series: ['#16a34a', '#ea580c', '#0ea5e9', '#8b5cf6', '#eab308', '#ec4899', '#14b8a6', '#f97316'],
  },
  dark: {
    text: '#cbd5e1',
    muted: '#64748b',
    split: '#253046',
    tooltipBg: '#1a2439',
    series: ['#4ade80', '#fb923c', '#38bdf8', '#a78bfa', '#facc15', '#f472b6', '#2dd4bf', '#fdba74'],
  },
} as const;

export const AVATAR_COLORS = ['#16a34a', '#0ea5e9', '#ea580c', '#8b5cf6', '#eab308', '#ec4899', '#14b8a6'];

export const CESTA_BASICA = [
  'ARROZ',
  'FEIJÃO',
  'CARNE',
  'LEITE',
  'FARINHA',
  'BATATA',
  'TOMATE',
  'PÃO',
  'CAFÉ',
  'BANANA',
  'AÇÚCAR',
  'ÓLEO',
  'MANTEIGA',
];

export function iniciais(nome: string): string {
  return nome
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0])
    .join('')
    .toUpperCase();
}
