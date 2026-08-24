# Conformance Assessment: trsdn/nanopielot

- Standard version:
  [1.2.0](https://github.com/trsdn/.github/blob/v1.2.0/docs/repository-quality-standard.md)
- Assessed on: 2026-08-24
- State: **Needs work**
- Record: [`.github/conformance.yml`](../.github/conformance.yml)

Results: 31 pass, 15 partial, 19 fail, 4 unknown, 14 not applicable.

The state is `Needs work` rather than `At risk`. The failures are concentrated in
release mechanics, product identity, and privacy disclosure. None of them is a
critical gap as the standard defines one: there are no committed secrets, secret
scanning and push protection are enabled, private vulnerability reporting is on,
and normal use of the project is supportable today.

## Profiles

| Profile | Applies | Rationale |
|---|---|---|
| Public | Yes | Public repository |
| Software | Yes | TypeScript application with a test suite |
| Deployable | Yes | Runs as a long-lived service via launchd and containers |
| Package | Yes | Publishes tagged GitHub releases |
| Documentation | No | `docs/` supports the software; documentation is not the product |
| Archived | No | Actively maintained |

## Critical findings

### B10 — Ownership and maintenance status are clear — `fail`

`.github/CODEOWNERS` assigns every path to `@gavrielc` and `@gabi-simons`, the
upstream NanoClaw authors. Neither has access to this fork. GitHub's own
CODEOWNERS API reports an error on every line:

```text
Unknown owner on line 2: make sure @gavrielc exists and has write access
```

The consequence is not cosmetic. Code ownership silently does nothing: no review
is requested, and a rule that appears to protect `/src/`, `/container/`,
`package.json`, and `package-lock.json` protects none of them. A file that looks
like governance and enforces nothing is worse than no file, because it stops
anyone from asking who reviews these paths.

Remediation: point the entries at the actual owner, or delete the file and say so
in `AGENTS.md`.

### R04, I01, I06 — Version drift between the release and the artifact — `fail`

`package.json` declares `1.0.0`. The changelog's newest entry is `1.2.1`, and
four releases exist up to `v1.2.1`. The published artifact therefore identifies
itself as a version that was superseded three releases ago.

`I06` is the criterion that explains why this happened: identity metadata is
maintained by hand instead of produced by the build, so nothing forces it to
follow the tag. Correcting the number today fixes the symptom and leaves the
mechanism in place.

Remediation: derive the version from the tag at build time, and have the release
workflow refuse to publish when tag and manifest disagree.

### R03 — A tag produces installable artifacts through automation — `fail`

The only workflows are `ci.yml` and `label-pr.yml`. The four existing releases
were created by hand. Nothing verifies that a tag, the manifest, and the release
title agree, which is precisely how the drift above went unnoticed.

### S09 — Required checks protect the default branch — `fail`

Branch protection exists on `main`, but no status check is required and linear
history is not enforced. `ci.yml` runs format, typecheck, and tests on every pull
request, and none of them can block a merge. The verification is bought and not
spent.

## Release and packaging

### R01 — Package metadata is complete and agrees with repository metadata — `fail`

`package.json` has no `license`, `repository`, or `bugs` field. Its `description`
("Personal Copilot assistant. Lightweight, secure, customizable.") also disagrees
with the repository description ("NanoClaw, ported to the GitHub Copilot SDK…").

This is what makes `I02` and `I03` fail as well: the artifact cannot embed a
repository URL, an issue tracker URL, or a license identifier that is not
recorded anywhere.

### R02 — Versioning and compatibility policy are documented — `fail`

Versions are incremented, but no policy states what a major, minor, or patch
change means for this project, so no consumer can predict what an upgrade breaks.

### R05, I05 — `unknown`

Whether built artifacts are smoke-tested from a clean environment, and whether
the banner in `assets/` is embedded in the artifact rather than only rendered in
the README, were not established. `unknown` is recorded rather than a guess.

## Privacy

The Y criteria are the weakest area, and the reason is structural: this project
relays a user's private messages to a third-party AI provider and stores them
locally, and none of that is written down anywhere.

- **Y01, Y02 — `fail`.** No document states what data is collected, stored, or
  transmitted, or which outbound destinations exist. In practice they include at
  least the Telegram Bot API and the GitHub Copilot API.
- **Y04, Y06 — `fail`.** `src/db.ts` stores messages in a SQLite database at
  `store/messages.db`. That location, and whether anything is ever deleted, is
  undocumented. A user cannot find, export, or delete their own message history
  from the documentation alone.
- **Y05 — `partial`.** The README makes the Copilot SDK obvious. That the
  message content itself reaches GitHub, and that Telegram sees it first, is
  never stated as a privacy consequence.
- **Y03 — `partial`.** No telemetry or analytics were found, which is the right
  default. It is not disclosed, so a reader has to take it on trust.

None of this is a leak. It is an absence of disclosure, and it is cheap to fix:
one `docs/PRIVACY.md` answers all six.

## Accessibility

- **X04 — `fail`.** `src/logger.ts` writes raw ANSI escapes (`\x1b[34m` and
  friends) unconditionally. There is no `NO_COLOR` check and no TTY detection, so
  log output carries escape sequences into files, pipes, and screen readers.
  This is the one accessibility criterion that fully applies to a
  terminal-and-bot product, and it is the one that fails.
- **X05 — `fail`.** No known limitations are stated.
- **X01, X02, X03 — `na`.** There is no graphical interface.

## Agent readiness

`AGENTS.md` is real and useful: it states the context, the key files, the secrets
model, and how to run the service. Three gaps:

- **G03 — `fail`.** No forbidden or high-risk operation is named. An agent is not
  told what it must not do.
- **G02 — `partial`.** The Development section documents `npm run dev`,
  `npm run build`, and the container rebuild — how to *run* the project, but not
  how to *validate* a change. `lint`, `typecheck`, `format:check`, and `test`
  all exist as scripts and none is mentioned.
- **G04 — `partial`.** `.github/copilot-instructions.md` carries a rule that
  `AGENTS.md` does not: never work directly on `main`, always go through a pull
  request. A rule that binds one tool and not another is a rule that will be
  followed inconsistently.

## Language

- **L03 — `fail`, L01 — `partial`.** Everything user-facing is English, and no
  German or other non-English strings were found. Neither the primary language
  nor the localization stance is declared, so "English-only" is an observation
  rather than a commitment.
- **L05 — `unknown`.** `src/timezone.test.ts` shows date handling is deliberate;
  whether formatting uses platform locale APIs was not established.

## Badges

**P08 — `pass`, after this change.** The README previously carried two hardcoded
shields.io badges. The `license-MIT` badge was the instructive one: it asserted
MIT while `package.json` declares no license at all. It was correct only because
`LICENSE` happened to agree with it, and nothing kept them agreeing.

The required badge block is now present in the order the convention specifies —
license, runtime, CI, latest release, conformance — and every value is derived
from an authoritative source: GitHub's detected license, `engines.node` read from
the manifest, the workflow's own status, the latest release, and the generated
conformance badge. Each links to what it reports. The decorative "Copilot SDK"
badge is kept, separated from the required block, and duplicates no manifest
field.

## Notable passes

- **S02, S05, S08** — 19 test files cover routing, IPC authentication, the sender
  allowlist, database migration, and end-to-end flows. Secret scanning and push
  protection are on, Dependabot is configured, and the changelog shows CodeQL
  findings being triaged and fixed rather than dismissed.
- **B04** — `.gitignore` is unusually careful. It excludes `store/`, `data/`,
  `logs/`, and `*.keys.json`, and uses negative patterns to track exactly the
  `groups/*/AGENTS.md` files that are meant to be tracked.
- **D01, D02, D04** — Setup, the launchd unit, the container build, and the
  device-login session model are all documented, and the secrets model
  deliberately avoids committing raw tokens.
- **S10** — `docs/SPEC.md` and `docs/APPLE-CONTAINER-NETWORKING.md` capture
  constraints that would otherwise have to be rediscovered.

## Reassessment

Due by 2027-02-24. The conformance check fails once the record ages past that
point and stays red until the repository is reassessed.
