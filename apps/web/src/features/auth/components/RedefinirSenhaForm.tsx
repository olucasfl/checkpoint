import { RotuloPendente } from '@/shared/components/RotuloPendente';
import { useState, type FormEvent } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { FieldError } from '@/shared/components/form-parts';
import { authApi } from '../api/auth-api';
import { AUTH_MESSAGES, describeAuthError, type AuthFormError } from '../lib/auth-errors';
import { confirmacaoError, novaSenhaError } from '../lib/field-rules';
import { PRIMARY_BUTTON, SECONDARY_LINK } from './AuthCard';
import { CampoSenha } from './CampoSenha';

/**
 * `/redefinir-senha?token=…`: nova senha e confirmação (mesmas regras da troca de senha). Senhas diferentes:
 * nenhuma request sai. O token inexistente, vencido ou já usado dá o mesmo erro (`AUTH_TOKEN_INVALIDO`), com o
 * caminho para pedir um link novo. Sucesso vai para `/login` com o aviso `?motivo=senha-redefinida`.
 */
export function RedefinirSenhaForm() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const token = params.get('token') ?? '';
  const [novaSenha, setNovaSenha] = useState('');
  const [confirmacao, setConfirmacao] = useState('');
  const [error, setError] = useState<AuthFormError | null>(null);
  const [confirmationError, setConfirmationError] = useState<string | undefined>();
  const [pending, setPending] = useState(false);
  const [linkInvalido, setLinkInvalido] = useState(token === '');

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (pending) {
      return;
    }

    const local = {
      novaSenha: novaSenhaError(novaSenha),
      // A confirmação só é cobrada quando a senha em si está ok: o erro do campo vem primeiro.
      confirmacao: novaSenhaError(novaSenha) ? undefined : confirmacaoError(novaSenha, confirmacao),
    };
    if (local.novaSenha || local.confirmacao) {
      setError({ message: '', fields: local.novaSenha ? { novaSenha: local.novaSenha } : {} });
      // `confirmacao` não é um campo da API: fica num estado à parte.
      setConfirmationError(local.confirmacao);
      return;
    }

    setConfirmationError(undefined);
    setPending(true);
    setError(null);
    try {
      await authApi.redefinirSenha({ token, novaSenha });
      navigate('/login?motivo=senha-redefinida', { replace: true });
    } catch (failure) {
      const described = describeAuthError(failure);
      // `fields.token` (link cortado) e AUTH_TOKEN_INVALIDO não têm conserto aqui: pede-se outro link.
      if (described.code === 'AUTH_TOKEN_INVALIDO' || described.fields.token) {
        setLinkInvalido(true);
      } else {
        setError(described);
      }
      setPending(false);
    }
  }

  if (linkInvalido) {
    return (
      <div className="flex flex-col gap-4">
        <p role="alert" className="m-0 text-[16px] font-semibold text-erro">
          {AUTH_MESSAGES.AUTH_TOKEN_INVALIDO}
        </p>
        <Link to="/esqueci-senha" className={PRIMARY_BUTTON + ' grid place-items-center'}>
          Pedir um link novo
        </Link>
      </div>
    );
  }

  return (
    <form onSubmit={(event) => void onSubmit(event)} noValidate className="flex flex-col gap-4">
      <CampoSenha
        id="redefinir-senha"
        label="Nova senha"
        value={novaSenha}
        onChange={setNovaSenha}
        autoComplete="new-password"
        hint="Mínimo de 8 caracteres"
        error={error?.fields.novaSenha}
      />
      <CampoSenha
        id="redefinir-confirmacao"
        label="Confirmar nova senha"
        value={confirmacao}
        onChange={setConfirmacao}
        autoComplete="new-password"
        error={confirmationError}
      />

      {error?.message && <FieldError id="redefinir-error" message={error.message} />}

      <button type="submit" disabled={pending} className={PRIMARY_BUTTON}>
        <RotuloPendente pendente={pending} normal="Redefinir senha" ocupado="Salvando…" />
      </button>
      <Link to="/login" className={SECONDARY_LINK}>
        Voltar para entrar
      </Link>
    </form>
  );
}
