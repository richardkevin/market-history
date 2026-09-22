import type { Produto } from '@/lib/types';
import { dataReferencia, chaveMes } from '@/lib/historico';

/**
 * Valor mensal da cesta básica da cidade do Rio de Janeiro (R$), conforme a
 * Pesquisa Nacional da Cesta Básica de Alimentos — DIEESE (em parceria com a
 * Conab desde 2025). Fonte: SGS/Banco Central (série 7491) e boletins DIEESE
 * de análise da cesta básica. Série completa de jan/2017 a ago/2026.
 */
export interface PontoDieese {
  data: string; // "YYYY-MM"
  valor: number;
}

export const DIEESE_CESTA_RJ: PontoDieese[] = [
  { data: '2017-01', valor: 440.16 }, { data: '2017-02', valor: 424.55 },
  { data: '2017-03', valor: 431.31 }, { data: '2017-04', valor: 448.51 },
  { data: '2017-05', valor: 442.56 }, { data: '2017-06', valor: 420.35 },
  { data: '2017-07', valor: 425.62 }, { data: '2017-08', valor: 410.43 },
  { data: '2017-09', valor: 410.27 }, { data: '2017-10', valor: 421.05 },
  { data: '2017-11', valor: 407.37 }, { data: '2017-12', valor: 418.71 },
  { data: '2018-01', valor: 443.81 }, { data: '2018-02', valor: 438.36 },
  { data: '2018-03', valor: 441.19 }, { data: '2018-04', valor: 440.06 },
  { data: '2018-05', valor: 446.03 }, { data: '2018-06', valor: 445.58 },
  { data: '2018-07', valor: 421.89 }, { data: '2018-08', valor: 417.05 },
  { data: '2018-09', valor: 418.48 }, { data: '2018-10', valor: 443.69 },
  { data: '2018-11', valor: 460.24 }, { data: '2018-12', valor: 466.75 },
  { data: '2019-01', valor: 460.46 }, { data: '2019-02', valor: 464.47 },
  { data: '2019-03', valor: 496.33 }, { data: '2019-04', valor: 515.58 },
  { data: '2019-05', valor: 492.93 }, { data: '2019-06', valor: 498.67 },
  { data: '2019-07', valor: 479.28 }, { data: '2019-08', valor: 462.24 },
  { data: '2019-09', valor: 458.21 }, { data: '2019-10', valor: 462.57 },
  { data: '2019-11', valor: 455.37 }, { data: '2019-12', valor: 516.91 },
  { data: '2020-01', valor: 507.13 }, { data: '2020-02', valor: 505.55 },
  { data: '2020-03', valor: 533.65 }, { data: '2020-04', valor: 544.34 },
  { data: '2020-05', valor: 558.81 }, { data: '2020-06', valor: 512.84 },
  { data: '2020-07', valor: 505.72 }, { data: '2020-08', valor: 529.76 },
  { data: '2020-09', valor: 563.75 }, { data: '2020-10', valor: 592.25 },
  { data: '2020-11', valor: 629.63 }, { data: '2020-12', valor: 621.09 },
  { data: '2021-01', valor: 644.0 }, { data: '2021-02', valor: 629.82 },
  { data: '2021-03', valor: 612.56 }, { data: '2021-04', valor: 622.04 },
  { data: '2021-05', valor: 622.76 }, { data: '2021-06', valor: 619.24 },
  { data: '2021-07', valor: 621.34 }, { data: '2021-08', valor: 634.18 },
  { data: '2021-09', valor: 643.06 }, { data: '2021-10', valor: 673.85 },
  { data: '2021-11', valor: 665.6 }, { data: '2021-12', valor: 666.26 },
  { data: '2022-01', valor: 692.83 }, { data: '2022-02', valor: 697.37 },
  { data: '2022-03', valor: 750.71 }, { data: '2022-04', valor: 768.42 },
  { data: '2022-05', valor: 723.55 }, { data: '2022-06', valor: 733.14 },
  { data: '2022-07', valor: 723.75 }, { data: '2022-08', valor: 717.82 },
  { data: '2022-09', valor: 714.14 }, { data: '2022-10', valor: 736.28 },
  { data: '2022-11', valor: 749.25 }, { data: '2022-12', valor: 752.74 },
  { data: '2023-01', valor: 770.19 }, { data: '2023-02', valor: 745.96 },
  { data: '2023-03', valor: 735.62 }, { data: '2023-04', valor: 750.77 },
  { data: '2023-05', valor: 749.76 }, { data: '2023-06', valor: 741.0 },
  { data: '2023-07', valor: 738.12 }, { data: '2023-08', valor: 722.78 },
  { data: '2023-09', valor: 719.92 }, { data: '2023-10', valor: 721.17 },
  { data: '2023-11', valor: 728.27 }, { data: '2023-12', valor: 738.61 },
  { data: '2024-01', valor: 791.77 }, { data: '2024-02', valor: 832.8 },
  { data: '2024-03', valor: 812.25 }, { data: '2024-04', valor: 801.15 },
  { data: '2024-05', valor: 796.67 }, { data: '2024-06', valor: 814.38 },
  { data: '2024-07', valor: 757.64 }, { data: '2024-08', valor: 745.64 },
  { data: '2024-09', valor: 757.3 }, { data: '2024-10', valor: 773.7 },
  { data: '2024-11', valor: 777.66 }, { data: '2024-12', valor: 779.84 },
  { data: '2025-01', valor: 802.88 }, { data: '2025-02', valor: 814.9 },
  { data: '2025-03', valor: 835.5 }, { data: '2025-04', valor: 849.7 },
  { data: '2025-05', valor: 847.99 }, { data: '2025-06', valor: 843.27 },
  { data: '2025-07', valor: 823.59 }, { data: '2025-08', valor: 801.34 },
  { data: '2025-09', valor: 799.22 }, { data: '2025-10', valor: 801.37 },
  { data: '2025-11', valor: 783.96 }, { data: '2025-12', valor: 792.06 },
  { data: '2026-01', valor: 817.6 }, { data: '2026-02', valor: 826.98 },
  { data: '2026-03', valor: 867.97 }, { data: '2026-04', valor: 879.03 },
  { data: '2026-05', valor: 914.48 }, { data: '2026-06', valor: 920.94 },
  { data: '2026-07', valor: 855.37 }, { data: '2026-08', valor: 851.19 },
];

