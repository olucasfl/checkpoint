import { defineKey } from '@/shared/lib/storage/keys';

/**
 * Quais seções recolhíveis da página do jogo estão abertas (spec `plataformas-e-pagina-do-jogo`, F2). Só neste aparelho
 * (escopo `dispositivo`, como as preferências) e por TIPO de seção, não por jogo: abrir "Faltam" num jogo vale para os
 * outros. Nunca vai à API.
 */
export type SecoesAbertas = Record<string, boolean>;

function isSecoesAbertas(valor: unknown): valor is SecoesAbertas {
  return (
    typeof valor === 'object' &&
    valor !== null &&
    !Array.isArray(valor) &&
    Object.values(valor).every((v) => typeof v === 'boolean')
  );
}

export const SECOES_DO_JOGO = defineKey<SecoesAbertas>({
  nome: 'secoes-do-jogo',
  escopo: 'dispositivo',
  padrao: {},
  validar: isSecoesAbertas,
});
