---
description: Prova, critério a critério, se a spec está atendida contra a aplicação local no ar. Não corrige nada.
argument-hint: <caminho-da-spec>
---

Verifique **$ARGUMENTS** contra a implementação atual. Sua entrega é **evidência**, não opinião.

## Regra que define este comando

**Você não corrige nada.** Se algo falhar, reporte e pare. Correção é `/fix-bug`, em outra
execução, com outro agente. Misturar as duas coisas faz o mesmo agente racionalizar um resultado
ruim como aceitável para "fechar a tarefa".

## Preparação

1. Leia a spec e extraia os critérios de aceite. Se não estiverem em BDD, avise na primeira linha.
2. Leia a seção **Requisitos de saída**: método, path, DTO, response (para rotas de API) ou
   campos/estados de tela (para o frontend). É dela que sai cada verificação.
3. Suba a aplicação **local**: confirme que o Postgres de `DATABASE_URL` está acessível (não há
   Docker neste projeto) e rode `npm run dev`. Espere ficar de pé antes de disparar qualquer
   verificação. Se não subir, **avise e pare** — não simule resultado.

## Regras de execução

- **Só `http://localhost:3333/api` e `http://localhost:5173`.** Nunca qualquer ambiente que não
  seja este checkout local.
- Teste também os caminhos negativos que a spec exige: payload inválido → 400; recurso inexistente
  → 404 (ou o que a spec definir); campo não declarado no DTO → removido ou 400, conforme o caso.

## Formato de cada verificação (rota de API)

```
# Critério 2: Dado um payload inválido, quando POST /api/games, então 400
curl -s -o /dev/null -w "%{http_code}" -X POST http://localhost:3333/api/games \
  -H "Content-Type: application/json" -d '{}'
```

Cole o comando **e a saída real**. Para critério de UI, descreva o passo (rota, ação, campo) e o
que foi observado — print ou texto, nunca "deveria funcionar".

## Saída

| #   | Critério                  | Passou? | Evidência                   |
| --- | ------------------------- | ------- | --------------------------- |
| 1   | Dado X, quando Y, então Z | ✅      | `curl … → 201 {"id":"..."}` |
| 2   | …                         | ❌      | esperado 400, recebido 201  |

Feche com uma linha: **quantos passaram de quantos**, e se a feature pode ser fechada. Se houver
falha, liste os critérios que falharam — sem propor a correção.
