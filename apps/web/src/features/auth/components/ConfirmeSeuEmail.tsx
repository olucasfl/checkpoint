import { Link, useLocation, useSearchParams } from 'react-router-dom';
import { SECONDARY_LINK } from './AuthCard';
import { ReenviarVerificacao } from './ReenviarVerificacao';

/** O estado que o registro manda junto quando o envio falhou (a conta existe, o e-mail talvez não tenha saído). */
export interface ConfirmeSeuEmailState {
  emailEnviado?: boolean;
}

/**
 * "Enviamos um link de confirmação para <email>", depois do registro (ou do login de uma conta ainda não
 * verificada). O e-mail vem de `?email=`; sem ele a tela pede o e-mail para reenviar.
 */
export function ConfirmeSeuEmail() {
  const [params] = useSearchParams();
  const { state } = useLocation() as { state: ConfirmeSeuEmailState | null };
  const email = params.get('email')?.trim() || undefined;
  const envioFalhou = state?.emailEnviado === false;

  return (
    <div className="flex flex-col gap-4">
      {email ? (
        <p className="m-0 text-[16px] leading-snug text-texto">
          {envioFalhou ? (
            <>
              Sua conta foi criada, mas não conseguimos enviar o e-mail para{' '}
              <strong className="[overflow-wrap:anywhere]">{email}</strong>. Use o botão abaixo para
              tentar de novo.
            </>
          ) : (
            <>
              Enviamos um link de confirmação para{' '}
              <strong className="[overflow-wrap:anywhere]">{email}</strong>. Clique nele para
              continuar.
            </>
          )}
        </p>
      ) : (
        <p className="m-0 text-[16px] leading-snug text-texto">
          Confirme seu e-mail para entrar. Informe o e-mail da sua conta para receber o link de
          novo.
        </p>
      )}

      <ReenviarVerificacao email={email} />

      <Link to="/login" className={SECONDARY_LINK}>
        Já confirmei, entrar
      </Link>
    </div>
  );
}
