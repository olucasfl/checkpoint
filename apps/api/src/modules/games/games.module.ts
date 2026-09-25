import { Module } from '@nestjs/common';
import { StorageService } from './cover/storage.service';
import { GamesController } from './games.controller';
import { GamesService } from './games.service';

@Module({
  controllers: [GamesController],
  providers: [GamesService, StorageService],
  // A exclusão de conta (`users`) lê e remove as capas pelo GamesService: o StorageService fica aqui.
  exports: [GamesService],
})
export class GamesModule {}
