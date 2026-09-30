import { RotuloPendente } from '@/shared/components/RotuloPendente';
import { useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { FieldError } from '@/shared/components/form-parts';
import { authApi } from '../api/auth-api';
import { describeAuthError, type AuthFormError } from '../lib/auth-errors';
import { emailError } from '../lib/field-rules';
import { PRIMARY_BUTTON, SECONDARY_LINK } from './AuthCard';
import { TextField } from './TextField';

/** O mesmo texto para e-mail que existe e que não existe: a tela nunca diz "e-mail não encontrado". */
export const ESQUECI_SENHA_SUCESSO =
  'Se esse e-mail tiver uma conta, enviamos um link para redefinir a senha. Ele vale por 30 minutos.';

/** `/esqueci-senha`: só o e-mail. O sucesso é sempre o mesmo, inclusive quando o envio falha no servidor. */
export function EsqueciSenhaForm() {
  const [email, setEmail] = useState('');
  const [error, setError] = useState<AuthFormError | null>(null);
  const [pending, setPending] = useState(false);
  const [enviado, setEnviado] = useState(false);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (pending) {
      return;
    }

    const local = emailError(email);
    if (local) {
      setError({ message: '', fields: { email: local } });
      return;
    }

    setPending(true);
    setError(null);
    try {
      await authApi.esqueciSenha({ email: email.trim() });
      setEnviado(true);
    } catch (failure) {
      setError(describeAuthError(failure));
    } finally {
      setPending(false);
    }
  }

  if (enviado) {
    return (
      <div className="flex flex-col gap-4">
        <p
          role="status"
          className="m-0 rounded-xl border border-destaque px-3.5 py-2.5 text-[16px] text-texto"
        >
          {ESQUECI_SENHA_SUCESSO}
        </p>
        <Link to="/login" className={SECONDARY_LINK}>
          Voltar para entrar
        </Link>
      </div>
    );
  }

  return (
    <form onSubmit={(event) => void onSubmit(event)} noValidate className="flex flex-col gap-4">
      <p className="m-0 text-[16px] leading-snug text-texto-suave">
        Informe o e-mail da sua conta e enviaremos um link para você escolher uma senha nova.
      </p>
      <TextField
        id="esqueci-email"
        label="E-mail"
        type="email"
        value={email}
        onChange={setEmail}
        autoComplete="email"
        inputMode="email"
        error={error?.fields.email}
      />

      {error?.message && <FieldError id="esqueci-error" message={error.message} />}

      <button type="submit" disabled={pending} className={PRIMARY_BUTTON}>
        <RotuloPendente pendente={pending} normal="Enviar link" ocupado="Enviando…" />
      </button>
      <Link to="/login" className={SECONDARY_LINK}>
        Voltar para entrar
      </Link>
    </form>
  );
}
