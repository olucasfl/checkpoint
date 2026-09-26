import { Link, useLocation, useNavigate } from 'react-router-dom';
import { Icon } from '@/shared/components/Icon';
import { newGameHref } from '@/features/games/lib/new-game';
import { isNavActive, NAV_ITEMS } from './nav-items';

const PILULA =
  'flex h-11 items-center gap-2 rounded-full px-[18px] font-display text-[15px] font-bold no-underline transition-colors';

/**
 * A barra do topo das telas que não são o catálogo, em >= 768px: logo e os mesmos destinos da barra inferior, em
 * pílulas de 44 px (a ativa com fundo `texto`). No catálogo (`/`) a barra é da própria página (com os filtros).
 * Com menos de dois destinos não há para onde navegar e nada é mostrado.
 */
export function TopNav() {
  const { pathname, search } = useLocation();
  const navigate = useNavigate();

  if (NAV_ITEMS.length < 2 || pathname === '/') {
    return null;
  }

  return (
    <div className="safe-x hidden pt-6 md:block">
      <div className="mx-auto flex max-w-[1168px] items-center justify-between gap-4">
        <Link
          to="/"
          className="flex min-h-11 shrink-0 items-center gap-2.5 font-display text-[22px] font-extrabold tracking-[-0.01em] text-texto no-underline"
        >
          <span
            aria-hidden="true"
            className="grid size-9 place-items-center rounded-full bg-destaque text-fundo"
          >
            <Icon name="flag" size={20} filled />
          </span>
          checkpoint
        </Link>

        <nav aria-label="Navegação principal">
          <ul className="m-0 flex list-none gap-1 rounded-full border border-borda bg-painel p-[5px]">
            {NAV_ITEMS.map((item) => {
              if (item.kind === 'novo-jogo') {
                return (
                  <li key={item.id}>
                    <button
                      type="button"
                      onClick={() => navigate(newGameHref(pathname, search))}
                      className={`${PILULA} border-0 bg-transparent text-texto-suave hover:text-texto`}
                    >
                      <Icon name={item.icon} size={20} />
                      {item.label}
                    </button>
                  </li>
                );
              }
              const isActive = isNavActive(item, pathname);
              return (
                <li key={item.id}>
                  <Link
                    to={item.to}
                    aria-current={isActive ? 'page' : undefined}
                    className={`${PILULA} ${
                      isActive ? 'bg-texto text-fundo' : 'text-texto-suave hover:text-texto'
                    }`}
                  >
                    <Icon name={item.icon} size={20} filled={isActive} />
                    {item.label}
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>
      </div>
    </div>
  );
}
