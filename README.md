<h1 align="center">🥧 NanoPieLot</h1>

<p align="center">
  <em>Easy as Pie.</em>
</p>

<p align="center">
  A personal AI assistant that runs agents securely in containers.<br>
  Ported from <a href="https://github.com/trsdn/nanoclaw">NanoClaw</a> to the <strong>GitHub Copilot SDK</strong> — same claw, different cockpit. 🥧🧑‍✈️
</p>

---

## What Changed from NanoClaw

NanoPieLot is a full port of [NanoClaw](https://github.com/trsdn/nanoclaw) from Anthropic/Claude to the GitHub Copilot SDK:

- **No API keys.** Authentication via `copilot login` device flow — no tokens in `.env` files.
- **Any Copilot model.** Use `/model list` to see what's available, `/model <id>` to switch. GPT-4.1, Claude, Gemini, and more — whatever your GitHub plan gives you.
- **Same architecture.** Everything else works exactly like NanoClaw: containers, channels, skills, groups, scheduling.

## Quick Start

```bash
gh repo fork trsdn/nanopielot --clone
cd nanopielot
copilot
```

<details>
<summary>Without GitHub CLI</summary>

1. Fork [trsdn/nanopielot](https://github.com/trsdn/nanopielot) on GitHub
2. `git clone https://github.com/<your-username>/nanopielot.git`
3. `cd nanopielot`
4. `copilot`

</details>

Then run `/setup`. It installs dependencies, builds the agent container, and walks you through a one-time `copilot login` device flow.

> **Note:** Commands prefixed with `/` (like `/setup`, `/add-whatsapp`) are CLI agent skills. Type them inside the `copilot` prompt, not in your regular terminal.

## Philosophy

**Small enough to understand.** One process, a few source files, no microservices. Want to understand the full codebase? Just ask Copilot to walk you through it.

**Secure by isolation.** Agents run in Linux containers (Apple Container on macOS, or Docker). They can only see what's explicitly mounted. Bash runs inside the container, not on your host.

**Built for you.** NanoPieLot isn't a monolithic framework. Fork it, let Copilot modify it to match your needs. Bespoke, not bloatware.

**Customization = code changes.** No configuration sprawl. Want different behavior? Modify the code. It's small enough that it's safe.

**AI-native.**
- No installation wizard; Copilot guides setup.
- No monitoring dashboard; ask Copilot what's happening.
- No debugging tools; describe the problem and Copilot fixes it.

**Skills over features.** Instead of adding features to the codebase, contributors submit skill branches like `/add-telegram` that transform your fork. You end up with clean code that does exactly what you need.

## What It Supports

- **Multi-channel messaging** — WhatsApp, Telegram, Discord, Slack, Gmail. Add with `/add-whatsapp`, `/add-telegram`, etc.
- **Live model switching** — `/model list` queries your available Copilot models in real-time. `/model gpt-4.1` switches instantly per group.
- **Isolated group context** — Each group has its own `AGENTS.md` memory, isolated filesystem, and container sandbox.
- **Main channel** — Your private channel for admin control; every group is completely isolated.
- **Scheduled tasks** — Recurring jobs that run Copilot and message you back.
- **Web access** — Search and fetch content from the web.
- **Container isolation** — Docker (macOS/Linux), [Docker Sandboxes](docs/docker-sandboxes.md) (micro VM), or Apple Container (macOS).
- **Credential security** — Device-login session stored under `data/copilot-auth/`, mounted into containers at runtime.
- **Agent Swarms** — Teams of specialized agents collaborating on complex tasks.

## Usage

Talk to your assistant with the trigger word (default: `@Andy`):

```
@Andy send an overview of the sales pipeline every weekday morning at 9am
@Andy review the git history for the past week each Friday and update the README if there's drift
@Andy every Monday at 8am, compile AI news from Hacker News and TechCrunch
```

### Model Switching

Switch models per group — no restart needed:

```
/model list              — show available models from your Copilot plan
/model gpt-4.1           — switch this group to GPT-4.1
/model claude-sonnet-4   — switch to Claude Sonnet
/model show              — see what's currently active
/model reset             — back to Copilot auto-selection
```

## Customizing

No config files. Just tell Copilot what you want:

- "Change the trigger word to @Bob"
- "Make responses shorter and more direct"
- "Add a custom greeting when I say good morning"

Or run `/customize` for guided changes.

## Contributing

**Don't add features. Add skills.**

Fork NanoPieLot, make changes on a branch, open a PR. We'll create a skill branch that other users can merge into their fork.

### RFS (Request for Skills)

- `/add-signal` — Add Signal as a channel

## Requirements

- macOS, Linux, or Windows (via WSL2)
- Node.js 20+
- [GitHub Copilot CLI](https://docs.github.com/en/copilot/how-tos/copilot-cli/set-up-copilot-cli/authenticate-copilot-cli)
- [Apple Container](https://github.com/apple/container) (macOS) or [Docker](https://docker.com/products/docker-desktop) (macOS/Linux)

## Architecture

```
Channels → SQLite → Polling loop → Container (GitHub Copilot SDK) → Response
```

Single Node.js process. Channels self-register at startup. Agents run in isolated Linux containers — only mounted directories are accessible. Per-group message queue with concurrency control.

Key files:
- `src/index.ts` — Orchestrator: state, message loop, agent invocation, `/model` commands
- `src/copilot-models.ts` — Live model listing via Copilot SDK
- `src/channels/registry.ts` — Channel registry
- `src/container-runner.ts` — Spawns streaming agent containers
- `src/db.ts` — SQLite operations (messages, groups, sessions, model state)
- `src/task-scheduler.ts` — Scheduled tasks
- `groups/*/AGENTS.md` — Per-group memory

## FAQ

**Why not just use NanoClaw?**

NanoClaw requires an Anthropic API key. NanoPieLot uses your existing GitHub Copilot subscription — no extra API keys, no billing surprises. Plus you get access to multiple model families (GPT, Claude, Gemini) through one authentication.

**Can I switch models on the fly?**

Yes. Send `/model list` to see what your plan supports, then `/model <id>` to switch. Each group can use a different model. Sessions are automatically cleared on model change.

**Why Docker?**

Cross-platform support and a mature ecosystem. On macOS, switch to Apple Container via `/convert-to-apple-container` for a lighter runtime. For extra isolation, [Docker Sandboxes](docs/docker-sandboxes.md) run containers inside micro VMs.

**Is this secure?**

Agents run in containers with filesystem isolation. Copilot auth is established once via device login, then reused from a mounted auth directory — no tokens in project files. The codebase is small enough that you can actually review it.

**How do I debug issues?**

Ask Copilot. "Why isn't the scheduler running?" "What's in the recent logs?" Or run `/debug`.

## Credits

NanoPieLot is a port of [NanoClaw](https://github.com/trsdn/nanoclaw) by [trsdn](https://github.com/trsdn). The original project's philosophy, architecture, and skill system are preserved. The Claw just got a Pilot now. 🥧

## License

MIT
