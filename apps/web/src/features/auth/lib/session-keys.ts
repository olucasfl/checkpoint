import { defineKey } from '@/shared/lib/storage/keys';

/**
 * `true` ao entrar. Distingue "visitante" (nunca entrou neste navegador, ou saiu) de "a sessão
 * terminou" (tinha sessão e o refresh deu 401), para mostrar ou não a mensagem. Escopo `usuario`: sai
 * junto com o logout (`storage.clearScope('usuario')`); as chaves `instalacao:*` (`dispositivo`) ficam.
 */
export const SESSAO_ATIVA = defineKey<boolean>({
  nome: 'sessao:ativa',
  escopo: 'usuario',
  padrao: false,
  validar: (valor): valor is boolean => typeof valor === 'boolean',
});
