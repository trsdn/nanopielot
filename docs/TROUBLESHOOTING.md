# Troubleshooting

This guide collects NanoPieLot-specific deployment and runtime issues that are easy to miss when coming from NanoClaw or when running a self-hosted install.

For upstream debugging context, also see:

- [NanoClaw debug checklist](https://github.com/qwibitai/nanoclaw/blob/main/docs/DEBUG_CHECKLIST.md)

## Agent replies with promises but never uses tools

### Symptoms

- The bot says things like "I'll look that up" or "I'll check that for you"
- It sends a short text response but does not actually browse, search, or run commands
- Container logs show no real tool execution

### Likely cause

The Copilot SDK tool allowlist is misconfigured.

NanoPieLot previously hit a bug where the allowlist used PascalCase names such as:

- `Bash`
- `Read`
- `Write`

But the Copilot SDK expects lowercase built-in tool names such as:

- `bash`
- `read`
- `edit`
- `glob`
- `grep`

### How to confirm

Inspect the agent container logs and look for configuration warnings like:

- `Disabled tools: ...`
- `Unknown tool name in the tool allowlist: "Bash"`

### Fix

- Remove the restrictive allowlist entirely, or
- use the actual Copilot SDK tool names

If in doubt, allowing all discovered tools is safer than maintaining an incorrect manual allowlist.

## Telegram bot connects but stops receiving messages

### Symptoms

- Service starts successfully
- Logs stop after `State loaded`
- You never see new inbound Telegram messages

### Likely cause

The host app source was updated, but `dist/` still contains stale build output.

### Fix

After pulling changes on the host:

```bash
npm run build
```

Then restart the service.

### Why this happens

NanoPieLot runs the built host app from `dist/index.js`. Updating `src/` alone is not enough.

## Container starts but produces no useful output

### Symptoms

- A container is spawned for a message
- The bot does not answer correctly or the container exits early
- Agent logs are missing meaningful Copilot activity

### Likely cause

The Copilot auth state is missing, incomplete, or expired.

### How to confirm

Check the host auth directory:

```text
data/copilot-auth/config.json
```

NanoPieLot expects a persisted signed-in-user state there and mounts it into the container at:

```text
/home/node/.copilot
```

### Fix

- Re-run the Copilot device login flow
- or restore a valid `config.json` from a working install

Do not switch back to raw API keys; NanoPieLot is built around the device-login flow.

## Docker build fails with "parent snapshot does not exist"

### Symptoms

- `./container/build.sh` fails during export or unpack
- The error mentions a missing parent snapshot

### Likely cause

Docker buildkit cache corruption or stale cached layers.

### Fix

Run a full builder prune and rebuild:

```bash
docker builder prune -af
./container/build.sh
```

## `/model` says only the bot owner can change the model

### Symptoms

- Telegram main chat user tries `/model`
- Bot responds that only the owner can inspect or change the model

### Likely cause

Ownership logic relies on `is_from_me`, which makes sense for WhatsApp but not for Telegram's separate bot identity.

### Fix

Use main-group ownership metadata such as `group.isMain` instead of relying only on `is_from_me`.

This was fixed in NanoPieLot v1.1.0.

## AGENTS instructions seem to be ignored

### Symptoms

- The bot answers without the expected persona or group behavior
- Group-level instructions are clearly not being followed

### Likely causes

1. The file is still named `CLAUDE.md`
2. The Copilot client `cwd` is not set to `/workspace/group`

### Fix

- Rename `CLAUDE.md` to `AGENTS.md`
- Ensure the in-container Copilot client uses:

```text
cwd: '/workspace/group'
```

Without the correct `cwd`, the Copilot CLI server may not discover project instructions properly.

## Rebuild appears successful, but old code still runs

### Symptoms

- You rebuild the agent container
- Behavior still looks like an older revision

### Likely causes

1. Stale Docker build cache
2. Host `dist/` not rebuilt
3. Old session state still being resumed

### Fix checklist

1. `docker builder prune -af`
2. `./container/build.sh`
3. `npm run build`
4. restart the host service
5. if needed, clear stale persisted sessions before retesting
