const NUMERO = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 1 });

/**
 * Horas jogadas, curtas: "45 min" abaixo de 1 h; "1,5 h" até 10 h; "42 h" depois (milhar com ponto:
 * "1.234 h"). Arredonda para baixo: nunca promete mais horas do que a plataforma contou.
 */
export function horasCurtas(minutos: number): string {
  const total = Math.max(0, Math.floor(minutos));
  if (total < 60) {
    return `${total} min`;
  }
  const horas = total / 60;
  return horas < 10
    ? `${NUMERO.format(Math.floor(horas * 10) / 10)} h`
    : `${NUMERO.format(Math.floor(horas))} h`;
}

/** "12 conquistas em 3 jogos vinculados" ("troféus" na PlayStation; singular quando é 1; zero é plural). */
export function textoDasConquistas(
  conquistas: {
    desbloqueadas: number;
    jogosVinculados: number;
  },
  vocabulario: { conquista: string; conquistas: string } = {
    conquista: 'conquista',
    conquistas: 'conquistas',
  },
): string {
  const { desbloqueadas, jogosVinculados } = conquistas;
  const primeira = desbloqueadas === 1 ? vocabulario.conquista : vocabulario.conquistas;
  const segunda = jogosVinculados === 1 ? 'jogo vinculado' : 'jogos vinculados';
  return `${desbloqueadas} ${primeira} em ${jogosVinculados} ${segunda}`;
}
