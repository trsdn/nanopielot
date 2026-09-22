# Conformance Assessment: trsdn/nanopielot

- Standard version:
  [1.21.0](https://github.com/trsdn/.github/blob/v1.21.0/docs/repository-quality-standard.md)
- Assessed on: 2026-09-22
- State: **Needs work**
- Record: [`.github/conformance.yml`](../.github/conformance.yml)

Results: 59 pass, 15 partial, 7 fail, 26 not applicable. The whole standard
was re-read for this pass, not diffed from the 1.2.0 record of 2026-08-24
(31 pass, 15 partial, 19 fail, 4 unknown, 14 not applicable). Most of that
record's findings still held and were re-verified against the current tree
rather than carried over unread.

## Profiles

| Profile | Applies | Rationale |
|---|---|---|
| Public | Yes | Public repository |
| Software | Yes | TypeScript application with a test suite |
| Deployable | Yes | Runs as a long-lived service via launchd/systemd and containers, started by a `/setup` install rather than by hand each time |
| Package | Yes | Publishes to npm and tagged GitHub releases |
| Published Site | No | This ships a personal AI-agent framework that a developer forks, configures (Docker/Apple Container, GitHub Copilot CLI device login, `/setup`), and self-hosts. Per [decision 0020](https://github.com/trsdn/.github/blob/main/docs/decisions/0020-public-applications-need-a-site.md), that is the excluded case: "an agent tool that ... a developer configures rather than installs by name." There is no `npm install -g` or `bin` entry point, and the README's own Quick Start is `gh repo fork` + `git clone`, not an install-by-name step for a non-developer. `W01`-`W09` are `na` for that reason. |
| Documentation | No | `docs/` supports the software; documentation is not the product |
| Archived | No | Actively maintained (pushed 2026-09-13, this pass added more) |

## What improved since 1.2.0

Fixed in this pass (pull requests
[#68](https://github.com/trsdn/nanopielot/pull/68) and
[#69](https://github.com/trsdn/nanopielot/pull/69)):

| Criterion | 1.2.0 | Now | What changed |
|---|---|---|---|
| `B02` | partial | pass | README states maintenance status, audience, and the primary language, in addition to the setup and key links it already had. |
| `B10` | fail | pass | README now carries an explicit maintenance-status statement; ownership defaults to the account that owns the repository (`trsdn`, a personal account), independent of `CODEOWNERS` (see below). |
| `G03` | fail | pass | `AGENTS.md` gained a "Do not do these" section: history rewriting/force push, credential files, hand releases, the service definitions, destructive data operations. |
| `G08` | — (file absent) | pass | `.github/github-app.yml` added, pointing at `AGENTS.md`. |
| `L01`, `L03` | partial / fail | pass | README states "English only" for both. |
| `P03` | pass (by profile, weak) | pass (substantively) | `docs/SECURITY.md` previously only redirected to the unrelated upstream [NanoClaw](https://github.com/qwibitai/nanoclaw) security guide and said nothing about *this* repository. Rewritten with this repository's own scope, reporting route, and credential handling. |
| `X05` | fail | pass | README's new *Accessibility* section states the limitation: no interface of its own. |
| `Y01`, `Y02`, `Y04` | fail | pass | README's new *Data and privacy* section states what is collected (nothing by this project), where data goes (the channels enabled, plus the GitHub Copilot API), and where local state lives (`store/messages.db`, `groups/`, `data/copilot-auth/`). |
| `Y05` | partial | pass | The same section names GitHub/Copilot and the connected chat platforms as recipients of message content. |
| `Y06` | fail | pass | States retention: kept until the data directory or group is deleted. |
| `B14` | not previously assessed at this identifier | pass | `docs/SECURITY.md` now names how to handle an exposed Copilot session or channel credential. |
| `R01` | fail | pass | `package.json` gained `license`, `repository`, and `bugs` fields since 1.2.0 (release 1.2.2); all agree with the GitHub repository. |
| `R03`, `R04` | fail | pass | `.github/workflows/release.yml` now publishes on `v*` tags via OIDC; the latest release (`v1.2.2`) has tag, `package.json` version, and release title all agreeing. |

Also merged, outside this branch: the repository's own clean Dependabot PR
[#60](https://github.com/trsdn/nanopielot/pull/60) (`fast-uri` in
`container/agent-runner`).

## Still failing, and why they were left

| Criterion | Result | Why |
|---|---|---|
| `S09` | fail | The default branch is protected (blocks force-push and deletion, `B16` pass) but no ruleset or classic protection requires any check before merge, so `ci`'s checks are informative, not gating. Fixing this is a branch-protection change, which this work is not authorised to make; recorded, not fixed. |
| `P09` | fail | No self-hosted repository stats card is published, and a runner is available (public repo with Actions). Not built in this pass; the [`templates/repo-stats/`](https://github.com/trsdn/.github/blob/main/templates/repo-stats) kit is the documented remediation. |
| `R02` | fail | No versioning-and-compatibility statement exists in the README or `CHANGELOG.md`; versions increment without a stated policy. |
| `R05` | fail | No smoke kit checks the published `nanopielot` npm artifact after publish. The published package has no `bin` entry (it is a library export, not the documented install path), so a minimal kit would be a self-test such as `node -e "require('nanopielot')"` against the installed tarball; not built in this pass. |
| `I04` | fail | No source-level version/about surface was found: no `--version` output, no status command that reports the repository or issue tracker. |
| `I06` | fail | The published version is a hand-edited `package.json` field (the 1.2.2 changelog entry describes correcting it by hand after it drifted from the tags), not derived by the build from the tag. |
| `X04` | fail | `src/logger.ts` writes ANSI colour codes unconditionally; no `NO_COLOR` support or TTY check is documented. |

`R07` is `partial`, not `fail`: the `v1.2.2` release notes describe that
version's changes but neither match nor link the `CHANGELOG.md [1.2.2]`
entry — the same content, reworded. `R09` is `partial`: no open secret-scanning
alert exists, but open Dependabot alerts (at least one high-severity, in
`js-yaml` and previously `fast-uri`) remain against the current commit without
a recorded reason; several fixes are open as Dependabot PRs
(`#62`-`#67`) but each fails its `agent-runner` CI job on
`npm audit --audit-level=high` for advisories none of those individual diffs
fully resolves alone, so merging any one over that red check was not done.

None of the failing criteria is in the standard's critical list
(`B04`, `D01`-`D04`, `D06`), so the state is `Needs work` rather than
`At risk`: there is no committed secret, secret scanning and push protection
are enabled, Dependabot alerts and security updates are on, and normal use of
the project is supportable today.

## Partial results, condensed

| Criterion | Assessment |
|---|---|
| `B05`, `G02`, `G05` | No single command is documented as *the* thing to run before proposing a change. CI runs `format:check`, `lint`(only in some jobs), `typecheck`, and `test` as separate steps, and `AGENTS.md`'s Development section documents `npm run dev`/`build`/the container rebuild but not validation. |
| `B13` | `Node.js 20+` is restated by hand in the README (and dynamically in a badge, which does not count against this) without a link to `package.json`'s `engines` field; it agrees, so this is a repetition rather than drift. |
| `B15` | Dependencies are resolved by npm at install time and nothing is vendored — true of the tree, but no sentence in the repository says so. |
| `P05` | Install (Quick Start) and compatibility (Requirements) are covered; security and support are now covered; configuration and a concrete usage example are still thin. |
| `P11` | `.github/PULL_REQUEST_TEMPLATE.md` collects what changed and a skill-specific checklist, but not how the change was verified, its risk, or a linked issue. |
| `S04` | CI (`ci.yml`) runs on `ubuntu-latest` only; the README claims macOS, Linux, and Windows (via WSL2). |
| `S06` | Not independently re-verified this pass beyond the 1.2.0 finding; config is read from `.env`/environment with no committed default observed. |
| `S07` | Not independently re-verified this pass; `docs/TROUBLESHOOTING.md` and `docs/DEBUG_CHECKLIST.md` suggest diagnosable logging exists, but credential-safe logging in `src/` was not read end to end. |
| `S08` | `.github/dependabot.yml` configures version updates for `github-actions`, `/container/agent-runner`, and the Docker image, but not the root npm manifest; root security patches still arrive through GitHub's separate automated-security-fixes feature (`P12`, pass). |
| `D03`, `D06` | Service management commands exist (README); a stated rollback/restore path for the SQLite store does not. |

## Ownership note (`CODEOWNERS`)

`.github/CODEOWNERS` still assigns `/src/`, `/container/`, `/groups/`,
`/launchd/`, and the manifest files to `@gavrielc` and `@gabi-simons`, the
upstream NanoClaw authors, who have no access to this fork. This does not fail
`B10` — the repository is owned by the `trsdn` account, which is who the
criterion's ownership part defaults to for a personal account — but it means
those `CODEOWNERS` entries do nothing (GitHub cannot request a review from an
account without access), which is worth the maintainer's attention even
though no criterion scores it directly.

## Not applicable

| Criteria | Rationale |
|---|---|
| `T01`-`T05` | The Documentation profile does not apply; `docs/` supports the software product. |
| `W01`-`W09` | See *Profiles* above. |
| `L04`-`L06` | English-only, declared in the README, no string catalogs. |
| `X01`-`X03` | No graphical interface of this project's own. |
| `I05` | No icon surface: no installer, store listing, or site. |
| `S13` | No workflow uses `pull_request_target` or `workflow_run`. |
| `A01`-`A04` | The repository is not archived. |

## Reassessment

Due by 2027-03-22.
