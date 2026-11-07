/**
 * Verifies every key stored in Settings against the real provider API.
 * Run it on a machine with normal internet access:
 *
 *   npm run check:keys
 */
import { initStore } from '../server/store.js';
import { testProvider } from '../server/ai.js';
import { mediaReadiness, testMediaProvider } from '../server/media/providers.js';

const db = initStore();
const providers = db.settings.providers.filter((p) => p.apiKey.trim().length > 8);
const readiness = mediaReadiness(db.settings);

if (!providers.length) {
  console.log('No provider keys saved yet. Add them in Settings → AI providers.');
  process.exit(1);
}

let failures = 0;
for (const provider of providers) {
  const result = await testProvider({ ...provider, enabled: true });
  const mark = result.ok ? 'OK  ' : 'FAIL';
  if (!result.ok) failures++;
  console.log(`${mark} ${provider.label.padEnd(16)} ${provider.model.padEnd(28)} ${result.latencyMs}ms  ${result.message}`);
}

console.log('');
console.log(`Media · image: ${readiness.image.resolved} · narration: ${readiness.tts.resolved ?? 'none'}`);
if (readiness.image.gemini || readiness.image.openai) {
  for (const kind of ['image', 'tts'] as const) {
    const provider = kind === 'image' ? (readiness.image.gemini ? 'gemini' : 'openai') : readiness.tts.resolved;
    if (!provider || provider === 'pollinations' || provider === 'local') continue;
    const result = await testMediaProvider(db.settings, kind, provider);
    if (!result.ok) failures++;
    console.log(`${result.ok ? 'OK  ' : 'FAIL'} media/${kind.padEnd(10)} ${provider.padEnd(12)} ${result.latencyMs}ms  ${result.message}`);
  }
}

console.log('');
console.log(failures === 0 ? 'All configured keys work.' : `${failures} check(s) failed — see the messages above.`);
process.exit(failures === 0 ? 0 : 1);
