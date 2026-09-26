import { RotuloPendente } from '@/shared/components/RotuloPendente';
import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from 'react';
import { Icon } from '@/shared/components/Icon';
import { FieldError, inputClass, LABEL } from '@/shared/components/form-parts';
import { describeAuthError, type AuthFormError } from '@/features/auth/lib/auth-errors';
import { nomeError } from '@/features/auth/lib/field-rules';
import { useAuth } from '@/features/auth/session/use-auth';
import { perfilApi } from '../api/perfil-api';

const NO_ERROR: AuthFormError = { message: '', fields: {} };

const BUTTON =
  'min-h-11 rounded-full px-4 font-display text-[15px] disabled:cursor-wait disabled:opacity-60 font-bold';

/**
 * O nome de exibição, no cabeçalho do perfil, com o botão Editar ao lado (o nome aparece uma vez só
 * na tela). Editar abre o campo com o nome atual; Esc ou Cancelar voltam sem request; Salvar valida
 * localmente (a mesma regra da API) e manda o `PATCH`. O sucesso troca o `usuario` da sessão, então o
 * nome muda em toda a tela sem recarregar.
 */
export function NomeEditavel() {
  const { usuario, atualizarUsuario } = useAuth();
  const [editando, setEditando] = useState(false);
  const [valor, setValor] = useState('');
  const [erro, setErro] = useState<AuthFormError>(NO_ERROR);
  const [salvando, setSalvando] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const editarRef = useRef<HTMLButtonElement>(null);
  // Só devolve o foco ao "Editar" depois de uma edição, nunca na primeira pintura.
  const voltarFoco = useRef(false);

  useEffect(() => {
    if (editando) {
      inputRef.current?.focus();
      inputRef.current?.select();
    } else if (voltarFoco.current) {
      voltarFoco.current = false;
      editarRef.current?.focus();
    }
  }, [editando]);

  function abrir() {
    setValor(usuario?.nome ?? '');
    setErro(NO_ERROR);
    setEditando(true);
  }

  function fechar() {
    voltarFoco.current = true;
    setErro(NO_ERROR);
    setEditando(false);
  }

  function onKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'Escape') {
      event.preventDefault();
      fechar();
    }
  }

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (salvando) {
      return;
    }
    const problema = nomeError(valor);
    if (problema) {
      setErro({ message: '', fields: { nome: problema } });
      return;
    }
    setSalvando(true);
    setErro(NO_ERROR);
    try {
      const atualizado = await perfilApi.atualizar({ nome: valor.trim() });
      atualizarUsuario(atualizado);
      fechar();
    } catch (failure) {
      setErro(describeAuthError(failure));
    } finally {
      setSalvando(false);
    }
  }

  if (!editando) {
    return (
      <div className="flex min-w-0 items-center gap-1">
        <h2 className="m-0 min-w-0 text-[22px] font-bold leading-tight [overflow-wrap:anywhere]">
          {usuario?.nome}
        </h2>
        <button
          ref={editarRef}
          type="button"
          aria-label="Editar nome"
          onClick={abrir}
          className="grid size-11 shrink-0 place-items-center rounded-xl text-texto-suave transition-colors hover:bg-acao-hover hover:text-destaque"
        >
          <Icon name="edit" size={22} />
        </button>
      </div>
    );
  }

  const campoErro = erro.fields.nome;

  return (
    <form onSubmit={(event) => void onSubmit(event)} noValidate className="flex flex-col gap-2">
      <label htmlFor="perfil-nome" className={LABEL}>
        Nome
      </label>
      <input
        ref={inputRef}
        id="perfil-nome"
        value={valor}
        onChange={(event) => {
          setValor(event.target.value);
          setErro(NO_ERROR);
        }}
        onKeyDown={onKeyDown}
        autoComplete="name"
        autoCapitalize="words"
        aria-invalid={campoErro ? true : undefined}
        aria-describedby={campoErro ? 'perfil-nome-err' : undefined}
        className={`${inputClass(Boolean(campoErro))} w-full`}
      />
      <FieldError id="perfil-nome-err" message={campoErro} />
      {erro.message && <FieldError id="perfil-nome-geral" message={erro.message} />}
      <div className="flex flex-wrap gap-2">
        <button
          type="submit"
          disabled={salvando}
          className={`${BUTTON} bg-destaque font-extrabold text-fundo`}
        >
          <RotuloPendente pendente={salvando} normal="Salvar" ocupado="Salvando…" />
        </button>
        <button
          type="button"
          onClick={fechar}
          disabled={salvando}
          className={`${BUTTON} border border-borda-controle font-semibold hover:bg-acao-hover`}
        >
          Cancelar
        </button>
      </div>
    </form>
  );
}
