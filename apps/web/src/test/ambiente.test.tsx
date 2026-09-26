import { render, screen } from '@testing-library/react';
import { APP_NAME } from '@checkpoint/shared';
import { describe, expect, it } from 'vitest';
import { env } from '@/shared/lib/env';

// Fumaca do ambiente de teste: jsdom + RTL + jest-dom, alias `@/` e o pacote linkado
// `@checkpoint/shared` (CommonJS em dist/) resolvendo dentro do Vitest.
describe('ambiente de teste do web', () => {
  it('renderiza no jsdom e usa os matchers do jest-dom', () => {
    render(<h1>{APP_NAME}</h1>);

    expect(screen.getByRole('heading', { name: 'Checkpoint' })).toBeInTheDocument();
  });

  it('resolve o alias @/ para apps/web/src', () => {
    expect(env).toHaveProperty('apiUrl');
  });
});
