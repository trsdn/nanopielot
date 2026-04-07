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
import { createRequire } from 'module';
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

interface ToolConfigurationWarning {
  disabledTools?: string[];
  unknownTools?: string[];
}

interface CopilotSdkVersionInfo {
  expectedVersion?: string;
  actualVersion?: string;
}

function parseToolList(value: string): string[] {
  return value
    .split(',')
    .map(item => item.trim())
    .filter(Boolean);
}

export function parseToolConfigurationWarning(
  message: string,
): ToolConfigurationWarning | null {
  const disabledMatch = message.match(/^Disabled tools:\s*(.+)$/i);
  if (disabledMatch) {
    return { disabledTools: parseToolList(disabledMatch[1]) };
  }

  const unknownMatch = message.match(
    /^Unknown tool name(?: in the tool allowlist)?:\s*(.+)$/i,
  );
  if (unknownMatch) {
    return { unknownTools: parseToolList(unknownMatch[1]) };
  }

  if (message.includes('Unknown tool name')) {
    return { unknownTools: [] };
  }

  return null;
}

function logToolConfigurationWarning(message: string): void {
  const warning = parseToolConfigurationWarning(message);
  if (!warning) return;

  log('WARNING: Tool configuration issue detected. Check availableTools and MCP tool registration.');
  if (warning.disabledTools && warning.disabledTools.length > 0) {
    log(`Disabled tools: ${warning.disabledTools.join(', ')}`);
  }
  if (warning.unknownTools) {
    if (warning.unknownTools.length > 0) {
      log(`Unknown tool names: ${warning.unknownTools.join(', ')}`);
    } else {
      log(`Unknown tool names reported by SDK: ${message}`);
    }
  }
}

function isExactVersionPin(version: string): boolean {
  return /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/.test(
    version,
  );
}

export function buildCopilotSdkCompatibilityWarning(
  expectedVersion: string | undefined,
  actualVersion: string | undefined,
): string | undefined {
  if (!expectedVersion) {
    return 'WARNING: Could not verify pinned @github/copilot-sdk version from agent-runner/package.json.';
  }

  if (!isExactVersionPin(expectedVersion)) {
    return `WARNING: @github/copilot-sdk is not pinned to an exact version in agent-runner/package.json (${expectedVersion}).`;
  }

  if (!actualVersion) {
    return 'WARNING: Could not determine the loaded @github/copilot-sdk version at runtime.';
  }

  if (expectedVersion !== actualVersion) {
    return `WARNING: Loaded @github/copilot-sdk version ${actualVersion} does not match pinned version ${expectedVersion}. Review SDK compatibility before deploying upgrades.`;
  }

  return undefined;
}

function readCopilotSdkVersionInfo(): CopilotSdkVersionInfo {
  let expectedVersion: string | undefined;
  let actualVersion: string | undefined;

  try {
    const packageJsonPath = fileURLToPath(new URL('../package.json', import.meta.url));
    const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf-8')) as {
      dependencies?: Record<string, unknown>;
    };
    const configuredVersion = packageJson.dependencies?.['@github/copilot-sdk'];
    if (typeof configuredVersion === 'string') {
      expectedVersion = configuredVersion;
    }
  } catch {
    expectedVersion = undefined;
  }

  try {
    const require = createRequire(import.meta.url);
    const sdkPackageJsonPath = require.resolve('@github/copilot-sdk/package.json');
    const sdkPackageJson = JSON.parse(fs.readFileSync(sdkPackageJsonPath, 'utf-8')) as {
      version?: unknown;
    };
    if (typeof sdkPackageJson.version === 'string') {
      actualVersion = sdkPackageJson.version;
    }
  } catch {
    actualVersion = undefined;
  }

  return { expectedVersion, actualVersion };
}

export function logCopilotSdkCompatibilityWarning(
  versionInfo: CopilotSdkVersionInfo = readCopilotSdkVersionInfo(),
): void {
  const warning = buildCopilotSdkCompatibilityWarning(
    versionInfo.expectedVersion,
    versionInfo.actualVersion,
  );
  if (warning) {
    log(warning);
  }
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
 * Tool names must match the SDK's internal lowercase names, not PascalCase.
 * Returning undefined allows all discovered tools (built-in + MCP).
 */
export function buildAvailableTools(): undefined {
  // Let the SDK expose all available tools — both built-in and MCP.
  // The SDK uses lowercase names (bash, edit, glob, grep, web_search, etc.)
  // and hyphenated MCP tool names (nanopielot-send_message, etc.).
  return undefined;
}

/**
 * Run a single query via Copilot SDK session.
 * Creates or resumes a session, sends the prompt, and collects the response.
 * Also polls IPC for follow-up messages during the query.
 */
export async function runQuery(
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
    onPermissionRequest: approveAll,
    workingDirectory: '/workspace/group',
    mcpServers,
    ...(availableTools ? { availableTools } : {}),
    systemMessage,
    ...(containerInput.model ? { model: containerInput.model } : {}),
  };

  if (sessionId) {
    const sessionMetadata = await client.getSessionMetadata(sessionId);
    if (sessionMetadata) {
      log(`Resuming session: ${sessionId}`);
      session = await client.resumeSession(
        sessionId,
        baseConfig as ResumeSessionConfig,
      );
    } else {
      log(`Session not found, creating new session: ${sessionId}`);
      session = await client.createSession(baseConfig as SessionConfig);
    }
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
  const seenToolConfigWarnings = new Set<string>();
  session.on((event) => {
    if (event.type === 'assistant.message_delta') return; // too noisy
    if (event.type === 'session.info') {
      const data =
        event.data && typeof event.data === 'object'
          ? (event.data as Record<string, unknown>)
          : null;
      const infoType = data?.infoType;
      const message = data?.message;
      if (infoType === 'configuration' && typeof message === 'string') {
        const warning = parseToolConfigurationWarning(message);
        if (warning && !seenToolConfigWarnings.has(message)) {
          seenToolConfigWarnings.add(message);
          logToolConfigurationWarning(message);
        }
      }
    }
    log(`[event] ${event.type}`);
  });

  // Send prompt and wait for response
  try {
    const response = await session.sendAndWait({ prompt }, SEND_TIMEOUT_MS);
    ipcPolling = false;

    const resultText = response?.data?.content || null;
    log(`Query done. Result: ${resultText ? resultText.slice(0, 200) : 'none'}`);
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

export function createCopilotClient(): CopilotClient {
  return new CopilotClient({
    logLevel: 'warning',
    cwd: '/workspace/group',
  });
}

export async function runAgentRunner(): Promise<void> {
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
  logCopilotSdkCompatibilityWarning();
  const client = createCopilotClient();

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

const entrypointPath = process.argv[1]
  ? path.resolve(process.cwd(), process.argv[1])
  : undefined;
const modulePath = fileURLToPath(import.meta.url);

if (entrypointPath === modulePath) {
  void runAgentRunner();
}
