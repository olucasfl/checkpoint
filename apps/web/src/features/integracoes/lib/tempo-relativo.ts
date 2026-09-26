const RELATIVO = new Intl.RelativeTimeFormat('pt-BR', { numeric: 'always' });

/**
 * "Atualizado agora" (menos de 1 min), "Atualizado há 12 minutos", "há 3 horas" ou "há 2 dias", a partir do
 * `atualizadoEm` gravado. `Intl.RelativeTimeFormat` nativo (sem dependência). Texto ilegível vira `null` (nunca
 * "Invalid Date") e um horário no futuro (relógio do aparelho atrasado) também vale "agora".
 */
export function atualizadoHaTexto(iso: string, agora: Date = new Date()): string | null {
  const instante = new Date(iso).getTime();
  if (Number.isNaN(instante)) {
    return null;
  }
  const segundos = Math.max(0, Math.floor((agora.getTime() - instante) / 1000));
  if (segundos < 60) {
    return 'Atualizado agora';
  }
  const minutos = Math.floor(segundos / 60);
  if (minutos < 60) {
    return `Atualizado ${RELATIVO.format(-minutos, 'minute')}`;
  }
  const horas = Math.floor(minutos / 60);
  if (horas < 24) {
    return `Atualizado ${RELATIVO.format(-horas, 'hour')}`;
  }
  return `Atualizado ${RELATIVO.format(-Math.floor(horas / 24), 'day')}`;
}
