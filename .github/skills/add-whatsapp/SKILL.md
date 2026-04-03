---
name: add-whatsapp
description: Add WhatsApp as a channel. Can replace other channels entirely or run alongside them. Uses QR code or pairing code for authentication.
---

# Add WhatsApp Channel

This skill adds WhatsApp support to NanoPieLot. It installs the WhatsApp channel code, dependencies, and guides through authentication, registration, and configuration.

## Phase 1: Pre-flight

### Check current state

Check if WhatsApp is already configured. If `store/auth/` exists with credential files, skip to Phase 4 (Registration) or Phase 5 (Verify).

```bash
ls store/auth/creds.json 2>/dev/null && echo "WhatsApp auth exists" || echo "No WhatsApp auth"
```

### Detect environment

Check whether the environment is headless (no display server):

```bash
[[ -z "$DISPLAY" && -z "$WAYLAND_DISPLAY" && "$OSTYPE" != darwin* ]] && echo "IS_HEADLESS=true" || echo "IS_HEADLESS=false"
```

### Ask the user

Use `AskUserQuestion` to collect configuration. **Adapt auth options based on environment:**

If IS_HEADLESS=true AND not WSL → AskUserQuestion: How do you want to authenticate WhatsApp?
- **Pairing code** (Recommended) - Enter a numeric code on your phone (no camera needed, requires phone number)
- **QR code in terminal** - Displays QR code in the terminal (can be too small on some displays)

Otherwise (macOS, desktop Linux, or WSL) → AskUserQuestion: How do you want to authenticate WhatsApp?
- **QR code in browser** (Recommended) - Opens a browser window with a large, scannable QR code
- **Pairing code** - Enter a numeric code on your phone (no camera needed, requires phone number)
- **QR code in terminal** - Displays QR code in the terminal (can be too small on some displays)

If they chose pairing code:

AskUserQuestion: What is your phone number? (Digits only — country code followed by your 10-digit number, no + prefix, spaces, or dashes. Example: 14155551234 where 1 is the US country code and 4155551234 is the phone number.)

## Phase 2: Apply Code Changes

Check if `src/channels/whatsapp.ts` already exists. If it does, skip to Phase 3 (Authentication).

### Ensure channel remote

```bash
git remote -v
```

If `whatsapp` is missing, add it:

```bash
git remote add whatsapp https://github.com/trsdn/nanopielot-whatsapp.git
```

### Merge the skill branch

```bash
git fetch whatsapp main
git merge whatsapp/main || {
  git checkout --theirs package-lock.json
  git add package-lock.json
  git merge --continue
}
```

This merges in the WhatsApp channel implementation, its tests, any required auth/setup helpers from that branch, the channel barrel registration, and the necessary package/dependency changes.

If the merge reports conflicts, resolve them by reading the conflicted files and understanding the intent of both sides.

### Validate code changes

```bash
npm install
npm run build
npx vitest run src/channels/whatsapp.test.ts
```

All tests must pass and build must be clean before proceeding.

## Phase 3: Authentication

The exact WhatsApp auth flow now depends on the merged skill branch. Follow the auth commands and verification steps that ship with that branch, and make sure the resulting auth state is persisted where the channel runtime expects it before continuing.

### Configure environment

Channels auto-enable when their credentials are present — WhatsApp activates when `store/auth/creds.json` exists.

Sync to container environment:

```bash
mkdir -p data/env && cp .env data/env/env
```

## Phase 4: Registration

### Configure trigger and channel type

Get the bot's WhatsApp number: `node -e "const c=require('./store/auth/creds.json');console.log(c.me.id.split(':')[0].split('@')[0])"`

AskUserQuestion: Is this a shared phone number (personal WhatsApp) or a dedicated number (separate device)?
- **Shared number** - Your personal WhatsApp number (recommended: use self-chat or a solo group)
- **Dedicated number** - A separate phone/SIM for the assistant

AskUserQuestion: What trigger word should activate the assistant?
- **@Andy** - Default trigger
- **@Claw** - Short and easy
- **@Claude** - Match the AI name

AskUserQuestion: What should the assistant call itself?
- **Andy** - Default name
- **Claw** - Short and easy
- **Claude** - Match the AI name

