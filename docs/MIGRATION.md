# NanoClaw to NanoPieLot Migration Guide

NanoPieLot keeps NanoClaw's architecture and customization model, but swaps the Anthropic/Claude runtime for the GitHub Copilot SDK. This guide covers the NanoPieLot-specific differences that matter when migrating an existing NanoClaw setup or maintaining a fork.

For the upstream architecture and general concepts, see the NanoClaw docs:

- [NanoClaw docs](https://github.com/qwibitai/nanoclaw/tree/main/docs)
- [NanoClaw spec](https://github.com/qwibitai/nanoclaw/blob/main/docs/SPEC.md)

## What stays the same

- Channels, groups, scheduling, and the skill-first customization model
- Containerized agent execution
- Per-group memory and isolated group folders
- Host-side orchestration with SQLite-backed state

## What changes in NanoPieLot

### Runtime: Claude -> GitHub Copilot SDK

NanoPieLot uses the GitHub Copilot SDK inside the agent container instead of Anthropic tooling.

- Authentication is based on the signed-in-user flow
- Models come from your GitHub Copilot plan
- Model selection is still group-scoped through `/model`

### Authentication: API keys -> device login

NanoClaw patterns that rely on raw API keys do not apply here.

NanoPieLot uses:

1. `copilot login` device flow
2. persisted auth state under `data/copilot-auth/`
3. a writable mount into the agent container at `/home/node/.copilot`

Practical implications:

- do **not** commit raw GitHub tokens into the repo
- auth state must exist on the host before container agents can answer
- if the auth state is missing or expired, the container may start but fail to do useful work

## Required migration changes

### 1. Rename `CLAUDE.md` to `AGENTS.md`

The Copilot SDK discovers project instructions from `AGENTS.md`.

If an existing group folder still has:

```text
groups/<group>/CLAUDE.md
```

rename it to:

```text
groups/<group>/AGENTS.md
```

This also applies to the main group folder.

### 2. Use Copilot SDK tool names, not Claude-style names

Copilot SDK built-in tools use lowercase names.

Examples:

- `bash`
- `read`
- `edit`
- `glob`
- `grep`
- `web_search`
- `web_fetch`

Do **not** use PascalCase names such as:

- `Bash`
- `Read`
- `Write`
- `Edit`

Using the wrong names in a tool allowlist can silently disable all tools.

### 3. Set the Copilot client `cwd`

NanoPieLot's in-container runner must set the Copilot client working directory to the group workspace.

Why it matters:

- the CLI server uses this directory to discover `AGENTS.md`
- project context and tool discovery depend on it
- `workingDirectory` in the session config is not enough on its own

Expected value in the agent container:

```text
/workspace/group
```

### 4. Do not rely on unsupported SDK config keys

Some config shapes that existed in experiments or other tooling do not exist in the Copilot SDK.

Example:

```ts
settingSources: ['project']
```

This is not a valid Copilot SDK config option and is silently ignored.

## Channel-specific migration notes

### Owner checks are not identical across channels

`is_from_me` is effectively a WhatsApp-specific ownership signal.

For Telegram and other bot-based channels:

- the bot is a separate identity
- messages are not "from me" in the WhatsApp sense
- main-group/admin checks should rely on group metadata such as `group.isMain`

This matters for commands like `/model`.

## Container and deployment differences

### Image naming

NanoPieLot uses the image name:

```text
nanopielot-agent:latest
```

Do not assume old NanoClaw image names still apply.

### Build cache behavior

Container rebuilds can appear to succeed while still using stale copied files.

If a rebuild behaves suspiciously:

```bash
docker builder prune -af
./container/build.sh
```

### Main app build still matters

After pulling host-side changes, rebuild the main TypeScript app before restarting:

```bash
npm run build
```

Otherwise the service may run stale `dist/` output even though the source tree is updated.

## Recommended migration checklist

1. Pull the latest NanoPieLot code
2. Run `npm install`
3. Run `npm run build`
4. Ensure `data/copilot-auth/` contains a valid Copilot login state
5. Rename any remaining `CLAUDE.md` files to `AGENTS.md`
6. Verify the agent runner uses `cwd: '/workspace/group'`
7. Verify no restrictive tool allowlist is using wrong tool names
8. Rebuild the agent container
9. Restart the host service
10. Test a prompt that requires a real tool call

## Validation tips

After migration, test with a prompt that cannot be answered well without tools, for example:

- "Search for the latest tech news"
- "Read the file in my workspace"
- "Check today's weather"

If the bot only replies with promises like "I'll look that up" but performs no actual action, inspect the agent container logs for configuration warnings about disabled or unknown tools.
