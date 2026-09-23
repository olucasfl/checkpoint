import { type Game } from '@checkpoint/shared';
import { describe, expect, it } from 'vitest';
import {
  EMPTY_FORM_VALUES,
  toGameRequest,
  valuesFromGame,
  withStatus,
  type GameFormValues,
} from './form-values';

const values = (overrides: Partial<GameFormValues> = {}): GameFormValues => ({
  titulo: 'Celeste',
  plataforma: 'PC',
  status: 'ZERADO',
  nota: '9',
  ...overrides,
});

describe('withStatus (CA-43)', () => {
  it('em "Quero jogar" a nota é limpa', () => {
    expect(withStatus(values({ nota: '8' }), 'QUERO_JOGAR')).toMatchObject({
      status: 'QUERO_JOGAR',
      nota: '',
    });
  });

  it('em Zerado ou Jogando a nota é mantida', () => {
    expect(withStatus(values({ nota: '8' }), 'JOGANDO').nota).toBe('8');
    expect(withStatus(values({ nota: '8' }), 'ZERADO').nota).toBe('8');
  });
});

describe('toGameRequest (CA-43)', () => {
  it('com "Quero jogar" envia nota: null, mesmo se o campo ainda tivesse valor', () => {
    expect(toGameRequest(values({ status: 'QUERO_JOGAR', nota: '8' })).nota).toBeNull();
  });

  it('com Zerado/Jogando envia a nota como número', () => {
    expect(toGameRequest(values({ nota: '9' })).nota).toBe(9);
    expect(toGameRequest(values({ status: 'JOGANDO', nota: '0' })).nota).toBe(0);
  });

  it('nota vazia vira null', () => {
    expect(toGameRequest(values({ nota: '' })).nota).toBeNull();
    expect(toGameRequest(values({ nota: '  ' })).nota).toBeNull();
  });

  it('apara título e plataforma; plataforma vazia vira null', () => {
    expect(toGameRequest(values({ titulo: '  Hades ', plataforma: ' Switch ' }))).toMatchObject({
      titulo: 'Hades',
      plataforma: 'Switch',
    });
    expect(toGameRequest(values({ plataforma: '   ' })).plataforma).toBeNull();
  });

  it('o corpo é sempre completo, inclusive nota: null explícito na edição', () => {
    expect(toGameRequest(values({ status: 'QUERO_JOGAR', nota: '' }))).toEqual({
      titulo: 'Celeste',
      status: 'QUERO_JOGAR',
      plataforma: 'PC',
      nota: null,
    });
  });
});

describe('valuesFromGame e valores iniciais', () => {
  const game: Game = {
    id: '1',
    titulo: 'Hades',
    plataforma: null,
    status: 'JOGANDO',
    nota: 7,
    capaUrl: null,
    criadoEm: '2026-09-23T12:00:00.000Z',
    atualizadoEm: '2026-09-23T12:00:00.000Z',
  };

  it('plataforma null vira texto vazio e a nota vira texto', () => {
    expect(valuesFromGame(game)).toEqual({
      titulo: 'Hades',
      plataforma: '',
      status: 'JOGANDO',
      nota: '7',
    });
  });

  it('nota null vira texto vazio', () => {
    expect(valuesFromGame({ ...game, nota: null }).nota).toBe('');
  });

  it('um jogo novo começa em "Quero jogar" e sem nota', () => {
    expect(EMPTY_FORM_VALUES).toMatchObject({ status: 'QUERO_JOGAR', nota: '', titulo: '' });
  });
});
