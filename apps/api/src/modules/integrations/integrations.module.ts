import { Module } from '@nestjs/common';
import { GAME_PROVIDERS, ProviderRegistry } from './providers/provider-registry';
import { SteamOpenId } from './steam/steam-open-id';
import { SteamProvider } from './steam/steam.provider';
import { SteamClient } from './steam/steam.client';

/**
 * Integrações com plataformas de jogos (spec `integracao-plataformas`). Cada plataforma nova acrescenta o seu
 * provider à lista de `GAME_PROVIDERS`; o resto do módulo só conhece a interface `GameProvider`.
 */
@Module({
  providers: [
    SteamClient,
    SteamOpenId,
    SteamProvider,
    {
      provide: GAME_PROVIDERS,
      useFactory: (steam: SteamProvider) => [steam],
      inject: [SteamProvider],
    },
    ProviderRegistry,
  ],
  exports: [SteamClient, SteamOpenId, ProviderRegistry],
})
export class IntegrationsModule {}
