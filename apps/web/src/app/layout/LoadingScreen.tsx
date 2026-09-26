import { BrandLogo } from '@/shared/components/BrandLogo';
import { useAtraso } from '@/shared/hooks/use-atraso';
import { Backdrop } from './Backdrop';

/** A bandeira do Chek só balança se a espera passar disto: um boot rápido nunca pisca a animação. */
export const ATRASO_DO_CHEK_MS = 300;

/**
 * Enquanto o boot da sessão responde: o Chek e o nome, nada mais. Sem conteúdo do app, para não mostrar (nem por um
 * instante) uma tela logada a quem talvez não tenha sessão. O Chek fica parado; depois de `ATRASO_DO_CHEK_MS` a bandeira
 * balança em laço lento (com movimento reduzido, a regra global a mantém parada).
 */
export function LoadingScreen() {
  const demorou = useAtraso(true, ATRASO_DO_CHEK_MS);

  return (
    <div className="app-shell relative grid place-items-center overflow-hidden">
      <Backdrop />
      <div role="status" aria-label="Carregando" className="relative">
        <BrandLogo animado={demorou} altura={72} />
      </div>
    </div>
  );
}