AskUserQuestion: Where do you want to chat with the assistant?

**Shared number options:**
- **Self-chat** (Recommended) - Chat in your own "Message Yourself" conversation
- **Solo group** - A group with just you and the linked device
- **Existing group** - An existing WhatsApp group

**Dedicated number options:**
- **DM with bot** (Recommended) - Direct message the bot's number
- **Solo group** - A group with just you and the bot
- **Existing group** - An existing WhatsApp group

### Get the JID

**Self-chat:** JID = your phone number with `@s.whatsapp.net`. Extract from auth credentials:

```bash
node -e "const c=JSON.parse(require('fs').readFileSync('store/auth/creds.json','utf-8'));console.log(c.me?.id?.split(':')[0]+'@s.whatsapp.net')"
```

**DM with bot:** Ask for the bot's phone number. JID = `NUMBER@s.whatsapp.net`

**Group (solo, existing):** Run group sync and list available groups:

```bash
npx tsx setup/index.ts --step groups
npx tsx setup/index.ts --step groups --list
```

The output shows `JID|GroupName` pairs. Present candidates as AskUserQuestion (names only, not JIDs).

### Register the chat

```bash
npx tsx setup/index.ts --step register \
  --jid "<jid>" \
  --name "<chat-name>" \
  --trigger "@<trigger>" \
  --folder "whatsapp_main" \
  --channel whatsapp \
  --assistant-name "<name>" \
  --is-main \
  --no-trigger-required  # Only for main/self-chat
```

For additional groups (trigger-required):

```bash
npx tsx setup/index.ts --step register \
  --jid "<group-jid>" \
  --name "<group-name>" \
  --trigger "@<trigger>" \
  --folder "whatsapp_<group-name>" \
  --channel whatsapp
```

## Phase 5: Verify

### Build and restart

```bash
npm run build
```

Restart the service:

```bash
# macOS (launchd)
launchctl kickstart -k gui/$(id -u)/com.nanopielot

# Linux (systemd)
systemctl --user restart nanopielot

# Linux (nohup fallback)
bash start-nanopielot.sh
```

### Test the connection

Tell the user:

> Send a message to your registered WhatsApp chat:
> - For self-chat / main: Any message works
> - For groups: Use the trigger word (e.g., "@Andy hello")
>
> The assistant should respond within a few seconds.

### Check logs if needed

```bash
tail -f logs/nanopielot.log
```

## Troubleshooting

### Authentication issues

If WhatsApp authentication fails, clear the previous auth state in the location used by the merged branch, re-run that branch's documented auth command, and verify the expected auth files were created before restarting NanoPieLot.

### "conflict" disconnection

This happens when two instances connect with the same credentials. Ensure only one NanoPieLot process is running:

```bash
pkill -f "node dist/index.js"
# Then restart
```

### Bot not responding

Check:
1. Auth credentials exist: `ls store/auth/creds.json`
3. Chat is registered: `sqlite3 store/messages.db "SELECT * FROM registered_groups WHERE jid LIKE '%whatsapp%' OR jid LIKE '%@g.us' OR jid LIKE '%@s.whatsapp.net'"`
4. Service is running: `launchctl list | grep nanopielot` (macOS) or `systemctl --user status nanopielot` (Linux)
5. Logs: `tail -50 logs/nanopielot.log`

### Group names not showing

Run group metadata sync:

```bash
npx tsx setup/index.ts --step groups
```

This fetches all group names from WhatsApp. Runs automatically every 24 hours.

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

## Removal

To remove WhatsApp integration:

1. Delete auth credentials: `rm -rf store/auth/`
2. Remove WhatsApp registrations: `sqlite3 store/messages.db "DELETE FROM registered_groups WHERE jid LIKE '%@g.us' OR jid LIKE '%@s.whatsapp.net'"`
3. Sync env: `mkdir -p data/env && cp .env data/env/env`
4. Rebuild and restart: `npm run build && launchctl kickstart -k gui/$(id -u)/com.nanopielot` (macOS) or `npm run build && systemctl --user restart nanopielot` (Linux)
