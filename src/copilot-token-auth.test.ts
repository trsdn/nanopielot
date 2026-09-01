/**
 * Tests for token-based Copilot authentication (COPILOT_GITHUB_TOKEN) as an
 * alternative to the interactive device-login flow.
 *
 * Both auth modes are compiled into the same module graph via top-level
 * constants, so each test re-imports the modules under a fresh config mock.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { EventEmitter } from 'events';
import { PassThrough } from 'stream';

const TEST_TOKEN = 'ghp_testtokenvalue1234567890';
const AUTH_DIR = '/tmp/nanopielot-test-copilot-auth';
const DATA_DIR = '/tmp/nanopielot-test-data';
const TOKEN_ENV_FILE = `${DATA_DIR}/copilot-token.env`;

function createFakeProcess() {
  const proc = new EventEmitter() as EventEmitter & {
    stdin: PassThrough;
    stdout: PassThrough;
    stderr: PassThrough;
    kill: ReturnType<typeof vi.fn>;
    pid: number;
  };
  proc.stdin = new PassThrough();
  proc.stdout = new PassThrough();
  proc.stderr = new PassThrough();
  proc.kill = vi.fn();
  proc.pid = 12345;
  return proc;
}

/**
 * Register the module mocks shared by every case and import container-runner
 * with COPILOT_GITHUB_TOKEN set to `token`.
 */
async function loadRunner(token: string) {
  vi.resetModules();

  vi.doMock('./config.js', () => ({
    CONTAINER_IMAGE: 'nanopielot-agent:latest',
    CONTAINER_MAX_OUTPUT_SIZE: 10485760,
    CONTAINER_TIMEOUT: 1800000,
    COPILOT_AUTH_DIR: AUTH_DIR,
    COPILOT_GITHUB_TOKEN: token,
    DATA_DIR,
    GROUPS_DIR: '/tmp/nanopielot-test-groups',
    IDLE_TIMEOUT: 1800000,
    TIMEZONE: 'America/Los_Angeles',
  }));

  vi.doMock('./logger.js', () => ({
    logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
  }));

  const fsMock = {
    existsSync: vi.fn(() => false),
    mkdirSync: vi.fn(),
    writeFileSync: vi.fn(),
    chmodSync: vi.fn(),
    rmSync: vi.fn(),
    readFileSync: vi.fn(() => ''),
    readdirSync: vi.fn(() => []),
    statSync: vi.fn(() => ({ isDirectory: () => false })),
    copyFileSync: vi.fn(),
  };
  vi.doMock('fs', async () => {
    const actual = await vi.importActual<typeof import('fs')>('fs');
    return { ...actual, ...fsMock, default: { ...actual, ...fsMock } };
  });

  vi.doMock('./mount-security.js', () => ({
    validateAdditionalMounts: vi.fn(() => []),
  }));

  vi.doMock('./container-runtime.js', () => ({
    CONTAINER_RUNTIME_BIN: 'docker',
    CONTAINER_HOST_GATEWAY: 'host.docker.internal',
    hostGatewayArgs: () => [],
    readonlyMountArgs: (h: string, c: string) => ['-v', `${h}:${c}:ro`],
    stopContainer: vi.fn(),
  }));

  const fakeProc = createFakeProcess();
  const spawn = vi.fn(
    (_bin: string, _args: string[], _opts?: unknown) => fakeProc,
  );
  vi.doMock('child_process', async () => {
    const actual =
      await vi.importActual<typeof import('child_process')>('child_process');
    return {
      ...actual,
      spawn,
      exec: vi.fn(
        (_cmd: string, _opts: unknown, cb?: (err: Error | null) => void) => {
          if (cb) cb(null);
          return new EventEmitter();
        },
      ),
    };
  });

  const { runContainerAgent } = await import('./container-runner.js');
  return { runContainerAgent, spawn, fakeProc, fsMock };
}

