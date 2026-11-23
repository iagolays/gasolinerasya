// Lista de informes, herramientas y páginas de contenido (para índices, menús y enlaces internos),
// y cálculos puros sobre el histórico diario para los informes de evolución.
import type { FuelKey, HistoryPoint } from './types';

export interface LinkCard {
  path: string;
  title: string;
  summary: string;
}

export const REPORTS: readonly LinkCard[] = [
  {
    path: '/informes/evolucion-precio-gasolina/',
    title: 'Evolución del precio de la gasolina',
    summary: 'Cómo han cambiado los precios en 7 y 30 días, con el histórico diario y las provincias que más suben y bajan.',
  },
  {
    path: '/informes/noviembre-2026/',
    title: 'Informe de noviembre de 2026',
    summary: 'La gasolina 95 baja 19 céntimos en cuatro semanas y el diésel se queda 23 céntimos por encima: análisis del 26-10 al 23-11.',
  },
  {
    path: '/informes/precio-por-provincia/',
    title: 'Precio de la gasolina por provincias',
    summary: 'Ranking de las 52 provincias y diferencia en céntimos con la media de España.',
  },
  {
    path: '/informes/low-cost-vs-tradicionales/',
    title: 'Low cost frente a las grandes marcas',
    summary: 'Cuánto más baratas son de verdad las gasolineras low cost, en total y por provincia.',
  },
  {
    path: '/informes/cuanto-cuesta-llenar-el-deposito/',
    title: '¿Cuánto cuesta llenar el depósito hoy?',
    summary: 'Precio de 40, 50, 60 y 70 litros por carburante, y la diferencia según dónde repostes.',
  },
  {
    path: '/marcas/',
    title: 'Marcas de gasolineras más baratas',
    summary: 'Ranking de marcas por precio medio de hoy en la península.',
  },
];

export const TOOLS: readonly LinkCard[] = [
  {
    path: '/calculadora-gasolina/',
    title: 'Calculadora de gasolina',
    summary: 'Cuánto cuesta un viaje, cuánto gastas al mes y cuánto sale llenar el depósito.',
  },
  {
    path: '/compensa-desviarse/',
    title: '¿Compensa desviarse?',
    summary: 'Si merece la pena hacer kilómetros de más para repostar en una gasolinera más barata.',
  },
  {
    path: '/cerca/',
    title: 'Gasolineras cerca de mí',
    summary: 'Las más baratas a tu alrededor, con mapa.',
  },
];

// ─── Cálculos sobre el histórico diario (informes de evolución) ───────────────────────────────
// Funciones puras: reciben el histórico (HistoryPoint[]) y no leen archivos, para poder probarlas.

/** Un día de una serie: fecha AAAA-MM-DD y precio (mediana). */
export interface DayValue {
  date: string;
  value: number;
}

/** Variación de una serie entre dos días. `diff` en €/l (negativo = baja). */
export interface Change {
  from: DayValue;
  to: DayValue;
  diff: number;
  /** Días naturales entre las dos fechas. */
  days: number;
}

/** "AAAA-MM-DD" → número de día (para restar fechas sin líos de zona horaria). */
export function dayNumber(iso: string): number {
  return Math.round(Date.parse(`${iso}T00:00:00Z`) / 86_400_000);
}

/** Serie de un carburante, nacional o de una provincia, ordenada por fecha. */
export function seriesFrom(history: readonly HistoryPoint[], fuel: FuelKey, provinceId?: string): DayValue[] {
  return history
    .map((h) => ({ date: h.date, value: provinceId ? h.provinces[provinceId]?.[fuel] : h.national[fuel] }))
    .filter((p): p is DayValue => typeof p.value === 'number')
    .sort((a, b) => a.date.localeCompare(b.date));
}

/** Recorta el histórico a un intervalo de fechas (ambas incluidas). */
export function historyBetween(history: readonly HistoryPoint[], from: string, to: string): HistoryPoint[] {
  return history.filter((h) => h.date >= from && h.date <= to).sort((a, b) => a.date.localeCompare(b.date));
}

/**
 * Variación en los últimos `days` días naturales: del último dato al de hace `days` días.
 * Si ese día falta (una ejecución que falló), usa el anterior más cercano con hasta `tolerance`
 * días de margen. Sin datos tan antiguos devuelve undefined: no inventamos tendencias.
 */
export function changeOver(series: readonly DayValue[], days: number, tolerance = 2): Change | undefined {
  if (series.length < 2 || days <= 0) return undefined;
  const to = series[series.length - 1]!;
  const target = dayNumber(to.date) - days;
  let from: DayValue | undefined;
  for (let i = series.length - 2; i >= 0; i--) {
    const d = dayNumber(series[i]!.date);
    if (d <= target) {
      if (target - d <= tolerance) from = series[i];
      break;
    }
  }
  if (!from) return undefined;
  return { from, to, diff: round3(to.value - from.value), days: dayNumber(to.date) - dayNumber(from.date) };
}

/** Variación desde el primer dato de la serie. */
export function changeSinceStart(series: readonly DayValue[]): Change | undefined {
  if (series.length < 2) return undefined;
  const from = series[0]!;
  const to = series[series.length - 1]!;
  return { from, to, diff: round3(to.value - from.value), days: dayNumber(to.date) - dayNumber(from.date) };
}

/**
 * Variación de cada provincia en `days` días (o desde el primer dato con 'start'), ordenada de la
 * que más baja a la que más sube. Solo entran las provincias con dato el último día del histórico.
 */
export function provinceChanges(
  history: readonly HistoryPoint[],
  fuel: FuelKey,
  days: number | 'start',
): Array<Change & { id: string }> {
  const sorted = [...history].sort((a, b) => a.date.localeCompare(b.date));
  const last = sorted[sorted.length - 1];
  if (!last) return [];
  return Object.keys(last.provinces)
    .map((id) => {
      const s = seriesFrom(sorted, fuel, id);
      const c = days === 'start' ? changeSinceStart(s) : changeOver(s, days);
      return c && c.to.date === last.date ? { id, ...c } : undefined;
    })
    .filter((x): x is Change & { id: string } => x !== undefined)
    .sort((a, b) => a.diff - b.diff || a.id.localeCompare(b.id));
}

/** Separa una lista de provincias: las de fiscalidad propia (Canarias, Ceuta y Melilla) aparte. */
export function splitOwnTaxes<T extends { id: string }>(
  list: readonly T[],
  ownTaxIds: ReadonlySet<string>,
): { main: T[]; own: T[] } {
  return { main: list.filter((x) => !ownTaxIds.has(x.id)), own: list.filter((x) => ownTaxIds.has(x.id)) };
}

/** Diferencia diaria entre dos carburantes (a − b) en los días en que hay dato de los dos. */
export function gapSeries(history: readonly HistoryPoint[], a: FuelKey, b: FuelKey, provinceId?: string): DayValue[] {
  const sb = new Map(seriesFrom(history, b, provinceId).map((p) => [p.date, p.value]));
  return seriesFrom(history, a, provinceId)
    .filter((p) => sb.has(p.date))
    .map((p) => ({ date: p.date, value: round3(p.value - sb.get(p.date)!) }));
}

/** Días naturales que cubre el histórico (del primer al último dato, ambos incluidos). */
export function historySpanDays(history: readonly HistoryPoint[]): number {
  if (!history.length) return 0;
  const days = history.map((h) => dayNumber(h.date));
  return Math.max(...days) - Math.min(...days) + 1;
}

/** Redondeo a milésimas (los precios vienen con 3 decimales; evita 0,19999999). */
function round3(n: number): number {
  return Math.round(n * 1000) / 1000;
}
