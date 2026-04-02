import fs from 'fs';

import { COPILOT_AUTH_DIR } from './config.js';

const COPILOT_CONFIG_FILE = 'config.json';

export function ensureCopilotAuthDir(authDir = COPILOT_AUTH_DIR): string {
  fs.mkdirSync(authDir, { recursive: true });
  return authDir;
}

export function hasCopilotAuth(authDir = COPILOT_AUTH_DIR): boolean {
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
