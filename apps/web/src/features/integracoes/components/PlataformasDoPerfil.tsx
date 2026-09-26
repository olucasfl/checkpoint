import { useState } from 'react';
import { type ContaVinculada, type PlataformaInfo, type Provedor } from '@checkpoint/shared';
import { plataformasDisponiveis } from '@checkpoint/shared';
import { FieldError } from '@/shared/components/form-parts';
import { Icon } from '@/shared/components/Icon';
import { PlataformaMarca } from '@/shared/components/PlataformaMarca';
import { describeAuthError } from '@/features/auth/lib/auth-errors';
import { useContas, useIniciarVinculo, usePerfilPlataforma } from '../api/use-integracoes';
import { dataCurta } from '../lib/conquistas';
import { irPara } from '../lib/navegar';
import { urlDaSteamSegura } from '../lib/steam-url';
import { atualizadoHaTexto } from '../lib/tempo-relativo';
import { PlataformaDialog } from './PlataformaDialog';
import { Esqueleto, Falha } from './ResumoSteam';

const LINHA = 'flex min-w-0 items-center gap-3 px-4 py-3 text-left';

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
  const cache = usePerfilPlataforma(provedor, false);
  const atualizado = cache.data ? atualizadoHaTexto(cache.data.consultadoEm) : null;
  const detalhe = atualizado ?? `Vinculada em ${dataCurta(conta.vinculadaEm) ?? '—'}`;

  return (
    <button
      type="button"
      onClick={onAbrir}
      aria-haspopup="dialog"
      data-plataforma-linha={provedor}
      className={`${LINHA} min-h-14 w-full transition-colors hover:bg-acao-hover`}
    >
      <PlataformaMarca provedor={provedor} variante="marcador" tamanho="g" decorativa />
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="font-display text-[15px] font-bold text-texto-suave">
          {plataforma.nome}
        </span>
        <span className="text-[17px] font-semibold [overflow-wrap:anywhere]">
          {conta.nomeExibicao}
        </span>
        <span className="text-[13px] font-medium text-texto-suave">{detalhe}</span>
      </span>
      <Icon name="chevron_right" size={24} className="shrink-0 text-texto-suave" />
    </button>
  );
}

/** Uma plataforma disponível e ainda não vinculada: o nome e o botão "Vincular", com a logo oficial dela. */
function LinhaNaoVinculada({ plataforma }: { plataforma: PlataformaInfo }) {
  const provedor = plataforma.id as Provedor;
  const iniciar = useIniciarVinculo(provedor);
  const [erro, setErro] = useState('');

  async function onVincular() {
    setErro('');
    try {
      const { url } = await iniciar.mutateAsync();
      if (!urlDaSteamSegura(url)) {
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
    <div data-plataforma-linha={provedor} className="flex flex-col gap-3 p-4">
      <div className="flex items-center gap-3">
        <PlataformaMarca provedor={provedor} variante="marcador" tamanho="g" decorativa />
        <div className="flex min-w-0 flex-col">
          <span className="text-[19px] font-semibold">{plataforma.nome}</span>
          <span className="text-[16px] text-texto-suave">
            Veja as horas e as conquistas dos seus jogos.
          </span>
        </div>
      </div>
      <button
        type="button"
        onClick={() => void onVincular()}
        disabled={iniciar.isPending}
        aria-label={`Vincular conta ${plataforma.nome}`}
        className="inline-flex min-h-11 items-center gap-3 self-start rounded-full border border-borda-controle bg-painel-2 pr-5 font-display text-[15px] font-bold transition-colors hover:bg-acao-hover disabled:cursor-wait disabled:opacity-60"
      >
        {/* A logo oficial fica sozinha, com o espaço livre dela; o texto do botão vem depois, separado. */}
        <PlataformaMarca provedor={provedor} variante="logo" decorativa />
        <span aria-hidden="true">{iniciar.isPending ? 'Abrindo…' : 'Vincular'}</span>
      </button>
      <FieldError id={`${plataforma.slug}-vincular-erro`} message={erro} />
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
        <div key={plataforma.id} className="border-b border-borda last:border-b-0">
          {conta ? (
            <>
              <LinhaVinculada
                plataforma={plataforma}
                conta={conta}
                onAbrir={() => setAberta(plataforma.id as Provedor)}
              />
              <PlataformaDialog
                open={aberta === plataforma.id}
                plataforma={plataforma}
                conta={conta}
                onClose={() => setAberta(null)}
              />
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
      <div className="overflow-hidden rounded-2xl bg-painel">{corpo}</div>
    </section>
  );
}
