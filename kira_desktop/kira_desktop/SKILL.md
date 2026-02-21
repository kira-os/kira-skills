---
name: kira-desktop
description: "Browser and desktop control via the VNC bridge. Use when: (1) Running commands on desktop — desktop.sh exec, (2) Taking screenshots — desktop.sh screenshot, (3) Seeing what's on screen (vision) — desktop.sh describe, (4) Typing text — desktop.sh type, (5) Clicking on screen — desktop.sh click, (6) Opening URLs — desktop.sh open-url, (7) Opening files — desktop.sh open-file. The describe command uses Kimi K2.5 multimodal vision to analyze the screenshot and return a text description."
metadata:
  openclaw:
    emoji: "🖥️"
    requires:
      env: ["DESKTOP_BRIDGE_URL"]
      bins: ["curl", "node"]
---

# Kira Desktop Control

Control the desktop browser and terminal via the VNC desktop bridge. Used for livestreaming, visual tasks, and browser automation. Includes vision capability via Kimi K2.5 multimodal model.

## Commands

### Execute command on desktop

```bash
bash skills/kira_desktop/scripts/desktop.sh exec --command "htop"
```

Runs a shell command visible on the streamed desktop.

### Take screenshot

```bash
bash skills/kira_desktop/scripts/desktop.sh screenshot
```

Returns a base64-encoded PNG of the current desktop state.

### Describe what's on screen (Vision)

```bash
# Default — describe everything visible
bash skills/kira_desktop/scripts/desktop.sh describe

# Custom prompt — ask a specific question about the screen
bash skills/kira_desktop/scripts/desktop.sh describe --prompt "What windows are open?"
bash skills/kira_desktop/scripts/desktop.sh describe --prompt "Is there an error on screen?"
bash skills/kira_desktop/scripts/desktop.sh describe --prompt "What code is visible in the editor?"
```

Takes a screenshot and sends it to Kimi K2.5 (multimodal vision model) for analysis. Returns a JSON object with:
- `description` — Text description of what's on screen
- `model` — Vision model used (kimi-k2.5)
- `screenshot_size` — Resolution of the captured screenshot
- `elapsed_ms` — Total time including screenshot + vision analysis

Requires `MOONSHOT_API_KEY` environment variable.

### Type text

```bash
bash skills/kira_desktop/scripts/desktop.sh type --text "Hello world"
```

Types text as keyboard input on the focused window.

### Click at coordinates

```bash
bash skills/kira_desktop/scripts/desktop.sh click --x 500 --y 300
```

Clicks at the specified screen coordinates.

### Open URL in browser

```bash
bash skills/kira_desktop/scripts/desktop.sh open-url --url "https://github.com/kira-os"
```

Opens a URL in the default browser on the desktop.

### Open file

```bash
bash skills/kira_desktop/scripts/desktop.sh open-file --path "/workspace/kira/README.md"
```

Opens a file with the default application.

## Environment Variables

- `DESKTOP_BRIDGE_URL` — Desktop bridge API base URL (default: `http://localhost:8080`)
- `MOONSHOT_API_KEY` — Kimi K2.5 API key (required for `describe` command)
