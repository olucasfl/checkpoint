import { Link } from 'react-router-dom';
import { Chek } from '@/shared/components/Chek/Chek';

/**
 * Qualquer caminho sem rota (a rota `*`, dentro da moldura e do `RequireAuth`: quem não tem sessão vai ao login antes,
 * então a tela não revela quais rotas existem). O Chek está confuso; o texto diz tudo sem ele.
 */
export function NaoEncontradaPage() {
  return (
    <main className="safe-x mx-auto flex min-h-[60vh] max-w-[520px] flex-col items-center justify-center gap-4 py-10 text-center">
      <Chek expressao="confuso" altura={120} />
      <h1 className="m-0 font-display text-[26px] font-extrabold tracking-[-0.01em]">
        Página não encontrada
      </h1>
      <p className="m-0 text-base text-texto-suave">
        O endereço não existe ou foi movido. Volte ao catálogo para continuar.
      </p>
      <Link
        to="/"
        className="inline-flex min-h-11 items-center justify-center rounded-full bg-destaque px-6 font-display text-[15px] font-extrabold text-fundo no-underline"
      >
        Ir para o catálogo
      </Link>
    </main>
  );
}
