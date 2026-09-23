# Índice de specs — checkpoint

Mapa único de `spec ↔ status`. **Este arquivo é a fonte da verdade sobre o que existe**; não
confie em adivinhar nome de arquivo. Quem cria ou fecha uma spec atualiza esta tabela no mesmo
commit — `/docs-sync` confere se ela bate com a realidade.

Nenhuma spec foi escrita ainda — checkpoint é um esqueleto sem entidades de domínio
(`ARCHITECTURE.md` §1). A primeira linha desta tabela nasce com a primeira feature real.

| Feature | Spec | Status |
| ------- | ---- | ------ |
| —       | —    | —      |

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

Nenhuma no momento. Mudanças destrutivas de schema (`/db-change`) e outras aprovações explícitas
exigidas por `.claude/rules/RULES.md` entram aqui quando existirem.
