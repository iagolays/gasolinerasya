import { describe, expect, it } from 'vitest';
import type { HistoryPoint } from './types';
import {
  changeOver,
  changeSinceStart,
  dayNumber,
  gapSeries,
  historyBetween,
  historySpanDays,
  provinceChanges,
  seriesFrom,
  splitOwnTaxes,
} from './reports';

/** Histórico de prueba: un punto por día desde el 2026-10-26, con precios que bajan 1 céntimo al día. */
function history(days: number, skip: string[] = []): HistoryPoint[] {
  const out: HistoryPoint[] = [];
  for (let i = 0; i < days; i++) {
    const date = new Date(Date.UTC(2026, 9, 26 + i)).toISOString().slice(0, 10);
    if (skip.includes(date)) continue;
    out.push({
      date,
      national: { gasolina95: 1.7 - i * 0.01, diesel: 1.8 - i * 0.005 },
      provinces: {
        '28': { gasolina95: 1.75 - i * 0.02, diesel: 1.85 },
        '35': { gasolina95: 1.5, diesel: 1.6 + i * 0.001 },
        '08': { gasolina95: 1.72 - i * 0.01 },
      },
    });
  }
  return out;
}

describe('dayNumber', () => {
  it('cuenta días naturales sin depender de la zona horaria', () => {
    expect(dayNumber('2026-11-23') - dayNumber('2026-10-26')).toBe(28);
    expect(dayNumber('2027-01-01') - dayNumber('2026-12-31')).toBe(1);
  });
});

describe('seriesFrom', () => {
  it('saca la serie nacional y la de una provincia, ordenadas por fecha', () => {
    const h = history(3).reverse();
    expect(seriesFrom(h, 'gasolina95').map((p) => p.date)).toEqual(['2026-10-26', '2026-10-27', '2026-10-28']);
    expect(seriesFrom(h, 'diesel', '28')[0]!.value).toBe(1.85);
  });
  it('omite los días sin dato', () => {
    expect(seriesFrom(history(3), 'diesel', '08')).toEqual([]);
  });
});

describe('changeOver', () => {
  it('calcula la variación a 7 días', () => {
    const c = changeOver(seriesFrom(history(10), 'gasolina95'), 7)!;
    expect(c.from.date).toBe('2026-10-28');
    expect(c.to.date).toBe('2026-11-04');
    expect(c.diff).toBe(-0.07);
    expect(c.days).toBe(7);
  });
  it('no inventa: sin datos tan antiguos devuelve undefined', () => {
    expect(changeOver(seriesFrom(history(7), 'gasolina95'), 7)).toBeUndefined();
    expect(changeOver(seriesFrom(history(1), 'gasolina95'), 7)).toBeUndefined();
    expect(changeOver([], 7)).toBeUndefined();
  });
  it('si falta el día exacto usa el anterior más cercano, con margen', () => {
    const c = changeOver(seriesFrom(history(10, ['2026-10-28']), 'gasolina95'), 7)!;
    expect(c.from.date).toBe('2026-10-27');
    expect(c.days).toBe(8);
    // con un hueco mayor que el margen, nada
    const gap = history(12, ['2026-10-27', '2026-10-28', '2026-10-29', '2026-10-30']);
    expect(changeOver(seriesFrom(gap, 'gasolina95'), 7, 1)).toBeUndefined();
  });
  it('redondea a milésimas', () => {
    const c = changeOver([{ date: '2026-11-01', value: 1.799 }, { date: '2026-11-08', value: 1.599 }], 7)!;
    expect(c.diff).toBe(-0.2);
  });
});

describe('changeSinceStart', () => {
  it('compara el primer y el último dato', () => {
    const c = changeSinceStart(seriesFrom(history(29), 'gasolina95'))!;
    expect(c.from.date).toBe('2026-10-26');
    expect(c.to.date).toBe('2026-11-23');
    expect(c.diff).toBe(-0.28);
    expect(c.days).toBe(28);
  });
  it('con un solo día no hay variación', () => {
    expect(changeSinceStart(seriesFrom(history(1), 'gasolina95'))).toBeUndefined();
  });
});

describe('provinceChanges y splitOwnTaxes', () => {
  it('ordena de la que más baja a la que más sube', () => {
    const list = provinceChanges(history(10), 'gasolina95', 7);
    expect(list.map((x) => x.id)).toEqual(['28', '08', '35']);
    expect(list[0]!.diff).toBe(-0.14);
    expect(list[2]!.diff).toBe(0);
  });
  it('desde el inicio y sin provincias sin dato', () => {
    const list = provinceChanges(history(5), 'diesel', 'start');
    expect(list.map((x) => x.id)).toEqual(['28', '35']);
    expect(list[1]!.diff).toBe(0.004);
  });
  it('vacío si no hay histórico suficiente', () => {
    expect(provinceChanges([], 'gasolina95', 7)).toEqual([]);
    expect(provinceChanges(history(3), 'gasolina95', 30)).toEqual([]);
  });
  it('separa Canarias, Ceuta y Melilla', () => {
    const { main, own } = splitOwnTaxes(provinceChanges(history(10), 'gasolina95', 7), new Set(['35', '38', '51', '52']));
    expect(main.map((x) => x.id)).toEqual(['28', '08']);
    expect(own.map((x) => x.id)).toEqual(['35']);
  });
});

describe('gapSeries, historyBetween e historySpanDays', () => {
  it('diferencia diésel − gasolina día a día', () => {
    const g = gapSeries(history(3), 'diesel', 'gasolina95');
    expect(g.map((p) => p.value)).toEqual([0.1, 0.105, 0.11]);
  });
  it('recorta por fechas y cuenta los días cubiertos', () => {
    const h = historyBetween(history(40), '2026-10-26', '2026-11-23');
    expect(h).toHaveLength(29);
    expect(historySpanDays(h)).toBe(29);
    expect(historySpanDays([])).toBe(0);
  });
});
