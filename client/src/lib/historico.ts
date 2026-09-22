import type { Produto } from '@/lib/types';
import { CESTA_BASICA } from '@/lib/utils';

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

/** Chave "YYYY-MM" para agregar por mês. */
export function chaveMes(d: Date): string {
  return chaveData(d).slice(0, 7);
}

function dataDeChave(k: string): Date {
  const [y, m] = k.split('-').map(Number);
  return new Date(y, (m ?? 1) - 1, 1, 12);
}

export type Granularidade = 'ano' | 'mes' | 'encarte';

const chavePorGranularidade = (g: Granularidade) => (d: Date) =>
  g === 'mes' ? chaveMes(d) : g === 'encarte' ? chaveData(d) : String(d.getFullYear());

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

/** Série temporal de um produto, um ponto por encarte (ou mês), média se repetir, ordenado. */
export function serieProduto(
  produtos: Produto[],
  opts?: { granularidade?: Granularidade }
): PontoPreco[] {
  const chave = chavePorGranularidade(opts?.granularidade ?? 'encarte');
  const porData = new Map<string, Produto[]>();
  for (const p of produtos) {
    const d = dataReferencia(p);
    if (!d || p.preco == null) continue;
    const k = chave(d);
    (porData.get(k) ?? porData.set(k, []).get(k)!).push(p);
  }
  const media = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
  const pontos: PontoPreco[] = [];
  for (const [k, grupo] of [...porData.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
    const preco = media(grupo.map((p) => p.preco as number));
    const clubes = grupo.filter((p) => p.preco_clube != null && p.preco_clube < (p.preco ?? Infinity));
    const precoUnitMedio = (xs: Produto[]): number | null => {
      const vals = xs
        .map((p) => precoPorUnidade(p.preco as number, p.medida))
        .filter((v): v is number => v != null);
      return vals.length ? media(vals) : null;
    };
    const precoUnit = precoUnitMedio(grupo);
    pontos.push({
      data: k,
      date: dataDeChave(k),
      preco,
      precoClube: clubes.length ? Math.min(...clubes.map((p) => p.preco_clube as number)) : null,
      promocao: grupo.some((p) => p.tipo_promocao != null),
      medida: grupo[grupo.length - 1].medida,
      precoUnit,
      precoClubeUnit: clubes.length ? precoUnitMedio(clubes) : null,
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
  /** salto extremo sem base unitária comparável (provável pack/erro de OCR) */
  suspeito: boolean;
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
    const pct = ((precoAtual - precoAnterior) / precoAnterior) * 100;
    resultado.push({
      produto: nome,
      marca: atual.marca,
      medidaAtual: atual.medida,
      categoria: atual.categoria,
      precoAnterior,
      precoAtual,
      precoClubeAtual: atual.preco_clube ?? null,
      delta: precoAtual - precoAnterior,
      pct,
      dataAnterior: anterior.iso,
      dataAtual: isoAtual,
      mudouEmbalagem: Boolean(mesmoBase && unAtual!.quantidade !== unAnterior!.quantidade),
      pctUnitario:
        mesmoBase
          ? ((precoAtual / unAtual!.quantidade - precoAnterior / unAnterior!.quantidade) /
              (precoAnterior / unAnterior!.quantidade)) *
            100
          : null,
      suspeito: !mesmoBase && Math.abs(pct) > 150,
    });
  }
  return resultado;
}

/**
 * Índice encadeado estilo cesta (base 100): cada período compara apenas os
 * produtos que também estavam no anterior (Laspeyres encadeado), então
 * produtos que somem/entram não distorcem a série.
 */
export function indiceCestaEncadeada(
  produtos: Produto[],
  opts?: { granularidade?: Granularidade }
): { data: string; indice: number }[] {
  const chave = chavePorGranularidade(opts?.granularidade ?? 'encarte');
  const precosPorData = new Map<string, Map<string, { soma: number; n: number }>>();
  for (const p of produtos) {
    const d = dataReferencia(p);
    if (!d || p.preco == null || !p.produto) continue;
    const k = chave(d);
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
 * Variação % do preço médio por categoria em cada período vs. anterior.
 * Colunas são datas (ou meses) globais; buracos viram null.
 */
export function heatmapCategorias(
  produtos: Produto[],
  opts?: { granularidade?: Granularidade }
): {
  datas: string[];
  categorias: { nome: string; valores: (number | null)[] }[];
} {
  const chave = chavePorGranularidade(opts?.granularidade ?? 'encarte');
  const medias = new Map<string, Map<string, { soma: number; n: number }>>();
  for (const p of produtos) {
    const d = dataReferencia(p);
    if (!d || p.preco == null || !p.categoria || p.erro_identificacao) continue;
    const dataISO = chave(d);
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
export function mediasAnuais(
  produtos: Produto[],
  opts?: { porUnidade?: boolean }
): MediaAnual[] {
  const porUnidade = opts?.porUnidade ?? false;
  const valor = (p: Produto) =>
    porUnidade ? precoPorUnidade(p.preco as number, p.medida) : (p.preco ?? null);

  const porAno = new Map<number, { soma: number; min: number; max: number; clubes: number[]; n: number }>();
  for (const p of produtos) {
    const d = dataReferencia(p);
    if (!d || p.preco == null) continue;
    const preco = valor(p);
    if (preco == null) continue;
    const clube =
      p.preco_clube != null && p.preco_clube < p.preco
        ? porUnidade
          ? precoPorUnidade(p.preco_clube, p.medida)
          : p.preco_clube
        : null;

    const ano = d.getFullYear();
    let celula = porAno.get(ano);
    if (!celula) {
      celula = { soma: 0, min: Infinity, max: -Infinity, clubes: [], n: 0 };
      porAno.set(ano, celula);
    }
    celula.soma += preco;
    celula.n += 1;
    celula.min = Math.min(celula.min, preco);
    celula.max = Math.max(celula.max, preco);
    if (clube != null) celula.clubes.push(clube);
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

/**
 * Palavras que indicam que o produto não é um item da cesta básica, mesmo que o
 * nome contenha um dos termos de `CESTA_BASICA` (ex.: "Tempero Carne", "Ração Carne").
 */
const NAO_CESTA = new Set([
  'TEMPERO',
  'CALDO',
  'AMACIANTE',
  'CONDIMENTO',
  'RAÇÃO',
  'RAÇOES',
  'PETISCO',
  'BIFINHO',
  'SACHÊ',
  'SACHE',
  'MACARRÃO',
  'MACARRAO',
  'LÁMEN',
  'LAMEN',
  'SNACK',
]);

/**
 * Exclusões específicas por grupo: o nome casa com o keyword da cesta, mas o
 * produto não é o item em si (ex.: óleo capilar em "ÓLEO", bombom "ao Leite",
 * biscoito "à Leite" em "LEITE", tempero/caldo/ração em "CARNE").
 */
const EXCLUSAO_POR_GRUPO: Record<string, readonly string[]> = {
  AÇÚCAR: [
    'NEUTRAÇÚCAR',
    'NEUTRACUCAR',
    'ANTIAÇÚCAR',
    'ANTIACUCAR',
    'ZERO AÇÚCAR',
    'ZERO ACUCAR',
    'SEM AÇÚCAR',
    'SEM ACUCAR',
    'S/ AÇÚCAR',
    'S/ ACUCAR',
    'LOWÇUCAR',
    'LOWCUCAR',
    'BOMBOM',
    'CHOCOLATE',
    'BISCOITO',
    'CONCENTRADO',
  ],
  BANANA: [
    'BARRA',
    'BOMBOM',
    'NUTS',
    'PÉ DE MOLEQUE',
    'PE DE MOLEQUE',
    'PROTEICA',
    'PROTEÍNA',
    'PROTEINA',
  ],
  BATATA: [
    'PALHA',
    'PALITO',
    'FRITA',
    'CHIPS',
    'PRINGLE',
    'RUFFLES',
    "LAY'S",
    'LAYS',
    'JACKER',
    'MCCAIN',
    'YOKITOS',
    'ONDULADA',
    'ROSTIE',
    'ROSTI',
    'NHOQUE',
    'CONGELAD',
    'CONG.',
    'PRÉ-FRIT',
    'PRE-FRIT',
    'PRÉ FRIT',
    'PRE FRIT',
    'HASH BROWN',
    'NOISETTE',
    'AIR FRYER',
    'CRINKLE',
    'SEAKHOUSE',
    'STEAKHOUSE',
    'SALGADINHO',
    'SNACK',
    'LONG CHIPS',
    'TUBO',
    'DOCE',
    'PAPINHA',
    'SALADA',
    'BISCOITO',
  ],
  CAFÉ: [
    'SOLÚVEL',
    'SOLUVEL',
    'INSTANTÂNEO',
    'INSTANTANEO',
    'CÁPSULA',
    'CAPSULA',
    'CAPPUCCINO',
    'CAPUCCINO',
    'LIOFILIZADO',
    'BEBIDA',
    'SUPLEMENTO',
    'NOTSHAKE',
    'PROTEÍNA',
    'PROTEINA',
    'GOURMET',
    'ESPECIAL',
    'EM GRÃOS',
    'EM GRAOS',
    'GRÃOS',
    'GRAOS',
    'ORGÂNICO',
    'ORGANICO',
    'DESCAFEINADO',
    'CAFETERIA',
    'COLÔMBIA',
    'COLOMBIA',
    'PERU',
    "L'OR",
  ],
  MANTEIGA: [
    'CAPILAR',
    'GHEE',
    'DE COCO',
    'PERU',
    'PIPOCA',
    'BISCOITO',
    'AMANTEIGADO',
    'CREAM CRACKER',
    'MARGARINA',
    'BECEL',
  ],
  ÓLEO: [
    'CAPILAR',
    'CORPORAL',
    'FINALIZADOR',
    'MILAGROSO',
    'EXTRAORDINÁRIO',
    'EXTRAORDINARIO',
    'MÁGICO',
    'MAGICO',
    'DA BELLE',
    'LOLA',
    'MUSA',
    'PAIXÃO',
    'PANTENE',
    'ELSEVE',
    'RÍCINO',
    'RICINO',
    'NIVEA',
    'BANHO',
    'MICELAR',
    'CREAM',
    'SARDINHA',
    'ATUM',
    'PEIXE',
    'WHEY',
    'LEAVE-IN',
    'LEAVE IN',
    'TRESSEMME',
    'PINGA',
    'DANOS',
    'PROBELLE',
    'SABONETE',
    'COCO',
    'NUTRIÇÃO',
    'NUTRICAO',
    'DOVE',
    'ULTRA',
  ],
  LEITE: [
    'AO LEITE',
    'BOMBOM',
    'BISCOITO',
    'CHOCOLATE',
    'TRUFA',
    'CONFEITO',
    'WHEY',
    'DE ROSAS',
    'DEMAQUILANTE',
    'DE COCO',
    'C/LEITE',
    'ROSA',
  ],
};

/** Grupo da cesta básica ao qual o produto pertence (ou null). */
export function grupoCesta(nomeProduto: string): string | null {
  const nome = nomeProduto.toUpperCase();
  if ([...NAO_CESTA].some((t) => nome.includes(t))) return null;
  for (const item of CESTA_BASICA) {
    if (!nome.includes(item)) continue;
    const ex = EXCLUSAO_POR_GRUPO[item];
    if (ex && ex.some((t) => nome.includes(t))) return null;
    return item;
  }
  return null;
}

export interface SerieGrupo {
  grupo: string;
  pontos: { date: Date; data: string; precoUnit: number | null }[];
}

export interface GrupoPreco {
  grupo: string;
  precoMedio: number;
  nProdutos: number;
  exemplos: string[];
}

/**
 * Agrupa produtos similares da cesta básica (todos os arrozes, todos os leites…)
 * e calcula o preço médio do grupo a partir do registro mais recente de cada produto.
 */
export function precosGruposCesta(itens: Produto[]): GrupoPreco[] {
  const grupos = new Map<string, Map<string, number>>();
  for (const p of itens) {
    const g = grupoCesta(p.produto);
    if (!g || !p.produto) continue;
    let porProduto = grupos.get(g);
    if (!porProduto) {
      porProduto = new Map();
      grupos.set(g, porProduto);
    }
    // mantém só o preço mais recente de cada produto dentro do grupo
    if (!porProduto.has(p.produto)) porProduto.set(p.produto, p.preco ?? 0);
  }
  return [...grupos.entries()]
    .map(([grupo, porProduto]) => {
      const precos = [...porProduto.values()].filter((v) => v > 0);
      return {
        grupo,
        precoMedio: precos.reduce((a, b) => a + b, 0) / (precos.length || 1),
        nProdutos: precos.length,
        exemplos: [...porProduto.keys()].slice(0, 3),
      };
    })
    .filter((g) => g.nProdutos > 0)
    .sort((a, b) => b.precoMedio - a.precoMedio);
}

export interface ValorCestaAnual {
  ano: number;
  valor: number;
  gruposIncluidos: number;
  gruposPossiveis: number;
  itens: { grupo: string; precoUnidade: number; contribuicao: number }[];
}

/**
 * Pesos da cesta básica (piso de referência DIEESE): quantidade fixa comprada
 * de cada alimento. Mesma unidade em que o preço é normalizado (R$/kg·L·un).
 */
export const CESTA_BASICA_QTD: Record<string, { qtd: number; base: 'kg' | 'L' | 'un' }> = {
  CARNE: { qtd: 6, base: 'kg' },
  LEITE: { qtd: 15, base: 'L' },
  FEIJÃO: { qtd: 4.5, base: 'kg' },
  ARROZ: { qtd: 3.6, base: 'kg' },
  FARINHA: { qtd: 3, base: 'kg' },
  BATATA: { qtd: 6, base: 'kg' },
  TOMATE: { qtd: 9, base: 'kg' },
  PÃO: { qtd: 6, base: 'kg' },
  CAFÉ: { qtd: 0.6, base: 'kg' },
  BANANA: { qtd: 90, base: 'un' },
  AÇÚCAR: { qtd: 3, base: 'kg' },
  ÓLEO: { qtd: 0.9, base: 'L' },
  MANTEIGA: { qtd: 0.75, base: 'kg' },
};

/**
 * Valor total da cesta básica por ano (pesos DIEESE): preço por unidade
 * (R$/kg·L·un) de cada grupo × quantidade fixa do grupo. Só entram na média
 * produtos cuja medida está na MESMA unidade do peso (ex.: leite em lata não
 * entra na cesta de 15 L). Anos rarefeitos (<50% dos grupos) são descartados e,
 * nos anos restantes, valem apenas os grupos presentes em TODOS eles.
 */
export function valorCestaPorAno(itens: Produto[]): ValorCestaAnual[] {
  const por = new Map<string, Map<number, Map<string, { t: number; unit: number }>>>();
  for (const p of itens) {
    const g = grupoCesta(p.produto);
    const peso = g ? CESTA_BASICA_QTD[g] : undefined;
    const d = dataReferencia(p);
    if (!g || !peso || !d || p.preco == null) continue;
    const un = extrairUnidade(p.medida);
    if (!un || un.base !== peso.base) continue;
    const ano = d.getFullYear();
    let porAno = por.get(g);
    if (!porAno) {
      porAno = new Map();
      por.set(g, porAno);
    }
    let porProduto = porAno.get(ano);
    if (!porProduto) {
      porProduto = new Map();
      porAno.set(ano, porProduto);
    }
    const antigo = porProduto.get(p.produto);
    const unit = p.preco / un.quantidade;
    if (!antigo || d.getTime() > antigo.t) porProduto.set(p.produto, { t: d.getTime(), unit });
  }

  const grupos = [...por.entries()];
  if (!grupos.length) return [];
  const anosTodos = [...new Set(grupos.flatMap(([, porAno]) => [...porAno.keys()]))].sort((a, b) => a - b);
  const anosUteis = anosTodos.filter((ano) => {
    const cobertos = grupos.filter(([, porAno]) => porAno.has(ano)).length;
    return cobertos / grupos.length >= 0.5;
  });
  const comuns = grupos.filter(([, porAno]) => anosUteis.every((ano) => porAno.has(ano)));
  if (!comuns.length) return [];

  const mediaUnitaria = (porAno: Map<string, { t: number; unit: number }>): number => {
    const units = [...porAno.values()].map((x) => x.unit).filter((v) => v > 0);
    return units.length ? units.reduce((a, b) => a + b, 0) / units.length : 0;
  };

  return anosUteis
    .map((ano) => {
      const detalhe = comuns.map(([g, porAno]) => {
        const precoUnidade = mediaUnitaria(porAno.get(ano)!);
        return {
          grupo: g,
          precoUnidade,
          contribuicao: precoUnidade * CESTA_BASICA_QTD[g].qtd,
        };
      });
      return {
        ano,
        valor: detalhe.reduce((acc, d) => acc + d.contribuicao, 0),
        gruposIncluidos: detalhe.length,
        gruposPossiveis: grupos.length,
        itens: detalhe,
      };
    })
    .filter((a) => a.gruposIncluidos > 0);
}

/**
 * Remove valores unitários fora de [mediana/6, mediana*6] dentro de um mesmo
 * balde (mês/encarte). Protege o preço do grupo de itens fora da cesta que
 * escapam dos keywords (ex.: tempero Knorr 25g dentro de "CARNE").
 */
function limparOutliers(precos: number[]): number[] {
  if (precos.length < 3) return precos;
  const ordenados = [...precos].sort((a, b) => a - b);
  const mediana = ordenados[Math.floor(ordenados.length / 2)];
  if (mediana <= 0) return precos;
  const min = mediana / 6;
  const max = mediana * 6;
  return precos.filter((v) => v >= min && v <= max);
}

/** Série temporal de preço médio (por unidade) para cada grupo da cesta básica. */
export function seriesCestaBasica(
  produtos: Produto[],
  opts?: { granularidade?: Granularidade }
): SerieGrupo[] {
  const chave = chavePorGranularidade(opts?.granularidade ?? 'mes');
  const grupos = new Map<string, Produto[]>();
  for (const p of produtos) {
    const g = grupoCesta(p.produto);
    if (!g) continue;
    (grupos.get(g) ?? grupos.set(g, []).get(g)!).push(p);
  }
  const media = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
  return [...grupos.entries()]
    .map(([grupo, lista]) => {
      const porData = new Map<string, number[]>();
      for (const p of lista) {
        const d = dataReferencia(p);
        if (!d || p.preco == null) continue;
        const u = precoPorUnidade(p.preco, p.medida);
        if (u == null) continue;
        const k = chave(d);
        (porData.get(k) ?? porData.set(k, []).get(k)!).push(u);
      }
      const pontos = [...porData.entries()]
        .sort((a, b) => a[0].localeCompare(b[0]))
        .map(([k, precos]) => ({
          date: dataDeChave(k),
          data: k,
          precoUnit: limparOutliers(precos).length
            ? media(limparOutliers(precos))
            : null,
        }))
        .filter((pt) => pt.precoUnit != null);
      return { grupo, pontos };
    })
    .filter((s) => s.pontos.length >= 2)
    .sort((a, b) => a.grupo.localeCompare(b.grupo, 'pt-BR'));
}

export interface SerieSelecao {
  produto: string;
  pontos: { date: Date; data: string; valor: number | null }[];
}

/**
 * Uma série temporal por produto distinto — usada quando o usuário marca itens
 * na tabela que não pertencem à cesta básica (ex.: carnes, aves, peixes).
 * Valor = preço por unidade quando há medida reconhecível; senão o preço bruto.
 */
export function seriesPorProduto(
  produtos: Produto[],
  opts?: { granularidade?: Granularidade; limite?: number }
): SerieSelecao[] {
  const porNome = new Map<string, Produto[]>();
  for (const p of produtos) {
    if (!p.produto || p.preco == null) continue;
    (porNome.get(p.produto) ?? porNome.set(p.produto, []).get(p.produto)!).push(p);
  }
  const nomes = [...porNome.keys()].sort(
    (a, b) => porNome.get(b)!.length - porNome.get(a)!.length
  );
  return nomes
    .slice(0, opts?.limite ?? 12)
    .map((produto) => ({
      produto,
      pontos: serieProduto(porNome.get(produto)!, opts)
        .map((pt) => ({ date: pt.date, data: pt.data, valor: pt.precoUnit ?? pt.preco }))
        .filter((pt) => pt.valor != null),
    }))
    .filter((s) => s.pontos.length >= 2)
    .sort((a, b) => a.produto.localeCompare(b.produto, 'pt-BR'));
}

/**
 * Preço médio por produto (registro mais recente de cada um), para itens fora
 * da cesta básica — mesma forma de GrupoPreco para reaproveitar gráfico de barras.
 */
export function precosGruposSelecao(itens: Produto[]): GrupoPreco[] {
  const maisRecente = new Map<string, Produto>();
  for (const p of itens) {
    if (!p.produto || p.preco == null || p.preco <= 0) continue;
    const d = dataReferencia(p);
    if (!d) continue;
    const atual = maisRecente.get(p.produto);
    if (!atual || (dataReferencia(atual)?.getTime() ?? 0) < d.getTime()) {
      maisRecente.set(p.produto, p);
    }
  }
  return [...maisRecente.values()]
    .map((p) => ({
      grupo: p.produto as string,
      precoMedio: p.preco as number,
      nProdutos: 1,
      exemplos: p.marca ? [p.marca] : [],
    }))
    .sort((a, b) => b.precoMedio - a.precoMedio);
}

export const formatarPct = (v: number) =>
  `${v > 0 ? '+' : ''}${v.toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%`;

const MESES_CURTOS = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];

/** "2024" → "2024" · "2024-05" → "mai/24" · "2024-05-12" → "12/05". */
export function rotuloPeriodo(k: string): string {
  if (k.length === 4) return k;
  if (k.length === 7) {
    const [ano, mes] = k.split('-');
    return `${MESES_CURTOS[Number(mes) - 1]}/${ano.slice(2)}`;
  }
  const [, mes, dia] = k.split('-');
  return `${dia}/${mes}`;
}
