import { useSyncExternalStore } from 'react';
import { usePrefs } from './use-prefs';

const CONSULTA = '(prefers-reduced-motion: reduce)';

function assinar(aviso: () => void): () => void {
  const consulta = window.matchMedia?.(CONSULTA);
  consulta?.addEventListener('change', aviso);
  return () => consulta?.removeEventListener('change', aviso);
}

const doSistema = () => window.matchMedia?.(CONSULTA).matches ?? false;

/**
 * Movimento reduzido para o que se decide em JS (a transição de tela, o `scrollIntoView`): o sistema pediu menos
 * movimento OU a pessoa escolheu "Animações: reduzidas" no /perfil. O CSS usa a variante `movimento-reduzido`, que
 * tem os mesmos dois gatilhos.
 */
export function useMovimentoReduzido(): boolean {
  const sistema = useSyncExternalStore(assinar, doSistema, () => false);
  const { efeitos } = usePrefs();

  return sistema || efeitos === 'reduzidos';
}
