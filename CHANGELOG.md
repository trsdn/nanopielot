# Changelog

All notable changes to NanoPieLot will be documented in this file.

## [1.1.0]

### Fixed

- **Agent tools now work** — the `availableTools` allowlist used PascalCase names (`Bash`, `Read`, `Write`) but the Copilot SDK expects lowercase (`bash`, `edit`, `glob`). This caused all tools to be silently disabled, making the agent respond with text-only promises instead of actually executing tasks.
- **CopilotClient `cwd`** — set to `/workspace/group` so the CLI server discovers `AGENTS.md` and project-level settings. Without this, the agent ran in the container root with no project context.
- **Removed invalid `settingSources`** — `settingSources: ['project']` is not a valid SDK config option and was silently ignored.
- **`/model` command works for Telegram owners** — the ownership check used `is_from_me` (a WhatsApp concept). Now uses `group.isMain` so Telegram main-group messages are recognized as owner commands.

## [1.0.0]

- Initial release. Ported from [NanoClaw](https://github.com/qwibitai/nanoclaw) to GitHub Copilot SDK.
- Authentication via `copilot login` device flow (no API keys).
- Live model switching with `/model` command per group.
- All NanoClaw features preserved: containers, channels, skills, scheduling, agent swarms.

[1.1.0]: https://github.com/trsdn/nanopielot/compare/v1.0.0...v1.1.0
[1.0.0]: https://github.com/trsdn/nanopielot/releases/tag/v1.0.0
