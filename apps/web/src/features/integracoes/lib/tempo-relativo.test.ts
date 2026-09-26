import { describe, expect, it } from 'vitest';
import { atualizadoHaTexto } from './tempo-relativo';

const AGORA = new Date('2026-09-25T12:00:00.000Z');
const antes = (segundos: number) => new Date(AGORA.getTime() - segundos * 1000).toISOString();

describe('atualizadoHaTexto (CA-45)', () => {
  it('menos de 1 minuto é "agora"', () => {
    expect(atualizadoHaTexto(antes(30), AGORA)).toBe('Atualizado agora');
    expect(atualizadoHaTexto(antes(0), AGORA)).toBe('Atualizado agora');
  });

  it('minutos, horas e dias, no singular e no plural', () => {
    expect(atualizadoHaTexto(antes(60), AGORA)).toBe('Atualizado há 1 minuto');
    expect(atualizadoHaTexto(antes(12 * 60), AGORA)).toBe('Atualizado há 12 minutos');
    expect(atualizadoHaTexto(antes(3 * 3600), AGORA)).toBe('Atualizado há 3 horas');
    expect(atualizadoHaTexto(antes(3600), AGORA)).toBe('Atualizado há 1 hora');
    expect(atualizadoHaTexto(antes(2 * 86400 + 5), AGORA)).toBe('Atualizado há 2 dias');
  });

  it('horário no futuro (relógio atrasado) vale "agora"', () => {
    expect(atualizadoHaTexto(antes(-600), AGORA)).toBe('Atualizado agora');
  });

  it('texto ilegível nunca vira "Invalid Date"', () => {
    expect(atualizadoHaTexto('ontem', AGORA)).toBeNull();
    expect(atualizadoHaTexto('', AGORA)).toBeNull();
  });
});
