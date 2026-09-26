import { estaInstalado } from '@/shared/lib/pwa/display';

/**
 * A abertura já passou nesta carga da página: uma variável do módulo, porque o projeto só grava no aparelho pelo
 * módulo de storage (e isto não precisa sobreviver a nada). Fechar e abrir o app instalado começa uma página nova,
 * então a abertura volta; só trocar de tela dentro do app não a repete.
 */
let jaMostrada = false;

/** Só para os testes: volta ao estado de "ainda não mostrou". */
export function reiniciarAberturaParaTeste(): void {
  jaMostrada = false;
}

/**
 * A abertura só existe no app instalado (PWA), uma vez por abertura. `?splash=1` a força em qualquer aba (para ver
 * e ajustar a animação sem instalar o app).
 */
export function deveMostrarSplash(): boolean {
  if (new URLSearchParams(window.location.search).get('splash') === '1') {
    return true;
  }
  return estaInstalado() && !jaMostrada;
}

export function marcarSplashVisto(): void {
  jaMostrada = true;
}

/** Espera a fonte dos títulos, no máximo `limiteMs`: o nome não pode aparecer na fonte de reserva e trocar no meio. */
export async function esperarFonteDosTitulos(limiteMs: number): Promise<void> {
  const fontes = document.fonts;
  if (!fontes?.load) {
    return;
  }
  await Promise.race([
    fontes.load('800 1em Outfit').then(() => undefined),
    new Promise<void>((resolver) => setTimeout(resolver, limiteMs)),
  ]).catch(() => undefined);
}
