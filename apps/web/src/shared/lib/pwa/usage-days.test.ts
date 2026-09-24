import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { storage } from '@/shared/lib/storage/storage';
import { DIAS_DE_USO } from './install-keys';
import { diaLocal, proximosDiasDeUso, registrarDiaDeUso } from './usage-days';

const originalTz = process.env.TZ;

beforeAll(() => {
  // Fuso do Brasil (UTC-3): é onde "dia local" e "dia UTC" divergem à noite.
  process.env.TZ = 'America/Sao_Paulo';
});

afterEach(() => {
  storage.clearScope('dispositivo');
});

afterAll(() => {
  process.env.TZ = originalTz;
});

describe('diaLocal', () => {
  it('formata AAAA-MM-DD com zeros à esquerda', () => {
    expect(diaLocal(new Date(2026, 0, 5, 10, 0))).toBe('2026-01-05');
  });

  it('23h59 local ainda é o dia local, mesmo que em UTC já seja o dia seguinte', () => {
    const quaseMeiaNoite = new Date(2026, 8, 24, 23, 59);

    expect(diaLocal(quaseMeiaNoite)).toBe('2026-09-24');
    // Prova que o teste distingue: em UTC-3 o ISO já virou para o dia 25.
    expect(quaseMeiaNoite.toISOString().slice(0, 10)).toBe('2026-09-25');
  });

  it('00h01 local é o dia novo', () => {
    expect(diaLocal(new Date(2026, 8, 25, 0, 1))).toBe('2026-09-25');
  });
});

describe('proximosDiasDeUso (pura)', () => {
  it('o mesmo dia não incrementa e devolve o mesmo objeto', () => {
    const atual = { ultimoDia: '2026-09-24', total: 3 };

    expect(proximosDiasDeUso(atual, '2026-09-24')).toBe(atual);
  });

  it('um dia novo incrementa e guarda o dia', () => {
    expect(proximosDiasDeUso({ ultimoDia: '2026-09-23', total: 1 }, '2026-09-24')).toEqual({
      ultimoDia: '2026-09-24',
      total: 2,
    });
  });

  it('primeiro uso (padrão) conta 1', () => {
    expect(proximosDiasDeUso({ ultimoDia: '', total: 0 }, '2026-09-24')).toEqual({
      ultimoDia: '2026-09-24',
      total: 1,
    });
  });
});

describe('registrarDiaDeUso', () => {
  it('primeiro carregamento grava total 1 e o dia de hoje', () => {
    registrarDiaDeUso(new Date(2026, 8, 24, 10, 0));

    expect(storage.get(DIAS_DE_USO)).toEqual({ ultimoDia: '2026-09-24', total: 1 });
  });

  it('recarregar no mesmo dia não incrementa', () => {
    registrarDiaDeUso(new Date(2026, 8, 24, 10, 0));
    registrarDiaDeUso(new Date(2026, 8, 24, 18, 30));

    expect(storage.get(DIAS_DE_USO).total).toBe(1);
  });

  it('dia novo incrementa', () => {
    registrarDiaDeUso(new Date(2026, 8, 24, 10, 0));
    registrarDiaDeUso(new Date(2026, 8, 25, 9, 0));

    expect(storage.get(DIAS_DE_USO)).toEqual({ ultimoDia: '2026-09-25', total: 2 });
  });

  it('a virada de dia à meia-noite LOCAL conta: 23h59 e 00h01 são dias diferentes', () => {
    registrarDiaDeUso(new Date(2026, 8, 24, 23, 59));
    registrarDiaDeUso(new Date(2026, 8, 25, 0, 1));

    expect(storage.get(DIAS_DE_USO).total).toBe(2);
  });

  it('valor corrompido no armazenamento (CA-18): volta ao padrão e a contagem recomeça em 1', () => {
    storage.raw.set('checkpoint:instalacao:dias-de-uso', '{quebrado');

    expect(() => registrarDiaDeUso(new Date(2026, 8, 24, 10, 0))).not.toThrow();

    expect(storage.get(DIAS_DE_USO)).toEqual({ ultimoDia: '2026-09-24', total: 1 });
  });

  it('formato antigo/estranho (total negativo, texto) também é descartado', () => {
    storage.raw.set(
      'checkpoint:instalacao:dias-de-uso',
      JSON.stringify({ ultimoDia: '2026-09-23', total: -4 }),
    );

    registrarDiaDeUso(new Date(2026, 8, 24, 10, 0));

    expect(storage.get(DIAS_DE_USO).total).toBe(1);
  });
});
