---
name: kira-desktop
description: "Full desktop stream control via the VNC bridge. You OWN this desktop — customize it completely. Input: exec, screenshot, describe, type, click, double-click, right-click, mouse-move, mouse-drag, scroll, key-press. Apps: open-url, open-file. Windows: list-windows, move-window, close-window, focus-window, minimize-window, maximize-window, set-always-on-top. Appearance: set-wallpaper, get/set-gtk-theme, get/set-resolution, install-font. Deep Styling: get/set-gtk-css (CSS-level restyling of ALL apps), get/set-wm-preferences (titlebar font, button layout), get/set-compositor-settings (animations, cursor, color-scheme), install-gtk-theme. Panel: get-panel-config, configure-panel, update-panel. Widgets: get/configure-widget, add/remove-widget. State: set-mood, set-task, get/set-clipboard. Layout: tile-windows, launch-stream-rig, setup-desktop."
metadata:
  openclaw:
    emoji: "🖥️"
    requires:
      env: ["DESKTOP_BRIDGE_URL"]
      bins: ["curl", "node"]
---

# Kira Desktop Control

**This is YOUR desktop. You have TOTAL control.** Move windows, change themes, customize the taskbar, create widgets, install fonts, drag things around, change resolution — anything a person can do at a desktop, you can do via this skill. Stream viewers see everything in real time.

## Input Commands

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

### Take screenshot of a region

```bash
bash skills/kira_desktop/scripts/desktop.sh screenshot-region --width 400 --height 300 --x 100 --y 100
```

Captures a specific rectangular region as base64 PNG.

### Describe what's on screen (Vision)

```bash
bash skills/kira_desktop/scripts/desktop.sh describe
bash skills/kira_desktop/scripts/desktop.sh describe --prompt "What windows are open?"
bash skills/kira_desktop/scripts/desktop.sh describe --prompt "Is there an error visible?"
```

Takes a screenshot and sends it to Kimi K2.5 vision for analysis.

### Type text

```bash
bash skills/kira_desktop/scripts/desktop.sh type --text "Hello world"
```

Types text as keyboard input on the focused window.

### Click at coordinates

```bash
bash skills/kira_desktop/scripts/desktop.sh click --x 500 --y 300
```

### Double-click

```bash
bash skills/kira_desktop/scripts/desktop.sh double-click --x 500 --y 300
bash skills/kira_desktop/scripts/desktop.sh double-click --x 500 --y 300 --button 1
```

### Right-click

```bash
bash skills/kira_desktop/scripts/desktop.sh right-click --x 500 --y 300
```

### Move mouse (no click)

```bash
bash skills/kira_desktop/scripts/desktop.sh mouse-move --x 500 --y 300
```

### Drag (click-hold-move-release)

```bash
bash skills/kira_desktop/scripts/desktop.sh mouse-drag --from-x 100 --from-y 200 --to-x 500 --to-y 600
bash skills/kira_desktop/scripts/desktop.sh mouse-drag --from-x 100 --from-y 200 --to-x 500 --to-y 600 --button 1
```

### Scroll

```bash
bash skills/kira_desktop/scripts/desktop.sh scroll --direction down --clicks 5
bash skills/kira_desktop/scripts/desktop.sh scroll --direction up --clicks 3 --x 500 --y 300
```

Direction: `up`, `down`, `left`, `right`. Defaults: direction=down, clicks=3.

### Press key combo

```bash
bash skills/kira_desktop/scripts/desktop.sh key-press --keys "ctrl+t"       # new browser tab
bash skills/kira_desktop/scripts/desktop.sh key-press --keys "ctrl+w"       # close tab
bash skills/kira_desktop/scripts/desktop.sh key-press --keys "alt+Tab"      # switch window
bash skills/kira_desktop/scripts/desktop.sh key-press --keys "Return"       # enter
bash skills/kira_desktop/scripts/desktop.sh key-press --keys "ctrl+l"       # focus URL bar
```

## Application Commands

### Open URL in browser

