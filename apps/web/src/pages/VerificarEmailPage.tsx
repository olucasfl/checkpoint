import { AuthCard } from '@/features/auth/components/AuthCard';
import { VerificarEmail } from '@/features/auth/components/VerificarEmail';

/** `verificar-email`: ver `VerificarEmail`. */
export function VerificarEmailPage() {
  return (
    <AuthCard title="Verificar e-mail">
      <VerificarEmail />
    </AuthCard>
  );
}
