import { ConfigModule } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { IntegrationsModule } from './integrations.module';
import { ProviderRegistry } from './providers/provider-registry';
import { SteamProvider } from './steam/steam.provider';
import { SteamClient } from './steam/steam.client';

// Garante que a injeção de dependência do módulo resolve (o `ConfigService` é global no app de verdade).
describe('IntegrationsModule', () => {
  it('monta o SteamClient e o ProviderRegistry com o provider da Steam registrado', async () => {
    const module = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({
          isGlobal: true,
          ignoreEnvFile: true,
          load: [() => ({ STEAM_API_KEY: 'ABCDEF0123456789ABCDEF0123456789' })],
        }),
        IntegrationsModule,
      ],
    }).compile();

    expect(module.get(SteamClient)).toBeInstanceOf(SteamClient);
    const registry = module.get(ProviderRegistry);
    expect(registry.provedoresRegistrados()).toEqual(['STEAM']);
    expect(registry.porSlug('steam')).toBeInstanceOf(SteamProvider);
  });
});
