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

class JogoParecidoDto {
  @ApiProperty() id!: string;
  @ApiProperty() titulo!: string;
  @ApiPropertyOptional({ nullable: true, type: String }) plataforma!: string | null;
}

export class ItemBibliotecaDto {
  @ApiProperty({ description: 'O identificador do item na plataforma (na Steam, o appid)' })
  idExterno!: string;
  @ApiProperty() titulo!: string;
  @ApiPropertyOptional({ nullable: true, type: String }) capaUrl!: string | null;
  @ApiProperty() minutosJogados!: number;
  @ApiPropertyOptional({ nullable: true, type: String, description: 'ISO 8601' })
  ultimaVezJogadoEm!: string | null;
  @ApiProperty({
    type: [JogoParecidoDto],
    description:
      'Jogos do catálogo com o mesmo título (sem caixa, acento nem pontuação) e ainda sem vínculo, até 3',
  })
  jogosParecidos!: JogoParecidoDto[];
  @ApiPropertyOptional({
    nullable: true,
    type: JogoParecidoDto,
    description: 'O jogo ao qual este item já está ligado',
  })
  vinculadoA!: JogoParecidoDto | null;
}

export class DadosJogoPlataformaDto {
  @ApiProperty({ enum: PROVEDORES }) provedor!: Provedor;
  @ApiProperty({ description: 'O identificador do item na plataforma (na Steam, o appid)' })
  idExterno!: string;
  @ApiProperty() minutosJogados!: number;
  @ApiPropertyOptional({ nullable: true, type: String, description: 'ISO 8601' })
  ultimaVezJogadoEm!: string | null;
  @ApiPropertyOptional({
    nullable: true,
    type: Number,
    description: 'null = nunca consultado ou negado; 0 = o jogo não tem conquistas',
  })
  conquistasTotal!: number | null;
  @ApiPropertyOptional({ nullable: true, type: Number }) conquistasDesbloqueadas!: number | null;
  @ApiPropertyOptional({ nullable: true, type: String }) capaUrl!: string | null;
  @ApiProperty({ description: 'ISO 8601' }) atualizadoEm!: string;
}

export class ConquistaDto {
  @ApiProperty() id!: string;
  @ApiProperty({ description: 'O nome da conquista (ou o id, se o schema falhou)' }) nome!: string;
  @ApiPropertyOptional({
    nullable: true,
    type: String,
    description: 'null quando a conquista é oculta e ainda bloqueada',
  })
  descricao!: string | null;
  @ApiProperty() oculta!: boolean;
  @ApiProperty() desbloqueada!: boolean;
  @ApiPropertyOptional({ nullable: true, type: String, description: 'ISO 8601' })
  desbloqueadaEm!: string | null;
  @ApiPropertyOptional({ nullable: true, type: String }) iconeUrl!: string | null;
  @ApiPropertyOptional({
    nullable: true,
    type: Number,
    description: '% dos jogadores que a têm, com 1 casa; null quando indisponível',
  })
  raridadePercentual!: number | null;
}

export class DetalheJogoPlataformaDto {
  @ApiProperty({ type: DadosJogoPlataformaDto }) dados!: DadosJogoPlataformaDto;
  @ApiProperty({
    type: [ConquistaDto],
    description: 'Vazia com aviso (privado, sem conquistas ou plataforma indisponível)',
  })
  conquistas!: ConquistaDto[];
  @ApiPropertyOptional({
    nullable: true,
    type: String,
    enum: ['PERFIL_PRIVADO', 'CONQUISTAS_PRIVADAS', 'SEM_CONQUISTAS', 'INDISPONIVEL'],
  })
  aviso!: string | null;
}
