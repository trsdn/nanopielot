# Changelog

All notable changes to NanoPieLot will be documented in this file.

## [1.2.0]

### Added

- **Agent-runner regression coverage** — added end-to-end-style tests around Copilot client setup, tool availability, permission wiring, session resume behavior, stale-session fallback, and tool-configuration warnings.
- **Migration guide** — added `docs/MIGRATION.md` with NanoClaw -> NanoPieLot migration notes for Copilot SDK, device login, AGENTS discovery, and related compatibility details.
- **Troubleshooting guide** — added `docs/TROUBLESHOOTING.md` covering tool allowlist issues, stale builds, Copilot auth problems, Docker cache problems, and the Copilot SDK upgrade workflow.

### Changed

- **Bootstrap vs. app runtime split** — extracted the main runtime and service logic into `src/app.ts`, leaving `src/index.ts` as a thin bootstrapper and re-export surface for future API/Web UI entrypoints.
- **Changelog navigation** — added compare/release links so version entries can link directly to GitHub release pages and diffs.

### Fixed

- **Pinned Copilot SDK usage** — pinned `@github/copilot-sdk` to exact `0.2.1` and added an agent-runner startup warning if the loaded SDK version drifts from the pinned version.
- **Safer session resume** — the agent-runner now checks `getSessionMetadata()` before `resumeSession()` and creates a fresh session when a persisted session ID no longer exists.
- **Tool configuration visibility** — the agent-runner now logs clear warnings when the SDK reports disabled tools or unknown tool names.
- **Safer `/model` parsing** — replaced the regex-based `/model` command parsing path with direct string parsing to avoid the GitHub Advanced Security CodeQL finding on uncontrolled input.

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

[1.2.0]: https://github.com/trsdn/nanopielot/compare/v1.1.0...v1.2.0
[1.1.0]: https://github.com/trsdn/nanopielot/compare/v1.0.0...v1.1.0
[1.0.0]: https://github.com/trsdn/nanopielot/releases/tag/v1.0.0
