import { Inject, Injectable } from '@nestjs/common';
import { PROVEDOR_SLUG, type Provedor } from '@checkpoint/shared';
import { type GameProvider } from './game-provider';
import { ProvedorNaoSuportadoError } from './plataforma-errors';

/** Token da lista de providers registrados (cada plataforma acrescenta o seu). */
export const GAME_PROVIDERS = Symbol('GAME_PROVIDERS');

/**
 * Acha o provider pelo `:provedor` da rota (o _slug_ em minúsculas, ex.: `steam`) ou pelo enum do
 * banco. O `IntegrationsService` só conhece a interface `GameProvider`: uma plataforma nova não muda
 * o service, só entra na lista de `GAME_PROVIDERS`.
 */
@Injectable()
export class ProviderRegistry {
  private readonly byId = new Map<Provedor, GameProvider>();

  constructor(@Inject(GAME_PROVIDERS) providers: GameProvider[]) {
    for (const provider of providers) {
      if (this.byId.has(provider.id)) {
        throw new Error(`Provider registrado duas vezes: ${provider.id}`);
      }
      this.byId.set(provider.id, provider);
    }
  }

  porProvedor(id: Provedor): GameProvider {
    const provider = this.byId.get(id);
    if (!provider) {
      throw new ProvedorNaoSuportadoError(id);
    }
    return provider;
  }

  /** `steam` → o provider da Steam. Slug desconhecido, ou de um provedor sem implementação, lança. */
  porSlug(slug: string): GameProvider {
    const entry = (Object.entries(PROVEDOR_SLUG) as [Provedor, string][]).find(
      ([, value]) => value === slug,
    );
    if (!entry) {
      throw new ProvedorNaoSuportadoError(slug);
    }
    return this.porProvedor(entry[0]);
  }

  /** Os provedores com implementação registrada (ex.: para um pipe validar o `:provedor`). */
  provedoresRegistrados(): Provedor[] {
    return [...this.byId.keys()];
  }
}
