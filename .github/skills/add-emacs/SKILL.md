---
name: add-emacs
description: Add Emacs as a channel. Opens an interactive chat buffer and org-mode integration so you can talk to NanoPieLot from within Emacs (Doom, Spacemacs, or vanilla). Uses a local HTTP bridge — no bot token or external service needed.
---

# Add Emacs Channel

This skill adds Emacs support to NanoPieLot, then walks through interactive setup.
Works with Doom Emacs, Spacemacs, and vanilla Emacs 27.1+.

## What you can do with this

- **Ask while coding** — open the chat buffer (`C-c n c` / `SPC N c`), ask about a function or error without leaving Emacs
- **Code review** — select a region and send it with `nanopielot-org-send`; the response appears as a child heading inline in your org file
- **Meeting notes** — send an org agenda entry; get a summary or action item list back as a child node
- **Draft writing** — send org prose; receive revisions or continuations in place
- **Research capture** — ask a question directly in your org notes; the answer lands exactly where you need it
- **Schedule tasks** — ask Andy to set a reminder or create a scheduled NanoPieLot task (e.g. "remind me tomorrow to review the PR")

## Phase 1: Pre-flight

### Check if already applied

Check if `src/channels/emacs.ts` exists:

```bash
test -f src/channels/emacs.ts && echo "already applied" || echo "not applied"
```

If it exists, skip to Phase 3 (Setup). The code changes are already in place.

## Phase 2: Apply Code Changes

### Ensure the upstream remote

```bash
git remote -v
```

If an `upstream` remote pointing to `https://github.com/trsdn/nanoclaw.git` is missing,
add it:

```bash
git remote add upstream https://github.com/trsdn/nanoclaw.git
```

### Merge the skill branch

```bash
git fetch upstream skill/emacs
git merge upstream/skill/emacs
```

If there are merge conflicts on `package-lock.json`, resolve them by accepting the incoming
version and continuing:

```bash
git checkout --theirs package-lock.json
git add package-lock.json
git merge --continue
```

For any other conflict, read the conflicted file and reconcile both sides manually.

This adds:
- `src/channels/emacs.ts` — `EmacsBridgeChannel` HTTP server (port 8766)
- `src/channels/emacs.test.ts` — unit tests
- `emacs/nanopielot.el` — Emacs Lisp package (`nanopielot-chat`, `nanopielot-org-send`)
- `import './emacs.js'` appended to `src/channels/index.ts`

If the merge reports conflicts, resolve them by reading the conflicted files and understanding the intent of both sides.

### Validate code changes

```bash
npm run build
npx vitest run src/channels/emacs.test.ts
```

Build must be clean and tests must pass before proceeding.

## Phase 3: Setup

### Configure environment (optional)

The channel works out of the box with defaults. Add to `.env` only if you need non-defaults:

```bash
EMACS_CHANNEL_PORT=8766     # default — change if 8766 is already in use
EMACS_AUTH_TOKEN=<random>   # optional — locks the endpoint to Emacs only
```

If you change or add values, sync to the container environment:

```bash
mkdir -p data/env && cp .env data/env/env
```

### Configure Emacs

The `nanopielot.el` package requires only Emacs 27.1+ built-in libraries (`url`, `json`, `org`) — no package manager setup needed.

AskUserQuestion: Which Emacs distribution are you using?
- **Doom Emacs** - config.el with map! keybindings
- **Spacemacs** - dotspacemacs/user-config in ~/.spacemacs
- **Vanilla Emacs / other** - init.el with global-set-key

**Doom Emacs** — add to `~/.config/doom/config.el` (or `~/.doom.d/config.el`):

```elisp
;; NanoPieLot — personal AI assistant channel
(load (expand-file-name "~/src/nanopielot/emacs/nanopielot.el"))

(map! :leader
      :prefix ("N" . "NanoPieLot")
      :desc "Chat buffer"  "c" #'nanopielot-chat
      :desc "Send org"     "o" #'nanopielot-org-send)
```

Then reload: `M-x doom/reload`

**Spacemacs** — add to `dotspacemacs/user-config` in `~/.spacemacs`:

```elisp
;; NanoPieLot — personal AI assistant channel
(load-file "~/src/nanopielot/emacs/nanopielot.el")

(spacemacs/set-leader-keys "aNc" #'nanopielot-chat)
(spacemacs/set-leader-keys "aNo" #'nanopielot-org-send)
```

Then reload: `M-x dotspacemacs/sync-configuration-layers` or restart Emacs.

**Vanilla Emacs** — add to `~/.emacs.d/init.el` (or `~/.emacs`):

