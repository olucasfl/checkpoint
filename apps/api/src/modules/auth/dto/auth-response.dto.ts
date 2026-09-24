import { ApiProperty } from '@nestjs/swagger';
import { type AuthResponse, type Usuario } from '@checkpoint/shared';

/** Só existe para o Swagger mostrar o formato (o contrato real é o `Usuario` do shared). */
export class UsuarioDto implements Usuario {
  @ApiProperty({ example: '3f2b8a52-9c1e-4d6a-8f31-0a7e5b2c9d44' })
  id!: string;

  @ApiProperty({ example: 'Ana Teste' })
  nome!: string;

  @ApiProperty({ example: 'ana@exemplo.com' })
  email!: string;

  @ApiProperty({ example: '2026-09-24T12:00:00.000Z' })
  criadoEm!: string;
}

export class AuthResponseDto implements AuthResponse {
  @ApiProperty({
    description:
      'Access token (JWT, 15 min): vai em `Authorization: Bearer`. O refresh token NÃO vem no corpo: ' +
      'é o cookie HttpOnly `checkpoint_refresh`.',
  })
  accessToken!: string;

  @ApiProperty({ type: UsuarioDto })
  usuario!: UsuarioDto;
}
