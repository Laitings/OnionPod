import { randomBytes } from 'node:crypto';
import { SyncStore } from './sync-store.mjs';

if (!process.env.DATA_DIR || process.argv.slice(2).some(value => value !== '--rotate')) {
  console.error('Set DATA_DIR, then run node sync-admin.mjs [--rotate].');
  process.exit(1);
}
process.umask(0o077);
const store = new SyncStore(process.env.DATA_DIR);
try {
  const password = randomBytes(24).toString('base64url');
  await store.setPassword(password, process.argv.includes('--rotate'));
  console.log('Save this OnionPod sync password in your password manager. It is shown once:');
  console.log(password);
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
} finally {
  store.close();
}
