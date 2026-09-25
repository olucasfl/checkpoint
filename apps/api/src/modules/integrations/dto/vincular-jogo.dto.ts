import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsOptional, IsString, Matches } from 'class-validator';
import { type VincularJogoRequest } from '@checkpoint/shared';
import { RawValue } from '../../../common/dto/transforms';

/**
 * Corpo de `PUT /api/integracoes/:provedor/jogos/:jogoId`. O valor é lido CRU (`RawValue`): um número
 * (`504230`), um array ou um objeto NÃO viram texto pela conversão implícita do pipe global. O formato do
 * identificador é só "curto e seguro" (o provedor confere o resto: na Steam, dígitos), para nunca chegar aos
 * logs nem a uma URL um texto arbitrário.
 */
export class VincularJogoDto implements VincularJogoRequest {
  @ApiProperty({
    description: 'O identificador do item na biblioteca da plataforma (na Steam, o appid)',
    example: '504230',
  })
  @RawValue()
  @IsString({ message: 'O identificador do item deve ser um texto' })
  @Matches(/^[A-Za-z0-9_-]{1,40}$/, { message: 'Identificador do item inválido' })
  idExterno!: string;

  @ApiPropertyOptional({
    description:
      'Com `true`, tira o vínculo do OUTRO jogo que já tem este item e o move para este (o outro jogo perde só a camada da plataforma)',
  })
  @IsOptional()
  @RawValue()
  @IsBoolean({ message: 'mover deve ser true ou false' })
  mover?: boolean;
}
