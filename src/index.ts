import { loadConfig, ConfigLoadError } from './config/index.js';
import { createLogger } from './logger/index.js';
import { App } from './app.js';

async function main(): Promise<void> {
  let config;
  try {
    config = loadConfig();
  } catch (error) {
    if (error instanceof ConfigLoadError) {
      console.error(`Configuration error: ${error.message}`);
      process.exit(1);
    }
    throw error;
  }

  const logger = createLogger(config.logging);
  const app = new App(config, logger);

  const shutdown = async (signal: string): Promise<void> => {
    logger.info(`Received ${signal}, shutting down...`);
    try {
      await app.stop();
      logger.close();
      process.exit(0);
    } catch (error) {
      logger.error('Error during shutdown', {
        error: error instanceof Error ? error.message : String(error),
      });
      process.exit(1);
    }
  };

  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('SIGTERM', () => void shutdown('SIGTERM'));

  try {
    await app.start();
  } catch (error) {
    logger.error('Failed to start application', {
      error: error instanceof Error ? error.message : String(error),
    });
    logger.close();
    process.exit(1);
  }
}

main().catch((error) => {
  console.error('Unhandled error:', error);
  process.exit(1);
});
