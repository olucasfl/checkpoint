import { useState } from 'react';
import { Icon } from '@/shared/components/Icon';
import { useInstallOption } from '@/shared/hooks/use-install-option';
import { pedirInstalacao } from '@/shared/lib/pwa/install-prompt';
import { LinhaBotao, ListaDeLinhas } from './LinhaConta';

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
    <ListaDeLinhas rotulo="App">
      <LinhaBotao
        icone={opcao === 'ios' ? 'add_to_home_screen' : 'install_mobile'}
        rotulo="Instalar app"
        seta={null}
        onClick={() => (opcao === 'nativo' ? void pedirInstalacao() : setPassoAPasso(true))}
      />
      {opcao === 'ios' && passoAPasso && (
        <p role="status" className="m-0 px-4 py-3 text-[16px]">
          Para instalar: toque em Compartilhar (ícone{' '}
          <Icon name="ios_share" size={18} className="align-middle" />) e depois em{' '}
          <em>Adicionar à Tela de Início</em>.
        </p>
      )}
    </ListaDeLinhas>
  );
}
