import { useState } from 'react';
import { type ContaVinculada, type PlataformaInfo, type Provedor } from '@checkpoint/shared';
import { plataformasDisponiveis } from '@checkpoint/shared';
import { FieldError } from '@/shared/components/form-parts';
import { PlataformaMarca } from '@/shared/components/PlataformaMarca';
import { describeAuthError } from '@/features/auth/lib/auth-errors';
import { useContas, useIniciarVinculo, useResumoPlataforma } from '../api/use-integracoes';
import { dataCurta } from '../lib/conquistas';
import { irPara } from '../lib/navegar';
import { atualizadoHaTexto } from '../lib/tempo-relativo';
import { urlDeVinculoSegura } from '../lib/vinculo-url';
import { PlataformaDialog } from './PlataformaDialog';
import { Esqueleto, Falha } from './ResumoPlataforma';
import { VincularCredencialDialog } from './VincularCredencialDialog';

// Cada plataforma é um cartão compacto (3 por linha no desktop, 2 no celular); a altura segue o conteúdo, sem sobra.
const QUADRADO =
  'flex min-h-28 min-w-0 flex-col gap-2 overflow-hidden rounded-2xl border border-borda bg-painel p-3 text-left';

/**
 * Uma plataforma que a pessoa já vinculou: linha minimizada com o marcador, o nome da conta e "atualizado há X". A linha
 * inteira é o botão que abre o popup. O "atualizado há X" só sai do que já está no cache (`enabled: false`): desenhar a
 * linha nunca chama a plataforma.
 */
function LinhaVinculada({
  plataforma,
  conta,
  onAbrir,
}: {
  plataforma: PlataformaInfo;
  conta: ContaVinculada;
  onAbrir: () => void;
}) {
  const provedor = plataforma.id as Provedor;
  const reautenticar = conta.estado === 'reautenticar';
  // O resumo entra no mesmo cache do popup (10 min no servidor): a linha mostra a foto e o "atualizado há X". Com a
  // conexão expirada a API responde 409 sem chamar a plataforma, então nem se pergunta.
  const cache = useResumoPlataforma(provedor, !reautenticar);
  const atualizado = cache.data ? atualizadoHaTexto(cache.data.consultadoEm) : null;
  const detalhe = atualizado ?? `Vinculada em ${dataCurta(conta.vinculadaEm) ?? '—'}`;
  const avatarUrl = cache.data?.avatarUrl ?? null;

  return (
    <button
      type="button"
      onClick={onAbrir}
      aria-haspopup="dialog"
      data-plataforma-linha={provedor}
      className={`${QUADRADO} w-full transition-colors hover:bg-acao-hover`}
    >
      <span className="flex items-start justify-between gap-2">
        <PlataformaMarca
          provedor={provedor}
          variante="logo"
          decorativa
          className="text-texto-suave"
        />
        {avatarUrl ? (
          <img
            src={avatarUrl}
            alt=""
            width={40}
            height={40}
            className="size-10 shrink-0 rounded-full border border-borda object-cover"
          />
        ) : null}
      </span>
      <span className="flex min-w-0 flex-col gap-2">
        <span className="flex min-w-0 flex-col">
          <span className="line-clamp-2 text-[16px] font-semibold leading-tight [overflow-wrap:anywhere]">
            {conta.nomeExibicao}
          </span>
          <span className="flex flex-wrap items-center gap-x-2 text-[12px] font-medium text-texto-suave">
            {detalhe}
            {reautenticar ? (
              <span className="rounded-full bg-painel-3 px-2 py-0.5 font-display text-[11px] font-bold uppercase tracking-[0.08em] text-ouro">
                Reconectar
              </span>
            ) : null}
          </span>
        </span>
      </span>
    </button>
  );
}

