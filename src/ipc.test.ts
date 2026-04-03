import fs from 'fs';
import path from 'path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('./config.js', () => ({
  DATA_DIR: '/tmp/nanopielot-ipc-test',
  IPC_POLL_INTERVAL: 1000,
  TIMEZONE: 'UTC',
}));

vi.mock('./logger.js', () => ({
  logger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

vi.mock('./db.js', () => ({
  createTask: vi.fn(),
  deleteTask: vi.fn(),
  getTaskById: vi.fn(() => undefined),
  updateTask: vi.fn(),
}));

import {
  _resetIpcWatcherForTests,
  processIpcOnce,
  type IpcDeps,
} from './ipc.js';

describe('ipc watcher integration', () => {
  beforeEach(() => {
    const tempRoot = '/tmp/nanopielot-ipc-test';
    fs.rmSync(tempRoot, { recursive: true, force: true });
    fs.mkdirSync(path.join(tempRoot, 'ipc'), { recursive: true });
    _resetIpcWatcherForTests();
  });

  afterEach(() => {
    _resetIpcWatcherForTests();
  });

  it('processes authorized IPC messages and removes the file', async () => {
    const tempRoot = '/tmp/nanopielot-ipc-test';
    const sent: Array<{ jid: string; text: string }> = [];
    const messagesDir = path.join(tempRoot, 'ipc', 'main', 'messages');
    fs.mkdirSync(messagesDir, { recursive: true });
    const file = path.join(messagesDir, 'msg.json');
    fs.writeFileSync(
      file,
      JSON.stringify({
        type: 'message',
        chatJid: 'jid-main',
        text: 'hello from ipc',
      }),
    );

    const deps: IpcDeps = {
      sendMessage: async (jid, text) => {
        sent.push({ jid, text });
      },
      registeredGroups: () => ({
        'jid-main': {
          name: 'Main',
          folder: 'main',
          trigger: '@Andy',
          added_at: new Date().toISOString(),
          isMain: true,
        },
      }),
      registerGroup: () => {},
      syncGroups: async () => {},
      getAvailableGroups: () => [],
      writeGroupsSnapshot: () => {},
      onTasksChanged: () => {},
    };

    await processIpcOnce(deps);

    expect(sent).toEqual([{ jid: 'jid-main', text: 'hello from ipc' }]);
    expect(fs.existsSync(file)).toBe(false);
  });

  it('blocks unauthorized IPC messages from non-main groups', async () => {
    const tempRoot = '/tmp/nanopielot-ipc-test';
    const sent: Array<{ jid: string; text: string }> = [];
    const messagesDir = path.join(tempRoot, 'ipc', 'group-a', 'messages');
    fs.mkdirSync(messagesDir, { recursive: true });
    fs.writeFileSync(
      path.join(messagesDir, 'msg.json'),
      JSON.stringify({
        type: 'message',
        chatJid: 'jid-b',
        text: 'forbidden',
      }),
    );

    const deps: IpcDeps = {
      sendMessage: async (jid, text) => {
        sent.push({ jid, text });
      },
      registeredGroups: () => ({
        'jid-a': {
          name: 'A',
          folder: 'group-a',
          trigger: '@Andy',
          added_at: new Date().toISOString(),
        },
        'jid-b': {
          name: 'B',
          folder: 'group-b',
          trigger: '@Andy',
          added_at: new Date().toISOString(),
        },
      }),
      registerGroup: () => {},
      syncGroups: async () => {},
      getAvailableGroups: () => [],
      writeGroupsSnapshot: () => {},
      onTasksChanged: () => {},
    };

    await processIpcOnce(deps);

    expect(sent).toEqual([]);
  });
});
