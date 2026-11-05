// Used by playwright.config.js as both globalSetup and globalTeardown.
import { execSync } from 'node:child_process';

export default function globalCleanup() {
  execSync('node ../e2e/cleanup.mjs', { cwd: 'server', stdio: ['ignore', 'ignore', 'inherit'] });
}
