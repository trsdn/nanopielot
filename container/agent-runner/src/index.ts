/**
 * NanoPieLot Agent Runner (Copilot SDK)
 * Runs inside a container, receives config via stdin, outputs result to stdout
 *
 * Input protocol:
 *   Stdin: Full ContainerInput JSON (read until EOF)
 *   IPC:   Follow-up messages written as JSON files to /workspace/ipc/input/
 *          Files: {type:"message", text:"..."}.json — polled and consumed
 *          Sentinel: /workspace/ipc/input/_close — signals session end
 *
 * Stdout protocol:
 *   Each result is wrapped in OUTPUT_START_MARKER / OUTPUT_END_MARKER pairs.
 *   Multiple results may be emitted (one per query cycle).
 *   Final marker after loop ends signals completion.
 */

import fs from 'fs';
import path from 'path';
import { execFile } from 'child_process';
import { CopilotClient, approveAll } from '@github/copilot-sdk';
import type { CopilotSession, ResumeSessionConfig, SessionConfig, MCPLocalServerConfig } from '@github/copilot-sdk';
import { fileURLToPath } from 'url';

interface ContainerInput {
  prompt: string;
  sessionId?: string;
  model?: string;
  groupFolder: string;
  chatJid: string;
  isMain: boolean;
  isScheduledTask?: boolean;
  assistantName?: string;
  script?: string;
}

interface ContainerOutput {
  status: 'success' | 'error';
  result: string | null;
  newSessionId?: string;
  error?: string;
}

const IPC_INPUT_DIR = '/workspace/ipc/input';
const IPC_INPUT_CLOSE_SENTINEL = path.join(IPC_INPUT_DIR, '_close');
const IPC_POLL_MS = 500;

// Default timeout for sendAndWait (10 minutes — agent tasks can be long)
const SEND_TIMEOUT_MS = 10 * 60 * 1000;

async function readStdin(): Promise<string> {
  return new Promise((resolve, reject) => {
    let data = '';
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', chunk => { data += chunk; });
    process.stdin.on('end', () => resolve(data));
    process.stdin.on('error', reject);
  });
}

const OUTPUT_START_MARKER = '---NANOPIELOT_OUTPUT_START---';
const OUTPUT_END_MARKER = '---NANOPIELOT_OUTPUT_END---';

function writeOutput(output: ContainerOutput): void {
  console.log(OUTPUT_START_MARKER);
  console.log(JSON.stringify(output));
  console.log(OUTPUT_END_MARKER);
}

function log(message: string): void {
  console.error(`[agent-runner] ${message}`);
}

/**
 * Check for _close sentinel.
 */
function shouldClose(): boolean {
  if (fs.existsSync(IPC_INPUT_CLOSE_SENTINEL)) {
    try { fs.unlinkSync(IPC_INPUT_CLOSE_SENTINEL); } catch { /* ignore */ }
    return true;
  }
  return false;
}

/**
 * Drain all pending IPC input messages.
 * Returns messages found, or empty array.
 */
function drainIpcInput(): string[] {
  try {
    fs.mkdirSync(IPC_INPUT_DIR, { recursive: true });
    const files = fs.readdirSync(IPC_INPUT_DIR)
      .filter(f => f.endsWith('.json'))
      .sort();

    const messages: string[] = [];
    for (const file of files) {
      const filePath = path.join(IPC_INPUT_DIR, file);
      try {
        const data = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
        fs.unlinkSync(filePath);
        if (data.type === 'message' && data.text) {
          messages.push(data.text);
        }
      } catch (err) {
        log(`Failed to process input file ${file}: ${err instanceof Error ? err.message : String(err)}`);
        try { fs.unlinkSync(filePath); } catch { /* ignore */ }
      }
    }
    return messages;
  } catch (err) {
    log(`IPC drain error: ${err instanceof Error ? err.message : String(err)}`);
    return [];
  }
}

/**
 * Wait for a new IPC message or _close sentinel.
 * Returns the messages as a single string, or null if _close.
 */
