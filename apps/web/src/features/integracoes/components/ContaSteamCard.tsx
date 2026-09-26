import { Chek } from '@/shared/components/Chek/Chek';
import { RotuloPendente } from '@/shared/components/RotuloPendente';
import { useState } from 'react';
import { type PerfilPlataforma } from '@checkpoint/shared';
import { FieldError } from '@/shared/components/form-parts';
import { Icon } from '@/shared/components/Icon';
import { ModalDialog } from '@/shared/components/ModalDialog';
import { describeAuthError } from '@/features/auth/lib/auth-errors';
import {
  useAtualizarPerfil,
  useContas,
  useDesvincular,
  useIniciarVinculo,
  usePerfilPlataforma,
} from '../api/use-integracoes';
import { classificarFalhaDoCartao } from '../lib/estado-do-cartao';
import { horasCurtas, textoDasConquistas } from '../lib/format';
import { irPara } from '../lib/navegar';
import { urlDaSteamSegura } from '../lib/steam-url';
import { avisar } from '@/shared/lib/avisos';

const PROVEDOR = 'STEAM' as const;

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

function Esqueleto({ rotulo }: { rotulo: string }) {
  return (
    <div role="status" aria-label={rotulo} className="flex flex-col gap-3 p-4">
      <div className="h-6 w-1/3 rounded-lg bg-painel-2" />
      <div className="h-4 w-2/3 rounded-lg bg-painel-2" />
      <div className="h-4 w-1/2 rounded-lg bg-painel-2" />
    </div>
  );
}

