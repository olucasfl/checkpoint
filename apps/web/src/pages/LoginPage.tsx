import { useSearchParams } from 'react-router-dom';
import { AuthCard } from '@/features/auth/components/AuthCard';
import { LoginForm } from '@/features/auth/components/LoginForm';
import { AUTH_MESSAGES } from '@/features/auth/lib/auth-errors';

/** `/login`. `?motivo=sessao` (a sessão terminou) mostra o aviso no topo do cartão. */
export function LoginPage() {
  const [params] = useSearchParams();

  return (
    <AuthCard title="Entrar">
      {params.get('motivo') === 'sessao' && (
        <p
          role="status"
          className="m-0 rounded-[4px] border border-ciano px-3.5 py-2.5 text-[16px] text-texto"
        >
          {AUTH_MESSAGES.AUTH_SESSAO_ENCERRADA}
        </p>
      )}
      <LoginForm />
    </AuthCard>
  );
}
