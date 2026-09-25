import { storage } from '@/shared/lib/storage/storage';
import { PREFS, PREFS_PADRAO, prefsDoUsuario, type Prefs } from './prefs';

/**
 * As preferências em uso, num store externo (lido por `usePrefs`). O dono é o usuário logado
 * (`definirUsuario`, chamado pelo `PrefsSync` quando a sessão resolve); antes disso, as de quem usou
 * este navegador por último (`iniciarPrefs`, no `main.tsx`).
 */
let usuarioAtual: string | null = null;
let atuais: Prefs = PREFS_PADRAO;
const listeners = new Set<() => void>();

function notificar(): void {
  for (const listener of [...listeners]) {
    listener();
  }
}

/** Cor de destaque e efeitos são CSS (`html[data-destaque]`, `html[data-efeitos]`). */
export function aplicarNoHtml(prefs: Prefs, raiz: HTMLElement = document.documentElement): void {
  raiz.dataset.destaque = prefs.destaque;
  raiz.dataset.efeitos = prefs.efeitos;
}

export function getPrefs(): Prefs {
  return atuais;
}

export function subscribePrefs(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Antes do primeiro render: aplica as de `ultimoUsuario` para a cor não piscar em magenta. */
export function iniciarPrefs(): void {
  const guardadas = storage.get(PREFS);
  atuais = prefsDoUsuario(guardadas, guardadas.ultimoUsuario);
  aplicarNoHtml(atuais);
  notificar();
}

/**
 * Quem está logado. Com um usuário, passa a usar as dele e o marca como o último. Sem usuário (saiu),
 * mantém a aparência de agora: a tela de login continua com as cores de quem acabou de sair.
 */
export function definirUsuario(userId: string | null): void {
  usuarioAtual = userId;
  if (userId === null) {
    return;
  }
  const guardadas = storage.get(PREFS);
  storage.set(PREFS, { ...guardadas, ultimoUsuario: userId });
  atuais = prefsDoUsuario(guardadas, userId);
  aplicarNoHtml(atuais);
  notificar();
}

/**
 * Muda uma ou mais preferências de quem está logado: vale na hora e fica gravada neste navegador.
 * Sem armazenamento (bloqueado), o módulo de storage guarda em memória e vale até recarregar.
 */
export function alterarPrefs(parcial: Partial<Prefs>): void {
  if (usuarioAtual === null) {
    return;
  }
  atuais = { ...atuais, ...parcial };
  const guardadas = storage.get(PREFS);
  storage.set(PREFS, {
    ultimoUsuario: usuarioAtual,
    porUsuario: { ...guardadas.porUsuario, [usuarioAtual]: atuais },
  });
  aplicarNoHtml(atuais);
  notificar();
}

/**
 * A conta foi excluída: some a entrada DESSE usuário (as dos outros ficam), e `ultimoUsuario` só
 * vira `null` se era ele. Se as preferências em uso eram as dele, a aparência volta ao padrão: a tela
 * de login não continua com as cores de uma conta que não existe mais.
 */
export function removerPrefsDoUsuario(userId: string): void {
  const guardadas = storage.get(PREFS);
  const porUsuario = Object.fromEntries(
    Object.entries(guardadas.porUsuario).filter(([id]) => id !== userId),
  );
  const ultimoUsuario = guardadas.ultimoUsuario === userId ? null : guardadas.ultimoUsuario;
  storage.set(PREFS, { ultimoUsuario, porUsuario });
  if (usuarioAtual === userId) {
    usuarioAtual = null;
    atuais = PREFS_PADRAO;
    aplicarNoHtml(atuais);
    notificar();
  }
}

/** Só para os testes. */
export function resetPrefsForTests(): void {
  usuarioAtual = null;
  atuais = PREFS_PADRAO;
  delete document.documentElement.dataset.destaque;
  delete document.documentElement.dataset.efeitos;
}
