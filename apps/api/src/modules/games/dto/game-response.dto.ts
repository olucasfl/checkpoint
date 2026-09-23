import { ApiProperty } from '@nestjs/swagger';
import { GAME_STATUS, type Game, type GameStatus } from '@checkpoint/shared';

/** Só existe para o Swagger mostrar o shape de `Game` (o contrato real está em @checkpoint/shared). */
export class GameResponseDto implements Game {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ example: 'Hollow Knight' })
  titulo!: string;

  @ApiProperty({ type: String, nullable: true, example: 'PC' })
  plataforma!: string | null;

  @ApiProperty({ enum: GAME_STATUS })
  status!: GameStatus;

  @ApiProperty({ type: Number, nullable: true, example: 9 })
  nota!: number | null;

  @ApiProperty({ format: 'date-time' })
  criadoEm!: string;

  @ApiProperty({ format: 'date-time' })
  atualizadoEm!: string;
}
