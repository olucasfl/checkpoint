import { RotuloPendente } from '@/shared/components/RotuloPendente';
import { useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { FieldError } from '@/shared/components/form-parts';
import { authApi } from '../api/auth-api';
import { describeAuthError, type AuthFormError } from '../lib/auth-errors';
import { confirmacaoError, emailError, nomeError, novaSenhaError } from '../lib/field-rules';
import { useAuth } from '../session/use-auth';
import { PRIMARY_BUTTON, SECONDARY_LINK } from './AuthCard';
import { CampoSenha } from './CampoSenha';
import { TextField } from './TextField';

/**
 * Criação de conta. "Confirmar senha" existe SÓ aqui (não há recuperação de senha: um erro de digitação
 * deixaria a conta inacessível) e, se as senhas diferem, nenhuma request sai.
 */
export function RegistroForm() {
  const { entrar } = useAuth();
  const [nome, setNome] = useState('');
  const [email, setEmail] = useState('');
  const [senha, setSenha] = useState('');
  const [confirmacao, setConfirmacao] = useState('');
  const [error, setError] = useState<AuthFormError | null>(null);
  const [confirmationError, setConfirmationError] = useState<string | undefined>();
  const [pending, setPending] = useState(false);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (pending) {
      return;
    }

    const local = {
      nome: nomeError(nome),
      email: emailError(email),
      senha: novaSenhaError(senha),
      // A confirmação só é cobrada quando a senha em si está ok: o erro do campo vem primeiro.
      confirmacao: novaSenhaError(senha) ? undefined : confirmacaoError(senha, confirmacao),
    };
    if (local.nome || local.email || local.senha || local.confirmacao) {
      setError({
        message: '',
        fields: {
          ...(local.nome ? { nome: local.nome } : {}),
          ...(local.email ? { email: local.email } : {}),
          ...(local.senha ? { senha: local.senha } : {}),
        },
      });
      // `confirmacao` não é um campo da API: fica num estado à parte.
      setConfirmationError(local.confirmacao);
      return;
    }

    setConfirmationError(undefined);
    setPending(true);
    setError(null);
    try {
      entrar(await authApi.registro({ nome: nome.trim(), email: email.trim(), senha }));
    } catch (failure) {
      setError(describeAuthError(failure));
    } finally {
      setPending(false);
    }
  }

  return (
    <form onSubmit={(event) => void onSubmit(event)} noValidate className="flex flex-col gap-4">
      <TextField
        id="registro-nome"
        label="Nome"
        value={nome}
        onChange={setNome}
        autoComplete="name"
        autoCapitalize="words"
        error={error?.fields.nome}
      />
      <TextField
        id="registro-email"
        label="E-mail"
        type="email"
        value={email}
        onChange={setEmail}
        autoComplete="email"
        inputMode="email"
        error={error?.fields.email}
      />
      <CampoSenha
        id="registro-senha"
        label="Senha"
        value={senha}
        onChange={setSenha}
        autoComplete="new-password"
        hint="Mínimo de 8 caracteres"
        error={error?.fields.senha}
      />
      <CampoSenha
        id="registro-confirmacao"
        label="Confirmar senha"
        value={confirmacao}
        onChange={setConfirmacao}
        autoComplete="new-password"
        error={confirmationError}
      />

      <p className="m-0 text-[15px] leading-snug text-texto-suave">
        Seu e-mail serve só para entrar: ele não é verificado e nenhum e-mail é enviado. Ainda não
        existe recuperação de senha — guarde a sua.
      </p>

      {error?.message && <FieldError id="registro-error" message={error.message} />}

      <button type="submit" disabled={pending} className={PRIMARY_BUTTON}>
        <RotuloPendente pendente={pending} normal="Criar conta" ocupado="Criando…" />
      </button>
      <Link to="/login" className={SECONDARY_LINK}>
        Já tenho conta
      </Link>
    </form>
  );
}
