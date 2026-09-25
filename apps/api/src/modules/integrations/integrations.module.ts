import { Module } from '@nestjs/common';
import { GAME_PROVIDERS, ProviderRegistry } from './providers/provider-registry';
import { SteamClient } from './steam/steam.client';

/**
 * Integrações com plataformas de jogos (spec `integracao-plataformas`). Na etapa 1 é só a base: o cliente
 * da Steam, a interface `GameProvider` e o registro. Ainda sem rota (controller e service chegam na etapa 2).
 * Cada plataforma nova acrescenta o seu provider à lista de `GAME_PROVIDERS`.
 */
@Module({
  providers: [SteamClient, ProviderRegistry, { provide: GAME_PROVIDERS, useValue: [] }],
  exports: [SteamClient, ProviderRegistry],
})
export class IntegrationsModule {}
