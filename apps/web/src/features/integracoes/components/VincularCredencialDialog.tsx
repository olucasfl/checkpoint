import { useState, type FormEvent } from 'react';
import { type PlataformaInfo, type Provedor } from '@checkpoint/shared';
import { describeAuthError } from '@/features/auth/lib/auth-errors';
import { Chek } from '@/shared/components/Chek/Chek';
import { FieldError, LABEL, inputClass } from '@/shared/components/form-parts';
import { Icon } from '@/shared/components/Icon';
import { ModalDialog } from '@/shared/components/ModalDialog';
import { PlataformaMarca } from '@/shared/components/PlataformaMarca';
import { avisar } from '@/shared/lib/avisos';
import { useVincularComCredencial } from '../api/use-integracoes';
import { comPlataforma } from '../lib/plataforma-texto';

const TITULO_ID = 'vincular-credencial-titulo';
const CAMPO_ID = 'vincular-credencial-campo';
const ERRO_ID = 'vincular-credencial-erro';

const BOTAO =
  'min-h-11 min-w-11 rounded-full px-4 font-display text-[15px] disabled:cursor-wait disabled:opacity-60 font-bold';
const BOTAO_CONTORNO = `${BOTAO} border border-borda-controle font-semibold hover:bg-acao-hover`;
const BOTAO_PRIMARIO = `${BOTAO} bg-destaque font-extrabold text-fundo`;

interface VincularCredencialDialogProps {
  open: boolean;
  plataforma: PlataformaInfo;
  /** A conexão expirou (o refresh guardado não vale mais): a conta e os jogos ligados continuam, só falta a credencial nova. */
  reautenticar?: boolean;
  onClose: () => void;
}

function Conteudo({
  plataforma,
  reautenticar = false,
  onClose,
}: Omit<VincularCredencialDialogProps, 'open'>) {
  const provedor = plataforma.id as Provedor;
  const { vinculo } = plataforma;
  const vincular = useVincularComCredencial(provedor);
  // O valor vive SÓ neste estado: some ao enviar, ao fechar (o conteúdo desmonta com o diálogo) e em erro. Nunca
  // no armazenamento local, na URL nem no cache do TanStack Query (a mutação é resetada logo depois do envio).
  const [credencial, setCredencial] = useState('');
  const [erro, setErro] = useState('');

  if (vinculo.tipo !== 'credencial') {
    return null;
  }

  async function enviar(event: FormEvent) {
    event.preventDefault();
    if (vincular.isPending || credencial.trim() === '') {
      return;
    }
    const enviada = credencial.trim();
    setErro('');
    setCredencial('');
    try {
      await vincular.mutateAsync(enviada);
      vincular.reset();
      avisar({ texto: `${plataforma.rotuloDaConta} vinculada.` });
      onClose();
    } catch (failure) {
      vincular.reset();
      setErro(describeAuthError(failure).message);
    }
  }

  return (
    <form
      onSubmit={(event) => void enviar(event)}
      noValidate
      className="sheet-pad flex max-h-[85dvh] flex-col gap-4 overflow-y-auto px-5 pt-6"
    >
      <div className="flex items-start justify-between gap-3">
        <h2
          id={TITULO_ID}
          className="m-0 flex items-center gap-2 font-display text-xl font-extrabold tracking-[-0.01em] text-destaque"
        >
          <PlataformaMarca provedor={provedor} variante="marcador" tamanho="g" decorativa />
          {reautenticar ? `Reconectar ${plataforma.nome}` : `Vincular ${plataforma.rotuloDaConta}`}
        </h2>
        <button type="button" onClick={onClose} className={`${BOTAO_CONTORNO} shrink-0`}>
          Fechar
        </button>
      </div>

      {reautenticar ? (
        <div role="status" className="flex items-center gap-3 rounded-2xl bg-painel-2 p-3.5">
          <Chek expressao="confuso" altura={64} />
          <p className="m-0 text-[16px] font-semibold">
            Sua conexão {comPlataforma(plataforma)} expirou. Sua conta e os jogos ligados continuam
            aí; cole um código novo para voltar a atualizar as horas e{' '}
            {plataforma.vocabulario.artigo} {plataforma.vocabulario.conquistas}.
          </p>
        </div>
      ) : null}

      <div className="flex flex-col gap-2 text-[16px]">
        <p className="m-0">
          <strong>O que é o {vinculo.rotuloDaCredencial}?</strong> {vinculo.explicacao}{' '}
          <strong>Trate-o como uma senha:</strong> quem o tem acessa a sua conta. O checkpoint o usa{' '}
          <strong>uma única vez</strong>, não o guarda e nunca o mostra de novo; o que fica guardado
          é uma chave de renovação <strong>cifrada</strong>.
        </p>
        <p className="m-0 font-semibold">Como pegar:</p>
        <ol className="m-0 flex list-decimal flex-col gap-1 pl-6">
          {vinculo.passos.map((passo) => (
            <li key={passo}>{passo}</li>
          ))}
        </ol>
        <p className="m-0">
          {/* Só texto para a pessoa abrir sozinha: o app nunca monta uma URL com o valor nem o lê de `location`. */}
          <a
            href={`https://${vinculo.enderecoDaCredencial}`}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex min-h-11 items-center gap-1.5 font-semibold text-destaque underline [overflow-wrap:anywhere]"
          >
            {vinculo.enderecoDaCredencial}
            <Icon name="open_in_new" size={18} />
          </a>
        </p>
        <p className="m-0 text-texto-suave">{vinculo.observacao}</p>
      </div>

      <div className="flex flex-col gap-2">
        <label htmlFor={CAMPO_ID} className={LABEL}>
          {vinculo.rotuloDaCredencial}
        </label>
        <input
          id={CAMPO_ID}
          type="password"
          autoComplete="off"
          autoCapitalize="off"
          autoCorrect="off"
          spellCheck={false}
          maxLength={128}
          data-autofocus
          value={credencial}
          aria-invalid={erro ? true : undefined}
          aria-describedby={erro ? ERRO_ID : undefined}
          onChange={(event) => setCredencial(event.target.value)}
          className={inputClass(Boolean(erro))}
        />
      </div>

      {erro ? (
        <div className="flex items-center gap-3">
          <Chek expressao="confuso" altura={56} />
          <FieldError id={ERRO_ID} message={erro} />
        </div>
      ) : null}

      <div className="flex flex-wrap justify-end gap-2.5">
        <button type="button" onClick={onClose} className={BOTAO_CONTORNO}>
          Cancelar
        </button>
        <button
          type="submit"
          disabled={vincular.isPending || credencial.trim() === ''}
          className={BOTAO_PRIMARIO}
        >
          {vincular.isPending ? 'Vinculando…' : reautenticar ? 'Reconectar' : 'Vincular'}
        </button>
      </div>
    </form>
  );
}

/**
 * O vínculo por credencial (spec `integracao-playstation`, F2): sem redirecionamento, a pessoa cola o {NPSSO} aqui. O
 * texto explica o que é, que equivale a uma senha e onde pegar, tudo do cadastro. O valor só vai no corpo de um POST e
 * some do estado ao enviar, ao fechar e em erro. Erro do servidor (código inválido, conta já vinculada, plataforma fora
 * do ar) aparece aqui dentro, com o Chek; o valor nunca é reenviado sozinho.
 */
export function VincularCredencialDialog({ open, ...resto }: VincularCredencialDialogProps) {
  return (
    <ModalDialog open={open} onClose={resto.onClose} labelledBy={TITULO_ID}>
      <Conteudo {...resto} />
    </ModalDialog>
  );
}
