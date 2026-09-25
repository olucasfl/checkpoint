import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { PROVEDORES, type Provedor } from '@checkpoint/shared';

/** Só descrevem as respostas no Swagger; o contrato de verdade está em `@checkpoint/shared`. */
export class ContaVinculadaDto {
  @ApiProperty({ enum: PROVEDORES }) provedor!: Provedor;
  @ApiProperty({ description: 'O identificador na plataforma (na Steam, o SteamID64)' })
  idExterno!: string;
  @ApiProperty() nomeExibicao!: string;
  @ApiProperty({ description: 'ISO 8601' }) vinculadaEm!: string;
}

export class IniciarVinculoResponseDto {
  @ApiProperty({
    description: 'Para onde o navegador deve ir provar quem é o usuário na plataforma',
  })
  url!: string;
}

class JogoMaisJogadoDto {
  @ApiProperty() idExterno!: string;
  @ApiProperty() titulo!: string;
  @ApiPropertyOptional({ nullable: true, type: String }) capaUrl!: string | null;
  @ApiProperty() minutosJogados!: number;
}

class ConquistasDoPerfilDto {
  @ApiProperty() desbloqueadas!: number;
  @ApiProperty() total!: number;
  @ApiProperty({ description: 'Quantos jogos vinculados entraram na soma' })
  jogosVinculados!: number;
}

export class PerfilPlataformaDto {
  @ApiProperty({ enum: PROVEDORES }) provedor!: Provedor;
  @ApiProperty() nomeExibicao!: string;
  @ApiPropertyOptional({ nullable: true, type: String }) avatarUrl!: string | null;
  @ApiPropertyOptional({ nullable: true, type: String }) perfilUrl!: string | null;
  @ApiProperty() totalJogos!: number;
  @ApiProperty() minutosTotais!: number;
  @ApiProperty({ type: [JogoMaisJogadoDto] }) maisJogados!: JogoMaisJogadoDto[];
  @ApiProperty({ type: ConquistasDoPerfilDto }) conquistas!: ConquistasDoPerfilDto;
  @ApiProperty({ description: 'Quando a biblioteca foi consultada na plataforma (ISO 8601)' })
  consultadoEm!: string;
}