function Cabecalho({ nome, avatarUrl }: { nome: string; avatarUrl?: string | null }) {
  return (
    <div className="flex min-w-0 items-center gap-3">
      {avatarUrl ? (
        // Decorativo (o nome já está ao lado) e sem `Referer`: a imagem vem de um domínio da Steam.
        <img
          src={avatarUrl}
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
      <div className="flex min-w-0 flex-col">
        <span className="font-display text-[15px] font-bold text-texto-suave">Steam</span>
        <span className="text-[19px] font-semibold [overflow-wrap:anywhere]">{nome}</span>
      </div>
    </div>
  );
}

function SemVinculo() {
  const iniciar = useIniciarVinculo(PROVEDOR);
  const [erro, setErro] = useState('');

  async function onVincular() {
    setErro('');
    try {
      const { url } = await iniciar.mutateAsync();
      if (!urlDaSteamSegura(url)) {
        // A resposta não é a tela de login da Steam: o navegador não vai para lugar nenhum.
        setErro('Não foi possível iniciar o vínculo. Tente de novo.');
        return;
      }
      irPara(url);
    } catch (failure) {
      setErro(describeAuthError(failure).message);
    }
  }

  return (
    <div className="flex flex-col gap-3 p-4">
      <div className="flex items-center gap-3">
        <Icon name="sports_esports" size={28} className="shrink-0 text-texto-suave" />
        <div className="flex min-w-0 flex-col">
          <span className="text-[19px] font-semibold">Steam</span>
          <span className="text-[16px] text-texto-suave">
            Veja as horas e as conquistas dos seus jogos.
          </span>
        </div>
      </div>
      <button
        type="button"
        onClick={() => void onVincular()}
        disabled={iniciar.isPending}
        className={`${BOTAO_PRIMARIO} self-start`}
      >
        {iniciar.isPending ? 'Abrindo a Steam…' : 'Vincular conta'}
      </button>
      <FieldError id="steam-vincular-erro" message={erro} />
    </div>
  );
}

function Falha({
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

function Estatistica({ rotulo, valor }: { rotulo: string; valor: string }) {
  return (
    <div className="flex flex-col rounded-xl bg-painel-2 px-3 py-2.5">
      <dt className="text-[14px] font-semibold uppercase tracking-[0.08em] text-texto-suave">
        {rotulo}
      </dt>
      <dd className="m-0 font-display text-[20px] font-bold">{valor}</dd>
    </div>
  );
}

function DadosDoPerfil({ perfil }: { perfil: PerfilPlataforma }) {
  return (
    <div className="flex flex-col gap-3">
      <dl className="m-0 grid grid-cols-2 gap-2.5">
        <Estatistica rotulo="Jogos" valor={String(perfil.totalJogos)} />
        <Estatistica rotulo="Horas" valor={horasCurtas(perfil.minutosTotais)} />
      </dl>
      <p className="m-0 text-[16px]">{textoDasConquistas(perfil.conquistas)}</p>
      {perfil.totalJogos === 0 ? (
        <p className="m-0 text-[16px] text-texto-suave">Nenhum jogo na sua biblioteca.</p>
      ) : (
        perfil.maisJogados.length > 0 && (
          <div className="flex flex-col gap-1.5">
            <h3 className="m-0 text-[14px] font-semibold uppercase tracking-[0.08em] text-texto-suave">
              Mais jogados
            </h3>
            <ol className="m-0 flex list-none flex-col gap-1.5 p-0">
              {perfil.maisJogados.map((jogo) => (
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
          </div>
        )
      )}
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

function ContaVinculadaCartao({ nomeGravado }: { nomeGravado: string }) {
  const perfil = usePerfilPlataforma(PROVEDOR, true);
  const atualizar = useAtualizarPerfil(PROVEDOR);
  const desvincular = useDesvincular(PROVEDOR);
  const [confirmando, setConfirmando] = useState(false);
  const [erroAtualizar, setErroAtualizar] = useState('');
  const [erroDesvincular, setErroDesvincular] = useState('');

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

  const dados = perfil.data;
  const falha = dados
    ? undefined
    : perfil.isError
      ? classificarFalhaDoCartao(perfil.error)
      : undefined;
  const tentando = perfil.isFetching;

  return (
    <div className="flex flex-col gap-4 p-4">
      <Cabecalho nome={dados?.nomeExibicao ?? nomeGravado} avatarUrl={dados?.avatarUrl} />

      {perfil.isPending && <Esqueleto rotulo="Carregando sua conta Steam" />}
      {dados && <DadosDoPerfil perfil={dados} />}
      {falha === 'privado' && (
        <PerfilPrivado onTentarDeNovo={() => void perfil.refetch()} tentando={tentando} />
      )}
      {(falha === 'erro' || falha === 'sem-conexao') && (
        <Falha
          mensagem={
            falha === 'sem-conexao'
              ? 'Sem conexão. Tente de novo quando a conexão voltar.'
              : 'Não foi possível falar com a Steam agora.'
          }
          onTentarDeNovo={() => void perfil.refetch()}
          tentando={tentando}
        />
      )}

      <FieldError id="steam-atualizar-erro" message={erroAtualizar} />
      <div className="flex flex-wrap gap-2.5">
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

      <DesvincularDialog
        open={confirmando}
        onClose={() => setConfirmando(false)}
        onConfirmar={() => void onDesvincular()}
        desvinculando={desvincular.isPending}
        erro={erroDesvincular}
      />
    </div>
  );
}

/**
 * O cartão Steam do `/perfil` (spec `integracao-plataformas`, etapa 2). Sem vínculo: "Vincular conta", que leva
 * à Steam (só se a URL for a tela de login dela). Com vínculo: nome e avatar, jogos, horas, conquistas dos jogos
 * vinculados e os mais jogados, com Atualizar e Desvincular (com confirmação). Perfil privado mostra o passo a
 * passo e "Tentar de novo"; falha da Steam e falta de conexão têm mensagem própria. A conta vem de `['integracoes']`;
 * o cartão, só depois de saber que há conta. Nada aqui quebra o resto do `/perfil`.
 */
export function ContaSteamCard() {
  const contas = useContas();

  if (contas.isPending) {
    return <Esqueleto rotulo="Carregando contas vinculadas" />;
  }
  if (contas.isError) {
    return (
      <Falha
        mensagem={describeAuthError(contas.error).message}
        onTentarDeNovo={() => void contas.refetch()}
        tentando={contas.isFetching}
      />
    );
  }
  const conta = contas.data.find((candidata) => candidata.provedor === PROVEDOR);
  return conta ? <ContaVinculadaCartao nomeGravado={conta.nomeExibicao} /> : <SemVinculo />;
}
