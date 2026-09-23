import { type GameStatus } from '@checkpoint/shared';
import { Icon } from '@/shared/components/Icon';
import { padCount, type StatusCounts } from '../lib/count-by-status';
import { STATUS_META } from '../lib/status-meta';

/** Ordem dos painéis (spec): Zerados, Jogando, Quero jogar. */
const ORDER: readonly GameStatus[] = ['ZERADO', 'JOGANDO', 'QUERO_JOGAR'];

/**
 * Três painéis com a contagem por status. O número aparece com dois dígitos ("01"), como na
 * referência visual; o `aria-label` traz o número simples ("1") para leitores de tela.
 */
export function StatPanels({ counts }: { counts: StatusCounts }) {
  return (
    <section
      aria-label="Contagem por status"
      className="grid grid-cols-3 gap-4 max-[900px]:grid-cols-1"
    >
      {ORDER.map((status) => {
        const meta = STATUS_META[status];

        return (
          <div
            key={status}
            data-panel={status}
            className="flex items-center justify-between rounded-md border border-borda bg-painel px-[22px] py-[18px]"
          >
            <div>
              <div className="flex items-center gap-2 text-[15px] font-semibold uppercase tracking-[0.24em] text-texto-suave">
                {meta.panelLabel}
                {status === 'JOGANDO' && (
                  <span
                    aria-hidden="true"
                    className="dot-blink size-2 rounded-full bg-ciano shadow-[0_0_10px_var(--color-ciano)]"
                  />
                )}
              </div>
              <span
                role="img"
                aria-label={String(counts[status])}
                className={`block font-display text-[42px] font-extrabold ${meta.text} ${meta.glowText}`}
              >
                {padCount(counts[status])}
              </span>
            </div>
            <Icon name={meta.icon} size={48} filled className={meta.text} />
          </div>
        );
      })}
    </section>
  );
}
