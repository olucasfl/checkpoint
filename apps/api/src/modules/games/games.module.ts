import { Module } from '@nestjs/common';
import { StorageService } from './cover/storage.service';
import { GamesController } from './games.controller';
import { GamesService } from './games.service';

@Module({
  controllers: [GamesController],
  providers: [GamesService, StorageService],
})
export class GamesModule {}
