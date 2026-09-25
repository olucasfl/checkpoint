import { useState } from 'react';
import {
  type AvisoPlataforma,
  type Conquista,
  type DadosJogoPlataforma,
  type Game,
} from '@checkpoint/shared';
import { FieldError, LABEL } from '@/shared/components/form-parts';
import { Icon } from '@/shared/components/Icon';
import { ModalDialog } from '@/shared/components/ModalDialog';
import { describeAuthError } from '@/features/auth/lib/auth-errors';
import { useAtualizarJogo, useDesvincularJogo, useDetalheJogo } from '../api/use-integracoes';
import {
  desbloqueadaEmTexto,
  horasEMinutos,
  progressoDasConquistas,
  raridadeTexto,
  separarConquistas,
  ultimoJogoTexto,
} from '../lib/conquistas';

const PROVEDOR = 'STEAM' as const;

const BOTAO =
  'min-h-11 min-w-11 rounded-xl px-4 font-display text-[13px] uppercase tracking-[0.1em] disabled:cursor-wait disabled:opacity-60';
const BOTAO_CONTORNO = `${BOTAO} inline-flex items-center justify-center gap-2 border border-borda-controle font-semibold hover:bg-acao-hover`;
const BOTAO_PRIMARIO = `${BOTAO} bg-destaque font-extrabold text-fundo`;

/** O que cada aviso do servidor vira na tela: discreto, e sempre com o que continua valendo. */
const TEXTO_DO_AVISO: Partial<Record<AvisoPlataforma, string>> = {
  CONQUISTAS_PRIVADAS:
    'As conquistas deste jogo estão privadas na Steam. As horas continuam atualizadas.',
  PERFIL_PRIVADO:
    'Seu perfil Steam está privado agora. Mostrando o último valor salvo (o passo a passo está no seu Perfil).',
  INDISPONIVEL: 'Não foi possível atualizar agora. Mostrando o último valor salvo.',
};

function Aviso({ texto }: { texto: string }) {
  return (
    <p
      role="status"
      data-aviso-steam
      className="m-0 flex items-start gap-2 rounded-xl bg-painel-2 px-3.5 py-3 text-[16px] font-semibold text-ouro"
    >
      <Icon name="info" size={20} filled className="mt-0.5 shrink-0" />
      <span className="min-w-0 [overflow-wrap:anywhere]">{texto}</span>
    </p>
  );
}

function Estatistica({ rotulo, valor }: { rotulo: string; valor: string }) {
  return (
    <div className="flex min-w-0 flex-col rounded-xl bg-painel-2 px-3 py-2.5">
      <dt className="text-[14px] font-semibold uppercase tracking-[0.08em] text-texto-suave">
        {rotulo}
      </dt>
      <dd className="m-0 font-display text-[19px] font-bold [overflow-wrap:anywhere]">{valor}</dd>
    </div>
  );
}

function Progresso({ desbloqueadas, total }: { desbloqueadas: number; total: number }) {
  const progresso = progressoDasConquistas(desbloqueadas, total);
  if (!progresso) {
    return null;
  }
  return (
    <div className="flex flex-col gap-1.5">
      <div
        role="progressbar"
        aria-label="Conquistas desbloqueadas"
        aria-valuemin={0}
        aria-valuemax={progresso.total}
        aria-valuenow={progresso.desbloqueadas}
        aria-valuetext={progresso.texto}
        className="h-3 w-full overflow-hidden rounded-full bg-painel-2"
      >
        <div className="h-full bg-destaque" style={{ width: `${progresso.percentual}%` }} />
      </div>
      <span className="text-[16px] font-semibold">{progresso.texto}</span>
    </div>
  );
}

