import fs from 'fs/promises';
import path from 'path';
import { ensureAuthenticated, ensureAuthenticatedNonInteractive } from './setup.js';
import { handleGatewayCommand, isGatewayReady } from './gateway.js';

export type OnboardOptions = {
  skipGateway?: boolean;
  skipHealth?: boolean;
  nonInteractive?: boolean;
};

export async function runOnboarding(options: OnboardOptions = {}): Promise<void> {
  console.log('\n🐰 Hare onboarding (QuickStart)\n');

  await warnIfGlobalMismatch();

  if (options.nonInteractive) {
    await ensureAuthenticatedNonInteractive();
  } else {
    await ensureAuthenticated(true);
  }

  if (!options.skipGateway) {
    if (process.platform === 'linux') {
      await handleGatewayCommand(['install']);
    } else {
      console.log('Gateway service install is only supported on Linux right now.');
      console.log('You can run the gateway in dev mode with `npm run gateway:dev`.');
    }
  }

  if (!options.skipHealth) {
    const ready = await waitForGatewayReady();
    if (ready) {
      await handleGatewayCommand(['status']);
    } else {
      console.log('Gateway is still starting. Run `hare gateway status` in a few seconds.');
      if (process.platform === 'linux') {
        console.log(
          'If it fails repeatedly, run: systemctl --user status hare-gateway.service --no-pager'
        );
      }
    }
  }

  console.log('\nNext steps:');
  console.log('- Run a prompt: hare "hello"');
  console.log('- Check status: hare gateway status');
}

async function warnIfGlobalMismatch(): Promise<void> {
  const repoRoot = await findRepoRoot(process.cwd());
  if (!repoRoot) return;

  const cliPath = path.resolve(process.argv[1]);
  if (cliPath.startsWith(repoRoot)) return;

  console.log('Note: You are running the global hare binary from inside the repo.');
  console.log('For dev, prefer: npx tsx src/cli/index.ts onboard');
}

async function findRepoRoot(startDir: string): Promise<string | null> {
  let current = path.resolve(startDir);
  while (true) {
    const candidate = path.join(current, 'package.json');
    try {
      const raw = await fs.readFile(candidate, 'utf8');
      const parsed = JSON.parse(raw) as { name?: string };
      if (parsed.name === 'hare.io') return current;
    } catch {
      // ignore
    }
    const parent = path.dirname(current);
    if (parent === current) break;
    current = parent;
  }
  return null;
}

async function waitForGatewayReady(): Promise<boolean> {
  const attempts = 5;
  const delaysMs = [500, 1000, 1500, 2000, 2500];
  for (let i = 0; i < attempts; i++) {
    if (await isGatewayReady()) return true;
    await new Promise((resolve) => setTimeout(resolve, delaysMs[i] || 2000));
  }
  return false;
}
