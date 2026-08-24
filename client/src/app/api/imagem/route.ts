import { NextRequest, NextResponse } from 'next/server';
import { readFile } from 'fs/promises';
import path from 'path';

const DIRS: Record<string, string> = {
  guanabara: 'encartes_guanabara',
  prezunic: 'encartes_prezunic',
};

/** Serve imagens de encartes do disco (protegido contra path traversal). */
export async function GET(request: NextRequest) {
  const arquivo = request.nextUrl.searchParams.get('arquivo');
  if (!arquivo || arquivo.includes('/') || arquivo.includes('\\') || arquivo.includes('..')) {
    return NextResponse.json({ error: 'arquivo inválido' }, { status: 400 });
  }
  const dirRel =
    DIRS[arquivo.startsWith('prezunic') ? 'prezunic' : 'guanabara'];
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
