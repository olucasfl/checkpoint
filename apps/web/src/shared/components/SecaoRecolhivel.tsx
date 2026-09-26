import { type ReactNode } from 'react';
import { useSecaoAberta } from '@/shared/hooks/use-secao-aberta';
import { Icon } from './Icon';

interface SecaoRecolhivelProps {
  /** A chave do estado guardado neste aparelho (por tipo de seção, não por jogo). */
  chave: string;
  abertaPorPadrao: boolean;
  /** O título da seção (um heading, ou a logo de uma plataforma dentro de um). */
  titulo: ReactNode;
  /** O resumo da linha, visível também com a seção fechada. */
  resumo?: ReactNode;
  /** `data-secao` para os testes e a conferência visual. */
  dataSecao: string;
  children: ReactNode;
}

/**
 * Uma seção que abre e fecha: `<details>` nativo (o `<summary>` é um botão de verdade, com `aria-expanded` implícito,
 * teclado e foco), com a seta e o resumo na linha fechada. O estado fica só neste aparelho. A seta gira sem transição,
 * então nada aqui depende de movimento (`prefers-reduced-motion` não tem o que desligar).
 */
export function SecaoRecolhivel({
  chave,
  abertaPorPadrao,
  titulo,
  resumo,
  dataSecao,
  children,
}: SecaoRecolhivelProps) {
  const [aberta, definir] = useSecaoAberta(chave, abertaPorPadrao);

  return (
    <details
      open={aberta}
      data-secao={dataSecao}
      // O `toggle` também dispara na montagem com `open`: só grava quando o estado de fato mudou.
      onToggle={(evento) => {
        const agora = evento.currentTarget.open;
        if (agora !== aberta) {
          definir(agora);
        }
      }}
      className="group/secao min-w-0 rounded-[22px] border border-borda bg-painel"
    >
      <summary className="flex min-h-11 cursor-pointer list-none items-center gap-3 rounded-[22px] px-4 py-3 md:px-7 [&::-webkit-details-marker]:hidden">
        <div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-4 gap-y-1">
          {titulo}
          {resumo && (
            <span className="min-w-0 text-sm font-semibold text-texto-suave [overflow-wrap:anywhere]">
              {resumo}
            </span>
          )}
        </div>
        <Icon
          name="expand_more"
          size={26}
          className="shrink-0 text-texto-suave group-open/secao:rotate-180"
        />
      </summary>
      <div className="flex min-w-0 flex-col gap-5 px-4 pb-5 md:gap-[22px] md:px-7 md:pb-6">
        {children}
      </div>
    </details>
  );
}