function waitForIpcMessage(): Promise<string | null> {
  return new Promise((resolve) => {
    const poll = () => {
      if (shouldClose()) {
        resolve(null);
        return;
      }
      const messages = drainIpcInput();
      if (messages.length > 0) {
        resolve(messages.join('\n'));
        return;
      }
      setTimeout(poll, IPC_POLL_MS);
    };
    poll();
  });
}

/**
 * Build system message config for the session.
 * Loads global AGENTS.md content for non-main groups.
 */
function buildSystemMessage(containerInput: ContainerInput): { mode: 'append'; content?: string } | undefined {
  const globalAgentsPath = '/workspace/global/AGENTS.md';
  if (!containerInput.isMain && fs.existsSync(globalAgentsPath)) {
    const content = fs.readFileSync(globalAgentsPath, 'utf-8');
    return { mode: 'append', content };
  }
  return undefined;
}

/**
 * Build the MCP server configuration for the nanopielot tools.
 */
function buildMcpServers(mcpServerPath: string, containerInput: ContainerInput): Record<string, MCPLocalServerConfig> {
  return {
    nanopielot: {
      command: 'node',
      args: [mcpServerPath],
      env: {
        NANOPIELOT_CHAT_JID: containerInput.chatJid,
        NANOPIELOT_GROUP_FOLDER: containerInput.groupFolder,
        NANOPIELOT_IS_MAIN: containerInput.isMain ? '1' : '0',
      },
      tools: ['*'],
    },
  };
}

/**
 * Build the list of allowed tools.
 */
function buildAvailableTools(): string[] {
  return [
    'Bash',
    'Read', 'Write', 'Edit', 'Glob', 'Grep',
    'WebSearch', 'WebFetch',
    'Task', 'TaskOutput', 'TaskStop',
    'Agent',
    'TodoWrite', 'ToolSearch', 'Skill',
    'NotebookEdit',
    'mcp__nanopielot__*',
  ];
}

/**
 * Run a single query via Copilot SDK session.
 * Creates or resumes a session, sends the prompt, and collects the response.
 * Also polls IPC for follow-up messages during the query.
 */
