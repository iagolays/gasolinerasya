// Marcas (rótulos) con página propia: agregados por marca y clasificación low cost / tradicional.
import type { Station, StatsByFuel } from './types';
import { getStations, hasOwnFuelTaxes, statsFor } from './data';
import { GENERIC_BRAND, slugify } from './slug';

/** Mínimo de gasolineras para que una marca tenga página (por debajo es casi siempre un negocio local). */
export const MIN_BRAND_STATIONS = 10;

/**
 * Las marcas con página pero con menos gasolineras que esto llevan noindex,follow y no entran
 * en el sitemap: su página aporta poco frente a las de los municipios (rechazo de AdSense por
 * «contenido de poco valor»). Siguen existiendo y enlazadas desde /marcas/ y las fichas.
 */
export const MIN_BRAND_STATIONS_TO_INDEX = 20;

/**
 * Cadenas de bajo coste (sin tienda grande ni personal en pista o asociadas a supermercados).
 * El resto de marcas con página se consideran "tradicionales" o regionales.
 */
export const LOW_COST_BRANDS: ReadonlySet<string> = new Set([
  'Ballenoil',
  'Plenergy',
  'Petroprix',
  'Carrefour',
  'Alcampo',
  'EsclatOil',
  'bonÀrea',
  'GasExpress',
  'Eroski',
  'BerOil',
  'Meroil',
  'AutoNetOil',
  'EasyGas',
  'Costco',
]);

/** Grandes operadoras de toda la vida (las que tienen refinería o red nacional histórica). */
export const MAJOR_BRANDS: ReadonlySet<string> = new Set([
  'Repsol',
  'Moeve',
  'Cepsa',
  'Galp',
  'Shell',
  'BP',
  'Petronor',
  'Campsa',
]);

export type BrandKind = 'lowcost' | 'major' | 'other';

export interface Brand {
  name: string;
  slug: string;
  kind: BrandKind;
  stations: Station[];
  stats: StatsByFuel;
  /** Provincias con al menos una gasolinera de la marca. */
  provinceIds: string[];
}

export function brandKind(name: string): BrandKind {
  if (LOW_COST_BRANDS.has(name)) return 'lowcost';
  if (MAJOR_BRANDS.has(name)) return 'major';
  return 'other';
}

let cache: Brand[] | null = null;

/** Marcas con página, de más a menos gasolineras. */
export function getBrands(): Brand[] {
  if (cache) return cache;
  const groups = new Map<string, Station[]>();
  for (const s of getStations()) {
    if (s.brand === GENERIC_BRAND) continue;
    const list = groups.get(s.brand);
    if (list) list.push(s);
    else groups.set(s.brand, [s]);
  }
  const used = new Set<string>();
  cache = [...groups]
    .filter(([, list]) => list.length >= MIN_BRAND_STATIONS)
    .sort((a, b) => b[1].length - a[1].length || a[0].localeCompare(b[0], 'es'))
    .map(([name, stations]) => {
      let slug = slugify(name) || 'marca';
      while (used.has(slug)) slug += '-2';
      used.add(slug);
      return {
        name,
        slug,
        kind: brandKind(name),
        stations,
        stats: statsFor(stations),
        provinceIds: [...new Set(stations.map((s) => s.provinceId))].sort(),
      };
    });
  return cache;
}

export function getBrand(slug: string): Brand | undefined {
  return getBrands().find((b) => b.slug === slug);
}

/** Ruta de la página de la marca, o `undefined` si la marca no tiene página. */
export function brandPathOf(name: string): string | undefined {
  const b = getBrands().find((x) => x.name === name);
  return b ? brandPath(b) : undefined;
}

export function brandPath(b: Pick<Brand, 'slug'>): string {
  return `/marca/${b.slug}/`;
}

export function isIndexableBrand(b: Pick<Brand, 'stations'>): boolean {
  return b.stations.length >= MIN_BRAND_STATIONS_TO_INDEX;
}

// ── Guías relacionadas por contexto (bloque «Guías útiles») ──

/** Guías que se reparten entre todas las páginas de datos para que reciban enlaces internos. */
export const ROTATING_GUIDES = [
  'compensa-desviarse-para-repostar',
  'descuentos-y-tarjetas-carburante',
  'combustible-equivocado',
  'coche-electrico-o-gasolina',
  'mejor-dia-para-repostar',
] as const;

/** Hash FNV-1a de 32 bits: determinista entre builds, para rotar las guías por página. */
export function hashString(text: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** Elementos de `list` desde la posición `start` (dando la vuelta), sin repetir. */
function rotate<T>(list: readonly T[], start: number): T[] {
  if (!list.length) return [];
  const from = start % list.length;
  return [...list.slice(from), ...list.slice(0, from)];
}

export interface GuideContext {
  /** Gasolineras de la página (zona, marca o la propia ficha). */
  stations: readonly Station[];
  /** Semilla de la rotación: el slug o la ruta de la página. */
  seed: string;
  /** Marca de la página, si es la de una marca. */
  brandName?: string;
}

/**
 * Elige de 3 a `max` slugs de guías según el contexto: GLP y AdBlue si se venden, low cost y
 * desatendidas si hay marcas low cost, impuestos en Canarias, Ceuta y Melilla, y siempre al menos
 * una de ROTATING_GUIDES. Si hay más guías de contexto que huecos, también se rotan con la semilla.
 */
export function pickRelatedGuides({ stations, seed, brandName }: GuideContext, max = 4): string[] {
  const h = hashString(seed);
  const context: string[] = [];
  if (stations.some((s) => s.prices.glp !== undefined)) context.push('glp-autogas');
  if (stations.some((s) => s.prices.adblue !== undefined)) context.push('adblue-que-es');
  const lowCost = brandName ? brandKind(brandName) === 'lowcost' : stations.some((s) => brandKind(s.brand) === 'lowcost');
  if (lowCost) context.push('gasolineras-low-cost-calidad', 'gasolineras-desatendidas');
  if (stations.some((s) => hasOwnFuelTaxes(s.provinceId))) context.push('impuestos-de-la-gasolina');

  const slots = Math.max(max - 1, 1);
  const picked = context.length > slots ? rotate(context, h).slice(0, slots) : context;
  // Se rellena con las rotatorias hasta `max` (como mínimo una).
  const extra = rotate(ROTATING_GUIDES, h).slice(0, max - picked.length);
  return [...picked, ...extra];
}

/** Vacía la caché (para tests que cambian el dataset). */
export function resetBrands(): void {
  cache = null;
}
