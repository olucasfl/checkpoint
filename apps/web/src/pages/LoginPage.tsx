import { useSearchParams } from 'react-router-dom';
import { AuthCard } from '@/features/auth/components/AuthCard';
import { LoginForm } from '@/features/auth/components/LoginForm';
import { AUTH_MESSAGES } from '@/features/auth/lib/auth-errors';

/** Os avisos do topo do cartão, por `?motivo=`. Um valor desconhecido não mostra nada. */
const AVISOS: Record<string, string> = {
  sessao: AUTH_MESSAGES.AUTH_SESSAO_ENCERRADA,
  'conta-excluida': 'Sua conta foi excluída.',
};

/** `/login`. `?motivo=` (a sessão terminou, ou a conta foi excluída) mostra o aviso no topo do cartão. */
export function LoginPage() {
  const [params] = useSearchParams();
  const motivo = params.get('motivo');
  const aviso = motivo && Object.hasOwn(AVISOS, motivo) ? AVISOS[motivo] : undefined;

  return (
    <AuthCard title="Entrar">
      {aviso && (
        <p
          role="status"
          className="m-0 rounded-[4px] border border-ciano px-3.5 py-2.5 text-[16px] text-texto"
        >
          {aviso}
        </p>
      )}
      <LoginForm />
    </AuthCard>
  );
}
