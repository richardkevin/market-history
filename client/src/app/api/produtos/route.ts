import { NextRequest, NextResponse } from 'next/server';
import { buscarProdutos, buscarProdutosUnicos, buscarDatasEncarte, buscarMarcas } from '@/lib/db';

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;

  const produto = searchParams.get('produto') || undefined;
  const data_encarte = searchParams.get('data_encarte') || undefined;
  const marca = searchParams.get('marca') || undefined;
  const action = searchParams.get('action') || 'produtos';

  try {
    switch (action) {
      case 'filtros':
        return NextResponse.json({
          produtos: buscarProdutosUnicos(),
          datas: buscarDatasEncarte(),
          marcas: buscarMarcas(),
        });
      case 'produtos':
      default:
        return NextResponse.json(buscarProdutos({ produto, data_encarte, marca }));
    }
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
