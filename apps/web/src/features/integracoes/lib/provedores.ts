import { type Provedor } from '@checkpoint/shared';

/**
 * O provedor das telas que hoje só falam com a Steam (Buscar na Steam, bloco da página do jogo). É o ÚNICO lugar
 * do web, fora do `shared`, com o código do provedor escrito à mão (`sem-provedor-solto.test.ts`): quando outra
 * plataforma entrar, essas telas passam a receber o provedor por prop e este arquivo acaba.
 */
export const PROVEDOR_STEAM: Provedor = 'STEAM';
