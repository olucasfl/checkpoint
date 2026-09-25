import { TtlCache } from './ttl-cache';

describe('TtlCache', () => {
  let agora: number;
  const relogio = (): number => agora;

  beforeEach(() => {
    agora = 1_000;
  });

  it('devolve o valor dentro da validade e undefined depois dela', () => {
    const cache = new TtlCache<string>(100, 10, relogio);
    cache.set('a', 'valor');

    agora = 1_099;
    expect(cache.get('a')).toBe('valor');
    agora = 1_100;
    expect(cache.get('a')).toBeUndefined();
    expect(cache.size).toBe(0);
  });

  it('chave que nunca entrou é undefined', () => {
    expect(new TtlCache<string>(100, 10, relogio).get('x')).toBeUndefined();
  });

  it('regravar renova a validade', () => {
    const cache = new TtlCache<string>(100, 10, relogio);
    cache.set('a', 'v1');
    agora = 1_090;
    cache.set('a', 'v2');
    agora = 1_150;

    expect(cache.get('a')).toBe('v2');
  });

  it('passou do teto, descarta a entrada MAIS ANTIGA', () => {
    const cache = new TtlCache<number>(1_000, 3, relogio);
    cache.set('a', 1);
    cache.set('b', 2);
    cache.set('c', 3);
    cache.set('d', 4);

    expect(cache.size).toBe(3);
    expect(cache.get('a')).toBeUndefined();
    expect([cache.get('b'), cache.get('c'), cache.get('d')]).toEqual([2, 3, 4]);
  });

  it('regravar uma chave existente não conta como entrada nova (não expulsa ninguém)', () => {
    const cache = new TtlCache<number>(1_000, 2, relogio);
    cache.set('a', 1);
    cache.set('b', 2);
    cache.set('a', 10);

    expect([cache.get('a'), cache.get('b')]).toEqual([10, 2]);
  });

  it('delete remove a entrada', () => {
    const cache = new TtlCache<number>(1_000, 2, relogio);
    cache.set('a', 1);
    cache.delete('a');

    expect(cache.get('a')).toBeUndefined();
  });

  it('lê Date.now a cada uso quando não recebe relógio (um teste pode trocá-lo)', () => {
    const spy = jest.spyOn(Date, 'now').mockReturnValue(5_000);
    const cache = new TtlCache<string>(100, 10);
    cache.set('a', 'v');
    spy.mockReturnValue(5_200);

    expect(cache.get('a')).toBeUndefined();
    spy.mockRestore();
  });
});
