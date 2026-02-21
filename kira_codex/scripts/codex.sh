#!/usr/bin/env bash
set -euo pipefail

# ═══════════════════════════════════════════════════════════════════════════════
# Kira Codex — GPT-5.3 coding subagent via OpenAI Codex CLI.
#
# Delegates coding tasks to Codex 5.3 for autonomous code generation,
# review, bug fixing, test writing, refactoring, and explanation.
#
# Auth: ~/.codex/config.toml + ~/.codex/auth.json (ChatGPT Plus)
# CLI:  npx @openai/codex (v0.101.0)
#
# Usage: bash codex.sh <command> [--args]
# ═══════════════════════════════════════════════════════════════════════════════

# ── Ensure Node/npx is available (nvm on Hetzner) ───────────────────────────
if ! command -v npx &>/dev/null; then
  export NVM_DIR="${NVM_DIR:-$HOME/.nvm}"
  # shellcheck disable=SC1091
  [ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh"
fi

if ! command -v npx &>/dev/null; then
  echo '{"status":"error","message":"npx not found. Install Node.js or source nvm.","data":null}'
  exit 1
fi

COMMAND="${1:-help}"
shift || true

# ── Parse arguments ──────────────────────────────────────────────────────────

DIR=""
TASK=""
ISSUE=""
TARGET=""
FILE=""
FRAMEWORK=""
BASE=""
DETAIL="high"
TIMEOUT="300"
AUTO=""
UNCOMMITTED=""

while [[ $# -gt 0 ]]; do
  case "$1" in
    --dir)         DIR="$2"; shift 2 ;;
    --task)        TASK="$2"; shift 2 ;;
    --issue)       ISSUE="$2"; shift 2 ;;
    --target)      TARGET="$2"; shift 2 ;;
    --file)        FILE="$2"; shift 2 ;;
    --framework)   FRAMEWORK="$2"; shift 2 ;;
    --base)        BASE="$2"; shift 2 ;;
    --detail)      DETAIL="$2"; shift 2 ;;
    --timeout)     TIMEOUT="$2"; shift 2 ;;
    --auto)        AUTO="true"; shift ;;
    --uncommitted) UNCOMMITTED="true"; shift ;;
    *)             echo "Unknown arg: $1"; shift ;;
  esac
done

# ── Helpers ──────────────────────────────────────────────────────────────────

CODEX_BIN="npx @openai/codex@0.101.0"

json_output() {
  local status="$1"
  local message="$2"
  local data="${3:-null}"
  echo "{\"status\":\"${status}\",\"message\":\"${message}\",\"data\":${data}}"
}

# Build common flags for codex exec
build_codex_flags() {
  local flags="--ephemeral --color never"

  # Sandbox mode
  if [ "$1" = "readonly" ]; then
    flags="$flags --sandbox read-only"
  elif [ "$1" = "auto" ]; then
    flags="$flags --full-auto"
  fi

  # Skip git repo check if dir is not a git repo
  if [ -n "$DIR" ] && [ ! -d "$DIR/.git" ]; then
    flags="$flags --skip-git-repo-check"
  fi

  echo "$flags"
}

# Run codex exec with timeout and output capture
run_codex() {
  local prompt="$1"
  local mode="$2"
  local output_file="/tmp/codex_result_$$.txt"
  local stderr_file="/tmp/codex_stderr_$$.txt"

  local flags
  flags=$(build_codex_flags "$mode")

  local dir_flag=""
  if [ -n "$DIR" ]; then
    dir_flag="-C $DIR"
  fi

  # Build the full command
  local full_cmd="$CODEX_BIN exec $dir_flag $flags -o $output_file"

  local exit_code=0
  # shellcheck disable=SC2086
  timeout "$TIMEOUT" bash -c "$full_cmd \"\$1\"" -- "$prompt" 2>"$stderr_file" || exit_code=$?

  if [ $exit_code -ne 0 ]; then
    local stderr_content=""
    if [ -f "$stderr_file" ]; then
      stderr_content=$(cat "$stderr_file" 2>/dev/null || true)
    fi
    rm -f "$output_file" "$stderr_file"

    if [ $exit_code -eq 124 ]; then
      json_output "error" "Codex timed out after ${TIMEOUT}s"
      return 1
    fi

    json_output "error" "Codex exited with code $exit_code: $stderr_content"
    return 1
  fi

  # Read and return output
  if [ -f "$output_file" ]; then
    local result
    result=$(cat "$output_file")
    rm -f "$output_file" "$stderr_file"
    echo "$result"
  else
    rm -f "$stderr_file"
    json_output "error" "No output file produced"
    return 1
  fi
}

# ── Commands ─────────────────────────────────────────────────────────────────

