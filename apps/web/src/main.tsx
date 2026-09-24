import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { AppProviders } from '@/app/providers';
import { AppRouter } from '@/app/router';
import { connectivity } from '@/shared/lib/connectivity';
import { runStorageMigrations } from '@/shared/lib/storage/migrations';
import '@/shared/lib/api-client';
import '@/styles/index.css';

const container = document.getElementById('root');

if (!container) {
  throw new Error('Elemento #root nao encontrado no index.html');
}

// Antes do primeiro render: nenhuma tela lê o armazenamento local com o formato antigo.
runStorageMigrations();
connectivity.start();

createRoot(container).render(
  <StrictMode>
    <AppProviders>
      <AppRouter />
    </AppProviders>
  </StrictMode>,
);
