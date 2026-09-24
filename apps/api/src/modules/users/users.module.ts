import { Module } from '@nestjs/common';
import { UsersController } from './users.controller';
import { UsersService } from './users.service';

/** A conta do usuário logado: por enquanto o nome de exibição (spec perfil, etapa 1). */
@Module({
  controllers: [UsersController],
  providers: [UsersService],
})
export class UsersModule {}
