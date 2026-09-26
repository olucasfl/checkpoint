import { Component, type ErrorInfo, type ReactNode } from 'react';

interface ErrorBoundaryProps {
  children: ReactNode;
  /** Quando muda (ex.: a rota), o erro é esquecido e a tela tenta de novo: navegar sempre escapa de uma tela quebrada. */
  resetKey?: string;
}

interface ErrorBoundaryState {
  error: Error | null;
  pilha: string;
}

const BOTAO =
  'inline-flex min-h-11 items-center justify-center rounded-full border border-borda-controle px-[18px] font-display text-[15px] font-bold text-texto no-underline transition-colors hover:bg-painel-3';

/**
 * Rede de segurança contra erro de RENDER. Sem ela, uma exceção em qualquer componente (um dado real que ninguém
 * previu, por exemplo) desmonta a árvore inteira do React: página em branco, sem mensagem, e nenhum clique responde
 * dali em diante. Aqui a tela quebrada vira um aviso com o erro de verdade (o que quem relata o problema precisa
 * colar), "Tentar de novo" e "Ir para o catálogo"; o resto do app (a navegação) continua vivo quando o boundary
 * envolve só o conteúdo. Não engole erros de eventos nem de requisições: esses continuam seguindo o caminho deles.
 */
export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  override state: ErrorBoundaryState = { error: null, pilha: '' };

  static getDerivedStateFromError(error: Error): Partial<ErrorBoundaryState> {
    return { error };
  }

  override componentDidCatch(_error: Error, info: ErrorInfo): void {
    this.setState({ pilha: (info.componentStack ?? '').trim().split('\n').slice(0, 8).join('\n') });
  }

  override componentDidUpdate(anterior: ErrorBoundaryProps): void {
    if (this.state.error && anterior.resetKey !== this.props.resetKey) {
      this.setState({ error: null, pilha: '' });
    }
  }

  override render(): ReactNode {
    const { error, pilha } = this.state;
    if (!error) {
      return this.props.children;
    }

    return (
      <div
        role="alert"
        data-state="render-error"
        className="safe-x mx-auto flex max-w-[640px] flex-col gap-4 py-10"
      >
        <h1 className="m-0 font-display text-[26px] font-extrabold tracking-[-0.01em]">
          Algo deu errado nesta tela
        </h1>
        <p className="m-0 text-base text-texto-suave">
          O resto do app continua funcionando. Tente de novo ou volte ao catálogo. Se acontecer
          outra vez, copie o texto abaixo: é o erro de verdade.
        </p>
        <pre className="m-0 max-h-56 overflow-auto whitespace-pre-wrap rounded-2xl border border-borda bg-painel p-4 font-mono text-xs [overflow-wrap:anywhere]">
          {`${error.name}: ${error.message}${pilha ? `\n\n${pilha}` : ''}`}
        </pre>
        <div className="flex flex-wrap gap-2.5">
          <button
            type="button"
            onClick={() => this.setState({ error: null, pilha: '' })}
            className={`${BOTAO} bg-destaque text-fundo hover:bg-destaque`}
          >
            Tentar de novo
          </button>
          {/* Um <a> comum (recarrega): funciona até quando o erro está no roteador ou nos provedores. */}
          <a href="/" className={BOTAO}>
            Ir para o catálogo
          </a>
        </div>
      </div>
    );
  }
}
