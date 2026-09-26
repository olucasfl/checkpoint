import { Icon } from '@/shared/components/Icon';

/** O logo "checkpoint" (círculo `destaque` com a bandeira em `fundo` e o nome), das telas fora do catálogo. */
export function BrandLogo() {
  return (
    <div className="flex items-center justify-center gap-2.5">
      <div
        aria-hidden="true"
        className="grid size-10 place-items-center rounded-full bg-destaque text-fundo"
      >
        <Icon name="flag" size={22} filled />
      </div>
      <span className="font-display text-2xl font-extrabold tracking-[-0.01em]">checkpoint</span>
    </div>
  );
}
