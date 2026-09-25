import { ApiProperty } from '@nestjs/swagger';
import { GAME_STATUS, type Game, type GameRatings, type GameStatus } from '@checkpoint/shared';
import { DadosJogoPlataformaDto } from '../../integrations/dto/integracao-response.dto';

/** Só existe para o Swagger mostrar as `notas` (cada critério de 0 a 10, ou null sem nota). */
export class GameRatingsResponseDto implements GameRatings {
  @ApiProperty({ type: Number, nullable: true, example: 9 })
  gameplay!: number | null;

  @ApiProperty({ type: Number, nullable: true, example: 8.5 })
  historia!: number | null;

  @ApiProperty({ type: Number, nullable: true, example: null })
  graficos!: number | null;

  @ApiProperty({ type: Number, nullable: true, example: null })
  trilhaSonora!: number | null;

  @ApiProperty({ type: Number, nullable: true, example: null })
  performance!: number | null;
}

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

  @ApiProperty({ type: GameRatingsResponseDto })
  notas!: GameRatingsResponseDto;

  @ApiProperty({
    type: Number,
    nullable: true,
    example: 8.8,
    description:
      'Média dos critérios preenchidos, com 1 casa decimal (calculada, nunca gravada); null sem nenhum critério.',
  })
  notaMedia!: number | null;

  @ApiProperty({ type: String, nullable: true, example: 'Escalada difícil e trilha marcante.' })
  descricao!: string | null;

  @ApiProperty({
    type: String,
    nullable: true,
    description: 'URL pública da capa, ou null sem capa.',
    example:
      'https://<ref>.supabase.co/storage/v1/object/public/capas/<userId>/<gameId>/<uuid>.png',
  })
  capaUrl!: string | null;

  @ApiProperty({ format: 'date-time' })
  criadoEm!: string;

  @ApiProperty({ format: 'date-time' })
  atualizadoEm!: string;

  @ApiProperty({
    type: [DadosJogoPlataformaDto],
    description:
      'A camada de cada plataforma vinculada (o último valor consultado, sem chamar a plataforma); [] sem vínculo.',
  })
  dadosPlataforma!: DadosJogoPlataformaDto[];
}
