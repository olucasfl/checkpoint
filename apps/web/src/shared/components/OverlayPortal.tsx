import { type ReactNode } from 'react';
import { createPortal } from 'react-dom';

/** id do contêiner irmão do #root no index.html. */
export const OVERLAY_ROOT_ID = 'overlay-root';

/**
 * Renderiza elementos `position: fixed` (barra inferior, avisos) no `#overlay-root`, fora do `#root`:
 * assim nenhum `transform`/`filter` de um ancestral vira containing block e prende o `fixed`. Sem o
 * contêiner (ex.: nos testes), cai para o `<body>`.
 */
export function OverlayPortal({ children }: { children: ReactNode }) {
  const target = document.getElementById(OVERLAY_ROOT_ID) ?? document.body;
  return createPortal(children, target);
}
