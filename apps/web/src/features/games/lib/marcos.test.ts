import { describe, expect, it } from 'vitest';
import { apareceNoFiltro, chegouAos100, marcoDoSalvar, textoDoMarco } from './marcos';

describe('marcoDoSalvar (CA-54, CA-55)', () => {
  it('criar com a lista vazia é o primeiro jogo, mesmo que ele já venha Zerado', () => {
    expect(marcoDoSalvar({ criado: true, listaVazia: true, jogo: { status: 'JOGANDO' } })).toBe(
      'primeiro-jogo',
    );
    expect(marcoDoSalvar({ criado: true, listaVazia: true, jogo: { status: 'ZERADO' } })).toBe(
      'primeiro-jogo',
    );
  });

  it('criar com jogos na lista não é o primeiro; criar já Zerado é um Zerado', () => {
    expect(
      marcoDoSalvar({ criado: true, listaVazia: false, jogo: { status: 'JOGANDO' } }),
    ).toBeNull();
    expect(marcoDoSalvar({ criado: true, listaVazia: false, jogo: { status: 'ZERADO' } })).toBe(
      'zerado',
    );
  });

  it('editar: só comemora quando PASSA a Zerado, nunca ao continuar Zerado', () => {
    const editar = (antes: 'JOGANDO' | 'ZERADO', depois: 'JOGANDO' | 'ZERADO') =>
      marcoDoSalvar({
        criado: false,
        listaVazia: false,
        anterior: { status: antes },
        jogo: { status: depois },
      });

    expect(editar('JOGANDO', 'ZERADO')).toBe('zerado');
    expect(editar('ZERADO', 'ZERADO')).toBeNull();
    expect(editar('ZERADO', 'JOGANDO')).toBeNull();
  });
});

describe('chegouAos100 (CA-56)', () => {
  const dados = (total: number | null, ganhas: number | null) => ({
    conquistasTotal: total,
    conquistasDesbloqueadas: ganhas,
  });

  it('passar de incompleto a completo comemora', () => {
    expect(chegouAos100(dados(40, 39), dados(40, 40))).toBe(true);
    expect(chegouAos100(dados(null, null), dados(20, 20))).toBe(true);
  });

  it('já estar em 100% não comemora de novo; jogo sem conquistas nunca', () => {
    expect(chegouAos100(dados(40, 40), dados(40, 40))).toBe(false);
    expect(chegouAos100(dados(0, 0), dados(0, 0))).toBe(false);
    expect(chegouAos100(dados(40, 10), dados(40, 12))).toBe(false);
  });
});

describe('textos e filtro', () => {
  it('textos dos marcos citam o jogo', () => {
    expect(textoDoMarco('zerado', 'Celeste')).toContain('Celeste');
    expect(textoDoMarco('conquistas-100', 'Hades')).toContain('100%');
    expect(textoDoMarco('primeiro-jogo', 'X')).toContain('primeiro jogo');
  });

  it('o jogo criado aparece com "Todos" ou com o filtro do próprio status', () => {
    expect(apareceNoFiltro('TODOS', 'JOGANDO')).toBe(true);
    expect(apareceNoFiltro('JOGANDO', 'JOGANDO')).toBe(true);
    expect(apareceNoFiltro('ZERADO', 'JOGANDO')).toBe(false);
  });
});
