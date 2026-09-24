// Config do Jest da API. Estava no package.json (JSON não aceita comentário); o conteúdo é o mesmo,
// mais o testTimeout.
/** @type {import('jest').Config} */
module.exports = {
  rootDir: 'src',
  testEnvironment: 'node',
  testRegex: '.*\\.spec\\.ts$',
  moduleFileExtensions: ['js', 'json', 'ts'],
  transform: {
    '^.+\\.ts$': 'ts-jest',
  },
  // 20 s (padrão 5 s): na máquina lenta (projeto no OneDrive) o 1º teste de uma suíte HTTP, que sobe o Nest, passava de 5 s.
  testTimeout: 20_000,
};
