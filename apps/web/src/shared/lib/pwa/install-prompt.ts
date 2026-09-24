import { storage } from '@/shared/lib/storage/storage';
import { INSTALADO } from './install-keys';

/** Não existe no lib.dom: é do Chrome/Edge. */
export interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
}

export type ResultadoInstalacao = 'aceito' | 'recusado' | 'indisponivel';

let evento: BeforeInstallPromptEvent | null = null;
const assinantes = new Set<() => void>();

function notificar(): void {
  for (const assinante of [...assinantes]) {
    assinante();
  }
}

// Escutas ligadas na importação, que `main.tsx` faz antes de qualquer componente: o Chrome dispara o
// `beforeinstallprompt` uma vez e cedo, e quem começa a escutar dentro de um componente o perde.
window.addEventListener('beforeinstallprompt', (event) => {
  // Sem isto o Chrome mostraria o próprio mini-aviso; o convite é nosso.
  event.preventDefault();
  evento = event as BeforeInstallPromptEvent;
  notificar();
});

window.addEventListener('appinstalled', () => {
  evento = null;
  storage.set(INSTALADO, true);
  notificar();
});

/** O navegador guardou um convite nativo que ainda pode ser mostrado. */
export function podeInstalar(): boolean {
  return evento !== null;
}

/** Abre o prompt nativo. O evento só vale uma vez: depois de usado, some, aceito ou não. */
export async function pedirInstalacao(): Promise<ResultadoInstalacao> {
  const atual = evento;
  if (!atual) {
    return 'indisponivel';
  }
  evento = null;
  notificar();
  try {
    await atual.prompt();
    const { outcome } = await atual.userChoice;
    return outcome === 'accepted' ? 'aceito' : 'recusado';
  } catch {
    return 'indisponivel';
  }
}

/** Avisa quando `podeInstalar()` ou o estado de instalação mudam (o evento chega depois do render). */
export function assinar(callback: () => void): () => void {
  assinantes.add(callback);
  return () => {
    assinantes.delete(callback);
  };
}
