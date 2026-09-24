# Índice de specs — checkpoint

Mapa único de `spec ↔ status`. **Este arquivo é a fonte da verdade sobre o que existe**; não
confie em adivinhar nome de arquivo. Quem cria ou fecha uma spec atualiza esta tabela no mesmo
commit — `/docs-sync` confere se ela bate com a realidade.

| Feature           | Spec                                   | Status          |
| ----------------- | -------------------------------------- | --------------- |
| Catálogo de jogos | [catalogo-jogos.md](catalogo-jogos.md) | 🚧 em andamento |
| PWA e mobile      | [pwa-e-mobile.md](pwa-e-mobile.md)     | 🚧 em andamento |
| Autenticação      | [autenticacao.md](autenticacao.md)     | 📝 rascunho     |
| Perfil            | [perfil.md](perfil.md)                 | 📝 rascunho     |

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

**`autenticacao` — aprovações e dados (etapas 1, 3 e 4):**

- [ ] Aprovar a **instalação** das dependências no início da etapa 1 (`RULES.md` §9). As bibliotecas
      já foram escolhidas em 2026-09-23 (Q1: cookie; Q2: `argon2`, com `node:crypto.scrypt` de plano B,
      e `@nestjs/throttler`); faltam `@nestjs/jwt` e `cookie-parser`.
- [ ] **Decidir Q5 e aprovar a mudança destrutiva** de `Game` (ainda em aberto): `@@unique` com `userId` (migração A3) e
      `userId` obrigatório (migração A4). Backup do banco antes de cada uma.
- [ ] Entre as etapas 3 e 4: criar a própria conta e executar o SQL de destino dos jogos sem dono (Q5).
      Não commitar esse SQL (tem e-mail real).
- [ ] Gerar `JWT_ACCESS_SECRET` e `JWT_REFRESH_SECRET` (diferentes) e definir `AUTH_REGISTRATION_OPEN`
      em `apps/api/.env`.

Mudanças destrutivas de schema (`/db-change`) e outras aprovações explícitas exigidas por
`.claude/rules/RULES.md` entram aqui quando existirem.
