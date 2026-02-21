---
name: kira-git
description: "Git and GitHub operations for both repos. Commands: status, log, diff, commit, push, pull, create-repo, list-repos, clone, create-branch, switch-branch, merge, pr-create, pr-list, pr-merge, issues, release. Two repos: personal (kira-os/*) and infra (Braintied-Nex/kira-os). Auto-detects which token to use based on working directory."
metadata:
  openclaw:
    emoji: "📦"
    requires:
      env: ["GITHUB_TOKEN", "GITHUB_PAT"]
      bins: ["git", "gh"]
---

# Kira Git & GitHub

You have **two GitHub identities**. This skill handles both seamlessly.

---

## Two Repos, Two Tokens

| Repo | Account | Token | Working Directory | Purpose |
|------|---------|-------|-------------------|---------|
| `kira-os/*` | Your account (`kira-os`) | `GITHUB_TOKEN` | `/workspace/kira/projects/*` | Your personal projects, portfolio, experiments |
| `Braintied-Nex/kira-os` | Galeon's org | `GITHUB_PAT` | `/opt/kira-os/` | Infrastructure monorepo (your own config, skills, dashboard, deploy) |

**The script auto-detects which token to use based on your current directory or the `--repo` flag.**

## CRITICAL RULES

1. **ALWAYS check `pwd` and `git remote -v` before pushing.** Wrong token = auth failure or pushing to wrong repo.
2. **Personal projects** go in `/workspace/kira/projects/<name>` and push to `kira-os/<name>`.
3. **Infra changes** (identity, skills, dashboard, deploy) go in `/opt/kira-os/` and push to `Braintied-Nex/kira-os`.
4. **NEVER use `GITHUB_PAT` for `kira-os/*` repos. NEVER use `GITHUB_TOKEN` for `Braintied-Nex` repos.**
5. **Before creating any new repo**, check the project registry and existing repos first.

---

## Commands

All commands use:
```bash
bash skills/kira_git/scripts/git.sh <command> [--args]
```

### Status & Info

```bash
# Git status in current directory
bash skills/kira_git/scripts/git.sh status

# Git status in a specific directory
bash skills/kira_git/scripts/git.sh status --dir "/workspace/kira/projects/mev-watch"

# Recent commit log
bash skills/kira_git/scripts/git.sh log
bash skills/kira_git/scripts/git.sh log --limit 20
bash skills/kira_git/scripts/git.sh log --dir "/opt/kira-os"

# Show diff (staged + unstaged)
bash skills/kira_git/scripts/git.sh diff
bash skills/kira_git/scripts/git.sh diff --dir "/workspace/kira/projects/mev-watch"
```

### Commit & Push

```bash
# Commit all changes with a message
bash skills/kira_git/scripts/git.sh commit --message "Add authentication middleware"

# Commit specific files
bash skills/kira_git/scripts/git.sh commit --message "Fix login bug" --files "src/auth.ts src/login.tsx"

# Push to remote (auto-detects token)
bash skills/kira_git/scripts/git.sh push

# Push a specific directory
bash skills/kira_git/scripts/git.sh push --dir "/opt/kira-os"

# Pull latest from remote
bash skills/kira_git/scripts/git.sh pull
bash skills/kira_git/scripts/git.sh pull --dir "/opt/kira-os"

# Commit and push in one step
bash skills/kira_git/scripts/git.sh commit-push --message "Ship new feature"
```

### Branching

```bash
# Create and switch to a new branch
bash skills/kira_git/scripts/git.sh create-branch --name "feature/auth"

# Switch to existing branch
bash skills/kira_git/scripts/git.sh switch-branch --name "main"

# Merge a branch into current
bash skills/kira_git/scripts/git.sh merge --branch "feature/auth"

# List branches
bash skills/kira_git/scripts/git.sh branches
```

### GitHub Repos (Personal — kira-os/*)

