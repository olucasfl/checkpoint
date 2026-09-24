import { NavLink } from 'react-router-dom';
import { Icon } from '@/shared/components/Icon';
import { NAV_LINKS } from './nav-items';

/**
 * Os mesmos destinos da barra inferior, no topo, em >= 768px. "Adicionar" no desktop é o botão "Adicionar
 * jogo" do catálogo, então só os links aparecem aqui. Com menos de dois destinos não há para onde
 * navegar e nada é mostrado.
 */
export function TopNav() {
  if (NAV_LINKS.length < 2) {
    return null;
  }

  return (
    <nav aria-label="Navegação principal" className="hidden justify-end md:flex">
      <ul className="m-0 flex list-none gap-2 p-0">
        {NAV_LINKS.map((item) => (
          <li key={item.id}>
            <NavLink
              to={item.to}
              end
              className={({ isActive }) =>
                `flex min-h-11 items-center gap-2 rounded-[4px] px-3 text-[15px] font-bold uppercase tracking-[0.1em] no-underline ${
                  isActive ? 'text-ciano' : 'text-texto-suave hover:text-texto'
                }`
              }
            >
              <Icon name={item.icon} size={20} />
              {item.label}
            </NavLink>
          </li>
        ))}
      </ul>
    </nav>
  );
}
