import { useState } from 'react';
import { Icon } from '@/shared/components/Icon';
import { useInstallOption } from '@/shared/hooks/use-install-option';
import { pedirInstalacao } from '@/shared/lib/pwa/install-prompt';

/**
 * "Instalar app" permanente no perfil (o convite da pwa-e-mobile é esporádico). Só aparece quando dá
 * para instalar agora: Chrome/Edge com o convite nativo guardado, ou Safari do iOS (que mostra o passo
 * a passo). Já instalado, ou aberto pelo ícone, não aparece.
 */
export function InstalarApp() {
  const opcao = useInstallOption();
  const [passoAPasso, setPassoAPasso] = useState(false);

  if (opcao === null) {
    return null;
  }

  return (
    <section
      aria-labelledby="perfil-app"
      className="flex flex-col gap-3 rounded-md border border-borda bg-painel p-5 md:p-6"
    >
      <h2
        id="perfil-app"
        className="m-0 font-display text-[15px] font-extrabold uppercase tracking-[0.14em]"
      >
        App
      </h2>
      <button
        type="button"
        onClick={() => (opcao === 'nativo' ? void pedirInstalacao() : setPassoAPasso(true))}
        className="flex min-h-11 items-center gap-2 self-start rounded-[4px] border border-ciano px-4 font-display text-[13px] font-semibold uppercase tracking-[0.1em] text-ciano hover:bg-acao-hover"
      >
        <Icon name={opcao === 'ios' ? 'add_to_home_screen' : 'install_mobile'} size={20} />
        Instalar app
      </button>
      {opcao === 'ios' && passoAPasso && (
        <p role="status" className="m-0 text-[16px]">
          Para instalar: toque em Compartilhar (ícone{' '}
          <Icon name="ios_share" size={18} className="align-middle" />) e depois em{' '}
          <em>Adicionar à Tela de Início</em>.
        </p>
      )}
    </section>
  );
}