```bash
bash skills/kira_desktop/scripts/desktop.sh open-url --url "https://github.com/kira-os"
```

### Open file in editor

```bash
bash skills/kira_desktop/scripts/desktop.sh open-file --path "/workspace/kira/README.md"
```

## Window Management

### List all windows

```bash
bash skills/kira_desktop/scripts/desktop.sh list-windows
```

Returns JSON array of all open windows with id, title, position (x, y), and size (width, height).

### Move / resize a window

```bash
bash skills/kira_desktop/scripts/desktop.sh move-window --title "Firefox" --x 0 --y 0 --width 960 --height 1080
bash skills/kira_desktop/scripts/desktop.sh move-window --id "0x04000003" --x 960 --y 0 --width 960 --height 540
bash skills/kira_desktop/scripts/desktop.sh move-window --title "Terminal" --width 800 --height 600
```

### Close a window

```bash
bash skills/kira_desktop/scripts/desktop.sh close-window --title "Firefox"
bash skills/kira_desktop/scripts/desktop.sh close-window --id "0x04000003"
```

### Focus (bring to front)

```bash
bash skills/kira_desktop/scripts/desktop.sh focus-window --title "Terminal"
```

### Minimize a window

```bash
bash skills/kira_desktop/scripts/desktop.sh minimize-window --title "Firefox"
```

### Maximize a window

```bash
bash skills/kira_desktop/scripts/desktop.sh maximize-window --title "Firefox"
bash skills/kira_desktop/scripts/desktop.sh maximize-window --title "Firefox" --state add
bash skills/kira_desktop/scripts/desktop.sh maximize-window --title "Firefox" --state remove
```

State: `toggle` (default), `add`, `remove`.

### Pin window on top

```bash
bash skills/kira_desktop/scripts/desktop.sh set-always-on-top --title "Terminal"
bash skills/kira_desktop/scripts/desktop.sh set-always-on-top --title "Terminal" --state add
bash skills/kira_desktop/scripts/desktop.sh set-always-on-top --title "Terminal" --state remove
```

State: `toggle` (default), `add`, `remove`.

## Wallpaper

```bash
bash skills/kira_desktop/scripts/desktop.sh set-wallpaper --url "https://example.com/bg.png"
bash skills/kira_desktop/scripts/desktop.sh set-wallpaper --path "/tmp/my_wallpaper.png"
```

## Panel (tint2 Taskbar)

You control the bottom taskbar. Change position, size, colors, font, everything.

### Read current panel config

```bash
bash skills/kira_desktop/scripts/desktop.sh get-panel-config
```

Returns the full tint2rc config file contents.

### Full panel rewrite

```bash
bash skills/kira_desktop/scripts/desktop.sh configure-panel --config "# tint2 config
panel_position = top center horizontal
panel_size = 100% 32
..."
```

Writes a complete new tint2rc and restarts the panel.

### Partial panel update

```bash
bash skills/kira_desktop/scripts/desktop.sh update-panel --config '{"panel_position": "top center horizontal", "panel_size": "100% 36"}'
```

Updates specific keys in the tint2 config without rewriting everything. Keys not mentioned stay unchanged.

**Common tint2 settings:**
- `panel_position` — `top/bottom/left/right center/left/right horizontal/vertical`
- `panel_size` — `100% 28` (width height)
- `panel_background_id` — background ID to use
- `task_font` — `Monospace 9`
- `task_font_color` — `#C4D3F0 100`
- `time1_format` — `%H:%M` (clock format)
- `panel_hide` — `0` (0=visible, 1=autohide)

## Widgets (conky)

Two built-in widgets exist: `brand` (top-left branding overlay) and `system` (top-right system monitor). You can also create custom widgets.

### Read a widget config

```bash
bash skills/kira_desktop/scripts/desktop.sh get-widget-config --widget "brand"
bash skills/kira_desktop/scripts/desktop.sh get-widget-config --widget "system"
bash skills/kira_desktop/scripts/desktop.sh get-widget-config --widget "my_custom"
```

### Rewrite a widget config

