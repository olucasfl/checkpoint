import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { ThrottlerModule } from '@nestjs/throttler';
import { IntegrationsController } from './integrations.controller';
import { IntegrationsService } from './integrations.service';
import { IntegrationsThrottlerGuard } from './integrations-throttler.guard';
import { GAME_PROVIDERS, ProviderRegistry } from './providers/provider-registry';
import { SteamOpenId } from './steam/steam-open-id';
import { SteamClient } from './steam/steam.client';
import { SteamProvider } from './steam/steam.provider';
import { VinculoStateService } from './vinculo/vinculo-state.service';

/**
 * Integrações com plataformas de jogos (spec `integracao-plataformas`). Cada plataforma nova acrescenta o seu
 * provider à lista de `GAME_PROVIDERS`; o resto do módulo só conhece a interface `GameProvider`.
 */
@Module({
  imports: [
    // O `state` do vínculo é um JWT: segredo e validade vão em cada chamada (`VinculoStateService`).
    JwtModule.register({}),
    // Só o padrão do módulo; cada rota define o próprio limite, POR USUÁRIO (`IntegrationsThrottlerGuard`).
    // Armazenamento em memória (uma instância), separado do das rotas de auth.
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: 30 }]),
  ],
  controllers: [IntegrationsController],
  providers: [
    IntegrationsService,
    IntegrationsThrottlerGuard,
    VinculoStateService,
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
