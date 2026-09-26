# Verificação no navegador (API mockada, sem banco)

Scripts de **conferência manual automatizada**: sobem o web (Vite) contra uma API **simulada no navegador** (Playwright
intercepta as requisições), clicam em cada elemento de cada tela e rodam os fluxos de escrita. **Nada sai para o
Supabase, o bucket nem para a sua API**; os dados são sintéticos.

Não fazem parte do `npm test` (o Playwright **não é dependência** do projeto, `RULES.md` §9). Precisam do Playwright
instalado globalmente (`npm i -g playwright` e `npx playwright install chromium`).

## Como rodar

```bash
npm run build -w @checkpoint/shared
# Vite na 5199, com a API "em outra origem" (5198), como o dev de verdade (web 5173 -> api 3333)
cd apps/web && VITE_API_URL=http://localhost:5198/api npx vite --port 5199 --strictPort

# em outro terminal, na pasta docs/verificacao-navegador (o NODE_PATH aponta para o playwright global)
export NODE_PATH="$(npm root -g)"
node clicker.js                # clica em TODOS os elementos, em 360 e 1280 px (uns 30 min)
CEN=feio node clicker.js       # o mesmo com dados "feios" e erros injetados (409, 502, 400)
ONLY=catalogo,perfil node clicker.js   # só alguns estados
node flows.js                  # fluxos completos: login, criar, editar, excluir, Steam, preferências, sair
node esc.js                    # Esc em diálogos empilhados
node boundary.js               # um jogo malformado derruba só a tela (ErrorBoundary), não o app
```

## O que cada um falha

- `clicker.js`: erro ou aviso de console, `pageerror`, resposta HTTP inesperada (>= 400), tela em branco, elemento sem
  nome acessível ou que não dá para clicar. Elementos desabilitados por design contam como ok. Escreve
  `checkpoint-verificacao-clicker-<cenario>.json` na pasta temporária do sistema.
- `flows.js`: o fluxo não gerou a requisição esperada (método, caminho e corpo) ou gerou erro. Escreve as requisições
  capturadas em `checkpoint-verificacao-flows-requests.json`.
- `mock.js`: a API simulada. Os corpos seguem os tipos do `@checkpoint/shared`; o **contrato de verdade** é provado
  nos testes (`apps/api/src/contract/*.spec.ts` e `apps/web/src/test/api-fixtures.test.ts`), não aqui.

## O que NÃO prova

A API real, o Postgres, o Supabase e a sua conta. O mock aceita qualquer corpo e devolve o que foi programado: a
compatibilidade dos corpos com a validação da API é conferida em `payloads-do-web.spec.ts`. Aparelho real (iOS e
Android), teclado virtual e o app instalado também ficam de fora.
