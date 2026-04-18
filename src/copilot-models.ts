import { CopilotClient } from '@github/copilot-sdk';

import { COPILOT_GITHUB_TOKEN } from './config.js';

export interface AvailableCopilotModel {
  id: string;
  name: string;
}

export async function listAvailableCopilotModels(): Promise<
  AvailableCopilotModel[]
> {
  const client = new CopilotClient({
    logLevel: 'warning',
    ...(COPILOT_GITHUB_TOKEN ? { githubToken: COPILOT_GITHUB_TOKEN } : {}),
  });

  try {
    const models = await client.listModels();
    return models
      .filter((model) => model.policy?.state !== 'disabled')
      .map((model) => ({
        id: model.id,
        name: model.name,
      }))
      .sort((a, b) => a.id.localeCompare(b.id));
  } finally {
    await client.stop().catch(() => {});
  }
}
