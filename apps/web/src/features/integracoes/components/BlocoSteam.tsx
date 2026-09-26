import { useState } from 'react';
import {
  type AvisoPlataforma,
  type Conquista,
  type DadosJogoPlataforma,
  type Game,
} from '@checkpoint/shared';
import { FieldError } from '@/shared/components/form-parts';
import { Icon } from '@/shared/components/Icon';
import { ModalDialog } from '@/shared/components/ModalDialog';
import { describeAuthError } from '@/features/auth/lib/auth-errors';
import { useAtualizarJogo, useDesvincularJogo, useDetalheJogo } from '../api/use-integracoes';
import {
  dataCurta,
  desbloqueadaEmTexto,
  horasEMinutos,
  progressoDasConquistas,
  raridadeTexto,
  separarConquistas,
} from '../lib/conquistas';
import { atualizadoHaTexto } from '../lib/tempo-relativo';

const PROVEDOR = 'STEAM' as const;

const BOTAO =
  'min-h-11 min-w-11 rounded-full px-[18px] font-display text-[15px] disabled:cursor-wait disabled:opacity-60';
const BOTAO_CONTORNO = `${BOTAO} inline-flex items-center justify-center gap-2 border border-borda-controle font-bold transition-colors hover:bg-painel-3`;
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
    <div className="flex min-w-0 flex-col gap-1 rounded-2xl bg-painel-2 px-[18px] py-4">
      <dt className="text-[13px] font-semibold text-texto-suave">{rotulo}</dt>
      <dd className="m-0 font-display text-2xl font-extrabold [overflow-wrap:anywhere]">{valor}</dd>
    </div>
  );
}

/** O cartão "Conquistas · 12 de 40": a barra `role="progressbar"` em `ouro` (10,35:1 sobre o trilho `borda`) e a porcentagem. */
function Progresso({ desbloqueadas, total }: { desbloqueadas: number; total: number }) {
  const progresso = progressoDasConquistas(desbloqueadas, total);
  if (!progresso) {
    return null;
  }
  return (
    <div className="flex min-w-0 flex-col gap-2 rounded-2xl bg-painel-2 px-[18px] py-4">
      <span className="text-[13px] font-semibold text-texto-suave">
        Conquistas · {progresso.desbloqueadas} de {progresso.total}
      </span>
      <div className="flex items-center gap-3">
        <div
          role="progressbar"
          aria-label={progresso.texto}
          aria-valuemin={0}
          aria-valuemax={progresso.total}
          aria-valuenow={progresso.desbloqueadas}
          aria-valuetext={progresso.texto}
          className="h-2.5 flex-1 overflow-hidden rounded-full bg-borda"
        >
          <div
            className="h-full rounded-full bg-ouro"
            style={{ width: `${progresso.percentual}%` }}
          />
        </div>
        <span className="font-display text-lg font-extrabold">{progresso.percentual}%</span>
      </div>
    </div>
  );
}

function ItemDeConquista({ conquista }: { conquista: Conquista }) {
  const escondida = conquista.oculta && !conquista.desbloqueada;
  const data = desbloqueadaEmTexto(conquista.desbloqueadaEm);
  const iconeVazio = conquista.desbloqueada
    ? 'military_tech'
    : escondida
      ? 'visibility_off'
      : 'lock';
  return (
    <li
      data-conquista={conquista.id}
      className="flex min-w-0 flex-wrap items-center gap-x-3.5 gap-y-1.5 rounded-2xl bg-painel-2 px-3.5 py-3"
    >
      {conquista.iconeUrl ? (
        // Decorativo (o nome está ao lado), sem `Referer` e com tamanho fixo: a lista pode ter centenas de ícones.
        <img
          src={conquista.iconeUrl}
          alt=""
          width={52}
          height={52}
          loading="lazy"
          referrerPolicy="no-referrer"
          className="size-[52px] shrink-0 rounded-[10px] bg-painel-3"
        />
      ) : (
        <div
          aria-hidden="true"
          className="grid size-[52px] shrink-0 place-items-center rounded-[10px] bg-painel-3 text-texto-suave"
        >
          <Icon name={iconeVazio} size={26} />
        </div>
      )}
      <div className="flex min-w-0 flex-1 basis-40 flex-col gap-0.5">
        <span className="text-[15px] font-bold [overflow-wrap:anywhere]">{conquista.nome}</span>
        <span className="text-[13px] font-medium text-texto-suave [overflow-wrap:anywhere]">
          {escondida ? 'Conquista oculta' : (conquista.descricao ?? '')}
        </span>
        {data && <span className="text-xs font-semibold text-status-zerado">{data}</span>}
      </div>
      <span className="shrink-0 text-xs font-bold text-texto-suave max-sm:basis-full max-sm:pl-[66px] sm:text-right">
        {raridadeTexto(conquista.raridadePercentual)}
      </span>
    </li>
  );
}

