/** `navigator.standalone` só existe no Safari do iOS. */
type NavigatorIos = Navigator & { standalone?: boolean };

/** O app está aberto pelo ícone instalado (janela própria), não numa aba do navegador. */
export function estaInstalado(): boolean {
  const standalone =
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(display-mode: standalone)').matches;
  return standalone || (navigator as NavigatorIos).standalone === true;
}

/** Outros navegadores do iOS (Chrome, Firefox, Edge, Opera) usam o motor do Safari, mas não têm o
 * mesmo "Adicionar à Tela de Início": o passo a passo do convite só vale para o Safari. */
const NAVEGADORES_IOS_NAO_SAFARI = /CriOS|FxiOS|EdgiOS|OPiOS|OPT\/|GSA\//;

/** iPhone/iPad no Safari, fora do app instalado. */
export function ehSafariIos(): boolean {
  const ua = navigator.userAgent;
  // iPadOS 13+ se apresenta como Mac: só o toque o distingue.
  const ipadComoMac = /Macintosh/.test(ua) && navigator.maxTouchPoints > 1;
  const ios = /iPhone|iPad|iPod/.test(ua) || ipadComoMac;
  return ios && /Safari/.test(ua) && !NAVEGADORES_IOS_NAO_SAFARI.test(ua) && !estaInstalado();
}
