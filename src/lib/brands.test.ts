import { beforeAll, describe, expect, it } from 'vitest';
import type { Dataset, Station } from './types';
import { setDataset } from './data';
import {
  brandKind,
  brandPathOf,
  getBrand,
  getBrands,
  hashString,
  isIndexableBrand,
  MIN_BRAND_STATIONS,
  MIN_BRAND_STATIONS_TO_INDEX,
  pickRelatedGuides,
  resetBrands,
  ROTATING_GUIDES,
} from './brands';
import { GENERIC_BRAND } from './slug';

function st(id: string, brand: string, provinceId: string, g95: number): Station {
  return {
    id,
    slug: `x-${id}`,
    brand,
    address: '',
    postalCode: '',
    locality: '',
    municipalityId: `m${provinceId}`,
    provinceId,
    lat: 40,
    lon: -3,
    schedule: '',
    is24h: false,
    prices: { gasolina95: g95 },
  };
}

const stations: Station[] = [];
let n = 0;
const add = (brand: string, count: number, prov: string, price: number) => {
  for (let i = 0; i < count; i++) stations.push(st(String(++n), brand, prov, price));
};
add('Repsol', MIN_BRAND_STATIONS + 2, '28', 1.7);
add('bonÀrea', MIN_BRAND_STATIONS, '08', 1.5);
add('Pequeña', MIN_BRAND_STATIONS - 1, '28', 1.6);
add(GENERIC_BRAND, MIN_BRAND_STATIONS + 5, '28', 1.6);

const dataset: Dataset = { updatedAt: '2026-10-26T00:00:00+01:00', stations, municipalities: [], provinces: [] };

beforeAll(() => {
  setDataset(dataset);
  resetBrands();
});

describe('marcas', () => {
  it('solo incluye las que llegan al mínimo y nunca la genérica', () => {
    expect(getBrands().map((b) => b.name)).toEqual(['Repsol', 'bonÀrea']);
  });
  it('slug sin tildes, estadísticas y provincias', () => {
    const b = getBrand('bonarea')!;
    expect(b.stats.gasolina95!.avg).toBe(1.5);
    expect(b.provinceIds).toEqual(['08']);
    expect(brandPathOf('Repsol')).toBe('/marca/repsol/');
    expect(brandPathOf('Pequeña')).toBeUndefined();
  });
  it('clasifica low cost y tradicionales', () => {
    expect(brandKind('Ballenoil')).toBe('lowcost');
    expect(brandKind('Repsol')).toBe('major');
    expect(brandKind('Avia')).toBe('other');
  });
});

describe('marcas indexables', () => {
  it('noindex por debajo de MIN_BRAND_STATIONS_TO_INDEX', () => {
    const fake = (n: number) => ({ stations: stations.slice(0, n) });
    expect(isIndexableBrand(fake(MIN_BRAND_STATIONS_TO_INDEX - 1))).toBe(false);
    expect(isIndexableBrand(fake(MIN_BRAND_STATIONS_TO_INDEX))).toBe(true);
  });
});

describe('guías relacionadas', () => {
  const base = st('g1', 'Repsol', '28', 1.7);
  const rotating = new Set<string>(ROTATING_GUIDES);

  it('es determinista y siempre lleva al menos una rotatoria', () => {
    const a = pickRelatedGuides({ stations: [base], seed: 'madrid' });
    expect(a).toEqual(pickRelatedGuides({ stations: [base], seed: 'madrid' }));
    expect(a).toHaveLength(4);
    expect(new Set(a).size).toBe(4);
    expect(a.some((g) => rotating.has(g))).toBe(true);
  });
  it('añade GLP, AdBlue, low cost e impuestos según el contexto', () => {
    const glp = { ...base, prices: { ...base.prices, glp: 0.9, adblue: 1.1 } };
    const g = pickRelatedGuides({ stations: [glp], seed: 'x' });
    expect(g).toContain('glp-autogas');
    expect(g).toContain('adblue-que-es');
    const lc = pickRelatedGuides({ stations: [st('g2', 'Ballenoil', '28', 1.5)], seed: 'x' });
    expect(lc).toEqual(expect.arrayContaining(['gasolineras-low-cost-calidad', 'gasolineras-desatendidas']));
    expect(pickRelatedGuides({ stations: [st('g3', 'Repsol', '38', 1.3)], seed: 'x' })).toContain('impuestos-de-la-gasolina');
    expect(pickRelatedGuides({ stations: [base], seed: 'x', brandName: 'Plenergy' })).toContain('gasolineras-desatendidas');
  });
  it('con mucho contexto no pasa de 4 y sigue habiendo una rotatoria', () => {
    const all = { ...st('g4', 'Ballenoil', '35', 1.2), prices: { gasolina95: 1.2, glp: 0.9, adblue: 1 } };
    const g = pickRelatedGuides({ stations: [all], seed: 'las-palmas' });
    expect(g).toHaveLength(4);
    expect(g.filter((x) => rotating.has(x))).toHaveLength(1);
  });
  it('reparte las rotatorias entre semillas distintas', () => {
    const firsts = new Set(Array.from({ length: 50 }, (_, i) => pickRelatedGuides({ stations: [all3()], seed: `muni-${i}` }).find((x) => rotating.has(x))));
    expect(firsts.size).toBe(ROTATING_GUIDES.length);
    expect(hashString('a')).not.toBe(hashString('b'));
  });
  function all3() {
    return { ...st('g5', 'Ballenoil', '28', 1.5), prices: { gasolina95: 1.5, glp: 0.9, adblue: 1 } };
  }
});
