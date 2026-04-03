---
name: init-onecli
description: Legacy skill retained for compatibility. The current NanoPieLot base no longer uses OneCLI for authentication.
---

# Initialize OneCLI Agent Vault

This skill is obsolete in the Copilot-based NanoPieLot mainline.

The repository now authenticates through GitHub Copilot device login and no longer depends on OneCLI's Agent Vault. If you are following the base setup, do not install or configure OneCLI.

## What to do instead

1. Run `/setup`.
2. Complete the `copilot login` device flow.
3. Use `/debug` if the mounted Copilot auth state needs repair.

## When this still matters

Only use OneCLI in a separate custom fork that has intentionally reintroduced that dependency. The main `trsdn/nanoclaw` branch should stay on the Copilot auth path.