case "$COMMAND" in

  # ── Run — execute a coding task ──────────────────────────────────────────

  run)
    if [ -z "$TASK" ]; then
      json_output "error" "Missing --task"
      exit 1
    fi
    if [ -z "$DIR" ]; then
      json_output "error" "Missing --dir"
      exit 1
    fi
    if [ ! -d "$DIR" ]; then
      json_output "error" "Directory does not exist: $DIR"
      exit 1
    fi

    mode="readonly"
    if [ "$AUTO" = "true" ]; then
      mode="auto"
    fi

    run_codex "$TASK" "$mode"
    ;;

  # ── Review — code review ────────────────────────────────────────────────

  review)
    if [ -z "$DIR" ]; then
      json_output "error" "Missing --dir"
      exit 1
    fi
    if [ ! -d "$DIR" ]; then
      json_output "error" "Directory does not exist: $DIR"
      exit 1
    fi

    prompt="review"
    if [ "$UNCOMMITTED" = "true" ]; then
      prompt="review --uncommitted"
    elif [ -n "$BASE" ]; then
      prompt="Review the changes compared to the $BASE branch. Provide feedback on code quality, potential bugs, and improvements."
    fi

    run_codex "$prompt" "readonly"
    ;;

  # ── Fix — fix a specific bug ────────────────────────────────────────────

  fix)
    if [ -z "$ISSUE" ]; then
      json_output "error" "Missing --issue"
      exit 1
    fi
    if [ -z "$DIR" ]; then
      json_output "error" "Missing --dir"
      exit 1
    fi
    if [ ! -d "$DIR" ]; then
      json_output "error" "Directory does not exist: $DIR"
      exit 1
    fi

    mode="readonly"
    if [ "$AUTO" = "true" ]; then
      mode="auto"
    fi

    run_codex "Fix this bug: $ISSUE" "$mode"
    ;;

  # ── Test — generate tests ───────────────────────────────────────────────

  test)
    if [ -z "$DIR" ]; then
      json_output "error" "Missing --dir"
      exit 1
    fi
    if [ ! -d "$DIR" ]; then
      json_output "error" "Directory does not exist: $DIR"
      exit 1
    fi

    prompt="Write comprehensive tests"
    if [ -n "$FILE" ]; then
      prompt="$prompt for the file $FILE"
    else
      prompt="$prompt for this project"
    fi
    if [ -n "$FRAMEWORK" ]; then
      prompt="$prompt using $FRAMEWORK"
    fi
    prompt="$prompt. Include edge cases, error handling, and happy path tests."

    mode="readonly"
    if [ "$AUTO" = "true" ]; then
      mode="auto"
    fi

    run_codex "$prompt" "$mode"
    ;;

  # ── Refactor — refactor code ────────────────────────────────────────────

  refactor)
    if [ -z "$TARGET" ]; then
      json_output "error" "Missing --target"
      exit 1
    fi
    if [ -z "$DIR" ]; then
      json_output "error" "Missing --dir"
      exit 1
    fi
    if [ ! -d "$DIR" ]; then
      json_output "error" "Directory does not exist: $DIR"
      exit 1
    fi

    mode="readonly"
    if [ "$AUTO" = "true" ]; then
      mode="auto"
    fi

    run_codex "Refactor: $TARGET" "$mode"
    ;;

  # ── Explain — explain code (always read-only) ──────────────────────────

  explain)
    if [ -z "$FILE" ]; then
      json_output "error" "Missing --file"
      exit 1
    fi
    if [ ! -f "$FILE" ]; then
      json_output "error" "File does not exist: $FILE"
      exit 1
    fi

    # Derive DIR from the file path if not set
    if [ -z "$DIR" ]; then
      DIR=$(dirname "$FILE")
    fi

    detail_instruction="Provide a thorough explanation"
    if [ "$DETAIL" = "low" ]; then
      detail_instruction="Provide a brief summary"
    fi

    run_codex "Explain the file $(basename "$FILE"). $detail_instruction including: purpose, key functions, data flow, and dependencies." "readonly"
    ;;

  # ── Help ────────────────────────────────────────────────────────────────

  help|--help|-h|"")
    cat <<'USAGE'
Kira Codex — GPT-5.3 Coding Subagent

Usage: bash codex.sh <command> [--args]

Commands:
  run       Execute a coding task
            --task "..." --dir <path> [--auto] [--timeout N]

  review    Code review
            --dir <path> [--uncommitted] [--base <branch>] [--timeout N]

  fix       Fix a specific bug
            --issue "..." --dir <path> [--auto] [--timeout N]

  test      Generate tests
            --dir <path> [--file "..."] [--framework "..."] [--auto] [--timeout N]

  refactor  Refactor code
            --target "..." --dir <path> [--auto] [--timeout N]

  explain   Explain code (always read-only)
            --file <path> [--detail high|low] [--timeout N]

Flags:
  --auto         Enable full-auto mode (Codex can write files)
  --timeout N    Timeout in seconds (default: 300)
  --uncommitted  Review uncommitted changes (review only)

Examples:
  bash codex.sh run --task "Add WebSocket support" --dir ./my-api --auto
  bash codex.sh review --dir ./my-api --uncommitted
  bash codex.sh fix --issue "500 error on login" --dir ./my-api --auto
  bash codex.sh test --dir ./my-api --file src/auth.ts --auto
  bash codex.sh refactor --target "Extract repository pattern" --dir ./my-api --auto
  bash codex.sh explain --file ./my-api/src/auth.ts --detail high

Auth: Pre-configured at ~/.codex/config.toml (ChatGPT Plus). No API keys needed.
Model: gpt-5.3-codex with xhigh reasoning effort.
USAGE
    ;;

  *)
    json_output "error" "Unknown command: $COMMAND. Run 'bash codex.sh help' for usage."
    exit 1
    ;;
esac
