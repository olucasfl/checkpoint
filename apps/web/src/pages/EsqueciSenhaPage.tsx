import { AuthCard } from '@/features/auth/components/AuthCard';
import { EsqueciSenhaForm } from '@/features/auth/components/EsqueciSenhaForm';

/** `esqueci-senha`: ver `EsqueciSenhaForm`. */
export function EsqueciSenhaPage() {
  return (
    <AuthCard title="Esqueci minha senha">
      <EsqueciSenhaForm />
    </AuthCard>
  );
}
