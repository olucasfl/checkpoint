import { RotuloPendente } from '@/shared/components/RotuloPendente';
import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { FieldError } from '@/shared/components/form-parts';
import { authApi } from '../api/auth-api';
import { describeAuthError, type AuthFormError } from '../lib/auth-errors';
import { confirmacaoError, emailError, nomeError, novaSenhaError } from '../lib/field-rules';
import { PRIMARY_BUTTON, SECONDARY_LINK } from './AuthCard';
import { CampoSenha } from './CampoSenha';
import { TextField } from './TextField';

/**
 * Criação de conta. "Confirmar senha" existe SÓ aqui (evita um erro de digitação que só apareceria no primeiro
 * login) e, se as senhas diferem, nenhuma request sai. O registro NÃO abre sessão: o sucesso leva a
 * `/confirme-seu-email`, e se o envio do e-mail falhou a tela avisa e oferece reenviar.
 */
export function RegistroForm() {
  const navigate = useNavigate();
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
      const { email: enviadoPara, emailEnviado } = await authApi.registro({
        nome: nome.trim(),
        email: email.trim(),
        senha,
      });
      navigate(`/confirme-seu-email?email=${encodeURIComponent(enviadoPara)}`, {
        state: { emailEnviado },
      });
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
