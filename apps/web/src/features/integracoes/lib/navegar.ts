/**
 * Leva o navegador a outro endereço (a tela de login da plataforma). À parte para os testes o mockarem: o
 * `jsdom` não implementa `window.location.assign`.
 */
export function irPara(url: string): void {
  window.location.assign(url);
}
