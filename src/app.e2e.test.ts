import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  registerChannel,
  _resetChannelRegistryForTests,
} from './channels/registry.js';
import {
  _getMessagesForChat,
  _initTestDatabase,
  createTask,
  getAllSessions,
  setRegisteredGroup,
  storeChatMetadata,
  storeMessageDirect,
} from './db.js';
import {
  _resetAppStateForTests,
  runMessageLoopIteration,
  startNanoClawApp,
} from './index.js';
import type { Channel, RegisteredGroup } from './types.js';

const sentMessages: Array<{ jid: string; text: string }> = [];
const runContainerAgentMock = vi.fn();

vi.mock('./container-runtime.js', () => ({
  cleanupOrphans: vi.fn(),
  ensureContainerRuntimeRunning: vi.fn(),
}));

vi.mock('./container-runner.js', async () => {
  const actual = await vi.importActual<typeof import('./container-runner.js')>(
    './container-runner.js',
  );
  return {
    ...actual,
    runContainerAgent: (...args: Parameters<typeof actual.runContainerAgent>) =>
      runContainerAgentMock(...args),
    writeGroupsSnapshot: vi.fn(),
    writeTasksSnapshot: vi.fn(),
  };
});

class FakeChannel implements Channel {
  name = 'fake';

  async connect(): Promise<void> {}

  async sendMessage(jid: string, text: string): Promise<void> {
    sentMessages.push({ jid, text });
  }

  isConnected(): boolean {
    return true;
  }

  ownsJid(jid: string): boolean {
    return jid.startsWith('fake:');
  }

  async disconnect(): Promise<void> {}
}

function registerFakeChannel(): void {
  registerChannel('fake', () => new FakeChannel());
}

function registerMainGroup(): RegisteredGroup {
  const group: RegisteredGroup = {
    name: 'Main',
    folder: 'main',
    trigger: '@Andy',
    added_at: new Date().toISOString(),
    isMain: true,
    requiresTrigger: false,
  };
  setRegisteredGroup('fake:main', group);
  storeChatMetadata(
    'fake:main',
    new Date('2026-04-02T00:00:00.000Z').toISOString(),
    'Main',
    'fake',
    false,
  );
  return group;
}

function registerSecondaryGroup(): RegisteredGroup {
  const group: RegisteredGroup = {
    name: 'Team',
    folder: 'team',
    trigger: '@Andy',
    added_at: new Date().toISOString(),
    requiresTrigger: true,
  };
  setRegisteredGroup('fake:team', group);
  storeChatMetadata(
    'fake:team',
    new Date('2026-04-02T00:00:00.000Z').toISOString(),
    'Team',
    'fake',
    true,
  );
  return group;
}

