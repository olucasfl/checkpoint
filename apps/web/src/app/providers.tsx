import { type ReactNode } from 'react';
import { QueryClientProvider } from '@tanstack/react-query';
import { PrefsSync } from '@/app/PrefsSync';
import { AuthProvider } from '@/features/auth/session/AuthProvider';
import { queryClient } from '@/shared/lib/query-client';

interface AppProvidersProps {
  children: ReactNode;
}

/** Ponto unico para registrar providers globais (query, sessão, tema, etc). */
export function AppProviders({ children }: AppProvidersProps) {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <PrefsSync />
        {children}
      </AuthProvider>
    </QueryClientProvider>
  );
}