```elisp
;; NanoPieLot — personal AI assistant channel
(load-file "~/src/nanopielot/emacs/nanopielot.el")

(global-set-key (kbd "C-c n c") #'nanopielot-chat)
(global-set-key (kbd "C-c n o") #'nanopielot-org-send)
```

Then reload: `M-x eval-buffer` or restart Emacs.

If `EMACS_AUTH_TOKEN` was set, also add (any distribution):

```elisp
(setq nanopielot-auth-token "<your-token>")
```

If `EMACS_CHANNEL_PORT` was changed from the default, also add:

```elisp
(setq nanopielot-port <your-port>)
```

### Restart NanoPieLot

```bash
npm run build
launchctl kickstart -k gui/$(id -u)/com.nanopielot  # macOS
# Linux: systemctl --user restart nanopielot
```

## Phase 4: Verify

### Test the HTTP endpoint

```bash
curl -s "http://localhost:8766/api/messages?since=0"
```

Expected: `{"messages":[]}`

If you set `EMACS_AUTH_TOKEN`:

```bash
curl -s -H "Authorization: Bearer <token>" "http://localhost:8766/api/messages?since=0"
```

### Test from Emacs

Tell the user:

> 1. Open the chat buffer with your keybinding (`SPC N c`, `SPC a N c`, or `C-c n c`)
> 2. Type a message and press `RET`
> 3. A response from Andy should appear within a few seconds
>
> For org-mode: open any `.org` file, position the cursor on a heading, and use `SPC N o` / `SPC a N o` / `C-c n o`

### Check logs if needed

```bash
tail -f logs/nanopielot.log
```

Look for `Emacs channel listening` at startup and `Emacs message received` when a message is sent.

## Troubleshooting

### Port already in use

```
Error: listen EADDRINUSE: address already in use :::8766
```

Either a stale NanoPieLot process is running, or 8766 is taken by another app.

Find and kill the stale process:

```bash
lsof -ti :8766 | xargs kill -9
```

Or change the port in `.env` (`EMACS_CHANNEL_PORT=8767`) and update `nanopielot-port` in Emacs config.

### No response from agent

Check:
1. NanoPieLot is running: `launchctl list | grep nanopielot` (macOS) or `systemctl --user status nanopielot` (Linux)
2. Emacs group is registered: `sqlite3 store/messages.db "SELECT * FROM registered_groups WHERE jid = 'emacs:default'"`
3. Logs show activity: `tail -50 logs/nanopielot.log`

If NanoPieLot is not registered, it will be created automatically on the next NanoPieLot restart.

### Auth token mismatch (401 Unauthorized)

Verify the token in Emacs matches `.env`:

```elisp
;; M-x describe-variable RET nanopielot-auth-token RET
```

Must exactly match `EMACS_AUTH_TOKEN` in `.env`.

### nanopielot.el not loading

Check the path is correct:

```bash
ls ~/src/nanopielot/emacs/nanopielot.el
```

If NanoPieLot is cloned elsewhere, update the `load`/`load-file` path in your Emacs config.

## After Setup

If running `npm run dev` while the service is active:

```bash
# macOS:
launchctl unload ~/Library/LaunchAgents/com.nanopielot.plist
npm run dev
# When done testing:
launchctl load ~/Library/LaunchAgents/com.nanopielot.plist

# Linux:
# systemctl --user stop nanopielot
# npm run dev
# systemctl --user start nanopielot
```

## Agent Formatting

The Emacs bridge converts markdown → org-mode automatically. Agents should
output standard markdown — **not** org-mode syntax. The conversion handles:

| Markdown | Org-mode |
|----------|----------|
| `**bold**` | `*bold*` |
| `*italic*` | `/italic/` |
| `~~text~~` | `+text+` |
| `` `code` `` | `~code~` |
| ` ```lang ` | `#+begin_src lang` |

If an agent outputs org-mode directly, bold/italic/etc. will be double-converted
and render incorrectly.

## Removal

To remove the Emacs channel:

1. Delete `src/channels/emacs.ts`, `src/channels/emacs.test.ts`, and `emacs/nanopielot.el`
2. Remove `import './emacs.js'` from `src/channels/index.ts`
3. Remove the NanoPieLot block from your Emacs config file
4. Remove Emacs registration from SQLite: `sqlite3 store/messages.db "DELETE FROM registered_groups WHERE jid = 'emacs:default'"`
5. Remove `EMACS_CHANNEL_PORT` and `EMACS_AUTH_TOKEN` from `.env` if set
6. Rebuild: `npm run build && launchctl kickstart -k gui/$(id -u)/com.nanopielot` (macOS) or `npm run build && systemctl --user restart nanopielot` (Linux)