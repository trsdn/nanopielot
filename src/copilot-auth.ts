import fs from 'fs';

import { COPILOT_AUTH_DIR, COPILOT_GITHUB_TOKEN } from './config.js';

const COPILOT_CONFIG_FILE = 'config.json';

/** Returns true if a token-based auth is configured via COPILOT_GITHUB_TOKEN. */
export function hasCopilotToken(): boolean {
  return COPILOT_GITHUB_TOKEN.length > 0;
}

export function ensureCopilotAuthDir(authDir = COPILOT_AUTH_DIR): string {
  fs.mkdirSync(authDir, { recursive: true });
  return authDir;
}

/** Returns true if device-login auth files exist in the auth directory. */
export function hasDeviceAuth(authDir = COPILOT_AUTH_DIR): boolean {
  if (!fs.existsSync(authDir)) return false;

  const configFile = `${authDir}/${COPILOT_CONFIG_FILE}`;
  try {
    if (fs.existsSync(configFile) && fs.statSync(configFile).size > 0) {
      return true;
    }
  } catch {
    return false;
  }

  try {
    return fs.readdirSync(authDir).some((entry) => entry !== '.DS_Store');
  } catch {
    return false;
  }
}

/** Returns true if any Copilot auth is available (token or device login). */
export function hasCopilotAuth(authDir = COPILOT_AUTH_DIR): boolean {
  return hasCopilotToken() || hasDeviceAuth(authDir);
}
