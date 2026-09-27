import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

const RAIZ_API = join(__dirname, '..', '..', '..', '..');
const RAIZ_WEB = join(RAIZ_API, '..', 'web', 'src');
const SRC_API = join(RAIZ_API, 'src');
const UNICO = join('modules', 'integrations', 'psn', 'psn.client.ts');

function arquivos(dir: string, achados: string[] = []): string[] {
  for (const nome of readdirSync(dir)) {
    const caminho = join(dir, nome);
    if (statSync(caminho).isDirectory()) {
      if (nome !== 'node_modules' && nome !== 'dist') {
        arquivos(caminho, achados);
      }
    } else if (/\.(ts|tsx)$/.test(nome)) {
      achados.push(caminho);
    }
  }
  return achados;
}

// A `psn-api` é uma API NÃO OFICIAL (spec integracao-playstation, D2): só o `PsnClient` a importa, para trocar de
// biblioteca (ou de endpoint) mexendo num arquivo e para nada do formato da Sony vazar pelo resto do módulo.
describe('a psn-api só é importada pelo PsnClient (CA-01)', () => {
  it('nenhum outro arquivo da API a importa', () => {
    const importadores = arquivos(SRC_API)
      .filter((arquivo) => !arquivo.endsWith('sem-import-direto.spec.ts'))
      .filter((arquivo) =>
        /from\s+['"]psn-api['"]|require\(\s*['"]psn-api['"]|import\(\s*['"]psn-api['"]/.test(
          readFileSync(arquivo, 'utf8'),
        ),
      )
      .map((arquivo) => relative(SRC_API, arquivo));

    expect(importadores).toEqual([UNICO]);
  });

  it('o web nunca a importa nem cita a chave de cifra (CA-67)', () => {
    const proibidos = arquivos(RAIZ_WEB)
      .filter((arquivo) => !arquivo.split(sep).includes('test') && !/\.test\.tsx?$/.test(arquivo))
      .filter((arquivo) => /psn-api|PSN_TOKEN_ENCRYPTION_KEY/.test(readFileSync(arquivo, 'utf8')))
      .map((arquivo) => relative(RAIZ_WEB, arquivo));

    expect(proibidos).toEqual([]);
  });

  it('a versão é exata, sem ^ nem ~ (só esta dependência nova)', () => {
    const pacote = JSON.parse(readFileSync(join(RAIZ_API, 'package.json'), 'utf8')) as {
      dependencies: Record<string, string>;
    };

    expect(pacote.dependencies['psn-api']).toBe('2.18.1');
  });
});
