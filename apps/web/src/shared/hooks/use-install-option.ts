import { useEffect, useReducer } from 'react';
import { ehSafariIos, estaInstalado } from '@/shared/lib/pwa/display';
import { INSTALADO } from '@/shared/lib/pwa/install-keys';
import { assinar, podeInstalar } from '@/shared/lib/pwa/install-prompt';
import { storage } from '@/shared/lib/storage/storage';

/**
 * Como instalar o app AGORA, neste navegador: `nativo` (Chrome/Edge guardaram o convite), `ios`
 * (Safari do iPhone/iPad: só dá pelo passo a passo) ou `null` (já instalado, aberto instalado, ou o
 * navegador não oferece). Reage ao convite nativo que chega depois do render e ao `appinstalled`.
 * Sem as regras de intervalo do convite esporádico: é para um botão sempre disponível.
 */
export function useInstallOption(): 'nativo' | 'ios' | null {
  const [, atualizar] = useReducer((n: number) => n + 1, 0);

  useEffect(() => assinar(atualizar), []);

  if (estaInstalado() || storage.get(INSTALADO)) {
    return null;
  }
  if (podeInstalar()) {
    return 'nativo';
  }
  return ehSafariIos() ? 'ios' : null;
}
