import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    // Disable file parallelism to avoid test directory conflicts
    fileParallelism: false,
  },
});
