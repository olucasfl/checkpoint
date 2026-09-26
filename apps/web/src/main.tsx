import '@/shared/lib/pwa/install-prompt';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { AppProviders } from '@/app/providers';
import { AppRouter } from '@/app/router';
import { ErrorBoundary } from '@/shared/components/ErrorBoundary';
import { connectivity } from '@/shared/lib/connectivity';
import { iniciarPrefs } from '@/shared/lib/prefs/prefs-store';
import { registrarDiaDeUso } from '@/shared/lib/pwa/usage-days';
import { runStorageMigrations } from '@/shared/lib/storage/migrations';
import '@/shared/lib/api-client';
import '@/styles/index.css';

const container = document.getElementById('root');

if (!container) {
  throw new Error('Elemento #root nao encontrado no index.html');
}

// Antes do primeiro render: nenhuma tela lê o armazenamento local com o formato antigo.
runStorageMigrations();
// Cor de destaque e efeitos de quem usou por último, antes do 1º render: sem piscar na cor padrão.
iniciarPrefs();
// Depois das migrações (que podem apagar `checkpoint:*`) e antes do render, que lê a contagem.
registrarDiaDeUso();
connectivity.start();

createRoot(container).render(
  <StrictMode>
    {/* Última rede: erro nos provedores, no roteador ou nas telas de entrada (que não usam o AppFrame). */}
    <ErrorBoundary>
      <AppProviders>
        <AppRouter />
      </AppProviders>
    </ErrorBoundary>
  </StrictMode>,
);
