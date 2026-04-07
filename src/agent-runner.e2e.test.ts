import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import path from 'path';
import { pathToFileURL } from 'url';

const sdkMocks = vi.hoisted(() => {
  type PermissionHandler = (request: unknown) => Promise<unknown>;
  type SessionBehaviorArgs = {
    config: Record<string, unknown>;
    session: FakeSession;
    prompt: string;
    timeout: number;
  };

  const state = {
    approveAllMock: vi.fn<PermissionHandler>(async (request) => ({
      status: 'approved',
      request,
    })),
    clientOptions: [] as Array<Record<string, unknown>>,
    createdConfigs: [] as Array<Record<string, unknown>>,
    resumedConfigs: [] as Array<{
      sessionId: string;
      config: Record<string, unknown>;
    }>,
    metadataLookups: [] as string[],
    sessionMetadataById: new Map<string, { id: string } | undefined>(),
    stopMock: vi.fn(async () => {}),
    sessionBehavior: undefined as
      | ((args: SessionBehaviorArgs) => Promise<void> | void)
      | undefined,
  };

  class FakeSession {
    sessionId: string;
    private handlers: Array<(event: { type: string; data?: unknown }) => void> =
      [];

    constructor(
      readonly config: Record<string, unknown>,
      sessionId: string,
    ) {
      this.sessionId = sessionId;
    }

    on(handler: (event: { type: string; data?: unknown }) => void): void {
      this.handlers.push(handler);
    }

    emit(event: { type: string; data?: unknown }): void {
      for (const handler of this.handlers) {
        handler(event);
      }
    }

    async sendAndWait(
      { prompt }: { prompt: string },
      timeout: number,
    ): Promise<{ data: { content: string } }> {
      await state.sessionBehavior?.({
        config: this.config,
        session: this,
        prompt,
        timeout,
      });
      return { data: { content: 'Tool-backed response' } };
    }

    async send(): Promise<void> {}

    async abort(): Promise<void> {}
  }

  class FakeCopilotClient {
    constructor(options: Record<string, unknown>) {
      state.clientOptions.push(options);
    }

    async createSession(config: Record<string, unknown>): Promise<FakeSession> {
      state.createdConfigs.push(config);
      return new FakeSession(config, 'new-session-id');
    }

    async resumeSession(
      sessionId: string,
      config: Record<string, unknown>,
    ): Promise<FakeSession> {
      state.resumedConfigs.push({ sessionId, config });
      return new FakeSession(config, sessionId);
    }

    async getSessionMetadata(
      sessionId: string,
    ): Promise<{ id: string } | undefined> {
      state.metadataLookups.push(sessionId);
      return state.sessionMetadataById.get(sessionId);
    }

    async stop(): Promise<void> {
      await state.stopMock();
    }
  }

  return {
    FakeCopilotClient,
    reset(): void {
      state.approveAllMock.mockClear();
      state.clientOptions.length = 0;
      state.createdConfigs.length = 0;
      state.resumedConfigs.length = 0;
      state.metadataLookups.length = 0;
      state.sessionMetadataById.clear();
      state.stopMock.mockClear();
      state.sessionBehavior = undefined;
    },
    setSessionMetadata(
      sessionId: string,
      metadata: { id: string } | undefined,
    ): void {
      state.sessionMetadataById.set(sessionId, metadata);
    },
    setSessionBehavior(
      behavior: (args: SessionBehaviorArgs) => Promise<void> | void,
    ): void {
      state.sessionBehavior = behavior;
    },
    state,
  };
});

vi.mock('@github/copilot-sdk', () => ({
  CopilotClient: sdkMocks.FakeCopilotClient,
  approveAll: sdkMocks.state.approveAllMock,
}));

async function loadAgentRunnerModule() {
  return import(
    pathToFileURL(
      path.resolve(process.cwd(), 'container/agent-runner/src/index.ts'),
    ).href
  );
}

const testContainerInput = {
  prompt: 'Find the latest tech news',
  groupFolder: 'telegram_main',
  chatJid: 'tg:123',
  isMain: true,
};

