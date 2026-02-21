#!/usr/bin/env bash
set -euo pipefail

# ═══════════════════════════════════════════════════════════════════════════════
# Kira Git — Unified git/GitHub operations for both repos.
# Auto-detects which token to use based on working directory or remote URL.
#
# Usage: bash git.sh <command> [--args]
# ═══════════════════════════════════════════════════════════════════════════════

COMMAND="${1:-help}"
shift || true

# ── Parse arguments ──────────────────────────────────────────────────────────

DIR=""
MESSAGE=""
FILES=""
NAME=""
DESCRIPTION=""
PUBLIC="true"
REPO=""
BRANCH=""
TITLE=""
BODY=""
NOTES=""
TAG=""
NUMBER=""
LIMIT="10"
CONFIRM=""

while [[ $# -gt 0 ]]; do
  case "$1" in
    --dir)        DIR="$2"; shift 2 ;;
    --message)    MESSAGE="$2"; shift 2 ;;
    --files)      FILES="$2"; shift 2 ;;
    --name)       NAME="$2"; shift 2 ;;
    --description) DESCRIPTION="$2"; shift 2 ;;
    --public)     PUBLIC="true"; shift ;;
    --private)    PUBLIC="false"; shift ;;
    --repo)       REPO="$2"; shift 2 ;;
    --branch)     BRANCH="$2"; shift 2 ;;
    --title)      TITLE="$2"; shift 2 ;;
    --body)       BODY="$2"; shift 2 ;;
    --notes)      NOTES="$2"; shift 2 ;;
    --tag)        TAG="$2"; shift 2 ;;
    --number)     NUMBER="$2"; shift 2 ;;
    --limit)      LIMIT="$2"; shift 2 ;;
    --confirm)    CONFIRM="true"; shift ;;
    *)            echo "Unknown arg: $1"; shift ;;
  esac
done

# ── Token detection ──────────────────────────────────────────────────────────

INFRA_DIR="/opt/kira-os"
PERSONAL_DIR="/workspace/kira/projects"

detect_token() {
  local check_dir="${1:-$(pwd)}"

  # Check if we're in the infra monorepo
  if [[ "$check_dir" == "$INFRA_DIR"* ]]; then
    echo "GITHUB_PAT"
    return
  fi

  # Check if we're in a personal project
  if [[ "$check_dir" == "$PERSONAL_DIR"* ]]; then
    echo "GITHUB_TOKEN"
    return
  fi

  # Check git remote URL as fallback
  local remote_url
  remote_url=$(cd "$check_dir" 2>/dev/null && git remote get-url origin 2>/dev/null || echo "")

  if [[ "$remote_url" == *"Braintied-Nex"* ]]; then
    echo "GITHUB_PAT"
  else
    echo "GITHUB_TOKEN"
  fi
}

get_token_value() {
  local token_name
  token_name=$(detect_token "${DIR:-$(pwd)}")
  echo "${!token_name:-}"
}

get_token_name() {
  detect_token "${DIR:-$(pwd)}"
}

# Change to target directory if specified
if [ -n "$DIR" ]; then
  cd "$DIR"
fi

# ── Helper functions ─────────────────────────────────────────────────────────

json_output() {
  local status="$1"
  local message="$2"
  local data="${3:-null}"
  echo "{\"status\":\"${status}\",\"message\":\"${message}\",\"data\":${data}}"
}

ensure_git_repo() {
  if ! git rev-parse --is-inside-work-tree &>/dev/null; then
    json_output "error" "Not a git repository: $(pwd)"
    exit 1
  fi
}

get_remote_repo() {
  local url
  url=$(git remote get-url origin 2>/dev/null || echo "")
  # Extract org/repo from URL
  echo "$url" | sed -E 's|.*github\.com[:/]||' | sed 's/\.git$//'
}

# ── Commands ─────────────────────────────────────────────────────────────────