const MESES_CURTOS = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];

/** "2026-08" → "ago/26". */
export function rotuloMes(data: string): string {
  const [ano, mes] = data.split('-');
  return `${MESES_CURTOS[Number(mes) - 1]}/${ano.slice(2)}`;
}

/** Primeiro e último mês ("YYYY-MM") cobertos pelos produtos; null se vazio. */
export function periodoProdutos(produtos: Produto[]): { inicio: string; fim: string } | null {
  let inicio: string | null = null;
  let fim: string | null = null;
  for (const p of produtos) {
    const d = dataReferencia(p);
    if (!d) continue;
    const k = chaveMes(d);
    if (!inicio || k < inicio) inicio = k;
    if (!fim || k > fim) fim = k;
  }
  return inicio && fim ? { inicio, fim } : null;
}

/** Série DIEESE limitada ao mesmo período dos produtos passados. */
export function serieDieeseNoPeriodo(produtos: Produto[]): PontoDieese[] {
  const periodo = periodoProdutos(produtos);
  if (!periodo) return DIEESE_CESTA_RJ;
  return DIEESE_CESTA_RJ.filter((p) => p.data >= periodo.inicio && p.data <= periodo.fim);
}

export interface ResumoDieese {
  periodo: string;
  rotulo: string;
  valor: number;
  variacaoMensal: number | null;
  variacao12m: number | null;
  variacaoNoAno: number | null;
}

/** Resumo do último ponto da série (mês corrente mais recente). */
export function resumoDieese(lista: PontoDieese[] = DIEESE_CESTA_RJ): ResumoDieese | null {
  if (lista.length === 0) return null;
  const ultimo = lista[lista.length - 1];
  const anterior = lista[lista.length - 2];
  const mesAnoAnterior = lista.find((p) => {
    const [y, m] = ultimo.data.split('-');
    return p.data === `${Number(y) - 1}-${m}`;
  });
  const primeiroDoAno = lista.filter((p) => p.data.startsWith(ultimo.data.slice(0, 4)))[0];
  const pct = (base: number | undefined, atual: number) =>
    base && base > 0 ? ((atual / base - 1) * 100) : null;
  return {
    periodo: ultimo.data,
    rotulo: rotuloMes(ultimo.data),
    valor: ultimo.valor,
    variacaoMensal: anterior ? pct(anterior.valor, ultimo.valor) : null,
    variacao12m: mesAnoAnterior ? pct(mesAnoAnterior.valor, ultimo.valor) : null,
    variacaoNoAno: primeiroDoAno ? pct(primeiroDoAno.valor, ultimo.valor) : null,
  };
}

/** Anual (média dos 12 meses) e valor médio no ano (para comparar com a cesta local por ano). */
export function mediaAnualDieese(lista: PontoDieese[] = DIEESE_CESTA_RJ): { ano: number; media: number }[] {
  const porAno = new Map<number, { soma: number; n: number }>();
  for (const { data, valor } of lista) {
    const ano = Number(data.slice(0, 4));
    const c = porAno.get(ano) ?? { soma: 0, n: 0 };
    c.soma += valor;
    c.n += 1;
    porAno.set(ano, c);
  }
  return [...porAno.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([ano, c]) => ({ ano, media: c.soma / c.n }));
}