/**
 * Destinos da navegação principal: fonte única da barra inferior (< 768px) e do topo (>= 768px).
 * `link` navega para uma rota; `novo-jogo` abre o formulário de novo jogo (`/?novo=1`).
 * `/status` fica de fora de propósito: é diagnóstico, acessível só pela URL.
 *
 * `ativoEm` diz em que caminhos, além do próprio `to`, o item continua marcado como ativo: "Jogos" segue
 * ativo no detalhe de um jogo (`/jogos/:id`), que é parte do catálogo.
 */
export type NavItem =
  | { id: string; label: string; icon: string; kind: 'link'; to: string; ativoEm?: string }
  | { id: string; label: string; icon: string; kind: 'novo-jogo' };

export const NAV_ITEMS: readonly NavItem[] = [
  {
    id: 'jogos',
    label: 'Jogos',
    icon: 'sports_esports',
    kind: 'link',
    to: '/',
    ativoEm: '/jogos/',
  },
  { id: 'adicionar', label: 'Adicionar', icon: 'add_circle', kind: 'novo-jogo' },
  { id: 'perfil', label: 'Perfil', icon: 'person', kind: 'link', to: '/perfil' },
];

export const NAV_LINKS = NAV_ITEMS.filter(
  (item): item is Extract<NavItem, { kind: 'link' }> => item.kind === 'link',
);

/**
 * Um link da navegação está ativo no caminho exato (`/` só em `/`, sem casar com tudo) ou sob o prefixo
 * `ativoEm`. É feito aqui, e não pelo `NavLink`, porque o `NavLink` só marca como ativo o que casa com o
 * próprio `to`.
 */
export function isNavActive(item: Extract<NavItem, { kind: 'link' }>, pathname: string): boolean {
  return pathname === item.to || (item.ativoEm !== undefined && pathname.startsWith(item.ativoEm));
}
