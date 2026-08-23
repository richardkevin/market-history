import type { Produto } from '@/lib/types';

/** Converte "DD/MM/AAAA" em Date local. Retorna null se inválido. */
export function parseDataBR(data: string | null | undefined): Date | null {
  if (!data) return null;
  const m = /^(\d{2})\/(\d{2})\/(\d{4})/.exec(data.trim());
  if (!m) return null;
  const d = new Date(Number(m[3]), Number(m[2]) - 1, Number(m[1]));
  return Number.isNaN(d.getTime()) ? null : d;
}

/** Data de referência do encarte: início do intervalo ou fallback created_at. */
export function dataReferencia(p: Produto): Date | null {
  const inicio = parseDataBR(p.data_encarte);
  if (inicio) return inicio;
  const fallback = parseDataBR(p.created_at?.substring(0, 10).split('-').reverse().join('/'));
  return fallback ?? null;
}

export function chaveData(d: Date): string {
  return `${String(d.getFullYear()).padStart(4, '0')}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export interface Unidade {
  quantidade: number;
  base: 'kg' | 'L' | 'un';
}

const RE_MEDIDA =
  /(\d+(?:[.,]\d+)?)\s*(kg|kgs|quilograma[s]?|g|gramas?|gr|l|litros?|ml|militros?|mililitros?|un|unidades?|cx|caixa|fd|fasdias?|pacote|pct)/i;

/**
 * Extrai a quantidade normalizada de uma medida como "5kg", "900ml", "1 litro",
 * "2,2kg", "16 unidades". Retorna null quando não dá para comparar.
 */
export function extrairUnidade(medida: string | null | undefined): Unidade | null {
  if (!medida) return null;
  const m = RE_MEDIDA.exec(medida.toLowerCase().replace(',', '.'));
  if (!m) return null;
  const qtd = parseFloat(m[1]);
  if (!Number.isFinite(qtd) || qtd <= 0) return null;
  const u = m[2];
  if (u.startsWith('kg')) return { quantidade: qtd, base: 'kg' };
  if (u === 'g' || u.startsWith('gra')) return { quantidade: qtd / 1000, base: 'kg' };
  if (u === 'l' || u.startsWith('lit')) return { quantidade: qtd, base: 'L' };
  if (u === 'ml' || u.startsWith('mili')) return { quantidade: qtd / 1000, base: 'L' };
  return { quantidade: qtd, base: 'un' };
}

export function rotuloUnidade(u: Unidade): string {
  if (u.base === 'kg') return '/kg';
  if (u.base === 'L') return '/L';
  return '/un';
}

/** Preço normalizado pela unidade (R$/kg, R$/L, R$/un) ou null. */
export function precoPorUnidade(preco: number, medida: string | null | undefined): number | null {
  const u = extrairUnidade(medida);
  if (!u) return null;
  return preco / u.quantidade;
}

export interface PontoPreco {
  data: string; // ISO
  date: Date;
  preco: number | null;
  precoClube: number | null;
  promocao: boolean;
  medida: string | null;
  precoUnit: number | null;
  precoClubeUnit: number | null;
}

/** Série temporal de um produto, um ponto por encarte (média se repetir na mesma data), ordenado. */
export function serieProduto(produtos: Produto[]): PontoPreco[] {
  const porData = new Map<string, Produto[]>();
  for (const p of produtos) {
    const d = dataReferencia(p);
    if (!d || p.preco == null) continue;
    const k = chaveData(d);
    (porData.get(k) ?? porData.set(k, []).get(k)!).push(p);
  }
  const media = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
  const pontos: PontoPreco[] = [];
  for (const [iso, grupo] of [...porData.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
    const medida = grupo[grupo.length - 1].medida;
    const preco = media(grupo.map((p) => p.preco as number));
    const clubes = grupo.filter((p) => p.preco_clube != null && p.preco_clube < (p.preco ?? Infinity));
    pontos.push({
      data: iso,
      date: new Date(`${iso}T12:00:00`),
      preco,
      precoClube: clubes.length ? Math.min(...clubes.map((p) => p.preco_clube as number)) : null,
      promocao: grupo.some((p) => p.tipo_promocao != null),
      medida,
      precoUnit: precoPorUnidade(preco, medida),
      precoClubeUnit:
        clubes.length
          ? Math.min(
              ...clubes.map((p) => precoPorUnidade(p.preco_clube as number, p.medida)).filter((v): v is number => v != null)
            )
          : null,
    });
  }
  return pontos;
}

export interface Variacao {
  produto: string;
  marca: string | null;
  medidaAtual: string | null;
  categoria: string | null;
  precoAnterior: number;
  precoAtual: number;
  precoClubeAtual: number | null;
  delta: number;
  pct: number;
  dataAnterior: string;
  dataAtual: string;
  /** true se a embalagem mudou entre os dois registros */
  mudouEmbalagem: boolean;
  /** variação % do preço por unidade (queda disfarçada de embalagem menor) */
  pctUnitario: number | null;
}

function agrupaPorProduto(produtos: Produto[]): Map<string, Produto[]> {
  const mapa = new Map<string, Produto[]>();
  for (const p of produtos) {
    if (!p.produto || p.erro_identificacao || p.preco == null) continue;
    (mapa.get(p.produto) ?? mapa.set(p.produto, []).get(p.produto)!).push(p);
  }
  for (const lista of mapa.values()) {
    lista.sort(
      (a, b) => (dataReferencia(a)?.getTime() ?? 0) - (dataReferencia(b)?.getTime() ?? 0)
    );
  }
  return mapa;
}

/**
 * Variação de cada produto entre o penúltimo e o último encarte em que apareceu.
 * Compara sempre os dois registros mais recentes do próprio produto (tolera buracos).
 */
export function variacoesDesdeUltimoEncarte(produtos: Produto[]): Variacao[] {
  const resultado: Variacao[] = [];
  for (const [nome, historico] of agrupaPorProduto(produtos)) {
    if (historico.length < 2) continue;
    const atual = historico[historico.length - 1];
    const dataAtual = dataReferencia(atual);
    if (!dataAtual || atual.preco == null) continue;
    const isoAtual = chaveData(dataAtual);

    let anterior: { p: Produto; iso: string } | null = null;
    for (let i = historico.length - 2; i >= 0; i--) {
      const d = dataReferencia(historico[i]);
      if (!d) continue;
      const iso = chaveData(d);
      if (iso !== isoAtual) {
        anterior = { p: historico[i], iso };
        break;
      }
    }
    if (!anterior || anterior.p.preco == null) continue;

    const precoAnterior = anterior.p.preco;
    const precoAtual = atual.preco;
    const unAtual = extrairUnidade(atual.medida);
    const unAnterior = extrairUnidade(anterior.p.medida);
    const mesmoBase = unAtual && unAnterior && unAtual.base === unAnterior.base;
    resultado.push({
      produto: nome,
      marca: atual.marca,
      medidaAtual: atual.medida,
      categoria: atual.categoria,
      precoAnterior,
      precoAtual,
      precoClubeAtual: atual.preco_clube ?? null,
      delta: precoAtual - precoAnterior,
      pct: ((precoAtual - precoAnterior) / precoAnterior) * 100,
      dataAnterior: anterior.iso,
      dataAtual: isoAtual,
      mudouEmbalagem: Boolean(mesmoBase && unAtual!.quantidade !== unAnterior!.quantidade),
      pctUnitario:
        mesmoBase
          ? ((precoAtual / unAtual!.quantidade - precoAnterior / unAnterior!.quantidade) /
              (precoAnterior / unAnterior!.quantidade)) *
            100
          : null,
    });
  }
  return resultado;
}

/**
 * Índice encadeado estilo cesta (base 100): cada encarte compara apenas os
 * produtos que também estavam no encarte anterior (Laspeyres encadeado), então
 * produtos que somem/entram não distorcem a série.
 */
export function indiceCestaEncadeada(produtos: Produto[]): { data: string; indice: number }[] {
  const precosPorData = new Map<string, Map<string, { soma: number; n: number }>>();
  for (const p of produtos) {
    const d = dataReferencia(p);
    if (!d || p.preco == null || !p.produto) continue;
    const k = chaveData(d);
    let dia = precosPorData.get(k);
    if (!dia) {
      dia = new Map();
      precosPorData.set(k, dia);
    }
    const celula = dia.get(p.produto) ?? { soma: 0, n: 0 };
    celula.soma += p.preco;
    celula.n += 1;
    dia.set(p.produto, celula);
  }

  const datas = [...precosPorData.keys()].sort();
  if (datas.length < 2) return [];

  const serie: { data: string; indice: number }[] = [];
  let acumulado = 1;
  let anteriorDia: Map<string, { soma: number; n: number }> | null = null;

  for (const data of datas) {
    const dia = precosPorData.get(data)!;
    const precoMedio = new Map<string, number>(
      [...dia.entries()].map(([nome, c]) => [nome, c.soma / c.n])
    );
    if (anteriorDia) {
      const anteriorMedio = new Map<string, number>(
        [...anteriorDia.entries()].map(([nome, c]) => [nome, c.soma / c.n])
      );
      const comuns = [...precoMedio.entries()].filter(([nome]) => anteriorMedio.has(nome));
      if (comuns.length >= 5) {
        const fator =
          comuns.reduce((acc, [nome, preco]) => acc + preco / (anteriorMedio.get(nome) as number), 0) /
          comuns.length;
        // amortiza saltos absurdos de OCR (ex.: erro pontual de leitura)
        if (fator > 0.25 && fator < 4) acumulado *= fator;
      }
    }
    serie.push({ data, indice: Math.round(acumulado * 10000) / 100 });
    anteriorDia = dia;
  }
  return serie;
}

export interface VariacaoCategoria {
  categoria: string;
  data: string;
  pct: number | null; // vs coluna anterior; null = sem base comparável
}

/**
 * Variação % do preço médio por categoria em cada encarte vs. encarte anterior.
 * Colunas são as datas globais; buracos viram null.
 */
export function heatmapCategorias(produtos: Produto[]): {
  datas: string[];
  categorias: { nome: string; valores: (number | null)[] }[];
} {
  const medias = new Map<string, Map<string, { soma: number; n: number }>>();
  for (const p of produtos) {
    const d = dataReferencia(p);
    if (!d || p.preco == null || !p.categoria || p.erro_identificacao) continue;
    const dataISO = chaveData(d);
    let cat = medias.get(p.categoria);
    if (!cat) {
      cat = new Map();
      medias.set(p.categoria, cat);
    }
    const celula = cat.get(dataISO) ?? { soma: 0, n: 0 };
    celula.soma += p.preco;
    celula.n += 1;
    cat.set(dataISO, celula);
  }

  const datas = [
    ...new Set([...medias.values()].flatMap((cat) => [...cat.keys()])),
  ].sort();

  const categorias = [...medias.entries()]
    .map(([nome, cat]) => ({
      nome,
      valores: datas.map((data, i) => {
        const celula = cat.get(data);
        if (!celula) return null;
        if (i === 0) return null;
        for (let j = i - 1; j >= 0; j--) {
          const base = cat.get(datas[j]);
          if (base) {
            const mediaAtual = celula.soma / celula.n;
            const mediaBase = base.soma / base.n;
            return Math.round(((mediaAtual - mediaBase) / mediaBase) * 10000) / 100;
          }
        }
        return null;
      }),
    }))
    .filter((c) => c.valores.some((v) => v != null))
    .sort((a, b) =>
      a.nome.localeCompare(b.nome, 'pt-BR')
    );

  return { datas, categorias };
}

export interface MediaAnual {
  ano: number;
  preco: number;
  precoMin: number;
  precoMax: number;
  precoClube: number | null;
  nRegistros: number;
}

/** Preço médio por ano-calendário, com faixa mín–máx e média do Clube. */
export function mediasAnuais(produtos: Produto[]): MediaAnual[] {
  const porAno = new Map<number, { soma: number; min: number; max: number; clubes: number[]; n: number }>();
  for (const p of produtos) {
    const d = dataReferencia(p);
    if (!d || p.preco == null) continue;
    const ano = d.getFullYear();
    let celula = porAno.get(ano);
    if (!celula) {
      celula = { soma: 0, min: Infinity, max: -Infinity, clubes: [], n: 0 };
      porAno.set(ano, celula);
    }
    celula.soma += p.preco;
    celula.n += 1;
    celula.min = Math.min(celula.min, p.preco);
    celula.max = Math.max(celula.max, p.preco);
    if (p.preco_clube != null && p.preco_clube < p.preco) celula.clubes.push(p.preco_clube);
  }
  return [...porAno.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([ano, c]) => ({
      ano,
      preco: c.soma / c.n,
      precoMin: c.min,
      precoMax: c.max,
      precoClube: c.clubes.length
        ? c.clubes.reduce((a, b) => a + b, 0) / c.clubes.length
        : null,
      nRegistros: c.n,
    }));
}

export const formatarPct = (v: number) =>
  `${v > 0 ? '+' : ''}${v.toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%`;

export const formatarDataCurta = (iso: string) => {
  const [, mes, dia] = iso.split('-');
  return `${dia}/${mes}`;
};
