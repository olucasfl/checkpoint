import { SetMetadata } from '@nestjs/common';

export const IS_PUBLIC_KEY = 'isPublic';

/**
 * Libera a rota (ou o controller inteiro) do guard global de autenticação. Sem ele, toda rota exige
 * `Authorization: Bearer <access token>`: esquecer o decorator fecha a rota, nunca a abre.
 */
export const Public = (): MethodDecorator & ClassDecorator => SetMetadata(IS_PUBLIC_KEY, true);