function ItemDeConquista({ conquista }: { conquista: Conquista }) {
  const escondida = conquista.oculta && !conquista.desbloqueada;
  const data = desbloqueadaEmTexto(conquista.desbloqueadaEm);
  return (
    <li
      data-conquista={conquista.id}
      className="flex min-w-0 flex-col gap-2 py-3 lg:flex-row lg:items-center lg:justify-between lg:gap-6"
    >
      <div className="flex min-w-0 items-start gap-3">
        {conquista.iconeUrl ? (
          // Decorativo (o nome está ao lado), sem `Referer` e com tamanho fixo: a lista pode ter centenas de ícones.
          <img
            src={conquista.iconeUrl}
            alt=""
            width={64}
            height={64}
            loading="lazy"
            referrerPolicy="no-referrer"
            className="size-16 shrink-0 rounded-md bg-painel-2"
          />
        ) : (
          <div aria-hidden="true" className="size-16 shrink-0 rounded-md bg-painel-2" />
        )}
        <div className="flex min-w-0 flex-col">
          <span className="text-[18px] font-semibold [overflow-wrap:anywhere]">
            {conquista.nome}
          </span>
          <span className="text-[16px] text-texto-suave [overflow-wrap:anywhere]">
            {escondida ? 'Conquista oculta' : (conquista.descricao ?? '')}
          </span>
        </div>
      </div>
      <div className="flex min-w-0 flex-col text-[15px] text-texto-suave lg:shrink-0 lg:text-right">
        {data && <span>{data}</span>}
        <span>{raridadeTexto(conquista.raridadePercentual)}</span>
      </div>
    </li>
  );
}

function ListaDeConquistas({
  titulo,
  conquistas,
  aberta,
}: {
  titulo: string;
  conquistas: Conquista[];
  aberta: boolean;
}) {
  if (conquistas.length === 0) {
    return null;
  }
  return (
    <details open={aberta} data-lista={titulo} className="flex flex-col">
      <summary className="flex min-h-11 cursor-pointer items-center gap-2 font-display text-[15px] font-bold uppercase tracking-[0.1em]">
        {titulo} ({conquistas.length})
      </summary>
      <ul className="m-0 flex list-none flex-col divide-y divide-borda p-0">
        {conquistas.map((conquista) => (
          <ItemDeConquista key={conquista.id} conquista={conquista} />
        ))}
      </ul>
    </details>
  );
}

function DesvincularJogoDialog({
  open,
  titulo,
  onClose,
  onConfirmar,
  desvinculando,
  erro,
}: {
  open: boolean;
  titulo: string;
  onClose: () => void;
  onConfirmar: () => void;
  desvinculando: boolean;
  erro: string;
}) {
  return (
    <ModalDialog open={open} onClose={onClose} labelledBy="desvincular-jogo-titulo">
      <div className="sheet-pad flex flex-col gap-5 px-7 pt-7">
        <h2
          id="desvincular-jogo-titulo"
          className="m-0 font-display text-xl font-extrabold uppercase tracking-[0.12em] text-destaque"
        >
          Desvincular da Steam
        </h2>
        <p className="m-0 text-[19px]">
          Isso remove de «{titulo}» as horas e as conquistas da Steam. O título, o status, as notas
          e a capa continuam como estão, e você pode ligar o jogo de novo depois.
        </p>
        <FieldError id="desvincular-jogo-erro" message={erro} />
        <div className="flex flex-wrap justify-end gap-2.5">
          <button
            type="button"
            data-autofocus
            onClick={onClose}
            className={`${BOTAO_CONTORNO} min-h-12`}
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={onConfirmar}
            disabled={desvinculando}
            className={`${BOTAO_PRIMARIO} min-h-12`}
          >
            {desvinculando ? 'Desvinculando…' : 'Desvincular'}
          </button>
        </div>
      </div>
    </ModalDialog>
  );
}

/**
 * O bloco **Steam** da página do jogo (spec `integracao-plataformas`, etapa 4): horas, última vez jogado, a barra de
 * conquistas e a lista completa. Só é montado para um jogo com vínculo, e só ele pede o detalhe (abrir `/` não faz
 * nenhuma request de conquistas). Enquanto o detalhe carrega, mostra o último valor gravado; se a plataforma falhar, o
 * servidor devolve esse valor com um aviso discreto (nunca um erro). Sem animação nenhuma: nada aqui muda com
 * "efeitos reduzidos". Uma coluna no celular; a partir de 1024 px, data e raridade ficam à direita de cada linha.
 */
