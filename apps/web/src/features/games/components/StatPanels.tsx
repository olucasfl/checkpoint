import { type GameStatus } from '@checkpoint/shared';
import { Icon } from '@/shared/components/Icon';
import { padCount, type StatusCounts } from '../lib/count-by-status';
import { STATUS_META } from '../lib/status-meta';

/** Ordem dos painéis (spec): Zerados, Jogando, Quero jogar. */
const ORDER: readonly GameStatus[] = ['ZERADO', 'JOGANDO', 'QUERO_JOGAR'];

/**
 * Três painéis com a contagem por status, sempre numa linha (no celular, compactos e sem o ícone
 * grande, que não cabe). O número aparece com dois dígitos ("01"), como na referência visual; o
 * `aria-label` traz o número simples ("1") para leitores de tela.
 */
export function StatPanels({ counts }: { counts: StatusCounts }) {
  return (
    <section aria-label="Contagem por status" className="grid grid-cols-3 gap-2 md:gap-4">
      {ORDER.map((status) => {
        const meta = STATUS_META[status];

        return (
          <div
            key={status}
            data-panel={status}
            className="flex min-w-0 items-center justify-between rounded-md border border-borda bg-painel px-3 py-3 md:px-[22px] md:py-[18px]"
          >
            <div className="min-w-0">
              <div className="flex items-center gap-1.5 text-[13px] font-semibold uppercase leading-tight tracking-[0.1em] text-texto-suave md:gap-2 md:text-[15px] md:tracking-[0.24em]">
                {meta.panelLabel}
                {status === 'JOGANDO' && (
                  <span
                    aria-hidden="true"
                    className="size-2 shrink-0 rounded-full bg-status-jogando"
                  />
                )}
              </div>
              <span
                role="img"
                aria-label={String(counts[status])}
                className={`block font-display text-2xl font-extrabold md:text-[42px] ${meta.text}`}
              >
                {padCount(counts[status])}
              </span>
            </div>
            <span className="hidden md:block">
              <Icon name={meta.icon} size={48} filled className={meta.text} />
            </span>
          </div>
        );
      })}
    </section>
  );
}
