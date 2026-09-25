import { useEffect, useState } from 'react';
import { type Game, type ItemBiblioteca } from '@checkpoint/shared';
import { FieldError, LABEL, inputClass } from '@/shared/components/form-parts';
import { ModalDialog } from '@/shared/components/ModalDialog';
import { describeAuthError } from '@/features/auth/lib/auth-errors';
import { useGames } from '@/features/games/api/use-games';
import { useBiblioteca, useVincularJogo } from '../api/use-integracoes';
import { jogoAtualDoErro, precisaConfirmarPlataforma } from '../lib/biblioteca';
import { classificarFalhaDoCartao } from '../lib/estado-do-cartao';
import { horasCurtas } from '../lib/format';

const PROVEDOR = 'STEAM' as const;
const BUSCA_ATRASO_MS = 300;

const BOTAO =
  'min-h-11 min-w-11 rounded-xl px-4 font-display text-[13px] uppercase tracking-[0.1em] disabled:cursor-wait disabled:opacity-60';
const BOTAO_CONTORNO = `${BOTAO} border border-borda-controle font-semibold hover:bg-acao-hover`;
const BOTAO_PRIMARIO = `${BOTAO} bg-destaque font-extrabold text-fundo`;

/** Criar um jogo novo a partir da biblioteca, ou ligar um jogo que já existe (`jogo`) a um item dela. */
export type ModoBiblioteca = { tipo: 'novo' } | { tipo: 'vincular'; jogo: Game };

/** O jogo do catálogo a que um item vai ser ligado (só o que o diálogo precisa). */
interface AlvoDoVinculo {
  id: string;
  titulo: string;
  plataforma: string | null;
}

interface BibliotecaSteamDialogProps {
  open: boolean;
  modo: ModoBiblioteca;
  onClose: () => void;
  /** Modo `novo`: a pessoa escolheu "Criar jogo" para este item (quem abriu preenche o formulário). */
  onCriar?: (item: ItemBiblioteca) => void;
  /** O vínculo foi gravado (em qualquer modo): quem abriu decide para onde ir. */
  onVinculado: (jogoId: string) => void;
}

interface Conflito {
  alvo: AlvoDoVinculo;
  item: ItemBiblioteca;
  jogoAtual: { id: string; titulo: string };
}

function Capa({ url }: { url: string | null }) {
  return url ? (
    // Decorativa (o título está ao lado) e sem `Referer`: a imagem vem de um domínio da Steam.
    <img
      src={url}
      alt=""
      width={92}
      height={43}
      loading="lazy"
      referrerPolicy="no-referrer"
      className="h-[43px] w-[92px] shrink-0 rounded-md bg-painel-2 object-cover"
    />
  ) : (
    <div aria-hidden="true" className="h-[43px] w-[92px] shrink-0 rounded-md bg-painel-2" />
  );
}

function SeletorDeJogo({
  item,
  ocupado,
  onEscolher,
}: {
  item: ItemBiblioteca;
  ocupado: boolean;
  onEscolher: (alvo: AlvoDoVinculo) => void;
}) {
  const jogos = useGames();
  const [escolhido, setEscolhido] = useState('');
  const semVinculo = (jogos.data ?? []).filter((jogo) => jogo.dadosPlataforma.length === 0);
  const id = `outro-jogo-${item.idExterno}`;

  if (jogos.isPending) {
    return <p className="m-0 text-[16px] text-texto-suave">Carregando seus jogos…</p>;
  }
  if (semVinculo.length === 0) {
    return (
      <p className="m-0 text-[16px] text-texto-suave">
        Você não tem jogos sem vínculo com a Steam.
      </p>
    );
  }
  return (
    <div className="flex flex-col gap-2">
      <label htmlFor={id} className={LABEL}>
        Jogo que já tenho
      </label>
      <select
        id={id}
        value={escolhido}
        onChange={(event) => setEscolhido(event.target.value)}
        className={inputClass(false)}
      >
        <option value="">Escolha um jogo</option>
        {semVinculo.map((jogo) => (
          <option key={jogo.id} value={jogo.id}>
            {jogo.plataforma ? `${jogo.titulo} (${jogo.plataforma})` : jogo.titulo}
          </option>
        ))}
      </select>
      <button
        type="button"
        disabled={escolhido === '' || ocupado}
        onClick={() => {
          const jogo = semVinculo.find((candidato) => candidato.id === escolhido);
          if (jogo) {
            onEscolher(jogo);
          }
        }}
        className={`${BOTAO_PRIMARIO} self-start`}
      >
        Vincular
      </button>
    </div>
  );
}

