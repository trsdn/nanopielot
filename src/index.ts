import './channels/index.js';

import { startNanoPieLotApp } from './app.js';
export {
  _resetAppStateForTests,
  _setRegisteredGroups,
  getAvailableGroups,
  runMessageLoopIteration,
  startNanoPieLotApp,
  type MessageLoopHandle,
  type NanoPieLotAppHandle,
  type StartNanoPieLotOptions,
} from './app.js';
export { escapeXml, formatMessages } from './router.js';
import { logger } from './logger.js';

async function main(): Promise<void> {
  await startNanoPieLotApp();
}

const isDirectRun =
  process.argv[1] &&
  new URL(import.meta.url).pathname ===
    new URL(`file://${process.argv[1]}`).pathname;

if (isDirectRun) {
  main().catch((err) => {
    logger.error({ err }, 'Failed to start NanoPieLot');
    process.exit(1);
  });
}
