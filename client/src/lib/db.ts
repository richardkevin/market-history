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
  produto?: string;
  anos?: number[];
  meses?: number[];
  marca?: string;
}

export function buscarProdutos(filtros: ProdutoFiltro = {}): Produto[] {
  const db = getDb();
  let query = 'SELECT * FROM produtos WHERE 1=1';
  const params: unknown[] = [];

  if (filtros.produto) {
    query += ' AND produto LIKE ?';
    params.push(`%${filtros.produto}%`);
  }
  if (filtros.anos?.length) {
    const placeholders = filtros.anos.map(() => '?').join(', ');
    query += ` AND CAST(substr(data_encarte, 7, 4) AS INTEGER) IN (${placeholders})`;
    params.push(...filtros.anos);
  }
  if (filtros.meses?.length) {
    const placeholders = filtros.meses.map(() => '?').join(', ');
    query += ` AND CAST(substr(data_encarte, 4, 2) AS INTEGER) IN (${placeholders})`;
    params.push(...filtros.meses);
  }
  if (filtros.marca) {
    query += ' AND marca LIKE ?';
    params.push(`%${filtros.marca}%`);
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

export function buscarMesesEncarte(): number[] {
  const db = getDb();
  const rows = db.prepare(
    "SELECT DISTINCT CAST(substr(data_encarte, 4, 2) AS INTEGER) AS mes FROM produtos WHERE data_encarte IS NOT NULL ORDER BY mes"
  ).all() as { mes: number }[];
  return rows.map(r => r.mes);
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

export function buscarHistoricoPreco(nomeProduto: string): Produto[] {
  const db = getDb();
  return db.prepare(
    'SELECT * FROM produtos WHERE produto LIKE ? ORDER BY created_at ASC'
  ).all(`%${nomeProduto}%`) as Produto[];
}
