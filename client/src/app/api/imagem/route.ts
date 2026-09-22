import { NextRequest, NextResponse } from 'next/server';
import { readFile, readdir } from 'fs/promises';
import path from 'path';

const DIRS: Record<string, string> = {
  assai: 'encartes_assai',
  atacadao: 'encartes_atacadao',
  guanabara: 'encartes_guanabara',
  mundial: 'encartes_mundial',
  prezunic: 'encartes_prezunic',
  supermarket: 'encartes_supermarket',
};

const ROOT = path.join(process.cwd(), '..');

/** Busca recursiva (profundidade limitada) por um basename dentro de uma pasta. */
async function buscarRecursivo(dir: string, alvo: string, profundidade: number): Promise<string | null> {
  if (profundidade <= 0) return null;
  const itens = await readdir(dir, { withFileTypes: true }).catch(() => []);
  for (const item of itens) {
    if (item.name.startsWith('.')) continue;
    const p = path.join(dir, item.name);
    if (item.isDirectory()) {
      const found = await buscarRecursivo(p, alvo, profundidade - 1);
      if (found) return found;
    } else if (item.name === alvo) {
      return p;
    }
  }
  return null;
}

/** Resolve o caminho local do arquivo, com fallback por basename em encartes_*. */
async function localizarArquivo(arquivo: string): Promise<string | null> {
  const dirRel =
    DIRS[Object.keys(DIRS).find((k) => arquivo.startsWith(k)) ?? 'guanabara'];
  const candidato = path.join(ROOT, dirRel, arquivo);
  try {
    await readFile(candidato);
    return candidato;
  } catch {
    // arquivos fora das pastas mapeadas (ex.: boards do Pinterest, fotos): busca por basename
    const itens = await readdir(ROOT, { withFileTypes: true }).catch(() => []);
    for (const item of itens) {
      const ehPastaEncarte = item.isDirectory() && item.name.startsWith('encartes_');
      const ehFotos = item.isDirectory() && item.name === 'fotos_prezunic';
      if (!ehPastaEncarte && !ehFotos) continue;
      const found = await buscarRecursivo(path.join(ROOT, item.name), arquivo, 3);
      if (found) return found;
    }
    return null;
  }
}

/** Serve imagens de encartes do disco (protegido contra path traversal). */
export async function GET(request: NextRequest) {
  const arquivo = request.nextUrl.searchParams.get('arquivo');
  if (!arquivo) {
    return NextResponse.json({ error: 'arquivo obrigatório' }, { status: 400 });
  }

  // imagens remotas (foto de produto do Prezunic gravada como URL):
  // redireciona para a origem — restrito ao domínio da VTEX para evitar open redirect
  if (/^https?:\/\//i.test(arquivo)) {
    let url: URL;
    try {
      url = new URL(arquivo);
    } catch {
      return NextResponse.json({ error: 'arquivo inválido' }, { status: 400 });
    }
    if (!url.hostname.endsWith('.vteximg.com.br')) {
      return NextResponse.json({ error: 'arquivo inválido' }, { status: 400 });
    }
    return NextResponse.redirect(url, 307);
  }

  if (arquivo.includes('/') || arquivo.includes('\\') || arquivo.includes('..')) {
    return NextResponse.json({ error: 'arquivo inválido' }, { status: 400 });
  }

  // páginas de PDF gravadas como "encarte.pdf:pag01": serve o próprio PDF
  const baseArquivo = arquivo.replace(/^(.+\.pdf):.+$/i, '$1');
  const caminho = await localizarArquivo(baseArquivo);
  if (!caminho) {
    return NextResponse.json({ error: 'não encontrada' }, { status: 404 });
  }

  try {
    const conteudo = await readFile(caminho);
    const ext = path.extname(baseArquivo).toLowerCase();
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