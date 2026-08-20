import Database from 'better-sqlite3';
import path from 'path';

const DB_PATH = path.join(process.cwd(), 'prezunic_produtos.db');

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
  data_encarte?: string;
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
  if (filtros.data_encarte) {
    query += ' AND data_encarte = ?';
    params.push(filtros.data_encarte);
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

export function buscarDatasEncarte(): string[] {
  const db = getDb();
  const rows = db.prepare('SELECT DISTINCT data_encarte FROM produtos WHERE data_encarte IS NOT NULL ORDER BY data_encarte').all() as { data_encarte: string }[];
  return rows.map(r => r.data_encarte);
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
