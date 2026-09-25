import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { GamesModule } from '../games/games.module';
import { UsersController } from './users.controller';
import { UsersService } from './users.service';

/** A conta do usuário logado (spec perfil): o nome de exibição e a exclusão da conta. */
@Module({
  imports: [AuthModule, GamesModule],
  controllers: [UsersController],
  providers: [UsersService],
})
export class UsersModule {}
