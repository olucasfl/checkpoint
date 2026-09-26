import { useState } from 'react';
import {
  type ContaVinculada,
  type ItemBiblioteca,
  type ResumoContaPlataforma,
} from '@checkpoint/shared';
import { Chek } from '@/shared/components/Chek/Chek';
import { FieldError } from '@/shared/components/form-parts';
import { Icon } from '@/shared/components/Icon';
import { ModalDialog } from '@/shared/components/ModalDialog';
import { RotuloPendente } from '@/shared/components/RotuloPendente';
import { avisar } from '@/shared/lib/avisos';
import { describeAuthError } from '@/features/auth/lib/auth-errors';
import { GameForm } from '@/features/games/components/GameForm';
import { useAtualizarResumo, useDesvincular, useResumoPlataforma } from '../api/use-integracoes';
import { classificarFalhaDoCartao } from '../lib/estado-do-cartao';
import { horasCurtas, textoDasConquistas } from '../lib/format';
import { PROVEDOR_STEAM } from '../lib/provedores';
import {
  percentualDoBacklog,
  textoDoBacklog,
  textoDoStatus,
  textoNoCheckpoint,
} from '../lib/resumo';
import { atualizadoHaTexto } from '../lib/tempo-relativo';
import { BibliotecaSteamDialog } from './BibliotecaSteamDialog';

const PROVEDOR = PROVEDOR_STEAM;

const BOTAO =
  'min-h-11 min-w-11 rounded-full px-4 font-display text-[15px] disabled:cursor-wait disabled:opacity-60 font-bold';
const BOTAO_CONTORNO = `${BOTAO} border border-borda-controle font-semibold hover:bg-acao-hover`;
const BOTAO_PRIMARIO = `${BOTAO} bg-destaque font-extrabold text-fundo`;

export const PASSOS_DE_PRIVACIDADE = [
  'Abra a Steam e vá em Perfil › Editar perfil › Configurações de privacidade.',
  'Deixe "Meu perfil" como Público.',
  'Deixe "Detalhes do jogo" como Público.',
  'Espere alguns minutos (a Steam demora a aplicar) e toque em "Tentar de novo".',
] as const;

/** A atribuição legal da Valve e a declaração de que o app não é afiliado a ela (spec, "Marca e logos"). */
export const ATRIBUICAO_DA_VALVE =
  '©2024 Valve Corporation. Steam and the Steam logo are trademarks and/or registered trademarks of Valve Corporation in the U.S. and/or other countries. All rights reserved.';
export const NAO_AFILIADO = 'Não afiliado à Valve';

export function Esqueleto({ rotulo }: { rotulo: string }) {
  return (
    <div role="status" aria-label={rotulo} className="flex flex-col gap-3 p-4">
      <div className="h-6 w-1/3 rounded-lg bg-painel-2" />
      <div className="h-4 w-2/3 rounded-lg bg-painel-2" />
      <div className="h-4 w-1/2 rounded-lg bg-painel-2" />
    </div>
  );
}