async function runQuery(
  client: CopilotClient,
  prompt: string,
  sessionId: string | undefined,
  mcpServerPath: string,
  containerInput: ContainerInput,
): Promise<{ newSessionId?: string; closedDuringQuery: boolean }> {

  const mcpServers = buildMcpServers(mcpServerPath, containerInput);
  const systemMessage = buildSystemMessage(containerInput);
  const availableTools = buildAvailableTools();

  let session: CopilotSession;

  const baseConfig = {
    onPermissionRequest: (...args: Parameters<typeof approveAll>) => {
      log(`[permission] Tool permission requested: ${JSON.stringify(args[0]).slice(0, 300)}`);
      return approveAll(...args);
    },
    workingDirectory: '/workspace/group',
    mcpServers,
    availableTools,
    systemMessage,
    ...(containerInput.model ? { model: containerInput.model } : {}),
  };

  if (sessionId) {
    log(`Resuming session: ${sessionId}`);
    session = await client.resumeSession(sessionId, baseConfig as ResumeSessionConfig);
  } else {
    log('Creating new session');
    session = await client.createSession(baseConfig as SessionConfig);
  }

  const newSessionId = session.sessionId;
  log(`Session ID: ${newSessionId}`);

  // Set up IPC polling during the query
  let ipcPolling = true;
  let closedDuringQuery = false;

  const pollIpcDuringQuery = () => {
    if (!ipcPolling) return;
    if (shouldClose()) {
      log('Close sentinel detected during query');
      closedDuringQuery = true;
      ipcPolling = false;
      session.abort().catch(err => {
        log(`Abort error: ${err instanceof Error ? err.message : String(err)}`);
      });
      return;
    }
    const messages = drainIpcInput();
    for (const text of messages) {
      log(`Piping IPC message into active session (${text.length} chars)`);
      session.send({ prompt: text }).catch(err => {
        log(`IPC send error: ${err instanceof Error ? err.message : String(err)}`);
      });
    }
    setTimeout(pollIpcDuringQuery, IPC_POLL_MS);
  };
  setTimeout(pollIpcDuringQuery, IPC_POLL_MS);

  // Subscribe to events for logging
  session.on((event) => {
    if (event.type === 'assistant.message_delta') return; // too noisy

    // Verbose logging for key diagnostic events
    if (event.type === 'session.tools_updated') {
      const data = (event as unknown as { data?: { tools?: Array<{ name: string }> } }).data;
      const tools = data?.tools;
      if (tools) {
        log(`[event] ${event.type} — ${tools.length} tools: ${tools.map(t => t.name).join(', ')}`);
      } else {
        log(`[event] ${event.type} — data: ${JSON.stringify(data ?? {}).slice(0, 500)}`);
      }
    } else if (event.type === 'session.info' || event.type === 'session.mcp_server_status_changed') {
      log(`[event] ${event.type} — ${JSON.stringify((event as unknown as { data?: unknown }).data ?? {}).slice(0, 300)}`);
    } else if (event.type.includes('tool')) {
      log(`[event] ${event.type} — ${JSON.stringify((event as unknown as { data?: unknown }).data ?? {}).slice(0, 500)}`);
    } else {
      log(`[event] ${event.type}`);
    }
  });

  // Send prompt and wait for response
  try {
    const response = await session.sendAndWait({ prompt }, SEND_TIMEOUT_MS);
    ipcPolling = false;

    const resultText = response?.data?.content || null;
    log(`Query done. Result: ${resultText ? resultText.slice(0, 200) : 'none'}`);
    // Log full response structure for debugging
    if (response?.data) {
      const keys = Object.keys(response.data);
      log(`Response keys: ${keys.join(', ')}`);
      const data = response.data as Record<string, unknown>;
      if (data.toolRequests) log(`Response toolRequests: ${JSON.stringify(data.toolRequests).slice(0, 500)}`);
    }
    writeOutput({
      status: 'success',
      result: resultText,
      newSessionId,
    });
  } catch (err) {
    ipcPolling = false;
    const errorMessage = err instanceof Error ? err.message : String(err);

    // If we closed during query, that's expected — not an error
    if (closedDuringQuery) {
      log('Query aborted due to close sentinel');
    } else {
      log(`Query error: ${errorMessage}`);
      writeOutput({
        status: 'error',
        result: null,
        newSessionId,
        error: errorMessage,
      });
    }
  }

  return { newSessionId, closedDuringQuery };
}

interface ScriptResult {
  wakeAgent: boolean;
  data?: unknown;
}

const SCRIPT_TIMEOUT_MS = 30_000;

async function runScript(script: string): Promise<ScriptResult | null> {
  const scriptPath = '/tmp/task-script.sh';
  fs.writeFileSync(scriptPath, script, { mode: 0o755 });

  return new Promise((resolve) => {
    execFile('bash', [scriptPath], {
      timeout: SCRIPT_TIMEOUT_MS,
      maxBuffer: 1024 * 1024,
      env: process.env,
    }, (error, stdout, stderr) => {
      if (stderr) {
        log(`Script stderr: ${stderr.slice(0, 500)}`);
      }

      if (error) {
        log(`Script error: ${error.message}`);
        return resolve(null);
      }

      const lines = stdout.trim().split('\n');
      const lastLine = lines[lines.length - 1];
      if (!lastLine) {
        log('Script produced no output');
        return resolve(null);
      }

      try {
        const result = JSON.parse(lastLine);
        if (typeof result.wakeAgent !== 'boolean') {
          log(`Script output missing wakeAgent boolean: ${lastLine.slice(0, 200)}`);
          return resolve(null);
        }
        resolve(result as ScriptResult);
      } catch {
        log(`Script output is not valid JSON: ${lastLine.slice(0, 200)}`);
        resolve(null);
      }
    });
  });
}

