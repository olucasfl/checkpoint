import { BrandLogo } from '@/shared/components/BrandLogo';
import { Backdrop } from './Backdrop';

/**
 * Enquanto o boot da sessão responde: o logo com brilho e nada mais. Sem conteúdo do app, para não
 * mostrar (nem por um instante) uma tela logada a quem talvez não tenha sessão.
 */
export function LoadingScreen() {
  return (
    <div className="app-shell relative grid place-items-center overflow-hidden">
      <Backdrop />
      <div role="status" aria-label="Carregando" className="relative">
        <BrandLogo />
      </div>
    </div>
  );
}