/** Spawn one container and return the argv docker was invoked with. */
async function captureSpawnArgs(token: string) {
  const ctx = await loadRunner(token);
  const promise = ctx.runContainerAgent(
    {
      name: 'Test Group',
      folder: 'test-group',
      trigger: '@Andy',
      added_at: new Date().toISOString(),
    },
    {
      prompt: 'Hello',
      groupFolder: 'test-group',
      chatJid: 'test@g.us',
      isMain: false,
    },
    () => {},
  );

  ctx.fakeProc.emit('close', 0);
  await promise;

  return { args: ctx.spawn.mock.calls[0]![1], fsMock: ctx.fsMock };
}

describe('copilot-auth token detection', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it('reports token auth when COPILOT_GITHUB_TOKEN is set', async () => {
    vi.doMock('./config.js', () => ({
      COPILOT_AUTH_DIR: AUTH_DIR,
      COPILOT_GITHUB_TOKEN: TEST_TOKEN,
    }));
    const auth = await import('./copilot-auth.js');

    expect(auth.hasCopilotToken()).toBe(true);
    // Token auth stands on its own — no device-login files required.
    expect(auth.hasCopilotAuth()).toBe(true);
  });

  it('reports no token auth when COPILOT_GITHUB_TOKEN is empty', async () => {
    vi.doMock('./config.js', () => ({
      COPILOT_AUTH_DIR: AUTH_DIR,
      COPILOT_GITHUB_TOKEN: '',
    }));
    vi.doMock('fs', async () => {
      const actual = await vi.importActual<typeof import('fs')>('fs');
      const stub = { existsSync: vi.fn(() => false) };
      return { ...actual, ...stub, default: { ...actual, ...stub } };
    });
    const auth = await import('./copilot-auth.js');

    expect(auth.hasCopilotToken()).toBe(false);
    expect(auth.hasDeviceAuth()).toBe(false);
    expect(auth.hasCopilotAuth()).toBe(false);
  });
});

describe('container-runner token auth', () => {
  it('never passes the token as a CLI argument', async () => {
    const { args } = await captureSpawnArgs(TEST_TOKEN);

    expect(args.join(' ')).not.toContain(TEST_TOKEN);
    expect(args).toContain('--env-file');
    expect(args[args.indexOf('--env-file') + 1]).toBe(TOKEN_ENV_FILE);
  });

  it('writes the token env-file with owner-only permissions', async () => {
    const { fsMock } = await captureSpawnArgs(TEST_TOKEN);

    expect(fsMock.writeFileSync).toHaveBeenCalledWith(
      TOKEN_ENV_FILE,
      `COPILOT_GITHUB_TOKEN=${TEST_TOKEN}\n`,
      { mode: 0o600 },
    );
    // writeFileSync's mode is ignored for pre-existing files, so the runner
    // must chmod explicitly or a stale world-readable file would leak.
    expect(fsMock.chmodSync).toHaveBeenCalledWith(TOKEN_ENV_FILE, 0o600);
  });

  it('skips the copilot-auth mount when a token is configured', async () => {
    const { args } = await captureSpawnArgs(TEST_TOKEN);

    expect(args.join(' ')).not.toContain('/home/node/.copilot');
  });

  it('mounts copilot-auth and writes no env-file without a token', async () => {
    const { args, fsMock } = await captureSpawnArgs('');

    expect(args).toContain('-v');
    expect(args.join(' ')).toContain(`${AUTH_DIR}:/home/node/.copilot`);
    expect(args).not.toContain('--env-file');
    expect(fsMock.writeFileSync).not.toHaveBeenCalledWith(
      TOKEN_ENV_FILE,
      expect.anything(),
      expect.anything(),
    );
  });

  it('removes a stale token env-file when switching back to device auth', async () => {
    const { fsMock } = await captureSpawnArgs('');

    expect(fsMock.rmSync).toHaveBeenCalledWith(TOKEN_ENV_FILE, { force: true });
  });
});
