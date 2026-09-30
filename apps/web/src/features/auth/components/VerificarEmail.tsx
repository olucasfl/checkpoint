import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { authApi } from '../api/auth-api';
import { AUTH_MESSAGES, describeAuthError } from '../lib/auth-errors';
import { PRIMARY_BUTTON, SECONDARY_LINK } from './AuthCard';
import { ReenviarVerificacao } from './ReenviarVerificacao';

type Estado =
  | { tipo: 'carregando' }
  | { tipo: 'confirmado' }
  /** O link não vale (inexistente, vencido ou malformado): oferece pedir outro. */
  | { tipo: 'invalido' }
  /** Falha passageira (sem conexão, limite): o link ainda pode valer, então tenta de novo. */
  | { tipo: 'falha'; message: string };

/**
 * `/verificar-email?token=…`: confirma ao MONTAR a página, por `fetch` (nunca por navegação a uma rota da
 * API: um pré-carregamento do link pelo cliente de e-mail não pode consumir o token antes do clique real).
 * `jaEstavaVerificado` `true` ou `false` mostram a mesma tela, porque a confirmação é idempotente.
 */
export function VerificarEmail() {
  const [params] = useSearchParams();
  const token = params.get('token') ?? '';
  const [tentativa, setTentativa] = useState(0);
  const [estado, setEstado] = useState<Estado>({ tipo: 'carregando' });

  useEffect(() => {
    let ativo = true;
    setEstado({ tipo: 'carregando' });
    authApi.verificarEmail({ token }).then(
      () => {
        if (ativo) {
          setEstado({ tipo: 'confirmado' });
        }
      },
      (failure: unknown) => {
        if (!ativo) {
          return;
        }
        const { code, message } = describeAuthError(failure);
        // VALIDACAO = token de formato errado (link cortado na colagem): também não tem conserto.
        setEstado(
          code === 'AUTH_TOKEN_INVALIDO' || code === 'VALIDACAO'
            ? { tipo: 'invalido' }
            : { tipo: 'falha', message },
        );
      },
    );
    return () => {
      ativo = false;
    };
  }, [token, tentativa]);

  if (estado.tipo === 'carregando') {
    return (
      <p role="status" className="m-0 text-center text-[16px] text-texto-suave">
        Confirmando seu e-mail…
      </p>
    );
  }

  if (estado.tipo === 'confirmado') {
    return (
      <div className="flex flex-col gap-4">
        <p role="status" className="m-0 text-center text-[18px] font-semibold text-texto">
          E-mail confirmado!
        </p>
        <Link to="/login" className={PRIMARY_BUTTON + ' grid place-items-center'}>
          Entrar
        </Link>
      </div>
    );
  }

  if (estado.tipo === 'falha') {
    return (
      <div className="flex flex-col gap-4">
        <p role="alert" className="m-0 text-[16px] font-semibold text-erro">
          {estado.message}
        </p>
        <button type="button" className={PRIMARY_BUTTON} onClick={() => setTentativa((n) => n + 1)}>
          Tentar de novo
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <p role="alert" className="m-0 text-[16px] font-semibold text-erro">
        {AUTH_MESSAGES.AUTH_TOKEN_INVALIDO}
      </p>
      <p className="m-0 text-[16px] leading-snug text-texto-suave">
        Informe o e-mail da sua conta para receber um link novo.
      </p>
      <ReenviarVerificacao />
      <Link to="/login" className={SECONDARY_LINK}>
        Voltar para entrar
      </Link>
    </div>
  );
}
