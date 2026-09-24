import { describe, expect, it } from 'vitest';
import { NEW_GAME_PARAM, newGameHref, wantsNewGame, withoutNewGameParam } from './new-game';

describe('newGameHref', () => {
  it('em `/` sem query vai para /?novo=1', () => {
    expect(newGameHref('/', '')).toBe('/?novo=1');
  });

  it('em `/` mantém o filtro atual', () => {
    expect(newGameHref('/', '?status=ZERADO')).toBe('/?status=ZERADO&novo=1');
  });

  it('em outra rota descarta a query dela e vai para /?novo=1', () => {
    expect(newGameHref('/status', '?x=1')).toBe('/?novo=1');
  });

  it('não duplica o parâmetro se ele já estiver lá', () => {
    expect(newGameHref('/', '?novo=1')).toBe('/?novo=1');
  });
});

describe('wantsNewGame / withoutNewGameParam', () => {
  it('só "1" pede o formulário', () => {
    expect(wantsNewGame(new URLSearchParams('novo=1'))).toBe(true);
    expect(wantsNewGame(new URLSearchParams('novo=0'))).toBe(false);
    expect(wantsNewGame(new URLSearchParams(''))).toBe(false);
  });

  it('remove só o "novo" e não altera o original', () => {
    const original = new URLSearchParams('status=JOGANDO&novo=1');
    const next = withoutNewGameParam(original);

    expect(next.toString()).toBe('status=JOGANDO');
    expect(original.get(NEW_GAME_PARAM)).toBe('1');
  });
});
