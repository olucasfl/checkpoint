import { AuthCard } from '@/features/auth/components/AuthCard';
import { ConfirmeSeuEmail } from '@/features/auth/components/ConfirmeSeuEmail';

/** `confirme-seu-email`: ver `ConfirmeSeuEmail`. */
export function ConfirmeSeuEmailPage() {
  return (
    <AuthCard title="Confirme seu e-mail">
      <ConfirmeSeuEmail />
    </AuthCard>
  );
}
