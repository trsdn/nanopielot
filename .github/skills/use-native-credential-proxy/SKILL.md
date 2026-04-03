---
name: use-native-credential-proxy
description: Legacy skill retained for compatibility. The current NanoPieLot base now uses GitHub Copilot device login instead of the old native credential proxy.
---

# Use Native Credential Proxy

This skill is obsolete in the Copilot-based NanoPieLot mainline.

The current repository no longer ships the native credential proxy or the OneCLI migration path. Authentication is handled by a persistent GitHub Copilot device-login session stored under `data/copilot-auth/` and mounted into agent containers.

## What to do instead

1. Run `/setup`.
2. Complete the `copilot login` device flow when prompted.
3. Re-run `/debug` if your Copilot auth state looks broken.

## Notes

- Do not reintroduce `src/credential-proxy.ts` into this branch unless you are intentionally maintaining a separate legacy fork.
- Old `.env`-based Anthropic credential instructions no longer apply to the base setup.
