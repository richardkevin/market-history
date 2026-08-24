import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

const URL_IPCA =
  'https://api.bcb.gov.br/dados/serie/bcdata.sgs.433/dados?formato=json';

interface PontoIPCA {
  data: string; // "MM/AAAA"
  valor: string; // % ao mês
}

let cache: { serie: { mes: string; pct: number }[]; obtidoEm: number } | null = null;
const TTL_MS = 24 * 60 * 60 * 1000;

/** IPCA mensal (BCB série 433). [{mes: 'YYYY-MM', pct}] ordenado. */
export async function GET() {
  if (cache && Date.now() - cache.obtidoEm < TTL_MS) {
    return NextResponse.json({ fonte: 'cache', serie: cache.serie });
  }
  try {
    const res = await fetch(URL_IPCA, {
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) throw new Error(`BCB respondeu ${res.status}`);
    const bruto = (await res.json()) as PontoIPCA[];
    const serie = bruto
      .map((p) => {
        const [mm, aaaa] = p.data.split('/');
        return { mes: `${aaaa}-${mm}`, pct: parseFloat(p.valor) };
      })
      .filter((p) => Number.isFinite(p.pct))
      .sort((a, b) => a.mes.localeCompare(b.mes));
    cache = { serie, obtidoEm: Date.now() };
    return NextResponse.json({ fonte: 'bcb', serie });
  } catch (erro) {
    if (cache) return NextResponse.json({ fonte: 'cache', serie: cache.serie });
    return NextResponse.json(
      { error: `Falha ao obter IPCA: ${String(erro)}`, serie: [] },
      { status: 502 }
    );
  }
}
