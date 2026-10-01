/**
 * O lugar de um valor que a plataforma está atualizando agora (horas, última vez jogado): um bloco de esqueleto no
 * tamanho de um texto curto. O resto do jogo continua na tela; só este valor espera. Parado com "efeitos reduzidos"
 * (a regra global do `.skeleton`). O `role="status"` diz o que está acontecendo a quem usa leitor de tela.
 */
export function HorasCarregando({ largura = 'w-16' }: { largura?: string }) {
  return (
    <span
      role="status"
      aria-label="Atualizando"
      data-sincronizando
      className={`skeleton inline-block h-[0.9em] ${largura} rounded-md align-middle`}
    />
  );
}
