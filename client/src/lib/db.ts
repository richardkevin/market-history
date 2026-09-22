import Database from 'better-sqlite3';
import path from 'path';

const DB_PATH = path.join(process.cwd(), 'encartes_produtos.db');

let db: Database.Database | null = null;

export function getDb(): Database.Database {
  if (!db) {
    db = new Database(DB_PATH, { readonly: true });
  }
  return db;
}

export interface Produto {
  id: number;
  imagem: string;
  produto: string;
  marca: string | null;
  medida: string | null;
  categoria: string | null;
  preco: number | null;
  preco_clube: number | null;
  tipo_promocao: string | null;
  limite: string | null;
  data_encarte: string | null;
  observacao: string | null;
  created_at: string;
}

export interface ProdutoFiltro {
  produto?: string | string[];
  anos?: number[];
  marca?: string;
  categoria?: string;
}

export function buscarProdutos(filtros: ProdutoFiltro = {}): Produto[] {
  const db = getDb();
  let query = 'SELECT * FROM produtos WHERE erro_identificacao = 0';
  const params: unknown[] = [];

  const termosProduto = Array.isArray(filtros.produto)
    ? filtros.produto
    : filtros.produto
      ? [filtros.produto]
      : [];
  if (termosProduto.length) {
    // cada termo casa por LIKE — aceita nomes exatos (checkbox) e buscas parciais
    query += ` AND (${termosProduto.map(() => 'produto LIKE ?').join(' OR ')})`;
    params.push(...termosProduto.map((t) => `%${t}%`));
  }
  if (filtros.anos?.length) {
    const placeholders = filtros.anos.map(() => '?').join(', ');
    query += ` AND CAST(substr(data_encarte, 7, 4) AS INTEGER) IN (${placeholders})`;
    params.push(...filtros.anos);
  }
  if (filtros.marca) {
    query += ' AND marca LIKE ?';
    params.push(`%${filtros.marca}%`);
  }
  if (filtros.categoria) {
    query += ' AND categoria = ?';
    params.push(filtros.categoria);
  }

  query += ' ORDER BY created_at DESC';

  return db.prepare(query).all(...params) as Produto[];
}

export function buscarProdutosUnicos(): string[] {
  const db = getDb();
  const rows = db.prepare('SELECT DISTINCT produto FROM produtos WHERE produto IS NOT NULL ORDER BY produto').all() as { produto: string }[];
  return rows.map(r => r.produto);
}

export function buscarAnosEncarte(): number[] {
  const db = getDb();
  const rows = db.prepare(
    "SELECT DISTINCT CAST(substr(data_encarte, 7, 4) AS INTEGER) AS ano FROM produtos WHERE data_encarte IS NOT NULL ORDER BY ano"
  ).all() as { ano: number }[];
  return rows.map(r => r.ano);
}

export function buscarUltimaDataEncarte(): string | null {
  const db = getDb();
  const row = db.prepare(
    `SELECT data_encarte FROM produtos
     WHERE data_encarte IS NOT NULL
     ORDER BY substr(data_encarte, 7, 4) || '-' || substr(data_encarte, 4, 2) || '-' || substr(data_encarte, 1, 2) DESC
     LIMIT 1`
  ).get() as { data_encarte: string } | undefined;
  if (!row) return null;
  return row.data_encarte.split(' a ')[0];
}

export function buscarMarcas(): string[] {
  const db = getDb();
  const rows = db.prepare('SELECT DISTINCT marca FROM produtos WHERE marca IS NOT NULL ORDER BY marca').all() as { marca: string }[];
  return rows.map(r => r.marca);
}

export interface EncarteResumo {
  arquivo: string;
  supermercado: string;
  n_produtos: number;
  data_inicio: string | null;
  data_fim: string | null;
}

/** Encartes disponíveis (por arquivo/imagem), agrupados por supermercado. */
export function buscarEncartes(): EncarteResumo[] {
  const db = getDb();
  const rows = db.prepare(
    `SELECT
       CASE WHEN instr(lower(imagem), '.pdf:') > 0
            THEN substr(imagem, 1, instr(lower(imagem), '.pdf:') + 4)
            ELSE imagem END AS arquivo,
       supermercado,
       COUNT(*) AS n_produtos,
       MIN(data_encarte) AS data_inicio,
       MAX(data_encarte) AS data_fim
     FROM produtos
     WHERE erro_identificacao = 0
       AND imagem IS NOT NULL AND imagem != ''
       AND imagem NOT LIKE 'http://%' AND imagem NOT LIKE 'https://%'
     GROUP BY supermercado, arquivo
     ORDER BY supermercado, data_fim DESC, arquivo`
  ).all() as Array<{
    arquivo: string;
    supermercado: string;
    n_produtos: number;
    data_inicio: string | null;
    data_fim: string | null;
  }>;
  return rows;
}

export function buscarCategorias(): string[] {
  const db = getDb();
  const rows = db.prepare('SELECT DISTINCT categoria FROM produtos WHERE categoria IS NOT NULL ORDER BY categoria').all() as { categoria: string }[];
  return rows.map(r => r.categoria);
}

export function buscarHistoricoPreco(nomeProduto: string): Produto[] {
  const db = getDb();
  return db.prepare(
    'SELECT * FROM produtos WHERE produto LIKE ? ORDER BY created_at ASC'
  ).all(`%${nomeProduto}%`) as Produto[];
}

export function buscarHistoricoProdutoExato(nomeProduto: string): Produto[] {
  const db = getDb();
  return db.prepare(
    'SELECT * FROM produtos WHERE produto = ? ORDER BY created_at ASC'
  ).all(nomeProduto) as Produto[];
}

export interface SugeridoComContagem {
  produto: string;
  registros: number;
}

/** Produtos com mais registros históricos — candidatos padrão do gráfico de linha. */
export function produtosMaisRegistrados(limite = 30): SugeridoComContagem[] {
  const db = getDb();
  return db.prepare(
    `SELECT produto, COUNT(*) AS registros FROM produtos
     WHERE produto IS NOT NULL AND preco IS NOT NULL AND erro_identificacao = 0
     GROUP BY produto HAVING COUNT(DISTINCT data_encarte) >= 2
     ORDER BY registros DESC LIMIT ?`
  ).all(limite) as SugeridoComContagem[];
}

/** Todos os produtos com contagem de registros — base para busca do gráfico. */
export function produtosComContagem(): SugeridoComContagem[] {
  const db = getDb();
  return db.prepare(
    `SELECT produto, COUNT(*) AS registros FROM produtos
     WHERE produto IS NOT NULL AND erro_identificacao = 0
     GROUP BY produto ORDER BY registros DESC, produto`
  ).all() as SugeridoComContagem[];
}
