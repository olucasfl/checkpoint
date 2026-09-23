# Índice de specs — checkpoint

Mapa único de `spec ↔ status`. **Este arquivo é a fonte da verdade sobre o que existe**; não
confie em adivinhar nome de arquivo. Quem cria ou fecha uma spec atualiza esta tabela no mesmo
commit — `/docs-sync` confere se ela bate com a realidade.

| Feature           | Spec                                   | Status          |
| ----------------- | -------------------------------------- | --------------- |
| Catálogo de jogos | [catalogo-jogos.md](catalogo-jogos.md) | 🚧 em andamento |

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

- [ ] **CA-84** (`prefers-reduced-motion`): hoje só está verificado por teste (a regra CSS existe, conferida no
      Vitest). Falta a verificação real: ligar a preferência do sistema (Windows: Configurações →
      Acessibilidade → Efeitos visuais → "Efeitos de animação" desligado), abrir `/` e conferir que o
      pulso do botão, as _scanlines_, os orbes, o ponto piscando e o tremer do campo com erro estão
      parados. Só depois a spec pode virar ✅ implementada.

Mudanças destrutivas de schema (`/db-change`) e outras aprovações explícitas exigidas por
`.claude/rules/RULES.md` entram aqui quando existirem.