describe('agent-runner tool availability', () => {
  const consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
  const consoleErrorSpy = vi
    .spyOn(console, 'error')
    .mockImplementation(() => {});
  const setTimeoutSpy = vi
    .spyOn(global, 'setTimeout')
    .mockImplementation(() => 0 as unknown as ReturnType<typeof setTimeout>);

  beforeEach(() => {
    vi.resetModules();
    sdkMocks.reset();
    consoleLogSpy.mockClear();
    consoleErrorSpy.mockClear();
    setTimeoutSpy.mockClear();
    sdkMocks.setSessionBehavior(
      async ({ config, session, prompt, timeout }) => {
        expect(prompt).toBe(testContainerInput.prompt);
        expect(timeout).toBe(10 * 60 * 1000);

        if (Object.prototype.hasOwnProperty.call(config, 'availableTools')) {
          session.emit({
            type: 'session.info',
            data: {
              infoType: 'configuration',
              message: 'Disabled tools: bash, edit, glob',
            },
          });
        } else {
          session.emit({
            type: 'session.tools_updated',
            data: {
              tools: [{ name: 'bash' }, { name: 'web_search' }],
            },
          });
        }

        const permissionHandler = config.onPermissionRequest as
          | ((request: unknown) => Promise<unknown>)
          | undefined;
        await permissionHandler?.({
          kind: 'shell',
          toolCallId: 'tool-1',
          fullCommandText: 'echo hello',
        });

        session.emit({
          type: 'tool.execution_start',
          data: { toolName: 'bash' },
        });
        session.emit({ type: 'session.idle' });
      },
    );
  });

  afterEach(() => {
    consoleLogSpy.mockClear();
    consoleErrorSpy.mockClear();
    setTimeoutSpy.mockClear();
  });

  it('creates Copilot clients with the workspace cwd', async () => {
    const { createCopilotClient } = await loadAgentRunnerModule();
    createCopilotClient();

    expect(sdkMocks.state.clientOptions).toEqual([
      {
        logLevel: 'warning',
        cwd: '/workspace/group',
      },
    ]);
  });

  it('creates sessions without a restrictive availableTools allowlist', async () => {
    const { createCopilotClient, runQuery } = await loadAgentRunnerModule();
    const client = createCopilotClient();

    const result = await runQuery(
      client,
      testContainerInput.prompt,
      undefined,
      '/tmp/ipc-mcp-stdio.js',
      testContainerInput,
    );

    expect(result).toEqual({
      newSessionId: 'new-session-id',
      closedDuringQuery: false,
    });
    expect(sdkMocks.state.createdConfigs).toHaveLength(1);

    const config = sdkMocks.state.createdConfigs[0];
    expect(config).not.toHaveProperty('availableTools');
    expect(config.workingDirectory).toBe('/workspace/group');
    expect(config.mcpServers).toMatchObject({
      nanopielot: {
        command: 'node',
        args: ['/tmp/ipc-mcp-stdio.js'],
        env: {
          NANOPIELOT_CHAT_JID: 'tg:123',
          NANOPIELOT_GROUP_FOLDER: 'telegram_main',
          NANOPIELOT_IS_MAIN: '1',
        },
        tools: ['*'],
      },
    });

    const errorOutput = consoleErrorSpy.mock.calls.flat().join('\n');
    expect(errorOutput).toContain(
      '[agent-runner] [event] session.tools_updated',
    );
    expect(errorOutput).not.toContain('Disabled tools');
  });

  it('parses disabled and unknown tool configuration warnings', async () => {
    const { parseToolConfigurationWarning } = await loadAgentRunnerModule();

    expect(
      parseToolConfigurationWarning('Disabled tools: bash, edit, glob'),
    ).toEqual({
      disabledTools: ['bash', 'edit', 'glob'],
    });
    expect(
      parseToolConfigurationWarning(
        'Unknown tool name in the tool allowlist: Bash, Read',
      ),
    ).toEqual({
      unknownTools: ['Bash', 'Read'],
    });
    expect(
      parseToolConfigurationWarning('Configuration loaded successfully'),
    ).toBeNull();
  });

  it('builds SDK compatibility warnings for unpinned or mismatched versions', async () => {
    const { buildCopilotSdkCompatibilityWarning } = await loadAgentRunnerModule();

    expect(
      buildCopilotSdkCompatibilityWarning('0.2.1', '0.2.1'),
    ).toBeUndefined();
    expect(
      buildCopilotSdkCompatibilityWarning('^0.2.1', '0.2.1'),
    ).toContain('not pinned to an exact version');
    expect(
      buildCopilotSdkCompatibilityWarning('0.2.1', '0.2.2'),
    ).toContain('does not match pinned version 0.2.1');
    expect(
      buildCopilotSdkCompatibilityWarning(undefined, '0.2.1'),
    ).toContain('Could not verify pinned');
  });

  it('logs clear warnings for disabled tools and unknown allowlist names', async () => {
    const { createCopilotClient, runQuery } = await loadAgentRunnerModule();
    const client = createCopilotClient();
    sdkMocks.setSessionBehavior(async ({ session }) => {
      session.emit({
        type: 'session.info',
        data: {
          infoType: 'configuration',
          message: 'Disabled tools: bash, edit, glob',
        },
      });
      session.emit({
        type: 'session.info',
        data: {
          infoType: 'configuration',
          message: 'Unknown tool name in the tool allowlist: Bash, Read',
        },
      });
      session.emit({
        type: 'session.info',
        data: {
          infoType: 'configuration',
          message: 'Disabled tools: bash, edit, glob',
        },
      });
      session.emit({ type: 'session.idle' });
    });

    await runQuery(
      client,
      testContainerInput.prompt,
      undefined,
      '/tmp/ipc-mcp-stdio.js',
      testContainerInput,
    );

    const errorOutput = consoleErrorSpy.mock.calls.flat().join('\n');
    expect(errorOutput).toContain(
      '[agent-runner] WARNING: Tool configuration issue detected. Check availableTools and MCP tool registration.',
    );
    expect(errorOutput).toContain('[agent-runner] Disabled tools: bash, edit, glob');
    expect(errorOutput).toContain('[agent-runner] Unknown tool names: Bash, Read');
    expect(
      consoleErrorSpy.mock.calls.filter((call) =>
        call.join('\n').includes('Disabled tools: bash, edit, glob'),
      ),
    ).toHaveLength(1);
  });

  it('wires approveAll into tool-backed queries', async () => {
    const { createCopilotClient, runQuery } = await loadAgentRunnerModule();
    const client = createCopilotClient();

    await runQuery(
      client,
      testContainerInput.prompt,
      undefined,
      '/tmp/ipc-mcp-stdio.js',
      testContainerInput,
    );

    expect(sdkMocks.state.approveAllMock).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: 'shell',
        toolCallId: 'tool-1',
        fullCommandText: 'echo hello',
      }),
    );
  });

  it('resumes persisted sessions with the same safe config', async () => {
    const { createCopilotClient, runQuery } = await loadAgentRunnerModule();
    const client = createCopilotClient();
    sdkMocks.setSessionMetadata('persisted-session-id', {
      id: 'persisted-session-id',
    });

    await runQuery(
      client,
      testContainerInput.prompt,
      'persisted-session-id',
      '/tmp/ipc-mcp-stdio.js',
      testContainerInput,
    );

    expect(sdkMocks.state.createdConfigs).toHaveLength(0);
    expect(sdkMocks.state.metadataLookups).toEqual(['persisted-session-id']);
    expect(sdkMocks.state.resumedConfigs).toEqual([
      {
        sessionId: 'persisted-session-id',
        config: expect.objectContaining({
          workingDirectory: '/workspace/group',
          mcpServers: expect.any(Object),
        }),
      },
    ]);
  });

  it('creates a new session when persisted metadata is missing', async () => {
    const { createCopilotClient, runQuery } = await loadAgentRunnerModule();
    const client = createCopilotClient();
    sdkMocks.setSessionMetadata('stale-session-id', undefined);

    const result = await runQuery(
      client,
      testContainerInput.prompt,
      'stale-session-id',
      '/tmp/ipc-mcp-stdio.js',
      testContainerInput,
    );

    expect(result).toEqual({
      newSessionId: 'new-session-id',
      closedDuringQuery: false,
    });
    expect(sdkMocks.state.metadataLookups).toEqual(['stale-session-id']);
    expect(sdkMocks.state.resumedConfigs).toHaveLength(0);
    expect(sdkMocks.state.createdConfigs).toHaveLength(1);
    expect(consoleErrorSpy.mock.calls.flat().join('\n')).toContain(
      '[agent-runner] Session not found, creating new session: stale-session-id',
    );
  });
});
