# NanoPieLot

Personal Copilot assistant. See [README.md](README.md) for philosophy and setup. See [docs/REQUIREMENTS.md](docs/REQUIREMENTS.md) for architecture decisions.

## Quick Context

Single Node.js process with skill-based channel system. Channels (WhatsApp, Telegram, Slack, Discord, Gmail) are skills that self-register at startup. Messages route to the GitHub Copilot SDK running in containers (Linux VMs). Each group has isolated filesystem and memory.

## Key Files

| File | Purpose |
|------|---------|
| `src/index.ts` | Orchestrator: state, message loop, agent invocation |
| `src/channels/registry.ts` | Channel registry (self-registration at startup) |
| `src/ipc.ts` | IPC watcher and task processing |
| `src/router.ts` | Message formatting and outbound routing |
| `src/config.ts` | Trigger pattern, paths, intervals |
| `src/container-runner.ts` | Spawns agent containers with mounts |
| `src/task-scheduler.ts` | Runs scheduled tasks |
| `src/db.ts` | SQLite operations |
| `groups/{name}/AGENTS.md` | Per-group memory (isolated) |
| `container/skills/` | Skills loaded inside agent containers (browser, status, formatting) |

## Secrets / Credentials / Copilot Login

NanoPieLot uses a persistent Copilot device-login session stored under `data/copilot-auth/` and mounted into containers at `/home/node/.copilot`. Setup establishes that session with `copilot login` inside an isolated container, so you do not need to commit raw GitHub tokens into `.env`.

## Skills

Four types of skills exist in NanoPieLot. See [CONTRIBUTING.md](CONTRIBUTING.md) for the full taxonomy and guidelines.

- **Feature skills** — merge a `skill/*` branch to add capabilities (e.g. `/add-telegram`, `/add-slack`)
- **Utility skills** — ship code files alongside SKILL.md (e.g. `/claw`)
- **Operational skills** — instruction-only workflows, always on `main` (e.g. `/setup`, `/debug`)
- **Container skills** — loaded inside agent containers at runtime (`container/skills/`)

| Skill | When to Use |
|-------|-------------|
| `/setup` | First-time installation, authentication, service configuration |
| `/customize` | Adding channels, integrations, changing behavior |
| `/debug` | Container issues, logs, troubleshooting |
| `/update-nanopielot` | Bring upstream NanoPieLot updates into a customized install |
| `/qodo-pr-resolver` | Fetch and fix Qodo PR review issues interactively or in batch |
| `/get-qodo-rules` | Load org- and repo-level coding rules from Qodo before code tasks |

## Contributing

Before creating a PR, adding a skill, or preparing any contribution, you MUST read [CONTRIBUTING.md](CONTRIBUTING.md). It covers accepted change types, the four skill types and their guidelines, SKILL.md format rules, PR requirements, and the pre-submission checklist (searching for existing PRs/issues, testing, description format).

## Development

Run commands directly—don't tell the user to run them.

```bash
npm run dev          # Run with hot reload
npm run build        # Compile TypeScript
./container/build.sh # Rebuild agent container
```

Service management:
```bash
# macOS (launchd)
launchctl load ~/Library/LaunchAgents/com.nanopielot.plist
launchctl unload ~/Library/LaunchAgents/com.nanopielot.plist
launchctl kickstart -k gui/$(id -u)/com.nanopielot  # restart

# Linux (systemd)
systemctl --user start nanopielot
systemctl --user stop nanopielot
systemctl --user restart nanopielot
```

## Troubleshooting

**WhatsApp not connecting after upgrade:** WhatsApp is now a separate skill, not bundled in core. Run `/add-whatsapp` to install it. Existing auth credentials and groups are preserved.

## Container Build Cache

The container buildkit caches the build context aggressively. `--no-cache` alone does NOT invalidate COPY steps — the builder's volume retains stale files. To force a truly clean rebuild, prune the builder then re-run `./container/build.sh`.

## Do not do these

- Do not rewrite history, force push, or delete branches.
- Do not commit secrets, tokens, or personal data. The Copilot device-login
  session under `data/copilot-auth/`, channel credentials (WhatsApp session
  files, bot tokens), and anything under `.env` are git-ignored; never add them
  back or paste a token into an issue, PR, or commit message.
- Do not run `npm publish`, create or move tags, or create GitHub releases by
  hand. `v*` tags trigger `.github/workflows/release.yml`, which publishes to
  npm over OIDC; that is the maintainer's action.
- Do not change what `launchctl`/`systemctl` install or start without saying so
  in the pull request: the service definitions in `launchd/` and the systemd
  unit are what keeps an installed instance running unattended, and a bad
  change there breaks it silently until the next restart.
- Do not delete or truncate a group's SQLite data (`src/db.ts`), its
  filesystem, or another group's isolated memory without the user asking for
  it by name. These hold conversation state and per-group memory that cannot
  be recreated.

## Attribution

Agent-authored commits carry a `Co-authored-by` trailer naming the agent, and
every change reaches `main` through a pull request, per the [Contributing
Workflow](README.md#contributing-workflow).
