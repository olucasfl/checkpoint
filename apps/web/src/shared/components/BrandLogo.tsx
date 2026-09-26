import { Chek } from '@/shared/components/Chek/Chek';

interface BrandLogoProps {
  /** O Chek acima do nome já está na tela (ex.: o cartão de entrada): mostra só o nome. */
  mostrarChek?: boolean;
  animado?: boolean;
  altura?: number;
}

/** O logo "Checkpoint" (o mascote Chek e o nome), das telas fora do catálogo. */
export function BrandLogo({ mostrarChek = true, animado = false, altura = 44 }: BrandLogoProps) {
  return (
    <div className="flex items-center justify-center gap-2.5">
      {mostrarChek && <Chek altura={altura} animado={animado} />}
      <span className="font-display text-2xl font-extrabold tracking-[-0.01em]">Checkpoint</span>
    </div>
  );
}
