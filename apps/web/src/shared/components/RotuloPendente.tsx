interface RotuloPendenteProps {
  pendente: boolean;
  /** O texto em repouso ("Salvar"). */
  normal: string;
  /** O texto enquanto o pedido existe ("Salvando…"). */
  ocupado: string;
  /** `false` quando o botão já tem um ícone que gira (o "Atualizar" da Steam): só o texto e a reserva de largura. */
  indicador?: boolean;
}

/**
 * O rótulo de um botão com pedido em andamento: um indicador de 16 px (gira só enquanto `pendente`) e o texto novo, na
 * **mesma largura** dos dois estados (`.reserva`, em `styles/index.css`, reserva o maior por pseudo-elemento: o botão
 * não "pula" e o texto não é duplicado no DOM). A pessoa que prefere menos movimento fica com o texto, que já diz tudo.
 */
export function RotuloPendente({
  pendente,
  normal,
  ocupado,
  indicador = true,
}: RotuloPendenteProps) {
  return (
    <span className="reserva" data-normal={normal} data-ocupado={ocupado}>
      <span className="inline-flex items-center justify-center gap-2">
        {pendente && indicador && (
          // Um anel de borda, não um ícone da fonte: na primeira vez a fonte de ícones pode demorar e o texto do ícone alargava o botão.
          <span
            aria-hidden="true"
            className="gira inline-block size-4 shrink-0 rounded-full border-2 border-current border-t-transparent"
          />
        )}
        {pendente ? ocupado : normal}
      </span>
    </span>
  );
}
