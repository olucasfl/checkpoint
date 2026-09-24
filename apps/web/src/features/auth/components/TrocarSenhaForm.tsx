import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { FieldError } from '@/shared/components/form-parts';
import { authApi } from '../api/auth-api';
import { describeAuthError, type AuthFormError } from '../lib/auth-errors';
import { confirmacaoError, novaSenhaError, senhaAtualError } from '../lib/field-rules';
import { SENHA_ALTERADA } from '../lib/perfil-avisos';
import { PRIMARY_BUTTON, SECONDARY_LINK } from './AuthCard';
import { CampoSenha } from './CampoSenha';

/**
 * Troca de senha de quem está logado. A confirmação existe porque não há recuperação de senha: se ela
 * difere, nenhuma request sai. Os erros da API chegam pelo `code`/`fields` (a senha atual errada é um
 * 400 em `fields.senhaAtual`, nunca um 401: a pessoa continua logada). Sucesso volta para `/perfil`
 * com o aviso.
 */
export function TrocarSenhaForm() {
  const navigate = useNavigate();
  const [senhaAtual, setSenhaAtual] = useState('');
  const [novaSenha, setNovaSenha] = useState('');
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
      senhaAtual: senhaAtualError(senhaAtual),
      novaSenha: novaSenhaError(novaSenha),
      // A confirmação só é cobrada quando a nova senha em si está ok: o erro do campo vem primeiro.
      confirmacao: novaSenhaError(novaSenha) ? undefined : confirmacaoError(novaSenha, confirmacao),
    };
    if (local.senhaAtual || local.novaSenha || local.confirmacao) {
      setError({
        message: '',
        fields: {
          ...(local.senhaAtual ? { senhaAtual: local.senhaAtual } : {}),
          ...(local.novaSenha ? { novaSenha: local.novaSenha } : {}),
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
      await authApi.trocarSenha({ senhaAtual, novaSenha });
    } catch (failure) {
      setError(describeAuthError(failure));
      setPending(false);
      return;
    }
    void navigate('/perfil', { state: { aviso: SENHA_ALTERADA } });
  }

  return (
    <form onSubmit={(event) => void onSubmit(event)} noValidate className="flex flex-col gap-4">
      <CampoSenha
        id="trocar-senha-atual"
        label="Senha atual"
        value={senhaAtual}
        onChange={setSenhaAtual}
        autoComplete="current-password"
        error={error?.fields.senhaAtual}
      />
      <CampoSenha
        id="trocar-senha-nova"
        label="Nova senha"
        value={novaSenha}
        onChange={setNovaSenha}
        autoComplete="new-password"
        hint="Mínimo de 8 caracteres"
        error={error?.fields.novaSenha}
      />
      <CampoSenha
        id="trocar-senha-confirmacao"
        label="Confirmar nova senha"
        value={confirmacao}
        onChange={setConfirmacao}
        autoComplete="new-password"
        error={confirmationError}
      />

      <p className="m-0 text-[15px] leading-snug text-texto-suave">
        Ao trocar, as outras sessões desta conta são encerradas; este dispositivo continua
        conectado.
      </p>

      {error?.message && <FieldError id="trocar-senha-error" message={error.message} />}

      <button type="submit" disabled={pending} className={PRIMARY_BUTTON}>
        {pending ? 'Trocando…' : 'Trocar senha'}
      </button>
      <Link to="/perfil" className={SECONDARY_LINK}>
        Voltar ao perfil
      </Link>
    </form>
  );
}
