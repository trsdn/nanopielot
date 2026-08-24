# Changelog

All notable changes to NanoPieLot will be documented in this file.

## [Unreleased]

### Security

- **All known dependency vulnerabilities resolved** — root project went from 7 advisories (6 high, 1 low) to 0, and `container/agent-runner` from 8 (4 high, 3 moderate, 1 low) to 0. Covers `@github/copilot` (GHSA-9ccr-r5hg-74gf, arbitrary command execution via nested bare repo `core.fsmonitor`), `hono`, `fast-uri`, `ip-address`, `express-rate-limit`, `@hono/node-server`, `body-parser`, `qs`, `js-yaml`, `postcss`, `nanoid`, `vite`, `brace-expansion`, and `esbuild`.
- **Container now installs from the lockfile** — `container/Dockerfile` used `npm install`, which ignored `package-lock.json`, so audited dependency versions never reached the running agent. Changed to `npm ci`.
- **Copilot CLI pinned in the container** — the global `npm install -g @github/copilot` was unpinned and therefore non-reproducible. Now pinned to `1.0.80`.

### Changed

- **Copilot SDK upgraded to 1.0.11** — the `@github/copilot` security fix requires a CLI newer than the pinned SDK `0.2.1` could drive, so the SDK was upgraded in both the root project and `container/agent-runner`. API migration: `CopilotClientOptions.cwd` → `workingDirectory`, `MCPLocalServerConfig` → `MCPStdioServerConfig`, and the `session.info` event payload cast updated for the new `InfoData` type.
- **Prettier pinned to an exact version** — the `^3.8.1` range let the formatter drift to 3.9.6 on lockfile refresh, which silently changes formatting rules and breaks `format:check`. Pinned to `3.9.6` and reformatted the affected files.

### Added

- **CI coverage for `container/`** — `container/agent-runner` previously had no CI at all, so dependency bumps touching it reported a meaningless green check. CI now installs from its lockfile, runs `npm audit --audit-level=high`, builds it, and builds the agent container image.

## [1.2.2]

### Added

- **npm Trusted Publishing** — `.github/workflows/release.yml` publishes to npm from GitHub Actions via OIDC on `v*` tags, with no npm tokens or repository secrets. Runs the full quality gate (`format:check`, `lint`, `typecheck`, `test`, `build`) before publishing.
- **Publish metadata** — added `files`, `types`, `repository`, `homepage`, `bugs`, `license`, `author`, and `keywords` to `package.json` so the published tarball ships only `dist/` plus `README.md`, `CHANGELOG.md`, and `LICENSE`.

### Changed

- **Build config split** — `npm run build` now uses `tsconfig.build.json`, which excludes `src/**/*.test.ts` so compiled tests no longer land in `dist/` or the published package. `npm run typecheck` still covers tests.
- **Version alignment** — `package.json` was stuck at `1.0.0` despite tags through `v1.2.1`; it now tracks the released version.

### Fixed

- **`prepare` script broke registry installs** — `prepare` ran `husky` unconditionally, which fails for consumers installing from npm. It is now guarded to run only inside a git checkout.

## [1.2.1]

### Changed

- **Agent-runner runtime dependency refresh** — pinned `@modelcontextprotocol/sdk` to `1.29.0` in `container/agent-runner` and regenerated the lockfile so patched runtime transitive dependencies are used.
- **Dev toolchain refresh** — upgraded `vitest` to `4.1.3` and regenerated the root lockfile so the Vite/Vitest dependency chain resolves to patched packages.

### Fixed

- **Agent-runner warning parsing ReDoS** — replaced regex-based parsing in `parseToolConfigurationWarning(...)` with direct prefix parsing to resolve the CodeQL polynomial ReDoS findings.
- **Setup command execution safety** — replaced shell-interpolated command execution in `setup/groups.ts` and `setup/service.ts` with argument-based process execution to resolve the CodeQL shell command injection findings.

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

[1.2.2]: https://github.com/trsdn/nanopielot/compare/v1.2.1...v1.2.2
[1.2.1]: https://github.com/trsdn/nanopielot/compare/v1.2.0...v1.2.1
[1.2.0]: https://github.com/trsdn/nanopielot/compare/v1.1.0...v1.2.0
[1.1.0]: https://github.com/trsdn/nanopielot/compare/v1.0.0...v1.1.0
[1.0.0]: https://github.com/trsdn/nanopielot/releases/tag/v1.0.0
