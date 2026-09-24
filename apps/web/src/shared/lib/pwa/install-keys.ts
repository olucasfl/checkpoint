import { defineKey } from '@/shared/lib/storage/keys';

export interface DiasDeUso {
  /** Último dia (AAAA-MM-DD, no fuso LOCAL) em que o app foi aberto; vazio se nunca. */
  ultimoDia: string;
  /** Quantos dias distintos o app foi aberto. */
  total: number;
}

const isBoolean = (valor: unknown): valor is boolean => typeof valor === 'boolean';

const isEpochOrNull = (valor: unknown): valor is number | null =>
  valor === null || (typeof valor === 'number' && Number.isFinite(valor));

const isDiasDeUso = (valor: unknown): valor is DiasDeUso => {
  if (typeof valor !== 'object' || valor === null) {
    return false;
  }
  const { ultimoDia, total } = valor as Record<string, unknown>;
  return typeof ultimoDia === 'string' && Number.isInteger(total) && (total as number) >= 0;
};

/** O evento `appinstalled` já ocorreu neste navegador. */
export const INSTALADO = defineKey<boolean>({
  nome: 'instalacao:instalado',
  escopo: 'dispositivo',
  padrao: false,
  validar: isBoolean,
});

/** Epoch ms do último "Agora não" no convite de instalação. */
export const DISPENSADO_EM = defineKey<number | null>({
  nome: 'instalacao:dispensado-em',
  escopo: 'dispositivo',
  padrao: null,
  validar: isEpochOrNull,
});

export const DIAS_DE_USO = defineKey<DiasDeUso>({
  nome: 'instalacao:dias-de-uso',
  escopo: 'dispositivo',
  padrao: { ultimoDia: '', total: 0 },
  validar: isDiasDeUso,
});
