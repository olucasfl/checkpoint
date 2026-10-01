import { RotuloPendente } from '@/shared/components/RotuloPendente';
import { useState, type ReactNode } from 'react';
import {
  PLATAFORMAS,
  PROVEDOR_SLUG,
  type AvisoPlataforma,
  type Conquista,
  type ContagemTrofeus,
  type DadosJogoPlataforma,
  type Game,
  type PlataformaInfo,
  type Provedor,
  type TipoDeTrofeu,
} from '@checkpoint/shared';
import { Chek } from '@/shared/components/Chek/Chek';
import { FieldError } from '@/shared/components/form-parts';
import { Icon } from '@/shared/components/Icon';
import { PlataformaMarca } from '@/shared/components/PlataformaMarca';
import { SecaoRecolhivel } from '@/shared/components/SecaoRecolhivel';
import { useSecaoAberta } from '@/shared/hooks/use-secao-aberta';
import { ModalDialog } from '@/shared/components/ModalDialog';
import { describeAuthError } from '@/features/auth/lib/auth-errors';
import { useAtualizarJogo, useDesvincularJogo, useDetalheJogo } from '../api/use-integracoes';
import { useSincronizando } from '../api/use-sincronizacao';
import { HorasCarregando } from './HorasCarregando';
import {
  TIPO_DE_TROFEU_TEXTO,
  capitalizada,
  dataCurta,
  desbloqueadaEmTexto,
  horasEMinutos,
  progressoDasConquistas,
  raridadeTexto,
  separarConquistas,
} from '../lib/conquistas';
import {
  comPlataforma,
  dePlataforma,
  horasEConquistas,
  naPlataforma,
} from '../lib/plataforma-texto';
import { atualizadoHaTexto } from '../lib/tempo-relativo';
import { VincularCredencialDialog } from './VincularCredencialDialog';
import { avisar } from '@/shared/lib/avisos';
import { chegouAos100, textoDoMarco } from '@/features/games/lib/marcos';

const BOTAO =
  'min-h-11 min-w-11 rounded-full px-[18px] font-display text-[15px] disabled:cursor-wait disabled:opacity-60';
const BOTAO_CONTORNO = `${BOTAO} inline-flex items-center justify-center gap-2 border border-borda-controle font-bold transition-colors hover:bg-painel-3`;
const BOTAO_PRIMARIO = `${BOTAO} bg-destaque font-extrabold text-fundo`;

/** O que cada aviso do servidor vira na tela: discreto, e sempre com o que continua valendo. Os textos saem do cadastro. */
function textoDoAvisoDaPlataforma(
  aviso: AvisoPlataforma,
  plataforma: PlataformaInfo,
): string | undefined {
  const { vocabulario } = plataforma;
  switch (aviso) {
    case 'CONQUISTAS_PRIVADAS':
      return `${capitalizada(vocabulario.artigo)} ${vocabulario.conquistas} deste jogo estão ${vocabulario.artigo === 'as' ? 'privadas' : 'privados'} ${naPlataforma(plataforma)}. As horas continuam atualizadas.`;
    case 'PERFIL_PRIVADO':
      return `Seu perfil ${plataforma.nome} está privado agora. Mostrando o último valor salvo${plataforma.privacidade ? ' (o passo a passo está no seu Perfil).' : '.'}`;
    case 'INDISPONIVEL':
      return 'Não foi possível atualizar agora. Mostrando o último valor salvo.';
    default:
      return undefined;
  }
}

function Aviso({ texto }: { texto: string }) {
  return (
    <p
      role="status"
      data-aviso-plataforma
      className="m-0 flex items-start gap-2 rounded-xl bg-painel-2 px-3.5 py-3 text-[16px] font-semibold text-ouro"
    >
      <Icon name="info" size={20} filled className="mt-0.5 shrink-0" />
      <span className="min-w-0 [overflow-wrap:anywhere]">{texto}</span>
    </p>
  );
}

function Estatistica({ rotulo, valor }: { rotulo: string; valor: ReactNode }) {
  return (
    <div className="flex min-w-0 flex-col gap-1 rounded-2xl bg-painel-2 px-[18px] py-4">
      <dt className="text-[13px] font-semibold text-texto-suave">{rotulo}</dt>
      <dd className="m-0 font-display text-2xl font-extrabold [overflow-wrap:anywhere]">{valor}</dd>
    </div>
  );
}

