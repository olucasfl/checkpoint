/**
 * Destinos da navegação principal: fonte única da barra inferior (< 768px) e do topo (>= 768px).
 * `link` navega para uma rota; `novo-jogo` abre o formulário de novo jogo (`/?novo=1`).
 * O item "Perfil" (`/perfil`) entra aqui com a spec autenticacao, etapa 2. `/status` fica de fora
 * de propósito: é diagnóstico, acessível só pela URL.
 */
export type NavItem =
  | { id: string; label: string; icon: string; kind: 'link'; to: string }
  | { id: string; label: string; icon: string; kind: 'novo-jogo' };

export const NAV_ITEMS: readonly NavItem[] = [
  { id: 'jogos', label: 'Jogos', icon: 'sports_esports', kind: 'link', to: '/' },
  { id: 'adicionar', label: 'Adicionar', icon: 'add_circle', kind: 'novo-jogo' },
];

export const NAV_LINKS = NAV_ITEMS.filter(
  (item): item is Extract<NavItem, { kind: 'link' }> => item.kind === 'link',
);
