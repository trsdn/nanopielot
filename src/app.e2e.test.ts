import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  registerChannel,
  _resetChannelRegistryForTests,
} from './channels/registry.js';
import {
  _getMessagesForChat,
  _initTestDatabase,
  getGroupModel,
  createTask,
  getAllSessions,
  setSession,
  setRegisteredGroup,
  storeChatMetadata,
  storeMessageDirect,
} from './db.js';
import {
  _resetAppStateForTests,
  runMessageLoopIteration,
  startNanoPieLotApp,
} from './index.js';
import type { Channel, RegisteredGroup } from './types.js';

const sentMessages: Array<{ jid: string; text: string }> = [];
const runContainerAgentMock = vi.fn();
const listAvailableCopilotModelsMock = vi.fn();

vi.mock('./container-runtime.js', () => ({
  cleanupOrphans: vi.fn(),
  ensureContainerRuntimeRunning: vi.fn(),
}));

vi.mock('./copilot-models.js', () => ({
  listAvailableCopilotModels: () => listAvailableCopilotModelsMock(),
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
    listAvailableCopilotModelsMock.mockReset();
    listAvailableCopilotModelsMock.mockResolvedValue([
      { id: 'claude-sonnet-4.5', name: 'Claude Sonnet 4.5' },
      { id: 'claude-sonnet-4.6', name: 'Claude Sonnet 4.6' },
      { id: 'gpt-5.4', name: 'GPT-5.4' },
      { id: 'gpt-5.4-mini', name: 'GPT-5.4 mini' },
    ]);
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

    const app = await startNanoPieLotApp({
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

    const firstApp = await startNanoPieLotApp({
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

    const secondApp = await startNanoPieLotApp({
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

    const app = await startNanoPieLotApp({
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

    const app = await startNanoPieLotApp({
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

  it('lets the owner inspect and change the model per group', async () => {
    const app = await startNanoPieLotApp({
      registerSignalHandlers: false,
      initializeDatabase: false,
      startBackgroundLoops: false,
    });

    await app.receiveMessage('fake:main', {
      id: 'm1',
      chat_jid: 'fake:main',
      sender: 'me',
      sender_name: 'Owner',
      content: '/model',
      timestamp: new Date('2026-04-02T10:00:00.000Z').toISOString(),
      is_from_me: true,
    });

    await app.receiveMessage('fake:main', {
      id: 'm2',
      chat_jid: 'fake:main',
      sender: 'me',
      sender_name: 'Owner',
      content: '/model gpt-5.4',
      timestamp: new Date('2026-04-02T10:01:00.000Z').toISOString(),
      is_from_me: true,
    });
    await app.shutdown('model-command');

    expect(getGroupModel('main')).toBe('gpt-5.4');
    expect(sentMessages).toContainEqual({
      jid: 'fake:main',
      text: 'Current model for Main: default',
    });
    expect(sentMessages).toContainEqual({
      jid: 'fake:main',
      text: 'Model for Main set to gpt-5.4. A fresh Copilot session will be used on the next run.',
    });
    expect(runContainerAgentMock).not.toHaveBeenCalled();
  });

  it('rejects /model from non-owner in non-main group', async () => {
    registerSecondaryGroup();
    const app = await startNanoPieLotApp({
      registerSignalHandlers: false,
      initializeDatabase: false,
      startBackgroundLoops: false,
    });

    await app.receiveMessage('fake:team', {
      id: 'm1',
      chat_jid: 'fake:team',
      sender: 'user-1',
      sender_name: 'User One',
      content: '/model gpt-5.4',
      timestamp: new Date('2026-04-02T10:00:00.000Z').toISOString(),
      is_from_me: false,
    });
    await app.shutdown('model-command-non-owner');

    expect(getGroupModel('team')).toBeUndefined();
    expect(sentMessages).toContainEqual({
      jid: 'fake:team',
      text: 'Only the bot owner can change or inspect the model.',
    });
    expect(runContainerAgentMock).not.toHaveBeenCalled();
  });

  it('lists the live Copilot models for the signed-in account', async () => {
    const app = await startNanoPieLotApp({
      registerSignalHandlers: false,
      initializeDatabase: false,
      startBackgroundLoops: false,
    });

    await app.receiveMessage('fake:main', {
      id: 'm1',
      chat_jid: 'fake:main',
      sender: 'me',
      sender_name: 'Owner',
      content: '/model list',
      timestamp: new Date('2026-04-02T10:00:00.000Z').toISOString(),
      is_from_me: true,
    });
    await app.shutdown('model-list');

    expect(sentMessages).toContainEqual({
      jid: 'fake:main',
      text:
        'Available Copilot models for this account:\n' +
        'claude-sonnet-4.5 - Claude Sonnet 4.5\n' +
        'claude-sonnet-4.6 - Claude Sonnet 4.6\n' +
        'gpt-5.4 - GPT-5.4\n' +
        'gpt-5.4-mini - GPT-5.4 mini',
    });
  });

  it('clears the persisted session when changing the model', async () => {
    const app = await startNanoPieLotApp({
      registerSignalHandlers: false,
      initializeDatabase: false,
      startBackgroundLoops: false,
    });
    setSession('main', 'existing-session');

    await app.receiveMessage('fake:main', {
      id: 'm1',
      chat_jid: 'fake:main',
      sender: 'me',
      sender_name: 'Owner',
      content: '/model claude-sonnet-4.5',
      timestamp: new Date('2026-04-02T10:00:00.000Z').toISOString(),
      is_from_me: true,
    });
    await app.shutdown('model-session-reset');

    expect(getAllSessions()).toEqual({});
    expect(getGroupModel('main')).toBe('claude-sonnet-4.5');
  });
});
