import { useSyncExternalStore } from 'react';

let visivel = false;
const assinantes = new Set<() => void>();

/**
 * O `UpdatePrompt` informa aqui se está na tela. Um store à parte, em vez de o `InstallNudge` chamar
 * `useAppUpdate`: cada chamada registraria o service worker de novo.
 */
export function setUpdatePromptVisivel(valor: boolean): void {
  if (valor === visivel) {
    return;
  }
  visivel = valor;
  for (const assinante of [...assinantes]) {
    assinante();
  }
}

function assinar(callback: () => void): () => void {
  assinantes.add(callback);
  return () => {
    assinantes.delete(callback);
  };
}

/** O aviso de versão nova está visível? A atualização tem prioridade sobre o convite de instalação. */
export function useUpdatePromptVisivel(): boolean {
  return useSyncExternalStore(assinar, () => visivel);
}
