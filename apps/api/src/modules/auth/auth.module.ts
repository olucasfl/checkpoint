import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { ThrottlerModule } from '@nestjs/throttler';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { AuthThrottlerGuard } from './auth-throttler.guard';
import { AuthTokensService } from './auth-tokens.service';
import { CsrfHeaderGuard } from './csrf-header.guard';
import { PasswordHasher, ScryptPasswordHasher } from './password-hasher';

@Module({
  imports: [
    // Segredo e validade vão em cada chamada (`AuthTokensService`): o access e o refresh usam segredos diferentes.
    JwtModule.register({}),
    // Só o padrão do módulo; cada rota do `AuthController` define o próprio limite. Armazenamento em
    // memória (uma instância).
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: 60 }]),
  ],
  controllers: [AuthController],
  providers: [
    AuthService,
    AuthTokensService,
    AuthThrottlerGuard,
    CsrfHeaderGuard,
    { provide: PasswordHasher, useClass: ScryptPasswordHasher },
  ],
  // O guard global (`AccessTokenGuard`, registrado no `AppModule`) precisa dos tokens.
  exports: [AuthTokensService],
})
export class AuthModule {}
