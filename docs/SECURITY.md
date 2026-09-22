# Security policy

## Supported versions

Only the latest published release is supported. Update to it before reporting;
the fix may already be there.

## Reporting a vulnerability

Report vulnerabilities privately through GitHub's [private vulnerability
reporting](https://github.com/trsdn/nanopielot/security/advisories/new). Do not
open a public issue for a security report, and never paste a token, session
file, or channel credential into any report.

You can expect an acknowledgement within seven days. If a fix is warranted, it
ships in a release with the advisory published alongside it.

## What is in scope

- Code in this repository: the orchestrator, channels, skills, and the agent
  container image in `container/`.
- The published npm package `nanopielot`.
- The release and CI workflows in `.github/workflows/`.

## What is not in scope

- Vulnerabilities in GitHub Copilot, or in the chat platforms a channel
  connects to (WhatsApp, Telegram, Slack, Discord, Gmail). Report those to the
  platform in question.
- Vulnerabilities inherited from [NanoClaw](https://github.com/qwibitai/nanoclaw)
  that have not diverged here; consider reporting upstream too so other forks
  benefit.

## Handling credentials

The Copilot device-login session lives under `data/copilot-auth/`, and channel
credentials (WhatsApp session files, bot tokens) live under their own
data directories. None of these are committed; all are git-ignored. If you
believe one has been exposed, revoke it at its source — the [Copilot CLI
session](https://github.com/settings/connections/applications) or the
channel's own bot/app settings — and re-run the relevant setup skill.
