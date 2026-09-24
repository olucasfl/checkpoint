import { Icon } from '@/shared/components/Icon';

/** O logo "CHECKPOINT" (bandeira + nome, com o brilho Neon), das telas fora do catálogo. */
export function BrandLogo() {
  return (
    <div className="flex items-center justify-center gap-3">
      <div className="glow-logo grid size-10 place-items-center rounded-md border border-magenta text-magenta">
        <Icon name="flag" size={26} filled />
      </div>
      <span className="glow-text-magenta font-display text-[22px] font-extrabold tracking-[0.14em]">
        CHECKPOINT
      </span>
    </div>
  );
}
