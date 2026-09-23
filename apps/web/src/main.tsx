import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { AppProviders } from '@/app/providers';
import { AppRouter } from '@/app/router';
import '@/styles/index.css';

const container = document.getElementById('root');

if (!container) {
  throw new Error('Elemento #root nao encontrado no index.html');
}

createRoot(container).render(
  <StrictMode>
    <AppProviders>
      <AppRouter />
    </AppProviders>
  </StrictMode>,
);