function ItemDaLista({
  item,
  modo,
  ocupado,
  onCriar,
  onVincular,
}: {
  item: ItemBiblioteca;
  modo: ModoBiblioteca;
  ocupado: boolean;
  onCriar: (item: ItemBiblioteca) => void;
  onVincular: (alvo: AlvoDoVinculo, item: ItemBiblioteca) => void;
}) {
  const [escolhendoOutro, setEscolhendoOutro] = useState(false);
  const jaLigadoAoAlvo = modo.tipo === 'vincular' && item.vinculadoA?.id === modo.jogo.id;

  return (
    <li className="flex flex-col gap-3 rounded-xl bg-painel-2 p-3">
      <div className="flex min-w-0 items-center gap-3">
        <Capa url={item.capaUrl} />
        <div className="flex min-w-0 flex-col">
          <span className="text-[17px] font-semibold [overflow-wrap:anywhere]">{item.titulo}</span>
          <span className="text-[15px] text-texto-suave">{horasCurtas(item.minutosJogados)}</span>
        </div>
      </div>

      {item.vinculadoA && (
        <p className="m-0 text-[16px] text-texto-suave">
          {jaLigadoAoAlvo ? 'Já ligado a este jogo.' : `Já ligado a «${item.vinculadoA.titulo}»`}
        </p>
      )}

      {modo.tipo === 'vincular' && !jaLigadoAoAlvo && (
        <button
          type="button"
          disabled={ocupado}
          aria-label={`Vincular ${item.titulo} a ${modo.jogo.titulo}`}
          onClick={() => onVincular(modo.jogo, item)}
          className={`${BOTAO_PRIMARIO} self-start`}
        >
          Vincular a este jogo
        </button>
      )}

      {modo.tipo === 'novo' && !item.vinculadoA && (
        <div className="flex flex-col gap-2.5">
          {item.jogosParecidos.length > 0 && (
            <div className="flex flex-col gap-2">
              <p className="m-0 text-[16px] font-semibold">Já no seu catálogo:</p>
              <ul className="m-0 flex list-none flex-col gap-2 p-0">
                {item.jogosParecidos.map((parecido) => (
                  <li key={parecido.id} className="flex flex-wrap items-center gap-2.5">
                    <span className="min-w-0 text-[16px] [overflow-wrap:anywhere]">
                      {parecido.plataforma
                        ? `${parecido.titulo} (${parecido.plataforma})`
                        : parecido.titulo}
                    </span>
                    <button
                      type="button"
                      disabled={ocupado}
                      aria-label={`Vincular ${item.titulo} a ${parecido.titulo}`}
                      onClick={() => onVincular(parecido, item)}
                      className={BOTAO_CONTORNO}
                    >
                      Vincular a este
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}
          <div className="flex flex-wrap gap-2.5">
            <button
              type="button"
              disabled={ocupado}
              aria-label={`${item.jogosParecidos.length > 0 ? 'Criar outro jogo' : 'Criar jogo'}: ${item.titulo}`}
              onClick={() => onCriar(item)}
              className={BOTAO_PRIMARIO}
            >
              {item.jogosParecidos.length > 0 ? 'Criar outro jogo' : 'Criar jogo'}
            </button>
            <button
              type="button"
              aria-expanded={escolhendoOutro}
              aria-label={`Vincular ${item.titulo} a outro jogo que já tenho`}
              onClick={() => setEscolhendoOutro((aberto) => !aberto)}
              className={BOTAO_CONTORNO}
            >
              Vincular a outro jogo que já tenho
            </button>
          </div>
          {escolhendoOutro && (
            <SeletorDeJogo
              item={item}
              ocupado={ocupado}
              onEscolher={(alvo) => onVincular(alvo, item)}
            />
          )}
        </div>
      )}
    </li>
  );
}

function ConfirmarPlataforma({
  alvo,
  item,
  onConfirmar,
  onVoltar,
  ocupado,
}: {
  alvo: AlvoDoVinculo;
  item: ItemBiblioteca;
  onConfirmar: () => void;
  onVoltar: () => void;
  ocupado: boolean;
}) {
  return (
    <div role="group" aria-label="Confirmar a plataforma" className="flex flex-col gap-4">
      <p className="m-0 text-[19px]">
        «{alvo.titulo}» é um jogo de {alvo.plataforma}. Ao ligá-lo a «{item.titulo}», as horas e as
        conquistas mostradas serão as da Steam. A plataforma do jogo não muda.
      </p>
      <div className="flex flex-wrap justify-end gap-2.5">
        <button
          type="button"
          data-autofocus
          onClick={onVoltar}
          className={`${BOTAO_CONTORNO} min-h-12`}
        >
          Voltar
        </button>
        <button
          type="button"
          onClick={onConfirmar}
          disabled={ocupado}
          className={`${BOTAO_PRIMARIO} min-h-12`}
        >
          {ocupado ? 'Vinculando…' : 'Vincular mesmo assim'}
        </button>
      </div>
    </div>
  );
}

function ConflitoDeVinculo({
  conflito,
  onMover,
  onVoltar,
  ocupado,
}: {
  conflito: Conflito;
  onMover: () => void;
  onVoltar: () => void;
  ocupado: boolean;
}) {
  return (
    <div role="group" aria-label="Item já ligado a outro jogo" className="flex flex-col gap-4">
      <p className="m-0 text-[19px]">
        «{conflito.item.titulo}» já está ligado a «{conflito.jogoAtual.titulo}». Se você mover o
        vínculo, «{conflito.jogoAtual.titulo}» perde as horas e as conquistas da Steam e «
        {conflito.alvo.titulo}» passa a mostrá-las. Nada é copiado nem apagado dos jogos.
      </p>
      <div className="flex flex-wrap justify-end gap-2.5">
        <button
          type="button"
          data-autofocus
          onClick={onVoltar}
          className={`${BOTAO_CONTORNO} min-h-12`}
        >
          Voltar
        </button>
        <button
          type="button"
          onClick={onMover}
          disabled={ocupado}
          className={`${BOTAO_PRIMARIO} min-h-12`}
        >
          {ocupado ? 'Movendo…' : 'Mover o vínculo'}
        </button>
      </div>
    </div>
  );
}

function Conteudo({
  modo,
  onClose,
  onCriar,
  onVinculado,
}: Omit<BibliotecaSteamDialogProps, 'open'>) {
  const [busca, setBusca] = useState('');
  const [buscaAplicada, setBuscaAplicada] = useState('');
  const [pendente, setPendente] = useState<{ alvo: AlvoDoVinculo; item: ItemBiblioteca } | null>(
    null,
  );
  const [conflito, setConflito] = useState<Conflito | null>(null);
  const [erro, setErro] = useState('');
  const biblioteca = useBiblioteca(PROVEDOR, buscaAplicada, true);
  const vincular = useVincularJogo(PROVEDOR);

  // O debounce evita uma consulta por tecla: a busca só vai à API 300 ms depois de a pessoa parar de digitar.
  useEffect(() => {
    const timer = setTimeout(() => setBuscaAplicada(busca.trim()), BUSCA_ATRASO_MS);
    return () => clearTimeout(timer);
  }, [busca]);

  async function executar(alvo: AlvoDoVinculo, item: ItemBiblioteca, mover: boolean) {
    setErro('');
    try {
      await vincular.mutateAsync({ jogoId: alvo.id, idExterno: item.idExterno, mover });
      onVinculado(alvo.id);
    } catch (failure) {
      const jogoAtual = jogoAtualDoErro(failure);
      if (jogoAtual) {
        setPendente(null);
        setConflito({ alvo, item, jogoAtual });
        return;
      }
      setPendente(null);
      setErro(describeAuthError(failure).message);
    }
  }

  function pedirVinculo(alvo: AlvoDoVinculo, item: ItemBiblioteca) {
    setErro('');
    if (precisaConfirmarPlataforma(alvo.plataforma)) {
      setPendente({ alvo, item });
      return;
    }
    void executar(alvo, item, false);
  }

  const falha = biblioteca.isError ? classificarFalhaDoCartao(biblioteca.error) : undefined;
  const itens = biblioteca.data ?? [];
  const titulo = modo.tipo === 'novo' ? 'Buscar na Steam' : 'Vincular à Steam';

  return (
    <div className="sheet-pad flex max-h-[85dvh] flex-col gap-4 overflow-y-auto px-5 pt-6">
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 flex-col gap-1">
          <h2
            id="biblioteca-steam-titulo"
            className="m-0 font-display text-xl font-extrabold uppercase tracking-[0.12em] text-destaque"
          >
            {titulo}
          </h2>
          <p className="m-0 text-[16px] text-texto-suave">
            {modo.tipo === 'novo'
              ? 'Escolha um jogo da sua biblioteca para criar ou ligar a um jogo seu.'
              : `Escolha o jogo da Steam que é «${modo.jogo.titulo}».`}
          </p>
        </div>
        <button type="button" onClick={onClose} className={BOTAO_CONTORNO}>
          Fechar
        </button>
      </div>

      {pendente ? (
        <ConfirmarPlataforma
          alvo={pendente.alvo}
          item={pendente.item}
          ocupado={vincular.isPending}
          onVoltar={() => setPendente(null)}
          onConfirmar={() => void executar(pendente.alvo, pendente.item, false)}
        />
      ) : conflito ? (
        <ConflitoDeVinculo
          conflito={conflito}
          ocupado={vincular.isPending}
          onVoltar={() => setConflito(null)}
          onMover={() => void executar(conflito.alvo, conflito.item, true)}
        />
      ) : (
        <>
          <div className="flex flex-col gap-2">
            <label htmlFor="biblioteca-steam-busca" className={LABEL}>
              Buscar por título
            </label>
            <input
              id="biblioteca-steam-busca"
              type="search"
              value={busca}
              maxLength={100}
              autoComplete="off"
              data-autofocus
              onChange={(event) => setBusca(event.target.value)}
              className={inputClass(false)}
            />
          </div>

          <FieldError id="biblioteca-steam-erro" message={erro} />

          {biblioteca.isPending && (
            <p role="status" className="m-0 text-[16px] text-texto-suave">
              Carregando sua biblioteca…
            </p>
          )}
          {falha === 'privado' && (
            <p role="alert" className="m-0 text-[16px] font-semibold text-ouro">
              Seu perfil Steam está privado. Deixe o perfil e os detalhes do jogo públicos (o passo
              a passo está no seu Perfil) e tente de novo.
            </p>
          )}
          {(falha === 'erro' || falha === 'sem-conexao') && (
            <FieldError
              id="biblioteca-steam-falha"
              message={
                falha === 'sem-conexao'
                  ? 'Sem conexão. Tente de novo quando a conexão voltar.'
                  : 'Não foi possível falar com a Steam agora.'
              }
            />
          )}
          {falha !== undefined && (
            <button
              type="button"
              onClick={() => void biblioteca.refetch()}
              disabled={biblioteca.isFetching}
              className={`${BOTAO_CONTORNO} self-start`}
            >
              {biblioteca.isFetching ? 'Tentando…' : 'Tentar de novo'}
            </button>
          )}
          {biblioteca.isSuccess && itens.length === 0 && (
            <p className="m-0 text-[16px] text-texto-suave">
              {buscaAplicada
                ? `Nenhum jogo encontrado para «${buscaAplicada}».`
                : 'Sua biblioteca da Steam está vazia.'}
            </p>
          )}
          {itens.length > 0 && (
            <ul aria-label="Jogos da Steam" className="m-0 flex list-none flex-col gap-3 p-0">
              {itens.map((item) => (
                <ItemDaLista
                  key={item.idExterno}
                  item={item}
                  modo={modo}
                  ocupado={vincular.isPending}
                  onCriar={(escolhido) => onCriar?.(escolhido)}
                  onVincular={pedirVinculo}
                />
              ))}
            </ul>
          )}
        </>
      )}
    </div>
  );
}

/**
 * A biblioteca da Steam num diálogo (spec `integracao-plataformas`, etapa 3). No modo `novo`, cada item vira
 * "Criar jogo" (ou "Criar outro jogo", quando já há jogos parecidos no catálogo, que ganham "Vincular a este") e há
 * "Vincular a outro jogo que já tenho", com todos os jogos sem vínculo. No modo `vincular`, o jogo já está
 * escolhido. NUNCA vincula sozinho: todo vínculo é um clique. Jogo de outra plataforma pede confirmação; item já
 * ligado a outro jogo oferece "Mover o vínculo" (a API só move com `mover: true`).
 */
export function BibliotecaSteamDialog({ open, ...resto }: BibliotecaSteamDialogProps) {
  return (
    <ModalDialog open={open} onClose={resto.onClose} labelledBy="biblioteca-steam-titulo">
      <Conteudo {...resto} />
    </ModalDialog>
  );
}