```bash
bash skills/kira_desktop/scripts/desktop.sh configure-widget --widget "brand" --config "conky.config = { ... } conky.text = [[ ... ]]"
```

Writes a new conky config and restarts that widget.

### Create a new custom widget

```bash
bash skills/kira_desktop/scripts/desktop.sh add-widget --name "clock" --config "conky.config = { ... } conky.text = [[ ... ]]"
```

Creates and launches a new conky widget with the given name.

### Remove a custom widget

```bash
bash skills/kira_desktop/scripts/desktop.sh remove-widget --name "clock"
```

Kills the conky process and deletes the config file.

## Theme & Appearance

### Read GTK theme settings

```bash
bash skills/kira_desktop/scripts/desktop.sh get-gtk-theme
```

Returns current theme name, icon theme, font, cursor theme.

### Change GTK theme

```bash
bash skills/kira_desktop/scripts/desktop.sh set-gtk-theme --theme-name "Adwaita-dark"
bash skills/kira_desktop/scripts/desktop.sh set-gtk-theme --font "Monospace 11"
bash skills/kira_desktop/scripts/desktop.sh set-gtk-theme --icon-theme "Adwaita" --cursor-theme "Adwaita"
bash skills/kira_desktop/scripts/desktop.sh set-gtk-theme --dark true
```

Changes are applied live via gsettings and persisted to settings.ini.

### Get screen resolution

```bash
bash skills/kira_desktop/scripts/desktop.sh get-resolution
```

### Change screen resolution

```bash
bash skills/kira_desktop/scripts/desktop.sh set-resolution --width 1920 --height 1080
bash skills/kira_desktop/scripts/desktop.sh set-resolution --width 1280 --height 720
```

If the mode doesn't exist, it will be created via cvt/xrandr.

### Install a font

```bash
bash skills/kira_desktop/scripts/desktop.sh install-font --url "https://example.com/MyFont.ttf"
bash skills/kira_desktop/scripts/desktop.sh install-font --name "firacode"
```

From URL: downloads the TTF/OTF file and runs fc-cache. By name: apt-get installs `fonts-<name>`.

## Deep Styling (GTK CSS, Window Manager, Compositor)

You have **CSS-level control** over every visual element on the desktop. This is your most powerful customization layer.

### Read/write custom GTK CSS

```bash
bash skills/kira_desktop/scripts/desktop.sh get-gtk-css
bash skills/kira_desktop/scripts/desktop.sh set-gtk-css --css "decoration { border-radius: 12px; } headerbar { background: #1a1a2e; color: #e0e0ff; } button { border-radius: 8px; background: #16213e; color: #ddd; } button:hover { background: #0f3460; } scrollbar slider { min-width: 8px; border-radius: 4px; background: #333366; }"
```

GTK CSS restyles **every application**: window decorations, buttons, menus, scrollbars, inputs, dialogs, titlebars. This is like writing a full CSS stylesheet for the entire desktop.

**Common GTK CSS selectors:**
- `decoration` — window frame (border-radius, box-shadow, border)
- `headerbar` — window titlebar (background, color, padding, border)
- `button` — all buttons (background, color, border-radius, padding)
- `button:hover`, `button:active` — button states
- `entry` — text inputs (background, color, border, border-radius)
- `scrollbar slider` — scrollbar handle (min-width, background, border-radius)
- `menu`, `menuitem` — dropdown menus
- `tooltip` — tooltips
- `.titlebar` — window titlebar area
- `window` — entire window

### Window manager preferences

```bash
bash skills/kira_desktop/scripts/desktop.sh get-wm-preferences
bash skills/kira_desktop/scripts/desktop.sh set-wm-preferences --settings '{"button-layout": "close,minimize,maximize:", "titlebar-font": "Monospace Bold 10"}'
bash skills/kira_desktop/scripts/desktop.sh set-wm-preferences --settings '{"button-layout": ":minimize,maximize,close"}'
bash skills/kira_desktop/scripts/desktop.sh set-wm-preferences --settings '{"focus-mode": "sloppy", "theme": "Adwaita"}'
```

