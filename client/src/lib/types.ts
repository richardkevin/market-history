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

export interface Filtros {
  produtos: string[];
  anos: number[];
  meses: number[];
  marcas: string[];
  categorias: string[];
  ultimaData: string | null;
}
