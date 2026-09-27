import { type PlataformaInfo } from '@checkpoint/shared';

/**
 * A URL que a API devolve para o vínculo por redirecionamento só é seguida se for a tela de login da plataforma
 * (`https`, o host e o caminho do cadastro, sem porta nem credenciais). Defesa extra: o navegador nunca é mandado para
 * um endereço qualquer por causa de uma resposta adulterada. Plataforma por credencial não usa redirecionamento.
 */
export function urlDeVinculoSegura(plataforma: PlataformaInfo, url: unknown): url is string {
  if (typeof url !== 'string' || plataforma.vinculo.tipo !== 'redirecionamento') {
    return false;
  }
  const { hostDeLogin, caminhoDeLogin } = plataforma.vinculo;
  try {
    const parsed = new URL(url);
    return (
      parsed.protocol === 'https:' &&
      parsed.hostname === hostDeLogin &&
      parsed.port === '' &&
      parsed.username === '' &&
      parsed.password === '' &&
      parsed.pathname === caminhoDeLogin
    );
  } catch {
    return false;
  }
}
