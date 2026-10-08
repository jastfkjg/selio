import { defineConfig } from '@playwright/test';
export default defineConfig({ testDir: './smoke', fullyParallel: false, workers: 1, timeout: 60000, expect: { timeout: 12000 }, reporter: 'list', outputDir: 'test-results', use: { trace: 'retain-on-failure' } });