case "$COMMAND" in

  # ── Status & Info ────────────────────────────────────────────────────────

  status)
    ensure_git_repo
    BRANCH_NAME=$(git branch --show-current 2>/dev/null || echo "detached")
    REMOTE_REPO=$(get_remote_repo)
    TOKEN_NAME=$(get_token_name)
    CHANGES=$(git status --porcelain | wc -l | tr -d ' ')
    STAGED=$(git diff --cached --name-only | wc -l | tr -d ' ')
    echo "=== Git Status ==="
    echo "Directory:  $(pwd)"
    echo "Repo:       ${REMOTE_REPO:-unknown}"
    echo "Branch:     $BRANCH_NAME"
    echo "Token:      $TOKEN_NAME"
    echo "Changed:    $CHANGES files"
    echo "Staged:     $STAGED files"
    echo ""
    git status --short
    ;;

  log)
    ensure_git_repo
    git log --oneline --graph -"$LIMIT"
    ;;

  diff)
    ensure_git_repo
    echo "=== Staged ==="
    git diff --cached --stat
    echo ""
    echo "=== Unstaged ==="
    git diff --stat
    echo ""
    git diff --cached
    git diff
    ;;

  # ── Commit & Push ──────────────────────────────────────────────────────

  commit)
    ensure_git_repo
    if [ -z "$MESSAGE" ]; then
      json_output "error" "Missing --message"
      exit 1
    fi

    if [ -n "$FILES" ]; then
      # shellcheck disable=SC2086
      git add $FILES
    else
      git add -A
    fi

    STAGED_COUNT=$(git diff --cached --name-only | wc -l | tr -d ' ')
    if [ "$STAGED_COUNT" -eq 0 ]; then
      json_output "ok" "Nothing to commit — working tree clean"
      exit 0
    fi

    git commit -m "$MESSAGE"
    HASH=$(git rev-parse --short HEAD)
    json_output "ok" "Committed ${HASH}: ${MESSAGE}" "\"${HASH}\""
    ;;

  push)
    ensure_git_repo
    TOKEN_VALUE=$(get_token_value)
    TOKEN_NAME=$(get_token_name)
    REMOTE_REPO=$(get_remote_repo)

    if [ -z "$TOKEN_VALUE" ]; then
      json_output "error" "Token ${TOKEN_NAME} not set in environment"
      exit 1
    fi

    BRANCH_NAME=$(git branch --show-current)
    echo "Pushing to ${REMOTE_REPO} (${BRANCH_NAME}) using ${TOKEN_NAME}..."
    git push "https://${TOKEN_VALUE}@github.com/${REMOTE_REPO}.git" "$BRANCH_NAME" 2>&1
    json_output "ok" "Pushed to ${REMOTE_REPO} (${BRANCH_NAME})"
    ;;

  pull)
    ensure_git_repo
    TOKEN_VALUE=$(get_token_value)
    REMOTE_REPO=$(get_remote_repo)
    BRANCH_NAME=$(git branch --show-current)

    if [ -n "$TOKEN_VALUE" ] && [ -n "$REMOTE_REPO" ]; then
      git pull "https://${TOKEN_VALUE}@github.com/${REMOTE_REPO}.git" "$BRANCH_NAME" 2>&1
    else
      git pull 2>&1
    fi
    json_output "ok" "Pulled latest for $(pwd)"
    ;;

  commit-push)
    ensure_git_repo
    if [ -z "$MESSAGE" ]; then
      json_output "error" "Missing --message"
      exit 1
    fi

    if [ -n "$FILES" ]; then
      # shellcheck disable=SC2086
      git add $FILES
    else
      git add -A
    fi

    STAGED_COUNT=$(git diff --cached --name-only | wc -l | tr -d ' ')
    if [ "$STAGED_COUNT" -eq 0 ]; then
      json_output "ok" "Nothing to commit — working tree clean"
      exit 0
    fi

    git commit -m "$MESSAGE"
    HASH=$(git rev-parse --short HEAD)

    TOKEN_VALUE=$(get_token_value)
    TOKEN_NAME=$(get_token_name)
    REMOTE_REPO=$(get_remote_repo)
    BRANCH_NAME=$(git branch --show-current)

    if [ -z "$TOKEN_VALUE" ]; then
      json_output "error" "Token ${TOKEN_NAME} not set. Committed locally as ${HASH} but could not push."
      exit 1
    fi

    git push "https://${TOKEN_VALUE}@github.com/${REMOTE_REPO}.git" "$BRANCH_NAME" 2>&1
    json_output "ok" "Committed ${HASH} and pushed to ${REMOTE_REPO} (${BRANCH_NAME})"
    ;;

  # ── Branching ──────────────────────────────────────────────────────────

  create-branch)
    ensure_git_repo
    if [ -z "$NAME" ]; then
      json_output "error" "Missing --name"
      exit 1
    fi
    git checkout -b "$NAME"
    json_output "ok" "Created and switched to branch: ${NAME}"
    ;;

  switch-branch)
    ensure_git_repo
    if [ -z "$NAME" ]; then
      json_output "error" "Missing --name"
      exit 1
    fi
    git checkout "$NAME"
    json_output "ok" "Switched to branch: ${NAME}"
    ;;

  merge)
    ensure_git_repo
    if [ -z "$BRANCH" ]; then
      json_output "error" "Missing --branch"
      exit 1
    fi
    git merge "$BRANCH"
    json_output "ok" "Merged ${BRANCH} into $(git branch --show-current)"
    ;;

  branches)
    ensure_git_repo
    git branch -a --format='%(refname:short) %(upstream:short) %(objectname:short) %(subject)' | head -"$LIMIT"
    ;;

  # ── GitHub Repos (Personal) ───────────────────────────────────────────

  list-repos)
    GH_TOKEN="${GITHUB_TOKEN:-}" gh repo list kira-os \
      --json name,description,updatedAt,visibility \
      --limit "$LIMIT" \
      --template '{{range .}}{{.name}}  {{.visibility}}  {{.description}}  ({{timeago .updatedAt}}){{"\n"}}{{end}}'
    ;;

  create-repo)
    if [ -z "$NAME" ]; then
      json_output "error" "Missing --name"
      exit 1
    fi

    VISIBILITY="--public"
    if [ "$PUBLIC" = "false" ]; then
      VISIBILITY="--private"
    fi

    DESC_FLAG=""
    if [ -n "$DESCRIPTION" ]; then
      DESC_FLAG="--description"
    fi

    echo "Creating repo kira-os/${NAME}..."
    GH_TOKEN="${GITHUB_TOKEN:-}" gh repo create "kira-os/${NAME}" $VISIBILITY \
      ${DESC_FLAG:+$DESC_FLAG "$DESCRIPTION"} \
      --confirm 2>&1

    json_output "ok" "Created repo: https://github.com/kira-os/${NAME}"
    ;;

  clone)
    if [ -z "$REPO" ]; then
      json_output "error" "Missing --repo (e.g. kira-os/my-project)"
      exit 1
    fi

    # Determine target directory
    REPO_NAME=$(echo "$REPO" | cut -d'/' -f2)
    TARGET="${PERSONAL_DIR}/${REPO_NAME}"

    if [ -d "$TARGET" ]; then
      json_output "ok" "Already cloned at ${TARGET}"
      exit 0
    fi

    echo "Cloning ${REPO} to ${TARGET}..."
    GH_TOKEN="${GITHUB_TOKEN:-}" gh repo clone "$REPO" "$TARGET" 2>&1
    json_output "ok" "Cloned to ${TARGET}"
    ;;

  delete-repo)
    if [ -z "$REPO" ]; then
      json_output "error" "Missing --repo"
      exit 1
    fi
    if [ "$CONFIRM" != "true" ]; then
      json_output "error" "Add --confirm to delete repo ${REPO}"
      exit 1
    fi

    GH_TOKEN="${GITHUB_TOKEN:-}" gh repo delete "$REPO" --yes 2>&1
    json_output "ok" "Deleted repo: ${REPO}"
    ;;

  # ── Pull Requests ──────────────────────────────────────────────────────

  pr-create)
    ensure_git_repo
    if [ -z "$TITLE" ]; then
      json_output "error" "Missing --title"
      exit 1
    fi

    TOKEN_NAME=$(get_token_name)
    PR_ARGS=(--title "$TITLE")
    if [ -n "$BODY" ]; then
      PR_ARGS+=(--body "$BODY")
    fi

    GH_TOKEN="${!TOKEN_NAME:-}" gh pr create "${PR_ARGS[@]}" 2>&1
    ;;

  pr-list)
    TOKEN_NAME=$(get_token_name)
    PR_ARGS=(--limit "$LIMIT" --json number,title,state,author,updatedAt)

    if [ -n "$REPO" ]; then
      PR_ARGS+=(--repo "$REPO")
    fi

    GH_TOKEN="${!TOKEN_NAME:-}" gh pr list "${PR_ARGS[@]}" 2>&1
    ;;

  pr-merge)
    ensure_git_repo
    if [ -z "$NUMBER" ]; then
      json_output "error" "Missing --number"
      exit 1
    fi

    TOKEN_NAME=$(get_token_name)
    GH_TOKEN="${!TOKEN_NAME:-}" gh pr merge "$NUMBER" --merge 2>&1
    json_output "ok" "Merged PR #${NUMBER}"
    ;;

  pr-view)
    ensure_git_repo
    if [ -z "$NUMBER" ]; then
      json_output "error" "Missing --number"
      exit 1
    fi

    TOKEN_NAME=$(get_token_name)
    GH_TOKEN="${!TOKEN_NAME:-}" gh pr view "$NUMBER" 2>&1
    ;;

  # ── Issues ─────────────────────────────────────────────────────────────

  issues)
    TOKEN_NAME=$(get_token_name)
    ISSUE_ARGS=(--limit "$LIMIT" --json number,title,state,labels,updatedAt)

    if [ -n "$REPO" ]; then
      ISSUE_ARGS+=(--repo "$REPO")
    fi

    GH_TOKEN="${!TOKEN_NAME:-}" gh issue list "${ISSUE_ARGS[@]}" 2>&1
    ;;

  issue-create)
    ensure_git_repo
    if [ -z "$TITLE" ]; then
      json_output "error" "Missing --title"
      exit 1
    fi

    TOKEN_NAME=$(get_token_name)
    ISSUE_ARGS=(--title "$TITLE")
    if [ -n "$BODY" ]; then
      ISSUE_ARGS+=(--body "$BODY")
    fi

    GH_TOKEN="${!TOKEN_NAME:-}" gh issue create "${ISSUE_ARGS[@]}" 2>&1
    ;;

  issue-close)
    ensure_git_repo
    if [ -z "$NUMBER" ]; then
      json_output "error" "Missing --number"
      exit 1
    fi

    TOKEN_NAME=$(get_token_name)
    GH_TOKEN="${!TOKEN_NAME:-}" gh issue close "$NUMBER" 2>&1
    json_output "ok" "Closed issue #${NUMBER}"
    ;;

  # ── Releases ───────────────────────────────────────────────────────────

  release)
    ensure_git_repo
    if [ -z "$TAG" ]; then
      json_output "error" "Missing --tag"
      exit 1
    fi

    TOKEN_NAME=$(get_token_name)
    RELEASE_ARGS=(--tag "$TAG")
    if [ -n "$TITLE" ]; then
      RELEASE_ARGS+=(--title "$TITLE")
    fi
    if [ -n "$NOTES" ]; then
      RELEASE_ARGS+=(--notes "$NOTES")
    fi

    GH_TOKEN="${!TOKEN_NAME:-}" gh release create "${RELEASE_ARGS[@]}" 2>&1
    ;;

  releases)
    TOKEN_NAME=$(get_token_name)
    RELEASE_ARGS=(--limit "$LIMIT")
    if [ -n "$REPO" ]; then
      RELEASE_ARGS+=(--repo "$REPO")
    fi

    GH_TOKEN="${!TOKEN_NAME:-}" gh release list "${RELEASE_ARGS[@]}" 2>&1
    ;;

  # ── Help ───────────────────────────────────────────────────────────────

  help|*)
    cat <<'HELP'