/** Uma plataforma disponível e ainda não vinculada: o nome e o botão "Vincular", com a logo oficial dela. */
function LinhaNaoVinculada({ plataforma }: { plataforma: PlataformaInfo }) {
  const provedor = plataforma.id as Provedor;
  const iniciar = useIniciarVinculo(provedor);
  const [erro, setErro] = useState('');
  const [colando, setColando] = useState(false);
  // O fluxo vem do cadastro: por credencial a pessoa cola um código aqui mesmo; por redirecionamento vai à plataforma.
  const porCredencial = plataforma.vinculo.tipo === 'credencial';

  async function onVincular() {
    setErro('');
    if (porCredencial) {
      setColando(true);
      return;
    }
    try {
      const { url } = await iniciar.mutateAsync();
      if (!urlDeVinculoSegura(plataforma, url)) {
        // A resposta não é a tela de login da plataforma: o navegador não vai para lugar nenhum.
        setErro('Não foi possível iniciar o vínculo. Tente de novo.');
        return;
      }
      irPara(url);
    } catch (failure) {
      setErro(describeAuthError(failure).message);
    }
  }

  return (
    <div data-plataforma-linha={provedor} className={QUADRADO}>
      <PlataformaMarca
        provedor={provedor}
        variante="logo"
        decorativa
        className="text-texto-suave"
      />
      <span className="line-clamp-3 text-[13px] leading-snug text-texto-suave">
        Veja as horas e {plataforma.vocabulario.artigo} {plataforma.vocabulario.conquistas} dos seus
        jogos.
      </span>
      <button
        type="button"
        onClick={() => void onVincular()}
        disabled={iniciar.isPending}
        aria-label={`Vincular conta ${plataforma.nome}`}
        className="inline-flex min-h-11 items-center justify-center rounded-full border border-borda-controle bg-painel-2 px-4 font-display text-[15px] font-bold transition-colors hover:bg-acao-hover disabled:cursor-wait disabled:opacity-60"
      >
        <span aria-hidden="true">{iniciar.isPending ? 'Abrindo…' : 'Vincular'}</span>
      </button>
      <FieldError id={`${plataforma.slug}-vincular-erro`} message={erro} />
      {porCredencial ? (
        <VincularCredencialDialog
          open={colando}
          plataforma={plataforma}
          onClose={() => setColando(false)}
        />
      ) : null}
    </div>
  );
}

/**
 * A seção **Plataformas** do `/perfil` (entre "Conta" e "Preferências"; spec `plataformas-e-pagina-do-jogo`, F3): uma
 * linha por plataforma do cadastro que já tem suporte (as outras nem aparecem). Vinculada: linha minimizada que abre o
 * popup; não vinculada: nome e "Vincular". As contas vêm de `['integracoes', 'contas']`; nada aqui quebra o resto do
 * `/perfil`.
 */
export function PlataformasDoPerfil() {
  const contas = useContas();
  const [aberta, setAberta] = useState<Provedor | null>(null);
  const [reconectando, setReconectando] = useState<Provedor | null>(null);

  let corpo;
  if (contas.isPending) {
    corpo = <Esqueleto rotulo="Carregando contas vinculadas" />;
  } else if (contas.isError) {
    corpo = (
      <Falha
        mensagem={describeAuthError(contas.error).message}
        onTentarDeNovo={() => void contas.refetch()}
        tentando={contas.isFetching}
      />
    );
  } else {
    const dados = contas.data;
    corpo = plataformasDisponiveis().map((plataforma) => {
      const conta = dados.find((candidata) => candidata.provedor === plataforma.id);
      return (
        <div key={plataforma.id} className="contents">
          {conta ? (
            <>
              <LinhaVinculada
                plataforma={plataforma}
                conta={conta}
                onAbrir={() =>
                  conta.estado === 'reautenticar'
                    ? setReconectando(plataforma.id as Provedor)
                    : setAberta(plataforma.id as Provedor)
                }
              />
              <PlataformaDialog
                open={aberta === plataforma.id}
                plataforma={plataforma}
                conta={conta}
                onClose={() => setAberta(null)}
              />
              {plataforma.vinculo.tipo === 'credencial' ? (
                <VincularCredencialDialog
                  open={reconectando === plataforma.id}
                  plataforma={plataforma}
                  reautenticar
                  onClose={() => setReconectando(null)}
                />
              ) : null}
            </>
          ) : (
            <LinhaNaoVinculada plataforma={plataforma} />
          )}
        </div>
      );
    });
  }

  return (
    <section aria-label="Plataformas" className="flex flex-col gap-2">
      <h2 className="m-0 px-1 font-display text-sm font-bold uppercase tracking-[0.14em] text-texto-suave">
        Plataformas
      </h2>
      {contas.isPending || contas.isError ? (
        <div className="overflow-hidden rounded-2xl bg-painel">{corpo}</div>
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">{corpo}</div>
      )}
    </section>
  );
}
