import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { FieldError } from '@/shared/components/form-parts';
import { authApi } from '../api/auth-api';
import { describeAuthError, type AuthFormError } from '../lib/auth-errors';
import { emailError, loginSenhaError } from '../lib/field-rules';
import { useAuth } from '../session/use-auth';
import { PRIMARY_BUTTON, SECONDARY_LINK } from './AuthCard';
import { CampoSenha } from './CampoSenha';
import { TextField } from './TextField';

/**
 * Login por e-mail e senha. Com erro, o e-mail continua, a senha é limpa e o foco volta para ela. O
 * redirecionamento depois de entrar é do `AuthLayout` (ele já cuida de "logado em /login vai para o
 * `voltar`"), então este formulário só registra a sessão.
 */
export function LoginForm() {
  const { entrar } = useAuth();
  const [email, setEmail] = useState('');
  const [senha, setSenha] = useState('');
  const [error, setError] = useState<AuthFormError | null>(null);
  const [pending, setPending] = useState(false);
  const [focusRequest, setFocusRequest] = useState(0);
  const senhaRef = useRef<HTMLInputElement>(null);

  // O foco só pode ir depois de o campo estar re-renderizado com o valor limpo.
  useEffect(() => {
    if (focusRequest > 0) {
      senhaRef.current?.focus();
    }
  }, [focusRequest]);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (pending) {
      return;
    }

    const local = {
      email: emailError(email),
      senha: loginSenhaError(senha),
    };
    if (local.email || local.senha) {
      setError({
        message: '',
        fields: {
          ...(local.email ? { email: local.email } : {}),
          ...(local.senha ? { senha: local.senha } : {}),
        },
      });
      return;
    }

    setPending(true);
    setError(null);
    try {
      entrar(await authApi.login({ email: email.trim(), senha }));
    } catch (failure) {
      setError(describeAuthError(failure));
      setSenha('');
      setFocusRequest((n) => n + 1);
    } finally {
      setPending(false);
    }
  }

  return (
    <form onSubmit={(event) => void onSubmit(event)} noValidate className="flex flex-col gap-4">
      <TextField
        id="login-email"
        label="E-mail"
        type="email"
        value={email}
        onChange={setEmail}
        autoComplete="email"
        inputMode="email"
        error={error?.fields.email}
      />
      <CampoSenha
        id="login-senha"
        label="Senha"
        value={senha}
        onChange={setSenha}
        autoComplete="current-password"
        error={error?.fields.senha}
        inputRef={senhaRef}
      />

      {error?.message && <FieldError id="login-error" message={error.message} />}

      <button type="submit" disabled={pending} className={PRIMARY_BUTTON}>
        {pending ? 'Entrando…' : 'Entrar'}
      </button>
      <Link to="/registro" className={SECONDARY_LINK}>
        Criar conta
      </Link>
    </form>
  );
}
