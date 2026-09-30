import { AuthCard } from '@/features/auth/components/AuthCard';
import { RedefinirSenhaForm } from '@/features/auth/components/RedefinirSenhaForm';

/** `redefinir-senha`: ver `RedefinirSenhaForm`. */
export function RedefinirSenhaPage() {
  return (
    <AuthCard title="Redefinir senha">
      <RedefinirSenhaForm />
    </AuthCard>
  );
}