export function BlocoSteam({ game }: { game: Game }) {
  const gravado: DadosJogoPlataforma | undefined = game.dadosPlataforma.find(
    (dados) => dados.provedor === PROVEDOR,
  );
  const detalhe = useDetalheJogo(PROVEDOR, game.id, gravado !== undefined);
  const atualizar = useAtualizarJogo(PROVEDOR, game.id);
  const desvincular = useDesvincularJogo(PROVEDOR);
  const [confirmando, setConfirmando] = useState(false);
  const [erroAtualizar, setErroAtualizar] = useState('');
  const [erroDesvincular, setErroDesvincular] = useState('');

  if (!gravado) {
    return null;
  }

  const dados = detalhe.data?.dados ?? gravado;
  const aviso = detalhe.data?.aviso ?? null;
  const conquistas = detalhe.data?.conquistas ?? [];
  const { desbloqueadas, faltam } = separarConquistas(conquistas);
  const semConquistas = aviso === 'SEM_CONQUISTAS';
  // A barra só com o número CERTO: sem aviso de conquistas privadas nem de "sem conquistas". Com o servidor
  // indisponível, o valor gravado ainda é o último conhecido e continua na tela, junto do aviso.
  const mostrarBarra = !semConquistas && aviso !== 'CONQUISTAS_PRIVADAS';
  const textoDoAviso = aviso ? TEXTO_DO_AVISO[aviso] : undefined;
  const steamUrl = /^\d{1,10}$/.test(dados.idExterno)
    ? `https://store.steampowered.com/app/${dados.idExterno}`
    : null;

  async function onAtualizar() {
    setErroAtualizar('');
    try {
      await atualizar.mutateAsync();
    } catch (failure) {
      setErroAtualizar(describeAuthError(failure).message);
    }
  }

  async function onDesvincular() {
    setErroDesvincular('');
    try {
      await desvincular.mutateAsync(game.id);
      setConfirmando(false);
    } catch (failure) {
      setErroDesvincular(describeAuthError(failure).message);
    }
  }

  return (
    <section
      aria-labelledby="detalhe-steam"
      data-secao="steam"
      className="flex min-w-0 flex-col gap-4 rounded-2xl bg-painel p-4 md:p-5"
    >
      <h2 id="detalhe-steam" className={`m-0 ${LABEL}`}>
        Steam
      </h2>

      <dl className="m-0 grid grid-cols-1 gap-2.5 sm:grid-cols-2">
        <Estatistica rotulo="Tempo jogado" valor={horasEMinutos(dados.minutosJogados)} />
        <Estatistica rotulo="Última vez" valor={ultimoJogoTexto(dados.ultimaVezJogadoEm)} />
      </dl>

      {textoDoAviso && <Aviso texto={textoDoAviso} />}
      {detalhe.isError && (
        <Aviso texto="Não foi possível carregar as conquistas agora. Mostrando o último valor salvo." />
      )}

      {semConquistas && <p className="m-0 text-[16px]">Este jogo não tem conquistas.</p>}
      {mostrarBarra && dados.conquistasTotal !== null && dados.conquistasDesbloqueadas !== null && (
        <Progresso desbloqueadas={dados.conquistasDesbloqueadas} total={dados.conquistasTotal} />
      )}

      {detalhe.isPending && (
        <div role="status" aria-label="Carregando conquistas" className="flex flex-col gap-2">
          <div className="h-4 w-1/2 rounded-lg bg-painel-2" />
          <div className="h-4 w-2/3 rounded-lg bg-painel-2" />
        </div>
      )}

      <ListaDeConquistas titulo="Desbloqueadas" conquistas={desbloqueadas} aberta={false} />
      <ListaDeConquistas titulo="Faltam" conquistas={faltam} aberta />

      <FieldError id="steam-jogo-atualizar-erro" message={erroAtualizar} />
      <div className="flex flex-wrap gap-2.5">
        <button
          type="button"
          onClick={() => void onAtualizar()}
          disabled={atualizar.isPending}
          className={BOTAO_CONTORNO}
        >
          {atualizar.isPending ? 'Atualizando…' : 'Atualizar'}
        </button>
        {steamUrl && (
          <a href={steamUrl} target="_blank" rel="noopener noreferrer" className={BOTAO_CONTORNO}>
            Abrir na Steam
            <Icon name="open_in_new" size={18} />
          </a>
        )}
        <button
          type="button"
          onClick={() => {
            setErroDesvincular('');
            setConfirmando(true);
          }}
          className={BOTAO_CONTORNO}
        >
          Desvincular
        </button>
      </div>

      <DesvincularJogoDialog
        open={confirmando}
        titulo={game.titulo}
        onClose={() => setConfirmando(false)}
        onConfirmar={() => void onDesvincular()}
        desvinculando={desvincular.isPending}
        erro={erroDesvincular}
      />
    </section>
  );
}
