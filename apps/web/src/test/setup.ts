import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';

// Sem `globals: true`, o RTL nao registra o cleanup automatico: desmonta a arvore apos cada teste.
afterEach(() => {
  cleanup();
});
