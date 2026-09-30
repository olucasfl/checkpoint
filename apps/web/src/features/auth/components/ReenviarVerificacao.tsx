import { useEffect, useState } from 'react';
import { FieldError } from '@/shared/components/form-parts';
import { authApi } from '../api/auth-api';
import { describeAuthError } from '../lib/auth-errors';
import { emailError } from '../lib/field-rules';
import { PRIMARY_BUTTON } from './AuthCard';
import { TextField } from './TextField';

/** Espera entre dois reenvios: não ajuda a estourar o limite do servidor (5 por minuto por IP). */
export const REENVIO_ESPERA_SEGUNDOS = 30;

interface ReenviarVerificacaoProps {
  /** O e-mail já conhecido (vindo do registro ou do login). Sem ele, o campo aparece. */
  email?: string;
}

/**
 * "Reenviar e-mail" da verificação. A API responde igual para e-mail que existe e que não existe, então a
 * mensagem de sucesso também não distingue. Depois de um envio o botão fica desabilitado por
 * `REENVIO_ESPERA_SEGUNDOS`, com a contagem no rótulo.
 */
export function ReenviarVerificacao({ email: emailInicial }: ReenviarVerificacaoProps) {
  const [digitado, setDigitado] = useState('');
  const [pending, setPending] = useState(false);
  const [restante, setRestante] = useState(0);
  const [aviso, setAviso] = useState<string | undefined>();
  const [erro, setErro] = useState<string | undefined>();
  const [erroCampo, setErroCampo] = useState<string | undefined>();

  const email = (emailInicial ?? digitado).trim();

  // Um relógio de 1 s só enquanto há espera: zerar a contagem desliga o intervalo.
  useEffect(() => {
    if (restante <= 0) {
      return undefined;
    }
    const timer = setTimeout(() => setRestante((atual) => atual - 1), 1000);
    return () => clearTimeout(timer);
  }, [restante]);

  async function reenviar() {
    if (pending || restante > 0) {
      return;
    }
    const invalido = emailError(email);
    if (invalido) {
      setErroCampo(invalido);
      return;
    }

    setErroCampo(undefined);
    setErro(undefined);
    setAviso(undefined);
    setPending(true);
    try {
      const { estado } = await authApi.reenviarVerificacao({ email });
      setAviso(
        estado === 'ja-verificado'
          ? 'Seu e-mail já está confirmado. Você já pode entrar.'
          : 'Enviamos um novo link. Confira a caixa de entrada e o spam.',
      );
      if (estado === 'enviado') {
        setRestante(REENVIO_ESPERA_SEGUNDOS);
      }
    } catch (failure) {
      setErro(describeAuthError(failure).message);
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      {emailInicial === undefined && (
        <TextField
          id="reenviar-email"
          label="E-mail"
          type="email"
          value={digitado}
          onChange={setDigitado}
          autoComplete="email"
          inputMode="email"
          error={erroCampo}
        />
      )}

      {aviso && (
        <p
          role="status"
          className="m-0 rounded-xl border border-destaque px-3.5 py-2.5 text-[16px] text-texto"
        >
          {aviso}
        </p>
      )}
      {erro && <FieldError id="reenviar-error" message={erro} />}

      <button
        type="button"
        onClick={() => void reenviar()}
        disabled={pending || restante > 0}
        className={PRIMARY_BUTTON}
      >
        {restante > 0 ? `Reenviar em ${restante} s` : pending ? 'Enviando…' : 'Reenviar e-mail'}
      </button>
    </div>
  );
}
