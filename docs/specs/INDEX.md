# Índice de specs — checkpoint

Mapa único de `spec ↔ status`. **Este arquivo é a fonte da verdade sobre o que existe**; não
confie em adivinhar nome de arquivo. Quem cria ou fecha uma spec atualiza esta tabela no mesmo
commit — `/docs-sync` confere se ela bate com a realidade.

| Feature                            | Spec                                                   | Status          |
| ---------------------------------- | ------------------------------------------------------ | --------------- |
| Catálogo de jogos                  | [catalogo-jogos.md](catalogo-jogos.md)                 | 🚧 em andamento |
| PWA e mobile                       | [pwa-e-mobile.md](pwa-e-mobile.md)                     | 🚧 em andamento |
| Autenticação                       | [autenticacao.md](autenticacao.md)                     | ✅ implementada |
| Perfil                             | [perfil.md](perfil.md)                                 | 🚧 em andamento |
| Avaliação de jogos                 | [avaliacao-de-jogos.md](avaliacao-de-jogos.md)         | ✅ implementada |
| Integração com plataformas (Steam) | [integracao-plataformas.md](integracao-plataformas.md) | 🚧 em andamento |

## Legenda de status

| Status          | Significa                                                 |
| --------------- | --------------------------------------------------------- |
| 📝 rascunho     | spec escrita, ainda não aprovada pelo humano              |
| ✅ aprovada     | aprovada, implementação não começou                       |
| 🚧 em andamento | implementação começou, nem todo critério fechado          |
| ✅ implementada | todos os critérios de aceite verificados por `/qa-verify` |
| 🗑️ obsoleta     | superada por outra spec — diga qual                       |

## Como usar

- **Feature nova:** `/criar-spec <nome>` → gera `docs/specs/<nome>.md` a partir de `_template.md`
  e adiciona a linha aqui.
- **Implementar:** `/implement-story docs/specs/<nome>.md`.
- **Provar que está pronto:** `/qa-verify docs/specs/<nome>.md` — critério a critério, com
  evidência.
- **Requisito mudou:** edite **só a spec** e rode `/spec-sync docs/specs/<nome>.md`. O agente
  compara desejado × implementado × testes e reporta a divergência — não reexplique o contexto em
  conversa nova, a spec é o único lugar onde "o que deveria acontecer" está escrito.

## Pendências de execução humana

**`catalogo-jogos` — capa (etapa 2):**

- [x] Criar o bucket **público** `capas` no painel do Supabase (mesmo projeto do banco). Leitura
      pública; escrita só pelo backend (service role key). Recomendado: limite de 2 MB e tipos
      `image/jpeg`, `image/png`, `image/webp` configurados no próprio bucket, como segunda barreira.
- [x] Preencher `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` e `SUPABASE_STORAGE_BUCKET` em
      `apps/api/.env` (nunca commitar; a chave nunca vai para o web).

**`catalogo-jogos` — verificação real pendente (etapa 3):**

- [x] **CA-84** (`prefers-reduced-motion`): hoje só está verificado por teste (a regra CSS existe, conferida no
      Vitest). Falta a verificação real: ligar a preferência do sistema (Windows: Configurações →
      Acessibilidade → Efeitos visuais → "Efeitos de animação" desligado), abrir `/` e conferir que o
      pulso do botão, as _scanlines_, os orbes, o ponto piscando e o tremer do campo com erro estão
      parados. Só depois a spec pode virar ✅ implementada.

**`pwa-e-mobile` — ponto de quebra (etapa 1):**

- [x] O catálogo passa de 900 px para 768 px (`md`) na etapa 1. Ao terminar a etapa 1, rodar
      `/spec-sync docs/specs/catalogo-jogos.md` para conferir se algum critério ou diretriz do catálogo
      cita 900 px.

**`pwa-e-mobile` — ícones (etapa 3):**

- [x] Criar os PNGs da tabela "Ícones" da spec em `apps/web/public/` (192/512 `any`, 192/512
      `maskable` com fundo opaco, `apple-touch-icon` 180 sem transparência, favicon 32). Até lá o build
      passa, mas o app não é instalável e o convite de instalação (etapa 4) não aparece.

**`pwa-e-mobile` — aparelho real:**

- [ ] Verificar em aparelho real **CA-09** (entalhe e barra de gestos, retrato e paisagem), **CA-10**
      (teclado no Android), **CA-11** (sem zoom ao focar campo no iPhone), **CA-12** (zoom por pinça) e
      **CA-41** (atalhos do ícone no Android). O CA-41 depende de deploy com HTTPS.

**`autenticacao` — aprovações e dados (etapas 1, 3 e 4):**

- [x] Aprovar a **instalação** das dependências no início da etapa 1 (`RULES.md` §9). As bibliotecas
      já foram escolhidas em 2026-09-23 (Q1: cookie; Q2: `argon2`, com `node:crypto.scrypt` de plano B,
      e `@nestjs/throttler`); faltam `@nestjs/jwt` e `cookie-parser`.
- [x] **Decidir Q5 e aprovar a mudança destrutiva** de `Game` (Q5 decidida em 2026-09-24: descartar os jogos): `@@unique` com `userId` (migração A3) e
      `userId` obrigatório (migração A4). Backup do banco antes de cada uma.
