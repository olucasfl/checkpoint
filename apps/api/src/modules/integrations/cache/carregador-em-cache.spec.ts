import { CarregadorEmCache } from './carregador-em-cache';

describe('CarregadorEmCache', () => {
  it('guarda o sucesso: a segunda chamada não carrega de novo', async () => {
    const cache = new CarregadorEmCache<number>(1000, 10);
    const carregar = jest.fn().mockResolvedValue(7);

    expect(await cache.obter('a', carregar)).toBe(7);
    expect(await cache.obter('a', carregar)).toBe(7);

    expect(carregar).toHaveBeenCalledTimes(1);
  });

  it('chamadas simultâneas esperam a mesma consulta', async () => {
    const cache = new CarregadorEmCache<number>(1000, 10);
    let resolver: (valor: number) => void = () => undefined;
    const carregar = jest.fn(
      () =>
        new Promise<number>((resolve) => {
          resolver = resolve;
        }),
    );

    const a = cache.obter('a', carregar);
    const b = cache.obter('a', carregar);
    resolver(3);

    await expect(Promise.all([a, b])).resolves.toEqual([3, 3]);
    expect(carregar).toHaveBeenCalledTimes(1);
  });

  it('erro não entra no cache nem fica preso em voo', async () => {
    const cache = new CarregadorEmCache<number>(1000, 10);
    const carregar = jest.fn().mockRejectedValueOnce(new Error('falhou')).mockResolvedValueOnce(5);

    await expect(cache.obter('a', carregar)).rejects.toThrow('falhou');
    expect(await cache.obter('a', carregar)).toBe(5);

    expect(carregar).toHaveBeenCalledTimes(2);
  });

  it('vale só até o TTL', async () => {
    let agora = 0;
    const cache = new CarregadorEmCache<number>(1000, 10, () => agora);
    const carregar = jest.fn().mockResolvedValueOnce(1).mockResolvedValueOnce(2);

    expect(await cache.obter('a', carregar)).toBe(1);
    agora = 1001;
    expect(await cache.obter('a', carregar)).toBe(2);
  });

  it('ignorarCache carrega de novo e grava o valor novo', async () => {
    const cache = new CarregadorEmCache<number>(1000, 10);
    const carregar = jest.fn().mockResolvedValueOnce(1).mockResolvedValueOnce(2);

    await cache.obter('a', carregar);
    expect(await cache.obter('a', carregar, { ignorarCache: true })).toBe(2);
    expect(await cache.obter('a', carregar)).toBe(2);

    expect(carregar).toHaveBeenCalledTimes(2);
  });

  it('chaves diferentes não se misturam', async () => {
    const cache = new CarregadorEmCache<string>(1000, 10);

    expect(await cache.obter('a', () => Promise.resolve('A'))).toBe('A');
    expect(await cache.obter('b', () => Promise.resolve('B'))).toBe('B');
  });
});