/** O cartão "Conquistas · 12 de 40": a barra `role="progressbar"` em `ouro` (10,35:1 sobre o trilho `borda`) e a porcentagem. */
function Progresso({
  desbloqueadas,
  total,
  vocabulario,
}: {
  desbloqueadas: number;
  total: number;
  vocabulario: PlataformaInfo['vocabulario'];
}) {
  const progresso = progressoDasConquistas(desbloqueadas, total, vocabulario);
  if (!progresso) {
    return null;
  }
  return (
    <div className="flex min-w-0 flex-col gap-2 rounded-2xl bg-painel-2 px-[18px] py-4">
      <span className="text-[13px] font-semibold text-texto-suave">
        {capitalizada(vocabulario.conquistas)} · {progresso.desbloqueadas} de {progresso.total}
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

function ItemDeConquista({
  conquista,
  vocabulario,
}: {
  conquista: Conquista;
  vocabulario: PlataformaInfo['vocabulario'];
}) {
  const escondida = conquista.oculta && !conquista.desbloqueada;
  // "Conquista oculta" / "Troféu oculto" (a API não manda nome nem descrição de um oculto bloqueado da PlayStation).
  const rotuloOculta = `${capitalizada(vocabulario.conquista)} ${vocabulario.artigo === 'as' ? 'oculta' : 'oculto'}`;
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
        <span className="text-[15px] font-bold [overflow-wrap:anywhere]">
          {conquista.nome === '' ? rotuloOculta : conquista.nome}
        </span>
        <span className="text-[13px] font-medium text-texto-suave [overflow-wrap:anywhere]">
          {escondida ? (conquista.nome === '' ? '' : rotuloOculta) : (conquista.descricao ?? '')}
        </span>
        {conquista.tipo ? (
          <span className="text-xs font-bold text-texto">
            {TIPO_DE_TROFEU_TEXTO[conquista.tipo]}
          </span>
        ) : null}
        {data && <span className="text-xs font-semibold text-status-zerado">{data}</span>}
      </div>
      <span className="shrink-0 text-xs font-bold text-texto-suave max-sm:basis-full max-sm:pl-[66px] sm:text-right">
        {raridadeTexto(conquista.raridadePercentual, conquista.raridadeNivel ?? null)}
      </span>
    </li>
  );
}

/** A linha da seção fechada: "42 h 30 min · 12/40 conquistas" (ou "troféus"; só com o número certo). */
export function resumoDaLinha(
  dados: DadosJogoPlataforma,
  comConquistas: boolean,
  vocabulario: PlataformaInfo['vocabulario'] = PLATAFORMAS.STEAM.vocabulario,
): string {
  const horas = horasEMinutos(dados.minutosJogados);
  const { conquistasTotal: total, conquistasDesbloqueadas: ganhas } = dados;
  if (!comConquistas || total === null || total <= 0 || ganhas === null) {
    return horas;
  }
  return `${horas} · ${ganhas}/${total} ${vocabulario.conquistas}`;
}

function ListaDeConquistas({
  titulo,
  chave,
  icone,
  cor,
  conquistas,
  vocabulario,
}: {
  vocabulario: PlataformaInfo['vocabulario'];
  titulo: string;
  /** A chave do estado guardado neste aparelho (por tipo de lista). */
  chave: string;
  icone: string;
  cor: string;
  conquistas: Conquista[];
}) {
  // As duas listas começam FECHADAS: a seta e o "Toque para ver" mostram que dá para abrir.
  const [aberta, definir] = useSecaoAberta(chave, false);
  if (conquistas.length === 0) {
    return null;
  }
  return (
    <details
      open={aberta}
      data-lista={titulo}
      onToggle={(evento) => {
        const agora = evento.currentTarget.open;
        if (agora !== aberta) {
          definir(agora);
        }
      }}
      className="group/lista flex min-w-0 flex-col gap-3"
    >
      <summary className="flex min-h-11 cursor-pointer list-none items-center gap-2 font-display text-base font-bold sm:gap-2.5 sm:text-lg [&::-webkit-details-marker]:hidden">
        <Icon name={icone} size={22} filled className={cor} />
        {titulo}
        <span className="inline-flex h-[22px] items-center rounded-full bg-painel-3 px-2.5 text-[13px] font-bold text-texto-suave">
          {conquistas.length}
        </span>
        <span className="ml-auto flex shrink-0 items-center gap-0.5 font-corpo text-xs sm:gap-1 sm:text-[13px] font-semibold text-texto-suave">
          {aberta ? 'Toque para fechar' : 'Toque para ver'}
          <Icon name="expand_more" size={22} className="group-open/lista:rotate-180" />
        </span>
      </summary>
      <ul className="m-0 flex list-none flex-col gap-2.5 p-0">
        {conquistas.map((conquista) => (
          <ItemDeConquista key={conquista.id} conquista={conquista} vocabulario={vocabulario} />
        ))}
      </ul>
    </details>
  );
}

/** Os troféus por tipo ("Platina 0 de 1 · Ouro 1 de 3…"), em texto: nada depende só de cor. */
const TIPOS_DE_TROFEU: readonly TipoDeTrofeu[] = ['platina', 'ouro', 'prata', 'bronze'];

function TrofeusPorTipo({ porTipo }: { porTipo: Record<TipoDeTrofeu, ContagemTrofeus> }) {
  return (
    <ul
      aria-label="Troféus por tipo"
      data-por-tipo
      className="m-0 flex list-none flex-wrap gap-2 p-0"
    >
      {TIPOS_DE_TROFEU.map((tipo) => (
        <li
          key={tipo}
          className="flex items-center gap-1.5 rounded-full bg-painel-2 px-3 py-1.5 text-[14px] font-semibold"
        >
          <Icon name="emoji_events" size={18} filled className="text-ouro" />
          <span>{TIPO_DE_TROFEU_TEXTO[tipo]}</span>
          <span className="text-texto-suave">
            {porTipo[tipo].desbloqueados} de {porTipo[tipo].total}
          </span>
        </li>
      ))}
    </ul>
  );
}

function DesvincularJogoDialog({
  open,
  plataforma,
  titulo,
  onClose,
  onConfirmar,
  desvinculando,
  erro,
}: {
  open: boolean;
  plataforma: PlataformaInfo;
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
          Desvincular {dePlataforma(plataforma)}
        </h2>
        <p className="m-0 text-[19px]">
          Isso remove de «{titulo}» {horasEConquistas(plataforma)} {dePlataforma(plataforma)}. O
          título, o status, as notas e a capa continuam como estão, e você pode ligar o jogo de novo
          depois.
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
 * O bloco de uma **plataforma** na página do jogo (spec `integracao-plataformas`, etapa 4; genérico por `provedor` na spec
 * `integracao-playstation`, F3: Steam com conquistas, PlayStation com troféus): horas, última vez jogado, a barra de
 * conquistas e a lista completa. Só é montado para um jogo com vínculo, e só ele pede o detalhe (abrir `/` não faz
 * nenhuma request de conquistas). Enquanto o detalhe carrega, mostra o último valor gravado; se a plataforma falhar, o
 * servidor devolve esse valor com um aviso discreto (nunca um erro). Sem animação nenhuma: nada aqui muda com
 * "efeitos reduzidos". Uma coluna no celular; a partir de 1024 px, data e raridade ficam à direita de cada linha.
 */
export function BlocoPlataforma({ game, provedor }: { game: Game; provedor: Provedor }) {
  const plataforma = PLATAFORMAS[provedor];
  const { vocabulario } = plataforma;
  const gravado: DadosJogoPlataforma | undefined = game.dadosPlataforma.find(
    (dados) => dados.provedor === provedor,
  );
  const detalhe = useDetalheJogo(provedor, game.id, gravado !== undefined);
  const atualizar = useAtualizarJogo(provedor, game.id);
  // As horas são trazidas da plataforma ao entrar no app: a página abre normal e só elas esperam.
  const sincronizando = useSincronizando([provedor]);
  const desvincular = useDesvincularJogo(provedor);
  const [confirmando, setConfirmando] = useState(false);
  const [erroAtualizar, setErroAtualizar] = useState('');
  const [erroDesvincular, setErroDesvincular] = useState('');
  const [reconectando, setReconectando] = useState(false);

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
  const textoDoAviso = aviso ? textoDoAvisoDaPlataforma(aviso, plataforma) : undefined;
  // O link da página do jogo vem do cadastro; sem ele (PlayStation), não há "Abrir na …".
  const { paginaDoJogo } = plataforma;
  const paginaUrl =
    paginaDoJogo && new RegExp(paginaDoJogo.formatoDoId).test(dados.idExterno)
      ? paginaDoJogo.modelo.replace('{id}', dados.idExterno)
      : null;
  const porTipo = detalhe.data?.porTipo ?? null;
  const reautenticar = aviso === 'REAUTENTICAR';

  async function onAtualizar() {
    setErroAtualizar('');
    try {
      const novo = await atualizar.mutateAsync();
      if (chegouAos100(dados, novo.dados)) {
        avisar({
          texto: textoDoMarco('conquistas-100', game.titulo, vocabulario),
          chek: 'comemorando',
        });
      } else {
        avisar({ texto: `Dados ${dePlataforma(plataforma)} atualizados.` });
      }
    } catch (failure) {
      setErroAtualizar(describeAuthError(failure).message);
    }
  }

  async function onDesvincular() {
    setErroDesvincular('');
    try {
      await desvincular.mutateAsync(game.id);
      setConfirmando(false);
      avisar({ texto: `Jogo desvinculado ${dePlataforma(plataforma)}.` });
    } catch (failure) {
      setErroDesvincular(describeAuthError(failure).message);
    }
  }

  const atualizadoEm = atualizadoHaTexto(dados.atualizadoEm);
  const slug = PROVEDOR_SLUG[provedor];
  const resumo = resumoDaLinha(dados, mostrarBarra, vocabulario);

  return (
    <SecaoRecolhivel
      chave={`plataforma:${slug}`}
      abertaPorPadrao
      dataSecao={plataforma.slug}
      titulo={
        // A logo oficial fica SOZINHA no título (regra da Valve): o resumo vai ao lado, em texto separado.
        <h2 id={`detalhe-${plataforma.slug}`} className="m-0">
          <PlataformaMarca provedor={provedor} variante="logo" />
        </h2>
      }
      resumo={sincronizando ? <HorasCarregando /> : resumo}
    >
      <div className="flex flex-wrap items-center justify-between gap-4">
        {atualizadoEm && (
          <span className="text-[13px] font-medium text-texto-suave">{atualizadoEm}</span>
        )}
        <div className="flex flex-wrap gap-2.5">
          <button
            type="button"
            onClick={() => void onAtualizar()}
            disabled={atualizar.isPending}
            className={BOTAO_CONTORNO}
          >
            <Icon name="refresh" size={20} className={atualizar.isPending ? 'gira' : undefined} />
            <RotuloPendente
              pendente={atualizar.isPending}
              normal="Atualizar"
              ocupado="Atualizando…"
              indicador={false}
            />
          </button>
          {paginaUrl && (
            <a
              href={paginaUrl}
              target="_blank"
              rel="noopener noreferrer"
              className={BOTAO_CONTORNO}
            >
              <Icon name="open_in_new" size={20} />
              Abrir {naPlataforma(plataforma)}
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

      <FieldError id={`${plataforma.slug}-jogo-atualizar-erro`} message={erroAtualizar} />
      {textoDoAviso && <Aviso texto={textoDoAviso} />}
      {reautenticar && (
        <div
          role="status"
          data-aviso-plataforma
          className="flex flex-wrap items-center gap-3 rounded-xl bg-painel-2 px-3.5 py-3"
        >
          <Chek expressao="confuso" altura={56} />
          <p className="m-0 min-w-0 flex-1 basis-56 text-[16px] font-semibold text-ouro">
            Sua conexão {comPlataforma(plataforma)} expirou. Mostrando o último valor salvo.
          </p>
          {plataforma.vinculo.tipo === 'credencial' && (
            <button type="button" onClick={() => setReconectando(true)} className={BOTAO_PRIMARIO}>
              Reconectar
            </button>
          )}
        </div>
      )}
      {detalhe.isError && (
        <Aviso texto="Não foi possível carregar as conquistas agora. Mostrando o último valor salvo." />
      )}

      <dl className="m-0 grid grid-cols-1 gap-3 md:grid-cols-3">
        <Estatistica
          rotulo={`Tempo jogado ${naPlataforma(plataforma)}`}
          valor={sincronizando ? <HorasCarregando /> : horasEMinutos(dados.minutosJogados)}
        />
        <Estatistica
          rotulo="Último jogo em"
          valor={
            sincronizando ? (
              <HorasCarregando largura="w-24" />
            ) : (
              (dataCurta(dados.ultimaVezJogadoEm) ?? 'Nunca jogado')
            )
          }
        />
        {mostrarBarra &&
          dados.conquistasTotal !== null &&
          dados.conquistasDesbloqueadas !== null && (
            <Progresso
              desbloqueadas={dados.conquistasDesbloqueadas}
              total={dados.conquistasTotal}
              vocabulario={vocabulario}
            />
          )}
      </dl>

      {porTipo && mostrarBarra && <TrofeusPorTipo porTipo={porTipo} />}

      {semConquistas && <p className="m-0 text-base">{plataforma.textoSemConquistas}</p>}

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
          chave={`conquistas:${slug}:desbloqueadas`}
          conquistas={desbloqueadas}
          vocabulario={vocabulario}
        />
        <ListaDeConquistas
          titulo="Faltam"
          icone="lock"
          cor="text-texto-suave"
          chave={`conquistas:${slug}:faltam`}
          conquistas={faltam}
          vocabulario={vocabulario}
        />
      </div>

      {plataforma.vinculo.tipo === 'credencial' && (
        <VincularCredencialDialog
          open={reconectando}
          plataforma={plataforma}
          reautenticar
          onClose={() => setReconectando(false)}
        />
      )}

      <DesvincularJogoDialog
        open={confirmando}
        plataforma={plataforma}
        titulo={game.titulo}
        onClose={() => setConfirmando(false)}
        onConfirmar={() => void onDesvincular()}
        desvinculando={desvincular.isPending}
        erro={erroDesvincular}
      />
    </SecaoRecolhivel>
  );
}
