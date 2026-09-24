/** Avisos que outra tela deixa para o `/perfil` mostrar, pelo `state` da navegação. */
export const SENHA_ALTERADA = 'Senha alterada. As outras sessões foram encerradas.';

/** O aviso do `state` da navegação, se for um dos conhecidos (o `state` é `unknown`). */
export function avisoDoPerfil(state: unknown): string | undefined {
  const aviso = (state as { aviso?: unknown } | null)?.aviso;
  return aviso === SENHA_ALTERADA ? aviso : undefined;
}
