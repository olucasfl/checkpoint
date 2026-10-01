import { useSincronizacaoAutomatica } from '../api/use-sincronizacao';

/**
 * Não desenha nada: monta a sincronização automática das horas das plataformas enquanto a pessoa está logada.
 * Fica no `AppLayout` (e não numa página) para valer qualquer que seja a tela em que o app foi aberto.
 */
export function SincronizadorDePlataformas() {
  useSincronizacaoAutomatica();
  return null;
}
