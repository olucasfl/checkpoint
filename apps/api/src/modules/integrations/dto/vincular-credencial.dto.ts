import { ApiProperty } from '@nestjs/swagger';
import { IsString, Matches } from 'class-validator';
import { type VincularComCredencialRequest } from '@checkpoint/shared';
import { RawValue } from '../../../common/dto/transforms';

/**
 * Corpo de `POST /api/integracoes/:provedor/vinculo/credencial` (spec integracao-playstation). A credencial (na
 * PlayStation, o NPSSO) equivale a uma SENHA: só viaja no corpo deste `POST`, é lida CRUA (`RawValue`: um número, um
 * array ou um objeto não viram texto) e as mensagens de validação NÃO ecoam o valor. O formato real do NPSSO não está
 * confirmado, então a regra é permissiva de propósito: só barra lixo óbvio, e a plataforma decide o resto.
 */
export class VincularCredencialDto implements VincularComCredencialRequest {
  @ApiProperty({
    description:
      'A credencial da plataforma (PlayStation: o NPSSO). Usada uma vez e nunca guardada.',
    writeOnly: true,
  })
  @RawValue()
  @IsString({ message: 'A credencial deve ser um texto' })
  @Matches(/^[A-Za-z0-9_-]{32,128}$/, { message: 'Credencial em formato inválido' })
  credencial!: string;
}
