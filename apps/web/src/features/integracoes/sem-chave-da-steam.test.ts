import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * A chave da Steam Web API é só do backend (spec `integracao-plataformas`, CA-59): ela viaja na query string das
 * chamadas à Steam, então nada do web pode citá-la, pedi-la por variável `VITE_*` nem embuti-la no bundle.
 * O nome é montado por partes para este arquivo não se achar a si mesmo.
 */
const NOME_DA_CHAVE = ['STEAM', 'API', 'KEY'].join('_');
const RAIZ_DO_WEB = resolve(__dirname, '..', '..', '..');
const IGNORAR = new Set(['node_modules', 'dist', 'coverage', '.vite', 'dev-dist']);
const TEXTO =
  /\.(ts|tsx|js|jsx|mjs|cjs|json|html|css|md|example|env|yml|yaml)$|(^|[\\/])\.env[^\\/]*$/i;

function arquivosDeTexto(pasta: string): string[] {
  return readdirSync(pasta).flatMap((nome) => {
    if (IGNORAR.has(nome)) {
      return [];
    }
    const caminho = join(pasta, nome);
    if (statSync(caminho).isDirectory()) {
      return arquivosDeTexto(caminho);
    }
    return TEXTO.test(nome) ? [caminho] : [];
  });
}

describe('a chave da Steam não entra no web (CA-59)', () => {
  const arquivos = arquivosDeTexto(RAIZ_DO_WEB);

  it('o levantamento acha os arquivos do web (senão o teste abaixo não provaria nada)', () => {
    const relativos = arquivos.map((arquivo) => relative(RAIZ_DO_WEB, arquivo).replace(/\\/g, '/'));
    expect(relativos).toEqual(
      expect.arrayContaining(['index.html', 'vercel.json', 'src/main.tsx', '.env.example']),
    );
    expect(arquivos.length).toBeGreaterThan(50);
  });

  it(`nenhum arquivo do web (código, .env.example, vercel.json, config) cita ${NOME_DA_CHAVE}`, () => {
    const citam = arquivos
      .filter((arquivo) => readFileSync(arquivo, 'utf8').includes(NOME_DA_CHAVE))
      .map((arquivo) => relative(RAIZ_DO_WEB, arquivo));

    expect(citam).toEqual([]);
  });

  it('nenhuma variável VITE_ pede a chave nem a URL de chamada da Steam', () => {
    const suspeitos = arquivos
      .filter((arquivo) =>
        /VITE_[A-Z_]*STEAM|api\.steampowered\.com/i.test(readFileSync(arquivo, 'utf8')),
      )
      .map((arquivo) => relative(RAIZ_DO_WEB, arquivo));

    expect(suspeitos).toEqual([]);
  });
});
