import { type PlataformaInfo } from '@checkpoint/shared';

/**
 * Os textos das telas de integração saem do cadastro global (nome, "ligado à…", vocabulário), nunca de um `if` por
 * provedor: uma plataforma nova concorda sozinha ("da Steam", "do Xbox"; "as conquistas", "os troféus").
 */

/** `à Steam` → `da Steam`; `ao Xbox` → `do Xbox`. */
export function dePlataforma(plataforma: PlataformaInfo): string {
  return plataforma.ligadoA.replace(/^à /, 'da ').replace(/^ao /, 'do ');
}

/** `na Steam` / `no Xbox`. */
export function naPlataforma(plataforma: PlataformaInfo): string {
  return plataforma.ligadoA.replace(/^à /, 'na ').replace(/^ao /, 'no ');
}

/** `com a Steam` / `com o Xbox`. */
export function comPlataforma(plataforma: PlataformaInfo): string {
  return plataforma.ligadoA.replace(/^à /, 'com a ').replace(/^ao /, 'com o ');
}

/** "as horas e as conquistas" / "as horas e os troféus". */
export function horasEConquistas(plataforma: PlataformaInfo): string {
  return `as horas e ${plataforma.vocabulario.artigo} ${plataforma.vocabulario.conquistas}`;
}

/** "Ao ligá-lo…, as horas e as conquistas mostradas serão as da Steam" (concorda com o artigo do plural). */
export function textoDaConfirmacaoDePlataforma(plataforma: PlataformaInfo): string {
  const { artigo } = plataforma.vocabulario;
  const mostradas = artigo === 'as' ? 'mostradas' : 'mostrados';
  return `${horasEConquistas(plataforma)} ${mostradas} serão ${artigo} ${dePlataforma(plataforma)}`;
}