function ListaDeConquistas({
  titulo,
  icone,
  cor,
  conquistas,
  aberta,
}: {
  titulo: string;
  icone: string;
  cor: string;
  conquistas: Conquista[];
  aberta: boolean;
}) {
  if (conquistas.length === 0) {
    return null;
  }
  return (
    <details open={aberta} data-lista={titulo} className="flex min-w-0 flex-col gap-3">
      <summary className="flex min-h-11 cursor-pointer items-center gap-2.5 font-display text-lg font-bold">
        <Icon name={icone} size={22} filled className={cor} />
        {titulo}
        <span className="inline-flex h-[22px] items-center rounded-full bg-painel-3 px-2.5 text-[13px] font-bold text-texto-suave">
          {conquistas.length}
        </span>
      </summary>
      <ul className="m-0 flex list-none flex-col gap-2.5 p-0">
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

  const atualizadoEm = atualizadoHaTexto(dados.atualizadoEm);

  return (
    <section
      aria-labelledby="detalhe-steam"
      data-secao="steam"
      className="flex min-w-0 flex-col gap-5 rounded-[22px] border border-borda bg-painel p-4 md:gap-[22px] md:px-7 md:py-6"
    >
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div
            aria-hidden="true"
            className="grid size-11 place-items-center rounded-xl bg-painel-3 text-status-jogando"
          >
            <Icon name="sports_esports" size={26} filled />
          </div>
          <div className="flex flex-col">
            <h2 id="detalhe-steam" className="m-0 font-display text-xl font-extrabold">
              Steam
            </h2>
            {atualizadoEm && (
              <span className="text-[13px] font-medium text-texto-suave">{atualizadoEm}</span>
            )}
          </div>
        </div>
        <div className="flex flex-wrap gap-2.5">
          <button
            type="button"
            onClick={() => void onAtualizar()}
            disabled={atualizar.isPending}
            className={BOTAO_CONTORNO}
          >
            <Icon name="refresh" size={20} />
            {atualizar.isPending ? 'Atualizando…' : 'Atualizar'}
          </button>
          {steamUrl && (
            <a href={steamUrl} target="_blank" rel="noopener noreferrer" className={BOTAO_CONTORNO}>
              <Icon name="open_in_new" size={20} />
              Abrir na Steam
            </a>
          )}
          <button
            type="button"
            onClick={() => {
              setErroDesvincular('');
              setConfirmando(true);
            }}
            className={`${BOTAO_CONTORNO} text-erro-texto`}
          >
            <Icon name="link_off" size={20} />
            Desvincular
          </button>
        </div>
      </div>

      <FieldError id="steam-jogo-atualizar-erro" message={erroAtualizar} />
      {textoDoAviso && <Aviso texto={textoDoAviso} />}
      {detalhe.isError && (
        <Aviso texto="Não foi possível carregar as conquistas agora. Mostrando o último valor salvo." />
      )}

      <dl className="m-0 grid grid-cols-1 gap-3 md:grid-cols-3">
        <Estatistica rotulo="Tempo jogado na Steam" valor={horasEMinutos(dados.minutosJogados)} />
        <Estatistica
          rotulo="Último jogo em"
          valor={dataCurta(dados.ultimaVezJogadoEm) ?? 'Nunca jogado'}
        />
        {mostrarBarra &&
          dados.conquistasTotal !== null &&
          dados.conquistasDesbloqueadas !== null && (
            <Progresso
              desbloqueadas={dados.conquistasDesbloqueadas}
              total={dados.conquistasTotal}
            />
          )}
      </dl>

      {semConquistas && <p className="m-0 text-base">Este jogo não tem conquistas.</p>}

      {detalhe.isPending && (
        <div role="status" aria-label="Carregando conquistas" className="flex flex-col gap-2">
          <div className="skeleton h-4 w-1/2 rounded-lg" />
          <div className="skeleton h-4 w-2/3 rounded-lg" />
        </div>
      )}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2 lg:items-start">
        <ListaDeConquistas
          titulo="Desbloqueadas"
          icone="check_circle"
          cor="text-status-zerado"
          conquistas={desbloqueadas}
          aberta={false}
        />
        <ListaDeConquistas
          titulo="Faltam"
          icone="lock"
          cor="text-texto-suave"
          conquistas={faltam}
          aberta
        />
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