describe('app e2e flow', () => {
  beforeEach(() => {
    sentMessages.length = 0;
    runContainerAgentMock.mockReset();
    _initTestDatabase();
    _resetAppStateForTests();
    _resetChannelRegistryForTests();
    registerFakeChannel();
    registerMainGroup();
  });

  afterEach(() => {
    _resetAppStateForTests();
    _resetChannelRegistryForTests();
  });

  it('routes an inbound message through the host app and persists the session', async () => {
    runContainerAgentMock.mockImplementation(
      async (
        _group: RegisteredGroup,
        _input: { prompt: string },
        _onProcess: unknown,
        onOutput?: (output: {
          status: 'success' | 'error';
          result: string | null;
          newSessionId?: string;
        }) => Promise<void>,
      ) => {
        await onOutput?.({
          status: 'success',
          result: 'Agent reply',
          newSessionId: 'session-123',
        });
        return {
          status: 'success',
          result: 'Agent reply',
          newSessionId: 'session-123',
        };
      },
    );

    const app = await startNanoClawApp({
      registerSignalHandlers: false,
      initializeDatabase: false,
      startBackgroundLoops: false,
    });

    storeMessageDirect({
      id: 'm1',
      chat_jid: 'fake:main',
      sender: 'user-1',
      sender_name: 'User One',
      content: 'hello there',
      timestamp: new Date('2026-04-02T10:00:00.000Z').toISOString(),
      is_from_me: false,
    });

    await runMessageLoopIteration();
    await app.shutdown('test');

    expect(sentMessages).toContainEqual({
      jid: 'fake:main',
      text: 'Agent reply',
    });
    expect(getAllSessions()).toEqual({ main: 'session-123' });
    expect(_getMessagesForChat('fake:main').map((m) => m.content)).toContain(
      'hello there',
    );
  });

  it('reuses a persisted session after app restart', async () => {
    runContainerAgentMock
      .mockImplementationOnce(
        async (
          _group: RegisteredGroup,
          _input: { prompt: string },
          _onProcess: unknown,
          onOutput?: (output: {
            status: 'success' | 'error';
            result: string | null;
            newSessionId?: string;
          }) => Promise<void>,
        ) => {
          await onOutput?.({
            status: 'success',
            result: 'First reply',
            newSessionId: 'session-abc',
          });
          return {
            status: 'success',
            result: 'First reply',
            newSessionId: 'session-abc',
          };
        },
      )
      .mockImplementationOnce(
        async (
          _group: RegisteredGroup,
          input: { sessionId?: string },
          _onProcess: unknown,
          onOutput?: (output: {
            status: 'success' | 'error';
            result: string | null;
            newSessionId?: string;
          }) => Promise<void>,
        ) => {
          expect(input.sessionId).toBe('session-abc');
          await onOutput?.({
            status: 'success',
            result: 'Second reply',
            newSessionId: 'session-abc',
          });
          return {
            status: 'success',
            result: 'Second reply',
            newSessionId: 'session-abc',
          };
        },
      );

    const firstApp = await startNanoClawApp({
      registerSignalHandlers: false,
      initializeDatabase: false,
      startBackgroundLoops: false,
    });
    storeMessageDirect({
      id: 'm1',
      chat_jid: 'fake:main',
      sender: 'user-1',
      sender_name: 'User One',
      content: 'first run',
      timestamp: new Date('2026-04-02T10:00:00.000Z').toISOString(),
      is_from_me: false,
    });
    await runMessageLoopIteration();
    await firstApp.shutdown('restart-1');

    _resetAppStateForTests();
    _resetChannelRegistryForTests();
    registerFakeChannel();

    const secondApp = await startNanoClawApp({
      registerSignalHandlers: false,
      initializeDatabase: false,
      startBackgroundLoops: false,
    });
    storeMessageDirect({
      id: 'm2',
      chat_jid: 'fake:main',
      sender: 'user-1',
      sender_name: 'User One',
      content: 'second run',
      timestamp: new Date('2026-04-02T10:05:00.000Z').toISOString(),
      is_from_me: false,
    });
    await runMessageLoopIteration();
    await secondApp.shutdown('restart-2');

    expect(getAllSessions()).toEqual({ main: 'session-abc' });
    expect(sentMessages).toEqual([
      { jid: 'fake:main', text: 'First reply' },
      { jid: 'fake:main', text: 'Second reply' },
    ]);
  });

  it('gates non-main groups on trigger and then includes accumulated context', async () => {
    registerSecondaryGroup();

    runContainerAgentMock.mockImplementation(
      async (
        _group: RegisteredGroup,
        input: { prompt: string },
        _onProcess: unknown,
        onOutput?: (output: {
          status: 'success' | 'error';
          result: string | null;
          newSessionId?: string;
        }) => Promise<void>,
      ) => {
        expect(input.prompt).toContain('first context message');
        expect(input.prompt).toContain('@Andy now respond');
        await onOutput?.({
          status: 'success',
          result: 'Triggered reply',
          newSessionId: 'session-team',
        });
        return {
          status: 'success',
          result: 'Triggered reply',
          newSessionId: 'session-team',
        };
      },
    );

    const app = await startNanoClawApp({
      registerSignalHandlers: false,
      initializeDatabase: false,
      startBackgroundLoops: false,
    });

    storeMessageDirect({
      id: 'm1',
      chat_jid: 'fake:team',
      sender: 'user-1',
      sender_name: 'User One',
      content: 'first context message',
      timestamp: new Date('2026-04-02T10:00:00.000Z').toISOString(),
      is_from_me: false,
    });
    await app.runMessageLoopOnce();
    expect(sentMessages).toEqual([]);

    storeMessageDirect({
      id: 'm2',
      chat_jid: 'fake:team',
      sender: 'user-1',
      sender_name: 'User One',
      content: '@Andy now respond',
      timestamp: new Date('2026-04-02T10:01:00.000Z').toISOString(),
      is_from_me: false,
    });
    await app.runMessageLoopOnce();
    await app.shutdown('trigger-test');

    expect(sentMessages).toContainEqual({
      jid: 'fake:team',
      text: 'Triggered reply',
    });
    expect(getAllSessions()).toMatchObject({ team: 'session-team' });
  });

  it('runs a scheduled task through the app and sends the task result', async () => {
    runContainerAgentMock.mockImplementation(
      async (
        _group: RegisteredGroup,
        input: { isScheduledTask?: boolean; prompt: string },
        _onProcess: unknown,
        onOutput?: (output: {
          status: 'success' | 'error';
          result: string | null;
          newSessionId?: string;
        }) => Promise<void>,
      ) => {
        expect(input.isScheduledTask).toBe(true);
        expect(input.prompt).toBe('run scheduled check');
        await onOutput?.({
          status: 'success',
          result: 'Scheduled result',
          newSessionId: 'session-task',
        });
        return {
          status: 'success',
          result: 'Scheduled result',
          newSessionId: 'session-task',
        };
      },
    );

    createTask({
      id: 'task-1',
      group_folder: 'main',
      chat_jid: 'fake:main',
      prompt: 'run scheduled check',
      schedule_type: 'once',
      schedule_value: new Date('2026-04-02T09:00:00.000Z').toISOString(),
      context_mode: 'group',
      next_run: new Date('2026-04-02T09:00:00.000Z').toISOString(),
      status: 'active',
      created_at: new Date('2026-04-02T08:59:00.000Z').toISOString(),
    });

    const app = await startNanoClawApp({
      registerSignalHandlers: false,
      initializeDatabase: false,
      startBackgroundLoops: false,
    });

    await app.runSchedulerOnce();
    await app.shutdown('scheduler-test');

    expect(sentMessages).toContainEqual({
      jid: 'fake:main',
      text: 'Scheduled result',
    });
  });
});