- [x] Entre as etapas 3 e 4 (Q5 = descartar; **sem conta e sem SQL com e-mail**): listar os `capaPath`
      dos jogos sem dono, apagar esses objetos no bucket `capas`, executar
      `DELETE FROM "Game" WHERE "userId" IS NULL;` e conferir que
      `SELECT count(*) FROM "Game" WHERE "userId" IS NULL;` dá `0`. _Concluído: a A4 está aplicada
      (`migrate status` com as 5 migrações, `"userId"` `NOT NULL`), a contagem de jogos sem dono é `0`, e
      o banco já estava vazio antes da A3, sem capas para apagar._
- [x] Gerar `JWT_ACCESS_SECRET` e `JWT_REFRESH_SECRET` (diferentes) e definir `AUTH_REGISTRATION_OPEN`
      em `apps/api/.env`.

**`perfil` — o que falta para ✅ implementada (etapas 1 a 4 feitas; só conferência humana; etapa 5, redesenho e modal de preferências, feita: CA-31 a CA-41):**

- [ ] **CA-06** — "Instalar app" num Chrome real, com o app instalável (não dá para exercitar em
      Chrome headless).
- [ ] **CA-18** — conferência humana dos efeitos "Reduzidos": sem orbes, sem _scanlines_ e sem
      animação, com o sistema **sem** `prefers-reduced-motion`. Os estilos computados já foram medidos.
- [ ] **CA-23** — conferir o contraste do texto `fundo` sobre as quatro cores de destaque num
      verificador externo. Pela fórmula WCAG sobre as cores computadas: 6,28, 7,47, 9,64 e 8,98:1.

- [ ] titulo: null devolve mensagem de 120 caracteres (herdado do catálogo)

**`integracao-plataformas` — chore de `trust proxy` (fora da spec; fazer ANTES da etapa 2):**

- [ ] ⚠️ **O limite por IP já está quebrado em produção.** Sem `trust proxy`, atrás da Vercel (rewrite de `/api`)
      e do Render o `req.ip` é o IP do proxy, então login (5/min), registro (3/h) e troca de senha usam **um
      contador único para o site inteiro**: poucos logins de pessoas diferentes já dão 429 para todo mundo.
- [ ] Fazer como chore própria (`fix(api)`), com o número de saltos do `X-Forwarded-For` **medido em
      produção, não chutado** (um valor alto demais deixa o limite burlável por cabeçalho forjado; baixo demais
      mantém o problema). Cobrir por teste e conferir o `req.ip` real depois do deploy. A spec
      `integracao-plataformas` não depende dela (limite por usuário), mas a etapa 2 só começa depois.

**`integracao-plataformas` — deploy e verificação (execução humana; a spec continua 🚧 até aqui):** fazer o checklist de `ARCHITECTURE.md` §8.1
(medir o proxy → `TRUST_PROXY_HOPS` → `STEAM_API_KEY`, `API_PUBLIC_URL`, `WEB_PUBLIC_URL` → `CORS_ORIGIN`, `NODE_ENV` → `migrate status` sem pendências →
deploy), rodar o `/qa-verify` (CA-15, CA-22, CA-39, CA-53, CA-55) e conferir o `count` do CA-56 com uma conta descartável. A spec vira
✅ implementada quando isso fechar; o CA-63 (fixtures reais) fica aberto sem bloquear.

**`integracao-plataformas` — fixtures reais de privacidade (CA-63; execução humana, quando der):** perfil privado, conquistas negadas
("detalhes do jogo" privados) e biblioteca vazia ainda são resposta **simulada** (CA-20, CA-30, CA-47, CA-49 ficam `[~]`). Para fechar: deixe a
conta de teste no estado certo no site da Steam, espere alguns minutos e rode `node apps/api/scripts/capturar-fixtures-steam.cjs privado`,
`... detalhes-privados` ou `... vazio` (uma captura por execução; só grava se o estado for o esperado). Depois troque as respostas
simuladas pelos fixtures e reveja os CAs.

**`integracao-plataformas` — execução humana (etapa 1; ordem obrigatória):**

- [ ] Gerar a `STEAM_API_KEY` em `steamcommunity.com/dev/apikey` (pede um "domínio": usar o da Vercel; exige uma
      conta Steam sem restrições). Nunca commitar, nunca colar em log, spec ou PR.
- [ ] Cadastrar **`STEAM_API_KEY`, `API_PUBLIC_URL` e `WEB_PUBLIC_URL` no Render ANTES do deploy** de qualquer
      commit da etapa 1 (a API passa a exigi-las no boot e **não sobe** sem elas). Produção: as duas URLs são o
      domínio da Vercel, sem barra final. Preencher também em `apps/api/.env` (dev: `http://localhost:3333` e
      `http://localhost:5173`).
- [ ] **Informar a conta Steam de teste** (pública, com jogos e conquistas) para a chamada real que fixa os
      fixtures (perfil privado, biblioteca vazia, jogo sem conquistas, conquistas negadas, 403). Se possível,
      também uma conta com perfil privado. O SteamID e o nome dessas contas não entram em fixture, teste, log
      nem documentação (`RULES.md` §8).
- [ ] **Migration `integracao_plataformas`: já aplicada no banco na etapa 1.** Conferir que esse banco é o de produção:
      `npx prisma migrate status` deve mostrar "sem migrations pendentes" (o `migrate deploy` seria um no-op); se aparecer
      pendência, parar e confirmar qual banco é o `DATABASE_URL`/`DIRECT_URL` antes de aplicar.

Mudanças destrutivas de schema (`/db-change`) e outras aprovações explícitas exigidas por
`.claude/rules/RULES.md` entram aqui quando existirem.