Kira Git — Unified git/GitHub operations

STATUS & INFO:
  status              Show git status (branch, changes, token)
  log                 Show recent commit log
  diff                Show staged + unstaged changes

COMMIT & PUSH:
  commit              Stage and commit (--message, --files)
  push                Push to remote (auto-detects token)
  pull                Pull from remote
  commit-push         Commit and push in one step

BRANCHING:
  create-branch       Create and switch (--name)
  switch-branch       Switch to branch (--name)
  merge               Merge branch into current (--branch)
  branches            List all branches

GITHUB REPOS:
  list-repos          List kira-os/* repos
  create-repo         Create new repo (--name, --description, --public/--private)
  clone               Clone to workspace (--repo "kira-os/name")
  delete-repo         Delete repo (--repo, --confirm)

PULL REQUESTS:
  pr-create           Create PR (--title, --body)
  pr-list             List PRs (--repo)
  pr-merge            Merge PR (--number)
  pr-view             View PR details (--number)

ISSUES:
  issues              List issues (--repo)
  issue-create        Create issue (--title, --body)
  issue-close         Close issue (--number)

RELEASES:
  release             Create release (--tag, --title, --notes)
  releases            List releases (--repo)

GLOBAL OPTIONS:
  --dir <path>        Work in specific directory
  --limit <n>         Limit results (default: 10)
HELP
    ;;

esac
