import { useSyncExternalStore } from 'react';
import { type ChekExpressao } from '@/shared/components/Chek/Chek';

/** Tempo mínimo na tela; textos longos ganham mais (ver `duracaoDoAviso`). */
export const AVISO_MIN_MS = 4_000;

export interface DadosDoAviso {
  texto: string;
  /** Com uma expressão, o Chek aparece no lugar do check de sucesso (os marcos usam `comemorando`). */
  chek?: ChekExpressao;
  /** Uma ação curta ao lado do texto (ex.: "Ver"). */
  acao?: { rotulo: string; aoClicar: () => void };
}

export interface AvisoNaFila extends DadosDoAviso {
  id: number;
}

/** 4 s, mais 1 s a cada 20 caracteres acima de 60: dá tempo de ler. */
export function duracaoDoAviso(texto: string): number {
  return AVISO_MIN_MS + Math.ceil(Math.max(0, texto.length - 60) / 20) * 1_000;
}

let fila: readonly AvisoNaFila[] = [];
let proximoId = 0;
const ouvintes = new Set<() => void>();

function emitir(): void {
  ouvintes.forEach((ouvinte) => ouvinte());
}

/** Enfileira um aviso de sucesso. Um por vez na tela; os outros esperam a vez (nunca empilham nem cobrem a tela). */
export function avisar(dados: DadosDoAviso): void {
  proximoId += 1;
  fila = [...fila, { ...dados, id: proximoId }];
  emitir();
}

export function dispensar(id: number): void {
  fila = fila.filter((aviso) => aviso.id !== id);
  emitir();
}

/** Esvazia a fila (os testes chamam entre um caso e outro). */
export function limparAvisos(): void {
  fila = [];
  emitir();
}

function assinar(ouvinte: () => void): () => void {
  ouvintes.add(ouvinte);
  return () => ouvintes.delete(ouvinte);
}

/** A fila atual, fora do React (os testes conferem o que foi avisado). */
export function avisosNaFila(): readonly AvisoNaFila[] {
  return fila;
}

export function useFilaDeAvisos(): readonly AvisoNaFila[] {
  return useSyncExternalStore(
    assinar,
    () => fila,
    () => fila,
  );
}
