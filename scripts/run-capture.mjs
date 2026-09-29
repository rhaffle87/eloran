import { spawnSync } from 'child_process';

const result = spawnSync('npx', ['playwright', 'test', 'e2e/capture-*.spec.js'], {
  stdio: 'inherit',
  shell: true,
  env: {
    ...process.env,
    RUN_CAPTURE: 'true',
  },
});

process.exit(result.status ?? 0);
