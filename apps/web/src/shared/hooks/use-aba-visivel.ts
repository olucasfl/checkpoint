import { useEffect } from 'react';

/** Marca `data-aba-oculta` no <html> com a aba escondida: o CSS pausa os laços da espera (esqueleto, Chek, ícone girando). */
export function useAbaVisivel(): void {
  useEffect(() => {
    const raiz = document.documentElement;
    const atualizar = () => raiz.toggleAttribute('data-aba-oculta', document.hidden);

    atualizar();
    document.addEventListener('visibilitychange', atualizar);
    return () => {
      document.removeEventListener('visibilitychange', atualizar);
      raiz.removeAttribute('data-aba-oculta');
    };
  }, []);
}
