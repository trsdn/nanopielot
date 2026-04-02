import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { _initTestDatabase } from './db.js';
import {
  _resetSchedulerLoopForTests,
  runSchedulerIteration,
} from './task-scheduler.js';

describe('runtime test seams', () => {
  beforeEach(() => {
    _initTestDatabase();
    _resetSchedulerLoopForTests();
  });

  afterEach(() => {
    _resetSchedulerLoopForTests();
  });

  it('runs a scheduler iteration without starting the long-lived loop', async () => {
    const enqueueTask = vi.fn();

    await runSchedulerIteration({
      registeredGroups: () => ({}),
      getSessions: () => ({}),
      queue: { enqueueTask } as any,
      onProcess: () => {},
      sendMessage: async () => {},
    });

    expect(enqueueTask).not.toHaveBeenCalled();
  });
});
