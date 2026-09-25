/**
 * O fundo das telas do app e das de entrada: um halo estático na cor do destaque (direção "Estante de console").
 * Sem orbes nem _scanlines_, e nada anima.
 */
export function Backdrop() {
  return <div aria-hidden="true" className="halo" />;
}
