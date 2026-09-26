import { type Game } from '@checkpoint/shared';
import { avisar } from '@/shared/lib/avisos';
import { type ResultadoDoSalvar } from '../components/GameForm';
import { apareceNoFiltro, marcoDoSalvar, rotuloDoStatus, textoDoMarco } from './marcos';
import { type StatusFilter } from './status-filter';

interface Opcoes {
  /** O jogo antes da edição (ausente ao criar). */
  anterior?: Pick<Game, 'status'>;
  /** A lista estava vazia quando o formulário abriu. */
  listaVazia?: boolean;
  /** O filtro ativo do catálogo: se esconde o jogo criado, o aviso oferece "Ver". */
  filtro?: StatusFilter;
  /** "Ver": troca o filtro para o status do jogo criado. */
  aoVer?: (status: Game['status']) => void;
}

/**
 * O aviso depois de salvar um jogo: um marco com o Chek comemorando (primeiro jogo ou passou a Zerado), ou o aviso
 * comum. Se o filtro ativo esconde o jogo recém-criado, o aviso diz onde ele foi parar e oferece "Ver". Só UM aviso por salvar.
 */
export function avisarDoSalvar(
  resultado: ResultadoDoSalvar | undefined,
  { anterior, listaVazia = false, filtro = 'TODOS', aoVer }: Opcoes = {},
): void {
  if (!resultado) {
    return;
  }
  const { jogo, criado } = resultado;
  const marco = marcoDoSalvar({ criado, listaVazia, anterior, jogo });

  if (marco) {
    avisar({ texto: textoDoMarco(marco, jogo.titulo), chek: 'comemorando' });
  } else if (criado && !apareceNoFiltro(filtro, jogo.status)) {
    avisar({
      texto: `Adicionado em ${rotuloDoStatus(jogo.status)}.`,
      acao: aoVer ? { rotulo: 'Ver', aoClicar: () => aoVer(jogo.status) } : undefined,
    });
  } else {
    avisar({ texto: criado ? 'Jogo adicionado.' : 'Jogo atualizado.' });
  }
}