```bash
# List all your repos
bash skills/kira_git/scripts/git.sh list-repos

# Create a new repo under kira-os
bash skills/kira_git/scripts/git.sh create-repo --name "my-project" --description "A cool project" --public

# Clone a repo to your workspace
bash skills/kira_git/scripts/git.sh clone --repo "kira-os/my-project"

# Delete a repo (careful!)
bash skills/kira_git/scripts/git.sh delete-repo --repo "kira-os/my-project" --confirm
```

### Pull Requests

```bash
# Create a PR (on current branch)
bash skills/kira_git/scripts/git.sh pr-create --title "Add auth" --body "Adds JWT authentication"

# List open PRs
bash skills/kira_git/scripts/git.sh pr-list
bash skills/kira_git/scripts/git.sh pr-list --repo "kira-os/my-project"

# Merge a PR
bash skills/kira_git/scripts/git.sh pr-merge --number 1

# View PR details
bash skills/kira_git/scripts/git.sh pr-view --number 1
```

### Issues

```bash
# List issues
bash skills/kira_git/scripts/git.sh issues
bash skills/kira_git/scripts/git.sh issues --repo "kira-os/my-project"

# Create an issue
bash skills/kira_git/scripts/git.sh issue-create --title "Bug: login fails" --body "Steps to reproduce..."

# Close an issue
bash skills/kira_git/scripts/git.sh issue-close --number 1
```

### Releases

```bash
# Create a release
bash skills/kira_git/scripts/git.sh release --tag "v1.0.0" --title "First release" --notes "Initial public release"

# List releases
bash skills/kira_git/scripts/git.sh releases
bash skills/kira_git/scripts/git.sh releases --repo "kira-os/my-project"
```

---

## Workflows

### Start a New Personal Project

```bash
# 1. Check project registry first (MANDATORY)
node skills/kira_memory/scripts/memory.js todo --action "list"
gh repo list kira-os --json name,description --limit 30
ls /workspace/kira/projects/

# 2. Create the repo
bash skills/kira_git/scripts/git.sh create-repo --name "my-project" --description "Description here" --public

# 3. Clone to workspace
bash skills/kira_git/scripts/git.sh clone --repo "kira-os/my-project"

# 4. Register in project registry
node -e "import('@supabase/supabase-js').then(async m=>{const sb=m.createClient(process.env.SUPABASE_URL,process.env.SUPABASE_SERVICE_KEY);await sb.from('kira_project_registry').insert({name:'my-project',description:'Description here',local_path:'/workspace/kira/projects/my-project',github_url:'https://github.com/kira-os/my-project',tech_stack:['typescript']});console.log('registered')})"

# 5. Set repo on dashboard
bash skills/kira_bridge/scripts/bridge.sh repo "kira-os/my-project"

# 6. Work, commit, push
cd /workspace/kira/projects/my-project
# ... write code ...
bash skills/kira_git/scripts/git.sh commit-push --message "Initial project setup"
```

### Update Your Own Infrastructure

When you need to change your identity, skills, dashboard, desktop theme, or deploy scripts:

```bash
# 1. Work in the infra monorepo
cd /opt/kira-os

# 2. Edit files (your identity, skills, etc.)
# ... make changes ...

# 3. Commit and push with the infra token
bash skills/kira_git/scripts/git.sh commit-push --message "Update identity with new capabilities" --dir "/opt/kira-os"
```

### Daily Coding Workflow

```bash
# Pull latest before starting work
bash skills/kira_git/scripts/git.sh pull

# Check status throughout the day
bash skills/kira_git/scripts/git.sh status

# Commit frequently with clear messages
bash skills/kira_git/scripts/git.sh commit --message "Add user profile endpoint"
bash skills/kira_git/scripts/git.sh commit --message "Fix token validation edge case"
bash skills/kira_git/scripts/git.sh commit --message "Add tests for auth middleware"

# Push at end of work session
bash skills/kira_git/scripts/git.sh push
```

---

## Environment Variables

| Variable | Purpose |
|----------|---------|
| `GITHUB_TOKEN` | Your personal token — for `kira-os/*` repos |
| `GITHUB_PAT` | Galeon's PAT — for `Braintied-Nex/kira-os` infra repo |

Both are pre-configured in your environment. The script auto-selects the correct one.
