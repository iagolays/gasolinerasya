import { describe, expect, it } from 'vitest';
import { displayName } from './places';

describe('displayName', () => {
  it('se queda con la parte antes de la barra en los nombres bilingües', () => {
    expect(displayName("Alquería de la Condesa/L'Alqueria de la Comtessa")).toBe('Alquería de la Condesa');
    expect(displayName('Alicante/Alacant')).toBe('Alicante');
    expect(displayName('Villajoyosa/La Vila Joiosa')).toBe('Villajoyosa');
  });
  it('deja igual los nombres sin barra', () => {
    expect(displayName('Las Palmas de Gran Canaria')).toBe('Las Palmas de Gran Canaria');
    expect(displayName('')).toBe('');
  });
});
