import { storage } from '@/shared/lib/storage/storage';
import { DIAS_DE_USO, type DiasDeUso } from './install-keys';

/** AAAA-MM-DD no fuso LOCAL: `toISOString()` é UTC e viraria o dia às 21h no Brasil. */
export function diaLocal(data: Date): string {
  const mes = String(data.getMonth() + 1).padStart(2, '0');
  const dia = String(data.getDate()).padStart(2, '0');
  return `${data.getFullYear()}-${mes}-${dia}`;
}

/** Pura: o mesmo dia não conta duas vezes; um dia novo soma um. */
export function proximosDiasDeUso(atual: DiasDeUso, hoje: string): DiasDeUso {
  return atual.ultimoDia === hoje ? atual : { ultimoDia: hoje, total: atual.total + 1 };
}

/** Chamada no boot: conta este carregamento como dia de uso, se for um dia novo. */
export function registrarDiaDeUso(agora: Date = new Date()): void {
  const atual = storage.get(DIAS_DE_USO);
  const proximo = proximosDiasDeUso(atual, diaLocal(agora));
  if (proximo !== atual) {
    storage.set(DIAS_DE_USO, proximo);
  }
}
