import { spawnSync } from 'child_process';

import { ensureCopilotAuthDir, hasCopilotToken, hasDeviceAuth } from '../src/copilot-auth.js';
import { CONTAINER_IMAGE } from '../src/config.js';
import { logger } from '../src/logger.js';
import { commandExists } from './platform.js';
import { emitStatus } from './status.js';

interface Args {
  runtime: string;
  login: boolean;
}

function parseArgs(args: string[]): Args {
  let runtime = '';
  let login = false;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--runtime' && args[i + 1]) {
      runtime = args[i + 1];
      i++;
      continue;
    }
    if (args[i] === '--login') {
      login = true;
    }
  }

  return { runtime, login };
}

function emit(
  runtime: string,
  authDir: string,
  loggedIn: boolean,
  status: 'success' | 'failed',
  extra: Record<string, string | boolean | number> = {},
): void {
  emitStatus('COPILOT_AUTH', {
    RUNTIME: runtime,
    AUTH_DIR: authDir,
    LOGGED_IN: loggedIn,
    STATUS: status,
    ...extra,
    LOG: 'logs/setup.log',
  });
}

export async function run(args: string[]): Promise<void> {
  const { runtime, login } = parseArgs(args);

  // Token-based auth: if COPILOT_GITHUB_TOKEN is set, skip device login entirely
  if (hasCopilotToken()) {
    const authDir = ensureCopilotAuthDir();
    logger.info('COPILOT_GITHUB_TOKEN is set, skipping device login');
    emit(runtime || 'any', authDir, true, 'success', {
      ACTION: 'token',
      AUTH_METHOD: 'token',
    });
    return;
  }

  if (!runtime || !['docker', 'apple-container'].includes(runtime)) {
    emit('unknown', ensureCopilotAuthDir(), false, 'failed', {
      ERROR: 'missing_or_invalid_runtime',
    });
    process.exit(2);
  }

  const runtimeBin = runtime === 'apple-container' ? 'container' : 'docker';
  if (!commandExists(runtimeBin)) {
    emit(runtime, ensureCopilotAuthDir(), false, 'failed', {
      ERROR: 'runtime_not_available',
    });
    process.exit(2);
  }

  const authDir = ensureCopilotAuthDir();
  if (!login) {
    const loggedIn = hasDeviceAuth(authDir);
    emit(runtime, authDir, loggedIn, loggedIn ? 'success' : 'failed', {
      ACTION: 'check',
      AUTH_METHOD: 'device',
    });
    if (!loggedIn) process.exit(1);
    return;
  }

  logger.info({ runtime, authDir }, 'Starting Copilot device login');
  const result = spawnSync(
    runtimeBin,
    [
      'run',
      '--rm',
      '-i',
      '-v',
      `${authDir}:/home/node/.copilot`,
      '-e',
      'HOME=/home/node',
      '--entrypoint',
      'copilot',
      CONTAINER_IMAGE,
      'login',
    ],
    { stdio: 'inherit' },
  );

  const loggedIn = hasDeviceAuth(authDir);
  emit(runtime, authDir, loggedIn, loggedIn ? 'success' : 'failed', {
    ACTION: 'login',
    AUTH_METHOD: 'device',
    EXIT_CODE: result.status ?? 1,
  });

  if (!loggedIn) process.exit(result.status ?? 1);
}
