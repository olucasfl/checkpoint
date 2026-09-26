import { useEffect, useRef, useState } from 'react';

/**
 * Um número que troca suavemente: o valor novo já está no DOM (a troca é só visual, um fade curto). Na primeira
 * renderização não anima; só quando o valor muda depois. Movimento reduzido: a regra global anula a animação.
 */
export function Contador({ valor, className }: { valor: number; className?: string }) {
  const anterior = useRef(valor);
  const [trocas, setTrocas] = useState(0);

  useEffect(() => {
    if (anterior.current !== valor) {
      anterior.current = valor;
      setTrocas((n) => n + 1);
    }
  }, [valor]);

  return (
    <span
      key={trocas}
      className={`${trocas > 0 ? 'contador-troca ' : ''}${className ?? ''}`.trim()}
    >
      {valor}
    </span>
  );
}
