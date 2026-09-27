import { useEffect, useState } from 'react';
import {
  PLATAFORMAS,
  type Game,
  type ItemBiblioteca,
  type PlataformaInfo,
  type Provedor,
} from '@checkpoint/shared';
import { FieldError, LABEL, inputClass } from '@/shared/components/form-parts';
import { ModalDialog } from '@/shared/components/ModalDialog';
import { describeAuthError } from '@/features/auth/lib/auth-errors';
import { useGames } from '@/features/games/api/use-games';
import { Chek } from '@/shared/components/Chek/Chek';
import { Icon } from '@/shared/components/Icon';
import { PlataformaMarca } from '@/shared/components/PlataformaMarca';
import { useBiblioteca, useVincularJogo } from '../api/use-integracoes';
import { jogoAtualDoErro, precisaConfirmarPlataforma } from '../lib/biblioteca';
import {
  comPlataforma,
  dePlataforma,
  horasEConquistas,
  naPlataforma,
  textoDaConfirmacaoDePlataforma,
} from '../lib/plataforma-texto';
import { classificarFalhaDoCartao } from '../lib/estado-do-cartao';
import { horasCurtas } from '../lib/format';
import { avisar } from '@/shared/lib/avisos';

const BUSCA_ATRASO_MS = 300;

const BOTAO =
  'min-h-11 min-w-11 rounded-full px-4 font-display text-[15px] disabled:cursor-wait disabled:opacity-60 font-bold';
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

