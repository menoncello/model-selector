# model-selector

A Claude Code hook that picks the model (haiku, sonnet, opus) and effort for each subagent. Before the subagent runs, the hook sends the task text to Jev (TypeSafe) and fills in `model` and `effort` on the call.

It covers the `Agent` tool and `agent()` calls inside workflows. For a workflow, the script is rewritten before it runs, and the approval prompt shows what was picked for each call. If a call already sets `model` or `effort`, the hook leaves it alone.

## Install (global)

```sh
cd model-router && bun install
ln -sfn "$PWD" ~/.claude/hooks/model-router
ln -sfn "$(dirname "$PWD")/agents/executor.md" ~/.claude/agents/executor.md
```

In `~/.claude/settings.json`:

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

Then paste `delegation.md` into `~/.claude/CLAUDE.md`.

## Tuning

Rubrics, effort thresholds and the timeout live in `model-router/config.ts`. Decisions and the cache go to `~/.claude/model-router/` (`decisions.jsonl`, `cache.json`). If Jev fails or takes longer than the timeout, the call runs unchanged.

## Limits

Set these in the `env` block of `~/.claude/settings.json`:

- `MODEL_ROUTER_MAX_TIER` (`haiku`, `sonnet`, `opus`): any bigger model the hook picks becomes this one. Default `opus`, no cap.
- `MODEL_ROUTER_MAX_EFFORT` (`none`, `low`, `medium`, `high`, `xhigh`, `max`): same for reasoning effort. Default `max`, no cap.

Effort `none` means the hook sends no effort and the subagent runs at its default. Limits only apply to what the hook picks; a call that sets `model` or `effort` itself is left alone. An invalid value is ignored.

## What it cost

```sh
bun ~/.claude/hooks/model-router/report.ts [--since 2026-10-01] [--project folder-name]
```

Reads the subagent transcripts in `~/.claude/projects` and sums tokens and cost by model and effort, using the price table in `report.ts`. The "same tokens on opus" column reprices the same tokens at Opus rates. Treat it as a reference point: Opus would have used a different number of tokens.

## Development

```sh
cd model-router
bun install
bun run lint && bun run typecheck && bun test
```

Tests mock Jev, so they need no API key. CI runs the same three checks on every pull request.
