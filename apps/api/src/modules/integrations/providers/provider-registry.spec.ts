import { type GameProvider } from './game-provider';
import { ProvedorNaoSuportadoError } from './plataforma-errors';
import { ProviderRegistry } from './provider-registry';

/** Um provider de mentira: o registro só precisa do `id`. */
function providerFalso(id: GameProvider['id']): GameProvider {
  return { id } as GameProvider;
}

describe('ProviderRegistry', () => {
  it('acha o provider pelo enum e pelo slug do :provedor', () => {
    const steam = providerFalso('STEAM');
    const registry = new ProviderRegistry([steam]);

    expect(registry.porProvedor('STEAM')).toBe(steam);
    expect(registry.porSlug('steam')).toBe(steam);
    expect(registry.provedoresRegistrados()).toEqual(['STEAM']);
  });

  it.each(['xbox', 'STEAM', 'Steam', '', 'steam ', '__proto__'])(
    'slug %j desconhecido lança ProvedorNaoSuportadoError',
    (slug) => {
      const registry = new ProviderRegistry([providerFalso('STEAM')]);

      expect(() => registry.porSlug(slug)).toThrow(ProvedorNaoSuportadoError);
    },
  );

  it('um provedor conhecido do contrato, mas sem implementação registrada, também lança', () => {
    const registry = new ProviderRegistry([]);

    expect(() => registry.porProvedor('STEAM')).toThrow(ProvedorNaoSuportadoError);
    expect(() => registry.porSlug('steam')).toThrow(ProvedorNaoSuportadoError);
  });

  it('recusa registrar o mesmo provedor duas vezes', () => {
    expect(() => new ProviderRegistry([providerFalso('STEAM'), providerFalso('STEAM')])).toThrow(
      'Provider registrado duas vezes: STEAM',
    );
  });
});
