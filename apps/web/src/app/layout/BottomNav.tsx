import { Link, useLocation, useNavigate } from 'react-router-dom';
import { Icon } from '@/shared/components/Icon';
import { OverlayPortal } from '@/shared/components/OverlayPortal';
import { useTypingOutsideDialog } from '@/shared/hooks/use-typing-outside-dialog';
import { newGameHref } from '@/features/games/lib/new-game';
import { isNavActive, NAV_ITEMS } from './nav-items';

const ITEM =
  'flex min-h-11 min-w-11 flex-1 flex-col items-center justify-center gap-0.5 rounded-[4px] text-[13px] font-bold uppercase tracking-[0.1em]';

/**
 * Barra de navegação inferior, só em tela estreita (< 768px). Fica no `#overlay-root` (portal) e
 * some enquanto um campo fora de diálogo está focado, para não flutuar sobre o teclado virtual.
 */
export function BottomNav() {
  const typing = useTypingOutsideDialog();
  const location = useLocation();
  const navigate = useNavigate();

  if (typing) {
    return null;
  }

  return (
    <OverlayPortal>
      <nav
        aria-label="Navegação principal"
        className="bottom-nav fixed inset-x-0 bottom-0 z-40 border-t border-borda bg-painel md:hidden"
      >
        <ul className="m-0 flex h-16 list-none items-stretch gap-1 px-2 py-1">
          {NAV_ITEMS.map((item) => (
            <li key={item.id} className="flex flex-1">
              {item.kind === 'link' ? (
                <Link
                  to={item.to}
                  aria-current={isNavActive(item, location.pathname) ? 'page' : undefined}
                  className={`${ITEM} no-underline ${
                    isNavActive(item, location.pathname) ? 'text-destaque' : 'text-texto-suave'
                  }`}
                >
                  <Icon name={item.icon} size={24} />
                  {item.label}
                </Link>
              ) : (
                <button
                  type="button"
                  onClick={() => navigate(newGameHref(location.pathname, location.search))}
                  className={`${ITEM} border-0 bg-transparent text-destaque`}
                >
                  <Icon name={item.icon} size={26} filled />
                  {item.label}
                </button>
              )}
            </li>
          ))}
        </ul>
      </nav>
    </OverlayPortal>
  );
}
