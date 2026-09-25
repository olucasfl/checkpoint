import { type Game } from '@checkpoint/shared';
import { describe, expect, it } from 'vitest';
import {
  EMPTY_FORM_VALUES,
  EMPTY_RATING_TEXTS,
  hasRatingText,
  mediaOf,
  ratingErrors,
  toGameRequest,
  valuesFromGame,
  withStatus,
  type GameFormValues,
} from './form-values';

const values = (overrides: Partial<GameFormValues> = {}): GameFormValues => ({
  titulo: 'Celeste',
  plataforma: 'PC',
  status: 'ZERADO',
  notas: { ...EMPTY_RATING_TEXTS, gameplay: '9' },
  descricao: '',
  ...overrides,
});

const notas = (overrides: Partial<GameFormValues['notas']>) => ({
  ...EMPTY_RATING_TEXTS,
  ...overrides,
});

describe('withStatus (CA-21)', () => {
  it('em "Quero jogar" as notas digitadas ficam no estado (quem as apaga é o envio)', () => {
    const result = withStatus(values({ notas: notas({ historia: '8' }) }), 'QUERO_JOGAR');

    expect(result.status).toBe('QUERO_JOGAR');
    expect(result.notas.historia).toBe('8');
    expect(hasRatingText(result)).toBe(true);
  });

  it('em Zerado ou Jogando as notas são mantidas', () => {
    expect(withStatus(values(), 'JOGANDO').notas.gameplay).toBe('9');
    expect(withStatus(values(), 'ZERADO').notas.gameplay).toBe('9');
  });
});

describe('toGameRequest', () => {
  it('com "Quero jogar" envia null em CADA critério, mesmo com texto no estado (CA-21)', () => {
    const body = toGameRequest(
      values({ status: 'QUERO_JOGAR', notas: notas({ gameplay: '8', historia: '7,5' }) }),
    );

    expect(body).toMatchObject({
      gameplay: null,
      historia: null,
      graficos: null,
      trilhaSonora: null,
      performance: null,
    });
  });

  it('com Zerado/Jogando envia cada nota como número, com ponto (8,7 -> 8.7) (CA-18)', () => {
    const body = toGameRequest(
      values({
        notas: notas({
          gameplay: '9',
          historia: '8,7',
          graficos: '7.3',
          trilhaSonora: '10',
          performance: '0',
        }),
      }),
    );

    expect(body).toMatchObject({
      gameplay: 9,
      historia: 8.7,
      graficos: 7.3,
      trilhaSonora: 10,
      performance: 0,
    });
  });

  it('0 é nota e vira 0; vazio e espaços viram null (CA-17)', () => {
    const body = toGameRequest(
      values({ status: 'JOGANDO', notas: notas({ gameplay: '0', historia: '', graficos: '  ' }) }),
    );

    expect(body.gameplay).toBe(0);
    expect(body.historia).toBeNull();
    expect(body.graficos).toBeNull();
  });

  it('texto inválido nunca vai à API: vira null (o formulário barra antes)', () => {
    expect(toGameRequest(values({ notas: notas({ gameplay: '7,55' }) })).gameplay).toBeNull();
  });

  it('apara título e plataforma; plataforma vazia vira null', () => {
    expect(toGameRequest(values({ titulo: '  Hades ', plataforma: ' Switch ' }))).toMatchObject({
      titulo: 'Hades',
      plataforma: 'Switch',
    });
    expect(toGameRequest(values({ plataforma: '   ' })).plataforma).toBeNull();
  });

  it('descrição: vazia ou só espaços vira null; o texto vai com as quebras (CA-22)', () => {
    expect(toGameRequest(values({ descricao: '' })).descricao).toBeNull();
    expect(toGameRequest(values({ descricao: '  \n ' })).descricao).toBeNull();
    expect(toGameRequest(values({ descricao: 'Linha 1\n\nLinha 3' })).descricao).toBe(
      'Linha 1\n\nLinha 3',
    );
  });

  it('o corpo é sempre completo, inclusive os critérios null explícitos na edição (CA-32)', () => {
    expect(toGameRequest(values({ status: 'QUERO_JOGAR', notas: EMPTY_RATING_TEXTS }))).toEqual({
      titulo: 'Celeste',
      status: 'QUERO_JOGAR',
      plataforma: 'PC',
      gameplay: null,
      historia: null,
      graficos: null,
      trilhaSonora: null,
      performance: null,
      descricao: null,
    });
  });
});

describe('ratingErrors e mediaOf (CA-19, CA-20)', () => {
  it('aponta só os critérios com texto inválido, com a mensagem do critério', () => {
    const errors = ratingErrors(
      values({ notas: notas({ gameplay: '10,5', historia: '8', graficos: 'x' }) }),
    );

    expect(Object.keys(errors).sort()).toEqual(['gameplay', 'graficos']);
    expect(errors.gameplay).toBe(
      'A nota de Gameplay deve ser um número de 0 a 10, com no máximo 1 casa decimal',
    );
  });

  it('em Quero jogar não há nota a validar', () => {
    expect(
      ratingErrors(values({ status: 'QUERO_JOGAR', notas: notas({ gameplay: '99' }) })),
    ).toEqual({});
  });

  it('a média ao vivo usa só o que está preenchido e válido', () => {
    expect(mediaOf(values({ notas: notas({ gameplay: '9', historia: '8,5' }) }))).toBe(8.8);
    expect(mediaOf(values({ notas: notas({ gameplay: '9', historia: '' }) }))).toBe(9);
    expect(mediaOf(values({ notas: notas({ gameplay: '9', historia: 'abc' }) }))).toBe(9);
    expect(mediaOf(values({ notas: EMPTY_RATING_TEXTS }))).toBeNull();
    expect(mediaOf(values({ notas: notas({ gameplay: '0' }) }))).toBe(0);
  });

  it('em Quero jogar não há média', () => {
    expect(mediaOf(values({ status: 'QUERO_JOGAR' }))).toBeNull();
  });
});

describe('valuesFromGame e valores iniciais', () => {
  const game: Game = {
    id: '1',
    titulo: 'Hades',
    plataforma: null,
    status: 'JOGANDO',
    notas: { gameplay: 7, historia: 8.5, graficos: null, trilhaSonora: 0, performance: null },
    notaMedia: 5.2,
    descricao: 'Ótimo\n\njogo',
    capaUrl: null,
    criadoEm: '2026-09-23T12:00:00.000Z',
    atualizadoEm: '2026-09-23T12:00:00.000Z',
  };

  it('plataforma null vira vazio; as notas viram texto com vírgula; 0 continua "0"; null vira ""', () => {
    expect(valuesFromGame(game)).toEqual({
      titulo: 'Hades',
      plataforma: '',
      status: 'JOGANDO',
      notas: { gameplay: '7', historia: '8,5', graficos: '', trilhaSonora: '0', performance: '' },
      descricao: 'Ótimo\n\njogo',
    });
  });

  it('descrição null vira ""', () => {
    expect(valuesFromGame({ ...game, descricao: null }).descricao).toBe('');
  });

  it('um jogo novo começa em "Quero jogar", vazio e sem notas', () => {
    expect(EMPTY_FORM_VALUES).toEqual({
      titulo: '',
      plataforma: '',
      status: 'QUERO_JOGAR',
      notas: EMPTY_RATING_TEXTS,
      descricao: '',
    });
  });
});
