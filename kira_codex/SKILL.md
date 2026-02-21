---
name: kira-codex
description: "Codex 5.3 subagent for autonomous coding. Delegate code generation, refactoring, bug fixes, test writing, and code review to OpenAI Codex CLI (GPT-5.3). Commands: run (execute coding task), review (code review), fix (fix bugs), test (write tests), refactor (refactor code), explain (explain code). Use when: heavy code generation, multi-file changes, writing tests, code review, complex refactoring."
metadata:
  openclaw:
    emoji: "\U0001F916"
    requires:
      env: []
      bins: ["npx"]
---

# Kira Codex — GPT-5.3 Coding Subagent

Delegate heavy coding tasks to OpenAI Codex 5.3. Runs autonomously in a target directory using the Codex CLI.

**Auth**: Pre-configured at `~/.codex/config.toml` + `~/.codex/auth.json` (ChatGPT Plus). No API keys needed.
**Model**: `gpt-5.3-codex` with `xhigh` reasoning effort.
**CLI**: `npx @openai/codex` (v0.101.0).

---

## Commands

All commands use:
```bash
bash skills/kira_codex/scripts/codex.sh <command> [--args]
```

### run — Execute a coding task

```bash
# Implement a feature (full-auto mode — Codex can write files)
bash skills/kira_codex/scripts/codex.sh run --task "Add WebSocket support to the server" --dir "/workspace/kira/projects/my-api" --auto

# Execute a coding task (read-only sandbox — no file writes)
bash skills/kira_codex/scripts/codex.sh run --task "Analyze the auth module and suggest improvements" --dir "/workspace/kira/projects/my-api"
```

### review — Code review

```bash
# Review uncommitted changes
bash skills/kira_codex/scripts/codex.sh review --dir "/workspace/kira/projects/my-api" --uncommitted

# Review changes against a base branch
bash skills/kira_codex/scripts/codex.sh review --dir "/workspace/kira/projects/my-api" --base main
```

### fix — Fix a specific bug

```bash
# Fix a described issue (full-auto mode)
bash skills/kira_codex/scripts/codex.sh fix --issue "Auth middleware returns 500 on expired tokens" --dir "/workspace/kira/projects/my-api" --auto

# Fix in read-only mode (suggests changes without writing)
bash skills/kira_codex/scripts/codex.sh fix --issue "Memory leak in WebSocket handler" --dir "/workspace/kira/projects/my-api"
```

### test — Generate tests

```bash
# Generate tests for a specific file
bash skills/kira_codex/scripts/codex.sh test --dir "/workspace/kira/projects/my-api" --file "src/auth.ts"

# Generate tests for the whole project with a specific framework
bash skills/kira_codex/scripts/codex.sh test --dir "/workspace/kira/projects/my-api" --framework "vitest"

# Generate tests (full-auto — writes test files)
bash skills/kira_codex/scripts/codex.sh test --dir "/workspace/kira/projects/my-api" --file "src/auth.ts" --auto
```

### refactor — Refactor code

```bash
# Refactor with description (full-auto mode)
bash skills/kira_codex/scripts/codex.sh refactor --target "Extract DB queries into repository pattern" --dir "/workspace/kira/projects/my-api" --auto

# Refactor in read-only mode (suggests changes)
bash skills/kira_codex/scripts/codex.sh refactor --target "Simplify error handling in routes" --dir "/workspace/kira/projects/my-api"
```

### explain — Explain code (read-only)

```bash
# Explain a specific file
bash skills/kira_codex/scripts/codex.sh explain --file "/workspace/kira/projects/my-api/src/auth.ts"

# Explain with high detail
bash skills/kira_codex/scripts/codex.sh explain --file "/workspace/kira/projects/my-api/src/auth.ts" --detail high

# Explain with low detail (summary)
bash skills/kira_codex/scripts/codex.sh explain --file "/workspace/kira/projects/my-api/src/auth.ts" --detail low
```

---

## Flags

| Flag | Description | Used By |
|------|-------------|---------|
| `--task` | Coding task description | run |
| `--dir` | Target directory | run, review, fix, test, refactor |
| `--auto` | Enable full-auto mode (Codex can write files) | run, fix, test, refactor |
| `--file` | Target file path | test, explain |
| `--framework` | Test framework to use | test |
| `--issue` | Bug description | fix |
| `--target` | Refactoring description | refactor |
| `--base` | Base branch for review diff | review |
| `--uncommitted` | Review uncommitted changes | review |
| `--detail` | Detail level: high or low | explain |
| `--timeout` | Timeout in seconds (default: 300) | all |

---

## When to Use kira-codex vs kira-code

| Scenario | Use |
|----------|-----|
| Run/test/build/scaffold projects | `kira-code` |
| Write new code, implement features | `kira-codex` |
| Fix bugs in existing code | `kira-codex` |
| Code review | `kira-codex` |
| Write test suites | `kira-codex` |
| Complex multi-file refactoring | `kira-codex` |
| Explain unfamiliar code | `kira-codex` |
| Manage dependencies | `kira-code` |
| Run linter or build | `kira-code` |

---

## Sandbox Modes

- **Without `--auto`**: Read-only sandbox. Codex can read files and suggest changes but cannot write.
- **With `--auto`**: Full-auto mode (`--full-auto`). Codex can read and write files in the target directory. Use for implementation tasks.

The `explain` and `review` commands always run read-only regardless of flags.
