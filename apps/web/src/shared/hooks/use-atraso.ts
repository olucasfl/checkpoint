import { useEffect, useState } from 'react';

/**
 * `true` só depois de `ms` contínuos com `ativo` verdadeiro; volta a `false` assim que `ativo` cai. Serve para o que não
 * deve aparecer em carregamentos rápidos (o Chek balançando só passa de ~300 ms de espera).
 */
export function useAtraso(ativo: boolean, ms: number): boolean {
  const [passou, setPassou] = useState(false);

  useEffect(() => {
    if (!ativo) {
      setPassou(false);
      return undefined;
    }
    const timer = setTimeout(() => setPassou(true), ms);
    return () => clearTimeout(timer);
  }, [ativo, ms]);

  return ativo && passou;
}