async function main(): Promise<void> {
  let containerInput: ContainerInput;

  try {
    const stdinData = await readStdin();
    containerInput = JSON.parse(stdinData);
    try { fs.unlinkSync('/tmp/input.json'); } catch { /* may not exist */ }
    log(`Received input for group: ${containerInput.groupFolder}`);
  } catch (err) {
    writeOutput({
      status: 'error',
      result: null,
      error: `Failed to parse input: ${err instanceof Error ? err.message : String(err)}`
    });
    process.exit(1);
  }

  const __dirname = path.dirname(fileURLToPath(import.meta.url));
  const mcpServerPath = path.join(__dirname, 'ipc-mcp-stdio.js');

  let sessionId = containerInput.sessionId;
  fs.mkdirSync(IPC_INPUT_DIR, { recursive: true });

  // Clean up stale _close sentinel from previous container runs
  try { fs.unlinkSync(IPC_INPUT_CLOSE_SENTINEL); } catch { /* ignore */ }

  // Build initial prompt (drain any pending IPC messages too)
  let prompt = containerInput.prompt;
  if (containerInput.isScheduledTask) {
    prompt = `[SCHEDULED TASK - The following message was sent automatically and is not coming directly from the user or group.]\n\n${prompt}`;
  }
  const pending = drainIpcInput();
  if (pending.length > 0) {
    log(`Draining ${pending.length} pending IPC messages into initial prompt`);
    prompt += '\n' + pending.join('\n');
  }

  // Script phase: run script before waking agent
  if (containerInput.script && containerInput.isScheduledTask) {
    log('Running task script...');
    const scriptResult = await runScript(containerInput.script);

    if (!scriptResult || !scriptResult.wakeAgent) {
      const reason = scriptResult ? 'wakeAgent=false' : 'script error/no output';
      log(`Script decided not to wake agent: ${reason}`);
      writeOutput({
        status: 'success',
        result: null,
      });
      return;
    }

    log(`Script wakeAgent=true, enriching prompt with data`);
    prompt = `[SCHEDULED TASK]\n\nScript output:\n${JSON.stringify(scriptResult.data, null, 2)}\n\nInstructions:\n${containerInput.prompt}`;
  }

  // Create the Copilot client. NanoPieLot's setup flow seeds /home/node/.copilot
  // via `copilot login`, and the SDK reuses that stored signed-in user state.
  // cwd must point to the group workspace so the CLI discovers AGENTS.md
  // and project-level settings from the working directory.
  const client = new CopilotClient({
    logLevel: 'warning',
    cwd: '/workspace/group',
  });

  try {
    // Query loop: run query → wait for IPC message → run new query → repeat
    while (true) {
      log(`Starting query (session: ${sessionId || 'new'})...`);

      const queryResult = await runQuery(client, prompt, sessionId, mcpServerPath, containerInput);
      if (queryResult.newSessionId) {
        sessionId = queryResult.newSessionId;
      }

      // If _close was consumed during the query, exit immediately.
      if (queryResult.closedDuringQuery) {
        log('Close sentinel consumed during query, exiting');
        break;
      }

      // Emit session update so host can track it
      writeOutput({ status: 'success', result: null, newSessionId: sessionId });

      log('Query ended, waiting for next IPC message...');

      // Wait for the next message or _close sentinel
      const nextMessage = await waitForIpcMessage();
      if (nextMessage === null) {
        log('Close sentinel received, exiting');
        break;
      }

      log(`Got new message (${nextMessage.length} chars), starting new query`);
      prompt = nextMessage;
    }
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err);
    log(`Agent error: ${errorMessage}`);
    writeOutput({
      status: 'error',
      result: null,
      newSessionId: sessionId,
      error: errorMessage
    });
  } finally {
    log('Stopping Copilot client...');
    try {
      await client.stop();
    } catch (err) {
      log(`Client stop error: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
}

main();
