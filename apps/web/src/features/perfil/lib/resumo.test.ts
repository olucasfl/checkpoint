import { describe, expect, it } from 'vitest';
import { membroDesde, RESUMO_CARREGANDO, resumoDoCatalogo } from './resumo';

describe('resumoDoCatalogo (perfil CA-01)', () => {
  it('sem contagens (carregando ou erro) é só o traço', () => {
    expect(resumoDoCatalogo(undefined)).toBe(RESUMO_CARREGANDO);
    expect(RESUMO_CARREGANDO).toBe('—');
  });

  it('o exemplo da spec: 3 jogos · 1 zerado · 2 jogando · 0 quero jogar', () => {
    expect(resumoDoCatalogo({ total: 3, ZERADO: 1, JOGANDO: 2, QUERO_JOGAR: 0 })).toBe(
      '3 jogos · 1 zerado · 2 jogando · 0 quero jogar',
    );
  });

  it('plural de "jogo" e "zerado"; "jogando" e "quero jogar" não flexionam', () => {
    expect(resumoDoCatalogo({ total: 1, ZERADO: 0, JOGANDO: 1, QUERO_JOGAR: 0 })).toBe(
      '1 jogo · 0 zerados · 1 jogando · 0 quero jogar',
    );
    expect(resumoDoCatalogo({ total: 12, ZERADO: 5, JOGANDO: 3, QUERO_JOGAR: 4 })).toBe(
      '12 jogos · 5 zerados · 3 jogando · 4 quero jogar',
    );
  });

  it('catálogo vazio', () => {
    expect(resumoDoCatalogo({ total: 0, ZERADO: 0, JOGANDO: 0, QUERO_JOGAR: 0 })).toBe(
      '0 jogos · 0 zerados · 0 jogando · 0 quero jogar',
    );
  });
});

describe('membroDesde (perfil CA-01)', () => {
  it('mês por extenso e ano, em pt-BR', () => {
    expect(membroDesde('2026-09-24T12:00:00.000Z')).toBe('Membro desde setembro de 2026');
    expect(membroDesde('2027-01-15T12:00:00.000Z')).toBe('Membro desde janeiro de 2027');
  });

  it('data inválida não quebra a tela: devolve null', () => {
    expect(membroDesde('não é data')).toBeNull();
  });
});
