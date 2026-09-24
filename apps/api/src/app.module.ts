import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { validateEnv } from './config/env.validation';
import { PrismaModule } from './database/prisma.module';
import { AccessTokenGuard } from './modules/auth/access-token.guard';
import { AuthModule } from './modules/auth/auth.module';
import { GamesModule } from './modules/games/games.module';
import { HealthModule } from './modules/health/health.module';
import { UsersModule } from './modules/users/users.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      cache: true,
      validate: validateEnv,
      envFilePath: ['.env'],
    }),
    PrismaModule,
    AuthModule,
    HealthModule,
    GamesModule,
    UsersModule,
  ],
  providers: [
    // Guard global: toda rota exige access token, exceto as marcadas com `@Public()`.
    { provide: APP_GUARD, useClass: AccessTokenGuard },
  ],
})
export class AppModule {}
