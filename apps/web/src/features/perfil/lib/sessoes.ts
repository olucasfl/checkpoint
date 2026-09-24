/** Rótulos de sistema de celular que o `deviceLabel` da API produz ("Chrome · Android"). */
const CELULAR = /\b(Android|iOS)\b/;

/** Ícone da linha: `smartphone` para Android/iOS, `computer` para o resto (inclusive "Outro"). */
export function iconeDoDispositivo(dispositivo: string): 'smartphone' | 'computer' {
  return CELULAR.test(dispositivo) ? 'smartphone' : 'computer';
}

const DATA_HORA = new Intl.DateTimeFormat('pt-BR', {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
});

/**
 * "Último uso em 23/09/2026 14:32" (fuso do aparelho). Montado pelas partes: o `format` do pt-BR põe
 * uma vírgula entre a data e a hora, e a spec pede só o espaço.
 */
export function ultimoUso(iso: string): string {
  const data = new Date(iso);
  if (Number.isNaN(data.getTime())) {
    return 'Último uso desconhecido';
  }
  const partes = Object.fromEntries(
    DATA_HORA.formatToParts(data).map((parte) => [parte.type, parte.value]),
  );
  return `Último uso em ${partes.day}/${partes.month}/${partes.year} ${partes.hour}:${partes.minute}`;
}

/** Texto da confirmação de "Encerrar todas as outras". */
export function confirmacaoEncerrarOutras(n: number): string {
  return n === 1
    ? 'Encerrar 1 sessão? Esse aparelho vai precisar entrar de novo.'
    : `Encerrar ${n} sessões? Esses aparelhos vão precisar entrar de novo.`;
}
