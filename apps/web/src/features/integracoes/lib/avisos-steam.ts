/**
 * O aviso do retorno do vínculo: a API redireciona para `/perfil?steam=vinculada` ou
 * `/perfil?steam=erro&motivo=…` (o retorno é um redirecionamento externo, então não dá para usar o `state` da
 * navegação). Nenhum dado do usuário vai na URL: só o desfecho e o motivo. Parâmetro desconhecido é ignorado.
 */
export const MOTIVOS_DO_RETORNO = [
  'cancelado',
  'invalido',
  'expirado',
  'indisponivel',
  'ja-vinculada',
] as const;
export type MotivoDoRetorno = (typeof MOTIVOS_DO_RETORNO)[number];

export const TEXTO_DO_MOTIVO: Record<MotivoDoRetorno, string> = {
  cancelado: 'Vínculo cancelado. Nada foi alterado.',
  invalido: 'Não foi possível confirmar sua conta Steam. Tente de novo.',
  expirado: 'O vínculo demorou demais e expirou. Tente de novo.',
  indisponivel: 'A Steam não respondeu agora. Tente de novo em instantes.',
  'ja-vinculada': 'Você já tem outra conta Steam vinculada. Desvincule-a antes de vincular esta.',
};

export const TEXTO_VINCULADA = 'Conta Steam vinculada.';

export interface AvisoDoRetorno {
  tipo: 'sucesso' | 'erro';
  texto: string;
}

export function avisoDoRetorno(params: URLSearchParams): AvisoDoRetorno | undefined {
  const steam = params.get('steam');
  if (steam === 'vinculada') {
    return { tipo: 'sucesso', texto: TEXTO_VINCULADA };
  }
  if (steam === 'erro') {
    const motivo = params.get('motivo');
    const conhecido = (MOTIVOS_DO_RETORNO as readonly (string | null)[]).includes(motivo);
    return conhecido
      ? { tipo: 'erro', texto: TEXTO_DO_MOTIVO[motivo as MotivoDoRetorno] }
      : undefined;
  }
  return undefined;
}

/** Tira os parâmetros do retorno da URL, depois de mostrar o aviso (o resto da query fica). */
export function semParametrosDoRetorno(params: URLSearchParams): URLSearchParams {
  const limpo = new URLSearchParams(params);
  limpo.delete('steam');
  limpo.delete('motivo');
  return limpo;
}
