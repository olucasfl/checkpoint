import { Link, useLocation } from 'react-router-dom';
import { Icon } from '@/shared/components/Icon';
import { isNavActive, NAV_LINKS } from './nav-items';

/**
 * Os mesmos destinos da barra inferior, no topo, em >= 768px. "Adicionar" no desktop é o botão "Adicionar
 * jogo" do catálogo, então só os links aparecem aqui. Com menos de dois destinos não há para onde
 * navegar e nada é mostrado.
 */
export function TopNav() {
  const { pathname } = useLocation();

  // No catálogo (`/`) a barra superior é da própria página (logo, filtros, Adicionar jogo e Perfil).
  if (NAV_LINKS.length < 2 || pathname === '/') {
    return null;
  }

  return (
    <nav aria-label="Navegação principal" className="hidden justify-end md:flex">
      <ul className="m-0 flex list-none gap-2 p-0">
        {NAV_LINKS.map((item) => {
          const isActive = isNavActive(item, pathname);
          return (
            <li key={item.id}>
              <Link
                to={item.to}
                aria-current={isActive ? 'page' : undefined}
                className={`flex min-h-11 items-center gap-2 rounded-[4px] px-3 text-[15px] font-bold uppercase tracking-[0.1em] no-underline ${
                  isActive ? 'text-destaque' : 'text-texto-suave hover:text-texto'
                }`}
              >
                <Icon name={item.icon} size={20} />
                {item.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