interface BibliotecaPlataformaDialogProps {
  /** De qual plataforma é a biblioteca (Steam, PlayStation…): os textos e o formato da capa saem do cadastro. */
  provedor: Provedor;
  /** O backlog: só os itens nunca abertos (0 minutos). */
  soNuncaJogados?: boolean;
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

/**
 * A capa tem a proporção da imagem que a plataforma entrega (Steam: cabeçalho 460x215; PlayStation: o ícone quadrado
 * do jogo), então nada é cortado. O formato vem do cadastro (`capaNaBusca`).
 */
function Capa({ url, formato }: { url: string | null; formato: PlataformaInfo['capaNaBusca'] }) {
  const quadrada = formato === 'quadrada';
  return (
    <div
      className={`${quadrada ? 'aspect-square w-[72px] sm:w-[84px]' : 'aspect-[460/215] w-[120px] sm:w-[148px]'} shrink-0 overflow-hidden rounded-lg bg-painel-3 shadow-[0_4px_14px_rgb(0_0_0/0.35)]`}
    >
      {url ? (
        // Decorativa (o título está ao lado) e sem `Referer`: a imagem vem de um domínio da plataforma.
        <img
          src={url}
          alt=""
          width={quadrada ? 84 : 460}
          height={quadrada ? 84 : 215}
          loading="lazy"
          referrerPolicy="no-referrer"
          className="size-full object-cover transition-transform duration-[var(--mov-enfase)] ease-[var(--ease-entrada)] group-hover:scale-105"
        />
      ) : null}
    </div>
  );
}

function SeletorDeJogo({
  item,
  plataforma,
  ocupado,
  onEscolher,
}: {
  item: ItemBiblioteca;
  plataforma: PlataformaInfo;
  ocupado: boolean;
  onEscolher: (alvo: AlvoDoVinculo) => void;
}) {
  const jogos = useGames();
  const [escolhido, setEscolhido] = useState('');
  // O vínculo é 1 para 1 POR plataforma: um jogo já ligado à Steam ainda pode ser ligado à PlayStation.
  const semVinculo = (jogos.data ?? []).filter(
    (jogo) => !jogo.dadosPlataforma.some((dados) => dados.provedor === plataforma.id),
  );
  const id = `outro-jogo-${item.idExterno}`;

  if (jogos.isPending) {
    return <p className="m-0 text-[16px] text-texto-suave">Carregando seus jogos…</p>;
  }
  if (semVinculo.length === 0) {
    return (
      <p className="m-0 text-[16px] text-texto-suave">
        Você não tem jogos sem vínculo {comPlataforma(plataforma)}.
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
  plataforma,
  modo,
  ocupado,
  onCriar,
  onVincular,
  indice,
}: {
  indice: number;
  plataforma: PlataformaInfo;
  item: ItemBiblioteca;
  modo: ModoBiblioteca;
  ocupado: boolean;
  onCriar: (item: ItemBiblioteca) => void;
  onVincular: (alvo: AlvoDoVinculo, item: ItemBiblioteca) => void;
}) {
  const [escolhendoOutro, setEscolhendoOutro] = useState(false);
  const jaLigadoAoAlvo = modo.tipo === 'vincular' && item.vinculadoA?.id === modo.jogo.id;

  return (
    <li
      // Entrada em cascata (só opacity e transform; as primeiras 8 linhas, o resto entra junto).
      style={{ animationDelay: `${Math.min(indice, 8) * 45}ms`, animationFillMode: 'backwards' }}
      className="update-in group flex flex-col gap-3 rounded-2xl border border-borda bg-painel-2 p-3 transition-[transform,border-color] duration-[var(--mov-padrao)] ease-[var(--ease-entrada)] hover:-translate-y-0.5 hover:border-borda-controle"
    >
      <div className="flex min-w-0 items-center gap-3.5">
        <Capa url={item.capaUrl} formato={plataforma.capaNaBusca} />
        <div className="flex min-w-0 flex-col gap-1">
          <span className="font-display text-[18px] font-bold leading-tight tracking-[-0.01em] [overflow-wrap:anywhere]">
            {item.titulo}
          </span>
          <span className="inline-flex items-center gap-1 text-[14px] font-medium text-texto-suave">
            <Icon name="schedule" size={16} />
            {horasCurtas(item.minutosJogados)}
          </span>
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

      {modo.tipo === 'novo' && (
        <div className="flex flex-col gap-2.5">
          {!item.vinculadoA && item.jogosParecidos.length > 0 && (
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
            {!item.vinculadoA && (
              <button
                type="button"
                disabled={ocupado}
                aria-label={`${item.jogosParecidos.length > 0 ? 'Criar outro jogo' : 'Criar jogo'}: ${item.titulo}`}
                onClick={() => onCriar(item)}
                className={BOTAO_PRIMARIO}
              >
                {item.jogosParecidos.length > 0 ? 'Criar outro jogo' : 'Criar jogo'}
              </button>
            )}
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
              plataforma={plataforma}
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
  plataforma,
  onConfirmar,
  onVoltar,
  ocupado,
}: {
  plataforma: PlataformaInfo;
  alvo: AlvoDoVinculo;
  item: ItemBiblioteca;
  onConfirmar: () => void;
  onVoltar: () => void;
  ocupado: boolean;
}) {
  return (
    <div role="group" aria-label="Confirmar a plataforma" className="flex flex-col gap-4">
      <p className="m-0 text-[19px]">
        «{alvo.titulo}» é um jogo de {alvo.plataforma}. Ao ligá-lo a «{item.titulo}»,{' '}
        {textoDaConfirmacaoDePlataforma(plataforma)}. A plataforma do jogo não muda.
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
  plataforma,
  onMover,
  onVoltar,
  ocupado,
}: {
  conflito: Conflito;
  plataforma: PlataformaInfo;
  onMover: () => void;
  onVoltar: () => void;
  ocupado: boolean;
}) {
  return (
    <div role="group" aria-label="Item já ligado a outro jogo" className="flex flex-col gap-4">
      <p className="m-0 text-[19px]">
        «{conflito.item.titulo}» já está ligado a «{conflito.jogoAtual.titulo}». Se você mover o
        vínculo, «{conflito.jogoAtual.titulo}» perde {horasEConquistas(plataforma)}{' '}
        {dePlataforma(plataforma)} e «{conflito.alvo.titulo}» passa a mostrá-las. Nada é copiado nem
        apagado dos jogos.
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
  provedor,
  modo,
  onClose,
  onCriar,
  onVinculado,
  soNuncaJogados = false,
}: Omit<BibliotecaPlataformaDialogProps, 'open'>) {
  const plataforma = PLATAFORMAS[provedor];
  const [busca, setBusca] = useState('');
  const [buscaAplicada, setBuscaAplicada] = useState('');
  const [pendente, setPendente] = useState<{ alvo: AlvoDoVinculo; item: ItemBiblioteca } | null>(
    null,
  );
  const [conflito, setConflito] = useState<Conflito | null>(null);
  const [erro, setErro] = useState('');
  const biblioteca = useBiblioteca(provedor, buscaAplicada, true, soNuncaJogados);
  const vincular = useVincularJogo(provedor);

  // O debounce evita uma consulta por tecla: a busca só vai à API 300 ms depois de a pessoa parar de digitar.
  useEffect(() => {
    const timer = setTimeout(() => setBuscaAplicada(busca.trim()), BUSCA_ATRASO_MS);
    return () => clearTimeout(timer);
  }, [busca]);

  async function executar(alvo: AlvoDoVinculo, item: ItemBiblioteca, mover: boolean) {
    setErro('');
    try {
      await vincular.mutateAsync({ jogoId: alvo.id, idExterno: item.idExterno, mover });
      avisar({ texto: `Jogo vinculado ${plataforma.ligadoA}.` });
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
    if (precisaConfirmarPlataforma(alvo.plataforma, plataforma)) {
      setPendente({ alvo, item });
      return;
    }
    void executar(alvo, item, false);
  }

  const falha = biblioteca.isError ? classificarFalhaDoCartao(biblioteca.error) : undefined;
  const itens = biblioteca.data ?? [];
  const titulo =
    modo.tipo === 'novo' ? `Buscar ${naPlataforma(plataforma)}` : `Vincular ${plataforma.ligadoA}`;

  return (
    <div className="sheet-pad flex max-h-[85dvh] flex-col gap-4 overflow-y-auto px-5 pt-6">
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 flex-col gap-1">
          <h2
            id="biblioteca-plataforma-titulo"
            className="m-0 flex items-center gap-2 font-display text-xl font-extrabold tracking-[-0.01em] text-destaque"
          >
            <PlataformaMarca provedor={provedor} variante="marcador" tamanho="g" decorativa />
            {titulo}
          </h2>
          <p className="m-0 text-[16px] text-texto-suave">
            {soNuncaJogados
              ? 'Só os jogos que você nunca abriu. Escolha um para criar ou ligar a um jogo seu.'
              : modo.tipo === 'novo'
                ? 'Escolha um jogo da sua biblioteca para criar ou ligar a um jogo seu.'
                : `Escolha o jogo ${dePlataforma(plataforma)} que é «${modo.jogo.titulo}».`}
          </p>
        </div>
        <button type="button" onClick={onClose} className={`${BOTAO_CONTORNO} shrink-0`}>
          Fechar
        </button>
      </div>

      {pendente ? (
        <ConfirmarPlataforma
          plataforma={plataforma}
          alvo={pendente.alvo}
          item={pendente.item}
          ocupado={vincular.isPending}
          onVoltar={() => setPendente(null)}
          onConfirmar={() => void executar(pendente.alvo, pendente.item, false)}
        />
      ) : conflito ? (
        <ConflitoDeVinculo
          plataforma={plataforma}
          conflito={conflito}
          ocupado={vincular.isPending}
          onVoltar={() => setConflito(null)}
          onMover={() => void executar(conflito.alvo, conflito.item, true)}
        />
      ) : (
        <>
          <div className="flex flex-col gap-2">
            <label htmlFor="biblioteca-plataforma-busca" className={LABEL}>
              Buscar por título
            </label>
            <input
              id="biblioteca-plataforma-busca"
              type="search"
              value={busca}
              maxLength={100}
              autoComplete="off"
              data-autofocus
              onChange={(event) => setBusca(event.target.value)}
              className={inputClass(false)}
            />
          </div>

          <FieldError id="biblioteca-plataforma-erro" message={erro} />

          {biblioteca.isPending && (
            <div role="status" aria-busy="true" className="flex flex-col gap-2.5">
              <p className="sr-only">Carregando sua biblioteca…</p>
              {[0, 1, 2].map((indice) => (
                <div
                  key={indice}
                  aria-hidden="true"
                  className="flex flex-col gap-3 rounded-2xl border border-borda bg-painel-2 p-3"
                >
                  <div className="flex items-center gap-3.5">
                    <div className="skeleton aspect-[460/215] w-[120px] shrink-0 rounded-lg sm:w-[148px]" />
                    <div className="flex flex-1 flex-col gap-2">
                      <div className="skeleton h-4 w-3/4 rounded-full" />
                      <div className="skeleton h-3 w-1/4 rounded-full" />
                    </div>
                  </div>
                  <div className="flex gap-2.5">
                    <div className="skeleton h-11 w-28 rounded-full" />
                    <div className="skeleton h-11 w-44 rounded-full" />
                  </div>
                </div>
              ))}
            </div>
          )}
          {falha === 'privado' && (
            <div className="flex flex-col items-center gap-3 py-4 text-center">
              <Chek expressao="cadeado" altura={72} />
              <p role="alert" className="m-0 text-[16px] font-semibold text-ouro">
                Seu perfil {plataforma.nome} está privado.{' '}
                {plataforma.privacidade
                  ? 'Deixe o perfil e os detalhes do jogo públicos (o passo a passo está no seu Perfil) e tente de novo.'
                  : 'Deixe-o público e tente de novo.'}
              </p>
            </div>
          )}
          {(falha === 'erro' || falha === 'sem-conexao') && (
            <FieldError
              id="biblioteca-plataforma-falha"
              message={
                falha === 'sem-conexao'
                  ? 'Sem conexão. Tente de novo quando a conexão voltar.'
                  : `Não foi possível falar ${comPlataforma(plataforma)} agora.`
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
            <div className="flex flex-col items-center gap-3 py-6 text-center">
              <Chek expressao="dormindo" altura={72} />
              <p className="m-0 text-[16px] text-texto-suave">
                {buscaAplicada
                  ? `Nenhum jogo encontrado para «${buscaAplicada}».`
                  : soNuncaJogados
                    ? `Você não tem jogos nunca abertos ${naPlataforma(plataforma)}.`
                    : `Sua biblioteca ${dePlataforma(plataforma)} está vazia.`}
              </p>
            </div>
          )}
          {itens.length > 0 && (
            <ul
              aria-label={`Jogos ${dePlataforma(plataforma)}`}
              className="m-0 flex list-none flex-col gap-3 p-0"
            >
              {itens.map((item, indice) => (
                <ItemDaLista
                  key={item.idExterno}
                  plataforma={plataforma}
                  indice={indice}
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
 * A biblioteca de uma plataforma num diálogo (spec `integracao-plataformas`, etapa 3; genérica por `provedor` na spec
 * `integracao-playstation`, F2: "Buscar na Steam", "Buscar na PlayStation"). No modo `novo`, cada item vira
 * "Criar jogo" (ou "Criar outro jogo", quando já há jogos parecidos no catálogo, que ganham "Vincular a este") e há
 * "Vincular a outro jogo que já tenho", com todos os jogos sem vínculo. No modo `vincular`, o jogo já está
 * escolhido. NUNCA vincula sozinho: todo vínculo é um clique. Jogo de outra plataforma pede confirmação; item já
 * ligado a outro jogo oferece "Mover o vínculo" (a API só move com `mover: true`).
 */
export function BibliotecaPlataformaDialog({ open, ...resto }: BibliotecaPlataformaDialogProps) {
  return (
    <ModalDialog open={open} onClose={resto.onClose} labelledBy="biblioteca-plataforma-titulo">
      <Conteudo {...resto} />
    </ModalDialog>
  );
}
