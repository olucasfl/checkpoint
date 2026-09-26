import { useEffect, useState } from 'react';
import { useMovimentoReduzido } from './use-movimento-reduzido';

/**
 * Mantém o último valor visível por `ms` depois que ele some (`null`), com `saindo` verdadeiro nesse intervalo, para a
 * saída poder animar. Com movimento reduzido some na hora. O dado de verdade já mudou: isto só segura o visual.
 */
export function useComSaida<T>(valor: T | null, ms: number): { atual: T | null; saindo: boolean } {
  const reduzido = useMovimentoReduzido();
  const [ultimo, setUltimo] = useState<T | null>(valor);
  const [saindo, setSaindo] = useState(false);

  useEffect(() => {
    if (valor !== null) {
      setUltimo(valor);
      setSaindo(false);
      return undefined;
    }
    if (ultimo === null) {
      return undefined;
    }
    if (reduzido) {
      setUltimo(null);
      return undefined;
    }
    setSaindo(true);
    const timer = setTimeout(() => {
      setUltimo(null);
      setSaindo(false);
    }, ms);
    return () => clearTimeout(timer);
  }, [valor, ultimo, ms, reduzido]);

  return { atual: valor ?? ultimo, saindo: valor === null && ultimo !== null && saindo };
}