function Cabecalho({ nome, resumo }: { nome: string; resumo?: ResumoContaPlataforma }) {
  const status = resumo ? textoDoStatus(resumo.status, resumo.jogandoAgora) : null;
  return (
    <div className="flex min-w-0 items-center gap-3">
      {resumo?.avatarUrl ? (
        // Decorativo (o nome já está ao lado) e sem `Referer`: a imagem vem de um domínio da Steam.
        <img
          src={resumo.avatarUrl}
          alt=""
          width={56}
          height={56}
          loading="lazy"
          referrerPolicy="no-referrer"
          className="size-14 shrink-0 rounded-full bg-painel-2"
        />
      ) : (
        <Icon name="account_circle" size={56} className="shrink-0 text-texto-suave" />
      )}
      <div className="flex min-w-0 flex-col gap-0.5">
        <span className="text-[19px] font-semibold [overflow-wrap:anywhere]">{nome}</span>
        {resumo?.membroDesde != null && (
          <span className="text-[14px] font-medium text-texto-suave">
            Na Steam desde {resumo.membroDesde}
          </span>
        )}
        {status && (
          <span
            data-status-steam={resumo?.status ?? undefined}
            className="text-[14px] font-semibold text-texto-suave"
          >
            {status}
          </span>
        )}
        {resumo?.perfilUrl && (
          <a
            href={resumo.perfilUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex min-h-11 items-center gap-1 text-[14px] font-semibold text-destaque underline underline-offset-4"
          >
            Abrir perfil na Steam
            <Icon name="open_in_new" size={16} />
          </a>
        )}
      </div>
    </div>
  );
}

export function Falha({
  mensagem,
  onTentarDeNovo,
  tentando,
}: {
  mensagem: string;
  onTentarDeNovo: () => void;
  tentando: boolean;
}) {
  return (
    <div className="flex flex-col gap-3 p-4">
      <FieldError id="steam-falha" message={mensagem} />
      <button
        type="button"
        onClick={onTentarDeNovo}
        disabled={tentando}
        className={`${BOTAO_CONTORNO} self-start`}
      >
        {tentando ? 'Tentando…' : 'Tentar de novo'}
      </button>
    </div>
  );
}

function PerfilPrivado({
  onTentarDeNovo,
  tentando,
}: {
  onTentarDeNovo: () => void;
  tentando: boolean;
}) {
  return (
    <div className="flex flex-col gap-3">
      <Chek expressao="cadeado" altura={72} />
      <h3 className="m-0 text-[19px] font-bold text-ouro">Seu perfil Steam está privado</h3>
      <p className="m-0 text-[16px] text-texto-suave">
        A Steam só entrega horas e conquistas de perfis públicos. Para mudar:
      </p>
      <ol className="m-0 flex flex-col gap-1.5 pl-6 text-[16px]">
        {PASSOS_DE_PRIVACIDADE.map((passo) => (
          <li key={passo}>{passo}</li>
        ))}
      </ol>
      <button
        type="button"
        onClick={onTentarDeNovo}
        disabled={tentando}
        className={`${BOTAO_CONTORNO} self-start`}
      >
        {tentando ? 'Tentando…' : 'Tentar de novo'}
      </button>
    </div>
  );
}

function Estatistica({
  rotulo,
  valor,
  className = '',
}: {
  rotulo: string;
  valor: string;
  className?: string;
}) {
  return (
    <div className={`flex flex-col rounded-xl bg-painel-2 px-3 py-2.5 ${className}`}>
      <dt className="text-[13px] font-semibold uppercase tracking-[0.08em] text-texto-suave">
        {rotulo}
      </dt>
      <dd className="m-0 font-display text-[20px] font-bold">{valor}</dd>
    </div>
  );
}

const TITULO_BLOCO = 'm-0 text-[14px] font-semibold uppercase tracking-[0.08em] text-texto-suave';

function DadosDoResumo({
  resumo,
  onVerBacklog,
}: {
  resumo: ResumoContaPlataforma;
  onVerBacklog: () => void;
}) {
  const percentual = percentualDoBacklog(resumo.nuncaJogados, resumo.totalJogos);
  return (
    <div className="flex flex-col gap-4">
      <dl className="m-0 grid grid-cols-2 gap-2.5 sm:grid-cols-3">
        <Estatistica rotulo="Jogos" valor={String(resumo.totalJogos)} />
        <Estatistica rotulo="Horas" valor={horasCurtas(resumo.minutosTotais)} />
        <Estatistica rotulo="Já jogados" valor={`${resumo.jogosJogados} de ${resumo.totalJogos}`} />
      </dl>

      {resumo.totalJogos === 0 ? (
        <p className="m-0 text-[16px] text-texto-suave">Nenhum jogo na sua biblioteca.</p>
      ) : (
        <>
          {resumo.maisJogados.length > 0 && (
            <section aria-label="Mais jogados de sempre" className="flex flex-col gap-1.5">
              <h3 className={TITULO_BLOCO}>Mais jogados</h3>
              <ol className="m-0 flex list-none flex-col gap-1.5 p-0">
                {resumo.maisJogados.map((jogo) => (
                  <li
                    key={jogo.idExterno}
                    className="flex min-w-0 items-baseline justify-between gap-3 text-[17px]"
                  >
                    <span className="min-w-0 [overflow-wrap:anywhere]">{jogo.titulo}</span>
                    <span className="shrink-0 font-semibold text-texto-suave">
                      {horasCurtas(jogo.minutosJogados)}
                    </span>
                  </li>
                ))}
              </ol>
            </section>
          )}

          <section aria-label="Backlog" className="flex flex-col gap-2">
            <h3 className={TITULO_BLOCO}>Backlog</h3>
            <p className="m-0 text-[17px]">
              {textoDoBacklog(resumo.nuncaJogados)} · {percentual}%
            </p>
            {resumo.nuncaJogados > 0 && (
              <button
                type="button"
                onClick={onVerBacklog}
                className={`${BOTAO_CONTORNO} self-start`}
              >
                Ver e importar
              </button>
            )}
          </section>
        </>
      )}

      <p className="m-0 text-[16px]">
        {textoNoCheckpoint(resumo.noCheckpoint.ligados, resumo.noCheckpoint.naBiblioteca)}
      </p>
      <p className="m-0 text-[16px]">{textoDasConquistas(resumo.conquistas)}</p>
    </div>
  );
}

function DesvincularDialog({
  open,
  onClose,
  onConfirmar,
  desvinculando,
  erro,
}: {
  open: boolean;
  onClose: () => void;
  onConfirmar: () => void;
  desvinculando: boolean;
  erro: string;
}) {
  return (
    <ModalDialog open={open} onClose={onClose} labelledBy="desvincular-steam-titulo">
      <div className="sheet-pad flex flex-col gap-5 px-7 pt-7">
        <h2
          id="desvincular-steam-titulo"
          className="m-0 font-display text-xl font-extrabold tracking-[-0.01em] text-destaque"
        >
          Desvincular a Steam
        </h2>
        <p className="m-0 text-[19px]">
          Isso remove das suas telas as horas e as conquistas da Steam. Seus jogos, notas, status e
          capas continuam como estão.
        </p>
        <FieldError id="desvincular-steam-erro" message={erro} />
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
 * O resumo da conta Steam dentro do popup (spec `plataformas-e-pagina-do-jogo`, F4a): cabeçalho (avatar, nome, "Na Steam
 * desde", status, link do perfil), números, mais jogados (5), backlog com "Ver e importar", "X dos seus Y jogos já estão
 * no checkpoint", conquistas dos jogos vinculados e as ações (Atualizar, Importar jogos, Desvincular). Tudo vem do mesmo
 * cache de 10 min do cartão: abrir o popup a quente não chama a Steam. Perfil privado mostra o passo a passo e "Tentar
 * de novo"; falha da Steam e falta de conexão têm mensagem própria. O rodapé traz a atribuição legal da Valve.
 */
export function ResumoSteam({ conta }: { conta: ContaVinculada }) {
  const resumo = useResumoPlataforma(PROVEDOR, true);
  const atualizar = useAtualizarResumo(PROVEDOR);
  const desvincular = useDesvincular(PROVEDOR);
  const [confirmando, setConfirmando] = useState(false);
  const [erroAtualizar, setErroAtualizar] = useState('');
  const [erroDesvincular, setErroDesvincular] = useState('');
  // A biblioteca aberta pelo popup: só o backlog ("Ver e importar") ou tudo ("Importar jogos").
  const [importando, setImportando] = useState<'backlog' | 'todos' | null>(null);
  const [criando, setCriando] = useState<ItemBiblioteca | null>(null);

  async function onAtualizar() {
    setErroAtualizar('');
    try {
      await atualizar.mutateAsync();
      avisar({ texto: 'Perfil Steam atualizado.' });
    } catch (failure) {
      setErroAtualizar(describeAuthError(failure).message);
    }
  }

  async function onDesvincular() {
    setErroDesvincular('');
    try {
      await desvincular.mutateAsync();
      setConfirmando(false);
      avisar({ texto: 'Conta Steam desvinculada.' });
    } catch (failure) {
      setErroDesvincular(describeAuthError(failure).message);
    }
  }

  const dados = resumo.data;
  const falha = dados
    ? undefined
    : resumo.isError
      ? classificarFalhaDoCartao(resumo.error)
      : undefined;
  const tentando = resumo.isFetching;
  const atualizado = dados ? atualizadoHaTexto(dados.consultadoEm) : null;

  return (
    <div className="flex flex-col gap-4 pb-1">
      <Cabecalho nome={dados?.nomeExibicao ?? conta.nomeExibicao} resumo={dados} />

      {resumo.isPending && <Esqueleto rotulo="Carregando sua conta Steam" />}
      {dados && <DadosDoResumo resumo={dados} onVerBacklog={() => setImportando('backlog')} />}
      {falha === 'privado' && (
        <PerfilPrivado onTentarDeNovo={() => void resumo.refetch()} tentando={tentando} />
      )}
      {(falha === 'erro' || falha === 'sem-conexao') && (
        <Falha
          mensagem={
            falha === 'sem-conexao'
              ? 'Sem conexão. Tente de novo quando a conexão voltar.'
              : 'Não foi possível falar com a Steam agora.'
          }
          onTentarDeNovo={() => void resumo.refetch()}
          tentando={tentando}
        />
      )}

      <FieldError id="steam-atualizar-erro" message={erroAtualizar} />
      <div className="flex flex-wrap items-center gap-2.5">
        <button
          type="button"
          onClick={() => void onAtualizar()}
          disabled={atualizar.isPending}
          className={BOTAO_CONTORNO}
        >
          <RotuloPendente
            pendente={atualizar.isPending}
            normal="Atualizar"
            ocupado="Atualizando…"
          />
        </button>
        <button type="button" onClick={() => setImportando('todos')} className={BOTAO_CONTORNO}>
          Importar jogos
        </button>
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
      {atualizado && <p className="m-0 text-[13px] font-medium text-texto-suave">{atualizado}</p>}

      <footer className="flex flex-col gap-1 border-t border-borda pt-3 text-[12px] leading-snug text-texto-suave">
        <p className="m-0">{ATRIBUICAO_DA_VALVE}</p>
        <p className="m-0 font-semibold">{NAO_AFILIADO}</p>
      </footer>

      <DesvincularDialog
        open={confirmando}
        onClose={() => setConfirmando(false)}
        onConfirmar={() => void onDesvincular()}
        desvinculando={desvincular.isPending}
        erro={erroDesvincular}
      />
      <BibliotecaSteamDialog
        open={importando !== null}
        modo={{ tipo: 'novo' }}
        soNuncaJogados={importando === 'backlog'}
        onClose={() => setImportando(null)}
        onCriar={(item) => {
          setImportando(null);
          setCriando(item);
        }}
        onVinculado={() => setImportando(null)}
      />
      <ModalDialog
        open={criando !== null}
        onClose={() => setCriando(null)}
        labelledBy="game-dialog-title"
      >
        {criando && (
          <GameForm
            itemInicial={criando}
            onDone={() => setCriando(null)}
            onCancel={() => setCriando(null)}
            onLinkedExisting={() => setCriando(null)}
          />
        )}
      </ModalDialog>
    </div>
  );
}
