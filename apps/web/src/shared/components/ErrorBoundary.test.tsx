import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter, Link, RouterProvider } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AppLayout } from '@/app/layout/AppLayout';
import { ErrorBoundary } from './ErrorBoundary';

/**
 * Regressão do relato "qualquer clique quebra contra a API real": sem um error boundary, uma exceção de render em
 * QUALQUER componente desmonta o app inteiro (página em branco, nenhum clique responde, nenhuma mensagem).
 */
let consoleError: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
  // O React loga o erro capturado; aqui ele é esperado.
  consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
});
afterEach(() => consoleError.mockRestore());

function Quebra({ mensagem = 'dado real inesperado' }: { mensagem?: string }): never {
  throw new TypeError(mensagem);
}

describe('ErrorBoundary', () => {
  it('a tela que lança vira um alerta com o erro de verdade, em vez de página em branco', () => {
    render(
      <ErrorBoundary>
        <Quebra />
      </ErrorBoundary>,
    );

    const alerta = screen.getByRole('alert');
    expect(alerta).toHaveTextContent('Algo deu errado nesta tela');
    expect(alerta).toHaveTextContent('TypeError: dado real inesperado');
    expect(screen.getByRole('link', { name: 'Ir para o catálogo' })).toHaveAttribute('href', '/');
  });

  it('mostra o Chek confuso, decorativo, e o texto vale sem ele (CA-36, CA-39)', () => {
    render(
      <ErrorBoundary>
        <Quebra />
      </ErrorBoundary>,
    );

    expect(document.querySelector('svg[data-chek="confuso"]')).toHaveAttribute(
      'aria-hidden',
      'true',
    );
    expect(screen.getByRole('alert')).toHaveAttribute('data-state', 'render-error');
    expect(screen.getByRole('button', { name: 'Tentar de novo' })).toBeInTheDocument();
  });

  it('sem erro, os filhos passam intactos', () => {
    render(
      <ErrorBoundary>
        <p>tudo certo</p>
      </ErrorBoundary>,
    );

    expect(screen.getByText('tudo certo')).toBeInTheDocument();
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('"Tentar de novo" renderiza outra vez e se recupera quando a causa passou', async () => {
    let quebrar = true;
    function Instavel() {
      if (quebrar) {
        throw new Error('falha momentânea');
      }
      return <p>recuperou</p>;
    }
    const user = userEvent.setup();
    render(
      <ErrorBoundary>
        <Instavel />
      </ErrorBoundary>,
    );
    expect(screen.getByRole('alert')).toBeInTheDocument();

    quebrar = false;
    await user.click(screen.getByRole('button', { name: 'Tentar de novo' }));

    expect(screen.getByText('recuperou')).toBeInTheDocument();
  });

  it('mudar o resetKey (a rota) esquece o erro: navegar sempre escapa de uma tela quebrada', () => {
    const { rerender } = render(
      <ErrorBoundary resetKey="/a">
        <Quebra />
      </ErrorBoundary>,
    );
    expect(screen.getByRole('alert')).toBeInTheDocument();

    rerender(
      <ErrorBoundary resetKey="/b">
        <p>outra tela</p>
      </ErrorBoundary>,
    );

    expect(screen.getByText('outra tela')).toBeInTheDocument();
  });
});

describe('no AppFrame: uma tela quebrada não derruba a navegação', () => {
  function App() {
    const router = createMemoryRouter(
      [
        {
          element: <AppLayout />,
          children: [
            { path: '/', element: <p>catálogo ok</p> },
            { path: '/quebrada', element: <Quebra mensagem="jogo com plataforma nula" /> },
            { path: '/perfil', element: <p>perfil ok</p> },
          ],
        },
      ],
      { initialEntries: ['/quebrada'] },
    );
    return <RouterProvider router={router} />;
  }

  it('mostra o erro, mantém a barra de navegação e um clique em "Perfil" volta a funcionar', async () => {
    const user = userEvent.setup();
    render(<App />);

    expect(screen.getByRole('alert')).toHaveTextContent('jogo com plataforma nula');
    const nav = screen.getAllByRole('navigation', {
      name: 'Navegação principal',
    })[0] as HTMLElement;
    expect(nav).toBeInTheDocument();

    await user.click(screen.getAllByRole('link', { name: 'Perfil' })[0] as HTMLElement);

    expect(await screen.findByText('perfil ok')).toBeInTheDocument();
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('o Link de exemplo continua clicável dentro do boundary (sanidade do roteador)', () => {
    render(
      <RouterProvider
        router={createMemoryRouter([{ path: '/', element: <Link to="/x">ir</Link> }])}
      />,
    );

    expect(screen.getByRole('link', { name: 'ir' })).toHaveAttribute('href', '/x');
  });
});