**Keys:** `button-layout` (window button order, colon separates left:right), `titlebar-font`, `theme`, `focus-mode` (click/sloppy/mouse), `action-double-click-titlebar`, `action-right-click-titlebar`, `num-workspaces`.

### Compositor & interface settings

```bash
bash skills/kira_desktop/scripts/desktop.sh get-compositor-settings
bash skills/kira_desktop/scripts/desktop.sh set-compositor-settings --settings '{"enable-animations": "false", "color-scheme": "prefer-dark"}'
bash skills/kira_desktop/scripts/desktop.sh set-compositor-settings --settings '{"cursor-size": "32", "font-antialiasing": "rgba", "font-hinting": "full"}'
bash skills/kira_desktop/scripts/desktop.sh set-compositor-settings --settings '{"center-new-windows": "true", "edge-tiling": "true"}'
```

**Mutter keys:** `center-new-windows`, `attach-modal-dialogs`, `draggable-border-width`, `edge-tiling`, `auto-maximize`.
**Interface keys:** `enable-animations`, `cursor-size`, `color-scheme` (default/prefer-dark/prefer-light), `font-antialiasing` (none/grayscale/rgba), `font-hinting` (none/slight/medium/full), `cursor-blink`, `font-name`, `monospace-font-name`, `clock-format`.

### Install a GTK theme

```bash
bash skills/kira_desktop/scripts/desktop.sh install-gtk-theme --name "arc-theme"
bash skills/kira_desktop/scripts/desktop.sh install-gtk-theme --url "https://example.com/MyTheme.tar.gz"
```

By name: apt-get installs the package. By URL: downloads and extracts the theme archive to `/usr/share/themes/`. Use `set-gtk-theme --theme-name "ThemeName"` afterwards to activate.

## Desktop State

### Set mood (displayed in brand widget)

```bash
bash skills/kira_desktop/scripts/desktop.sh set-mood --mood "focused"
bash skills/kira_desktop/scripts/desktop.sh set-mood --mood "vibing"
```

Writes to `/tmp/kira_mood` which the conky brand widget reads.

### Set task (displayed in brand widget)

```bash
bash skills/kira_desktop/scripts/desktop.sh set-task --task "building kira-agent v2"
```

Writes to `/tmp/kira_task` which the conky brand widget reads.

### Read clipboard

```bash
bash skills/kira_desktop/scripts/desktop.sh get-clipboard
```

### Write to clipboard

```bash
bash skills/kira_desktop/scripts/desktop.sh set-clipboard --text "some text"
```

## Layout Commands

### Tile windows (standard layout)

```bash
bash skills/kira_desktop/scripts/desktop.sh tile-windows
```

### Launch full stream rig

```bash
bash skills/kira_desktop/scripts/desktop.sh launch-stream-rig
```

Kills all existing windows and launches the full stream desktop.

### Reapply desktop theme

```bash
bash skills/kira_desktop/scripts/desktop.sh setup-desktop
```

### Health check

```bash
bash skills/kira_desktop/scripts/desktop.sh health
```

## Workflow: Customizing Your Stream

1. **See what's on screen**: `describe` or `list-windows`
2. **Rearrange**: `move-window`, `minimize-window`, `maximize-window`
3. **Open content**: `open-url` for websites, `open-file` for code
4. **Personalize**: `set-wallpaper`, `set-gtk-theme`, `set-resolution`
5. **Customize panel**: `get-panel-config` → `update-panel` or `configure-panel`
6. **Add widgets**: `add-widget` with conky config, or modify existing with `configure-widget`
7. **Navigate**: `key-press` for shortcuts, `focus-window` to switch, `scroll` to browse
8. **Express yourself**: `set-mood`, `set-task` to update stream overlay
9. **Reset**: `tile-windows` or `launch-stream-rig` to go back to default

## Environment Variables

- `DESKTOP_BRIDGE_URL` — Desktop bridge API base URL (default: `http://localhost:9222`)
- `MOONSHOT_API_KEY` — Kimi K2.5 API key (required for `describe` command)
