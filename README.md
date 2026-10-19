# model-selector

Hook do Claude Code que escolhe modelo (haiku, sonnet, opus) e esforço para cada subagent. Antes de o subagent rodar, o hook manda o texto da tarefa para o Jev (TypeSafe) e preenche `model` e `effort` na chamada.

Cobre o tool `Agent` e os `agent()` dentro de workflows. Num workflow, o script é reescrito antes de rodar, e o pedido de aprovação mostra o que foi escolhido para cada chamada. Se a chamada já traz `model` ou `effort`, o hook respeita.

## Instalação (global)

```sh
cd model-router && bun install
ln -sfn "$PWD" ~/.claude/hooks/model-router
ln -sfn "$(dirname "$PWD")/agents/executor.md" ~/.claude/agents/executor.md
```

No `~/.claude/settings.json`:

```json
{
  "env": { "TYPESAFE_API_KEY": "..." },
  "permissions": { "deny": ["Agent(fork)"] },
  "hooks": {
    "PreToolUse": [
      {
        "matcher": "Agent|Workflow",
        "hooks": [{ "type": "command", "command": "bun ~/.claude/hooks/model-router/router.ts", "timeout": 10 }]
      }
    ]
  }
}
```

E cole `delegation.md` no `~/.claude/CLAUDE.md`.

## Ajustes

Rubricas, limiares de esforço e timeout ficam em `model-router/config.ts`. Decisões e cache vão para `~/.claude/model-router/` (`decisions.jsonl`, `cache.json`). Se o Jev falhar ou demorar mais que o timeout, a chamada segue sem alteração.

## Quanto custou

```sh
bun ~/.claude/hooks/model-router/report.ts [--since 2026-10-01] [--project nome-da-pasta]
```

Lê os transcripts dos subagents em `~/.claude/projects` e soma tokens e custo por modelo e esforço, usando a tabela de preços em `report.ts`. A coluna "same tokens on opus" recalcula os mesmos tokens com o preço do Opus. Serve de referência, não de medida exata, porque o Opus usaria outra quantidade de tokens.
