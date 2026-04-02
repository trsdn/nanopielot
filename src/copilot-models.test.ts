import { beforeEach, describe, expect, it, vi } from 'vitest';

const listModelsMock = vi.fn();
const stopMock = vi.fn().mockResolvedValue([]);

vi.mock('@github/copilot-sdk', () => ({
  CopilotClient: class {
    listModels = listModelsMock;
    stop = stopMock;
  },
}));

import { listAvailableCopilotModels } from './copilot-models.js';

describe('listAvailableCopilotModels', () => {
  beforeEach(() => {
    listModelsMock.mockReset();
    stopMock.mockClear();
  });

  it('returns sorted enabled models', async () => {
    listModelsMock.mockResolvedValue([
      {
        id: 'gpt-5.4',
        name: 'GPT-5.4',
        policy: { state: 'enabled' },
      },
      {
        id: 'disabled-model',
        name: 'Disabled model',
        policy: { state: 'disabled' },
      },
      {
        id: 'claude-sonnet-4.6',
        name: 'Claude Sonnet 4.6',
        policy: { state: 'enabled' },
      },
    ]);

    await expect(listAvailableCopilotModels()).resolves.toEqual([
      { id: 'claude-sonnet-4.6', name: 'Claude Sonnet 4.6' },
      { id: 'gpt-5.4', name: 'GPT-5.4' },
    ]);
    expect(stopMock).toHaveBeenCalled();
  });
});
