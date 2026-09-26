import { useCallback, useState } from 'react';
import { SECOES_DO_JOGO } from '@/shared/lib/secoes';
import { storage } from '@/shared/lib/storage/storage';

/**
 * O estado aberto/fechado de uma seção, lembrado neste aparelho. Sem valor guardado (ou com o armazenamento
 * bloqueado ou corrompido) vale `abertaPorPadrao`; o módulo de storage nunca lança.
 */
export function useSecaoAberta(chave: string, abertaPorPadrao: boolean) {
  const [aberta, setAberta] = useState(() => storage.get(SECOES_DO_JOGO)[chave] ?? abertaPorPadrao);

  const definir = useCallback(
    (valor: boolean) => {
      setAberta(valor);
      storage.set(SECOES_DO_JOGO, { ...storage.get(SECOES_DO_JOGO), [chave]: valor });
    },
    [chave],
  );

  return [aberta, definir] as const;
}
