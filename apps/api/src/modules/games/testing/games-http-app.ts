import { type INestApplication } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { JwtModule } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import { randomUUID } from 'node:crypto';
import { type AddressInfo } from 'node:net';
import { createValidationPipe } from '../../../common/pipes/app-validation.pipe';
import { API_GLOBAL_PREFIX } from '../../../config/app.config';
import { PrismaService } from '../../../database/prisma.service';
import { AccessTokenGuard } from '../../auth/access-token.guard';
import { AuthTokensService } from '../../auth/auth-tokens.service';
import { StorageService } from '../cover/storage.service';
import { GamesController } from '../games.controller';
import { GamesService } from '../games.service';

/** Donos sintéticos dos jogos nos specs HTTP. */
export const ANA_ID = '0b6c1f7e-2a3d-4e5f-8a9b-1c2d3e4f5a6b';
export const BIA_ID = '9e8d7c6b-5a4f-4e3d-9c2b-1a0f9e8d7c6b';

export interface GamesHttpApp {
  app: INestApplication;
  baseUrl: string;
  /** Access token válido de `userId`, com a sessão dele registrada no Prisma falso. */
  tokenFor(userId: string): Promise<string>;
}

/**
 * Sobe o `GamesController` com o guard global de verdade (`AccessTokenGuard` + JWT assinado pelo
 * `AuthTokensService`), numa porta local efêmera. O `game` e o storage são os mocks do spec; a
 * sessão do token vive num mapa em memória: nenhum teste toca o banco nem o Supabase reais.
 */
export async function startGamesApp(
  game: Record<string, jest.Mock>,
  storage: Record<string, jest.Mock>,
): Promise<GamesHttpApp> {
  const sessions = new Map<string, string>();
  const refreshSession = {
    findUnique: jest.fn(({ where }: { where: { id: string } }) => {
      const userId = sessions.get(where.id);
      return Promise.resolve(
        userId ? { userId, expiraEm: new Date(Date.now() + 60 * 60 * 1000) } : null,
      );
    }),
  };

  const moduleRef = await Test.createTestingModule({
    imports: [
      ConfigModule.forRoot({
        isGlobal: true,
        ignoreEnvFile: true,
        load: [
          () => ({ JWT_ACCESS_SECRET: 'segredo-de-acesso-sintetico-com-mais-de-32-caracteres' }),
        ],
      }),
      JwtModule.register({}),
    ],
    controllers: [GamesController],
    providers: [
      GamesService,
      AuthTokensService,
      { provide: PrismaService, useValue: { game, refreshSession } },
      { provide: StorageService, useValue: storage },
      { provide: APP_GUARD, useClass: AccessTokenGuard },
    ],
  }).compile();

  const app = moduleRef.createNestApplication({ logger: false });
  app.setGlobalPrefix(API_GLOBAL_PREFIX);
  app.useGlobalPipes(createValidationPipe());
  await app.listen(0, '127.0.0.1');

  const { port } = app.getHttpServer().address() as AddressInfo;
  const tokens = moduleRef.get(AuthTokensService);

  return {
    app,
    baseUrl: `http://127.0.0.1:${port}/${API_GLOBAL_PREFIX}`,
    tokenFor: (userId) => {
      const sessionId = randomUUID();
      sessions.set(sessionId, userId);
      return tokens.signAccess(userId, sessionId);
    },
  };
}
