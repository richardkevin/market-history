import { NextRequest, NextResponse } from 'next/server';
import {
  buscarProdutos,
  buscarProdutosUnicos,
  buscarAnosEncarte,
  buscarMesesEncarte,
  buscarUltimaDataEncarte,
  buscarMarcas,
  buscarCategorias,
} from '@/lib/db';

function parseListaNumeros(valor: string | null): number[] | undefined {
  if (!valor) return undefined;
  const numeros = valor
    .split(',')
    .map((v) => Number(v.trim()))
    .filter((v) => Number.isInteger(v));
  return numeros.length ? numeros : undefined;
}

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;

  const produto = searchParams.get('produto') || undefined;
  const anos = parseListaNumeros(searchParams.get('anos'));
  const meses = parseListaNumeros(searchParams.get('meses'));
  const marca = searchParams.get('marca') || undefined;
  const categoria = searchParams.get('categoria') || undefined;
  const action = searchParams.get('action') || 'produtos';

  try {
    switch (action) {
      case 'filtros':
        return NextResponse.json({
          produtos: buscarProdutosUnicos(),
          anos: buscarAnosEncarte(),
          meses: buscarMesesEncarte(),
          marcas: buscarMarcas(),
          categorias: buscarCategorias(),
          ultimaData: buscarUltimaDataEncarte(),
        });
      case 'produtos':
      default:
        return NextResponse.json(
          buscarProdutos({ produto, anos, meses, marca, categoria })
        );
    }
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
