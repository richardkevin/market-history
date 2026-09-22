import { NextRequest, NextResponse } from 'next/server';
import { readFile } from 'fs/promises';
import path from 'path';

const DIRS: Record<string, string> = {
  assai: 'encartes_assai',
  atacadao: 'encartes_atacadao',
  guanabara: 'encartes_guanabara',
  mundial: 'encartes_mundial',
  prezunic: 'encartes_prezunic',
  supermarket: 'encartes_supermarket',
};

/** Serve imagens de encartes do disco (protegido contra path traversal). */
export async function GET(request: NextRequest) {
  const arquivo = request.nextUrl.searchParams.get('arquivo');
  if (!arquivo || arquivo.includes('/') || arquivo.includes('\\') || arquivo.includes('..')) {
    return NextResponse.json({ error: 'arquivo inválido' }, { status: 400 });
  }
  const dirRel =
    DIRS[Object.keys(DIRS).find((k) => arquivo.startsWith(k)) ?? 'guanabara'];
  try {
    const conteudo = await readFile(
      path.join(process.cwd(), '..', dirRel, arquivo)
    );
    const ext = path.extname(arquivo).toLowerCase();
    const tipo =
      ext === '.png'
        ? 'image/png'
        : ext === '.webp'
          ? 'image/webp'
          : ext === '.pdf'
            ? 'application/pdf'
            : 'image/jpeg';
    return new NextResponse(new Uint8Array(conteudo), {
      headers: {
        'Content-Type': tipo,
        'Cache-Control': 'public, max-age=86400',
      },
    });
  } catch {
    return NextResponse.json({ error: 'não encontrada' }, { status: 404 });
  }
}
