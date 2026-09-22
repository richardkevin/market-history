/** Busca fuzzy compartilhada (normaliza acentos e casa por subsequência). */

export function normalizar(s: string): string {
  return s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

/** Pontua > 0 quando a consulta casa como subsequência; maior = mais relevante. */
export function pontuacaoFuzzy(alvo: string, consulta: string): number {
  const opt = normalizar(alvo);
  const q = normalizar(consulta).trim();
  if (!q) return 1;
  if (opt === q) return 1000;
  if (opt.startsWith(q)) return 500 - q.length;
  if (opt.includes(q)) return 300 - q.length;
  let idx = 0;
  let score = 10;
  let prev = -2;
  for (let i = 0; i < opt.length && idx < q.length; i++) {
    if (opt[i] === q[idx]) {
      score += i === prev + 1 ? 20 : 5;
      prev = i;
      idx++;
    }
  }
  return idx < q.length ? -1 : score;
}

/** Ordena `itens` pela relevância fuzzy do campo `texto`; limita a `limite`. */
export function filtrarFuzzy<T>(
  itens: T[],
  consulta: string,
  texto: (item: T) => string,
  limite = 30
): T[] {
  const q = consulta.trim();
  if (!q) return itens.slice(0, limite);
  return itens
    .map((item) => ({ item, score: pontuacaoFuzzy(texto(item), q) }))
    .filter((r) => r.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limite)
    .map((r) => r.item);
}