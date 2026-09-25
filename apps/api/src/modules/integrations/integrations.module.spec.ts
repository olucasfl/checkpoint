import { ConfigModule } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { IntegrationsModule } from './integrations.module';
import { ProviderRegistry } from './providers/provider-registry';
import { SteamClient } from './steam/steam.client';

// Garante que a injeção de dependência do módulo resolve (o `ConfigService` é global no app de verdade).
describe('IntegrationsModule', () => {
  it('monta o SteamClient e o ProviderRegistry (ainda sem provider registrado na etapa 1)', async () => {
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
    expect(module.get(ProviderRegistry).provedoresRegistrados()).toEqual([]);
  });
});
