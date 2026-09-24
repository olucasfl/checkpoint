import { AuthCard } from '@/features/auth/components/AuthCard';
import { RegistroForm } from '@/features/auth/components/RegistroForm';

/** `/registro`. */
export function RegistroPage() {
  return (
    <AuthCard title="Criar conta">
      <RegistroForm />
    </AuthCard>
  );
}
