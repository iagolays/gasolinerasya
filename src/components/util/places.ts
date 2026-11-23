// Nombres y rutas del municipio y la provincia de una estación (Station solo trae los IDs).
import { getMunicipalityById, getProvinceById, municipalityPath, provincePath } from '../../lib/data';
import type { Station } from '../../lib/types';

export interface Place {
  municipality: string;
  municipalityPath: string;
  province: string;
  provincePath: string;
}

/**
 * Nombre corto de un lugar para títulos, H1 y listas: en los nombres bilingües, la parte antes de la barra
 * (la misma de la que sale el slug). "Alquería de la Condesa/L'Alqueria de la Comtessa" → "Alquería de la Condesa".
 */
export function displayName(name: string): string {
  const corto = name.split('/')[0]!.trim();
  return corto || name;
}

const cache = new Map<string, Place>();

export function placeOf(station: Pick<Station, 'municipalityId' | 'provinceId'>): Place {
  const key = station.municipalityId;
  let p = cache.get(key);
  if (!p) {
    const m = getMunicipalityById(station.municipalityId);
    const prov = getProvinceById(station.provinceId);
    p = {
      municipality: m ? displayName(m.name) : '',
      municipalityPath: m ? municipalityPath(m) : '/',
      province: prov?.name ?? '',
      provincePath: prov ? provincePath(prov) : '/',
    };
    cache.set(key, p);
  }
  return p;
}
