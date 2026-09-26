import { isAxiosError } from 'axios';
import { useState, type FormEvent } from 'react';
import { FieldError } from '@/shared/components/form-parts';
import { ModalDialog } from '@/shared/components/ModalDialog';
import { removerPrefsDoUsuario } from '@/shared/lib/prefs/prefs-store';
import { useGames } from '@/features/games/api/use-games';
import { CampoSenha } from '@/features/auth/components/CampoSenha';
import { describeAuthError, type AuthFormError } from '@/features/auth/lib/auth-errors';
import { encerrarContaExcluida } from '@/features/auth/session/session';
import { useAuth } from '@/features/auth/session/use-auth';
import { perfilApi } from '../api/perfil-api';

export const SEM_CONEXAO_NADA_EXCLUIDO = 'Sem conexão. Nada foi excluído.';

/** "seus 3 jogos", "seu 1 jogo"; sem a lista carregada, só "seus jogos". */
export function textoDaExclusao(totalDeJogos: number | undefined): string {
  const jogos =
    totalDeJogos === undefined
      ? 'seus jogos'
      : totalDeJogos === 1
        ? 'seu 1 jogo'
        : `seus ${totalDeJogos} jogos`;
  return `Isso apaga sua conta, ${jogos} e as capas deles. Não dá para desfazer.`;
}

const BOTAO_BASE =
  'min-h-12 rounded-full px-5 font-display text-[15px] disabled:opacity-60 font-bold';

/**
 * Confirma a exclusão com a senha. "Cancelar" tem o foco inicial (o padrão seguro) e "Excluir conta"
 * fica desabilitado até haver senha. Sem conexão, NADA foi excluído: o diálogo continua aberto para
 * tentar de novo.
 */
export function ExcluirContaDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { usuario } = useAuth();
  const { data: jogos } = useGames();
  const [senha, setSenha] = useState('');
  const [erro, setErro] = useState<AuthFormError | null>(null);
  const [excluindo, setExcluindo] = useState(false);

  function fechar() {
    setSenha('');
    setErro(null);
    onClose();
  }

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (excluindo || senha.length === 0 || !usuario) {
      return;
    }
    setExcluindo(true);
    setErro(null);
    try {
      await perfilApi.excluirConta({ senha });
    } catch (failure) {
      setErro(
        isAxiosError(failure) && !failure.response
          ? { message: SEM_CONEXAO_NADA_EXCLUIDO, fields: {} }
          : describeAuthError(failure),
      );
      setExcluindo(false);
      return;
    }
    // A conta não existe mais no servidor: nada aqui pode disparar outra request antes do logout
    // local. As preferências dela saem do aparelho; o `RequireAuth` leva a `/login?motivo=conta-excluida`.
    removerPrefsDoUsuario(usuario.id);
    encerrarContaExcluida();
  }

  return (
    <ModalDialog open={open} onClose={fechar} labelledBy="excluir-conta-titulo">
      <form
        onSubmit={(event) => void onSubmit(event)}
        noValidate
        className="sheet-pad flex flex-col gap-5 px-7 pt-7"
      >
        <h2
          id="excluir-conta-titulo"
          className="m-0 font-display text-xl font-extrabold tracking-[-0.01em] text-erro"
        >
          Excluir conta
        </h2>
        <p className="m-0 text-[19px]">{textoDaExclusao(jogos?.length)}</p>
        <CampoSenha
          id="excluir-conta-senha"
          label="Senha"
          value={senha}
          onChange={setSenha}
          autoComplete="current-password"
          error={erro?.fields.senha}
        />
        {erro?.message && <FieldError id="excluir-conta-erro" message={erro.message} />}
        <div className="flex flex-wrap justify-end gap-2.5">
          <button
            type="button"
            data-autofocus
            onClick={fechar}
            className={`${BOTAO_BASE} border border-borda-controle font-semibold uppercase hover:bg-acao-hover`}
          >
            Cancelar
          </button>
          <button
            type="submit"
            disabled={senha.length === 0 || excluindo}
            className={`${BOTAO_BASE} bg-erro font-extrabold uppercase text-fundo disabled:cursor-not-allowed`}
          >
            {excluindo ? 'Excluindo…' : 'Excluir conta'}
          </button>
        </div>
      </form>
    </ModalDialog>
  );
}

/** A "Zona de perigo" do /perfil (spec perfil, etapa 4): só a exclusão da conta. */
export function ZonaDePerigo() {
  const [aberto, setAberto] = useState(false);

  return (
    <section
      aria-labelledby="perfil-perigo"
      className="flex flex-col gap-3 border-t border-borda pt-6"
    >
      <h2
        id="perfil-perigo"
        className="m-0 px-1 font-display text-sm font-bold uppercase tracking-[0.14em] text-erro"
      >
        Zona de perigo
      </h2>
      <p className="m-0 px-1 text-[16px] text-texto-suave">
        Excluir a conta apaga os seus jogos e as capas deles. Não dá para desfazer.
      </p>
      <button
        type="button"
        onClick={() => setAberto(true)}
        className="min-h-11 min-w-11 self-start rounded-full border border-erro px-5 font-display text-[15px] font-bold text-erro hover:bg-acao-hover"
      >
        Excluir conta
      </button>
      <ExcluirContaDialog open={aberto} onClose={() => setAberto(false)} />
    </section>
  );
}
