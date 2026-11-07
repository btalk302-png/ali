/**
 * Verifies every key stored in Settings against the real provider API.
 * Run it on a machine with normal internet access:
 *
 *   npm run check:keys
 */
import { initStore } from '../server/store.js';
import { testProvider } from '../server/ai.js';
import { mediaReadiness, testMediaProvider } from '../server/media/providers.js';

/** Known key shapes — a mismatch explains most "it just fails" reports. */
const KEY_SHAPE: Record<string, { test: RegExp; hint: string }> = {
  openai: { test: /^sk-(proj-|svcacct-|admin-)?[A-Za-z0-9_-]{20,}$/, hint: 'OpenAI keys start with "sk-" (or "sk-proj-")' },
  openrouter: { test: /^sk-or-v1-[a-f0-9]{64}$/, hint: 'OpenRouter keys look like "sk-or-v1-" + 64 hex chars' },
  anthropic: { test: /^sk-ant-/, hint: 'Anthropic keys start with "sk-ant-"' },
  deepseek: { test: /^sk-[a-f0-9]{32}$/, hint: 'DeepSeek keys are "sk-" + 32 hex chars' },
  gemini: { test: /^(AIza|AQ\.)/, hint: 'Google AI Studio keys start with "AIza" (or "AQ." for newer keys)' },
};

const db = initStore();
const providers = db.settings.providers.filter((p) => p.apiKey.trim().length > 8);
const readiness = mediaReadiness(db.settings);

if (!providers.length) {
  console.log('No provider keys saved yet. Add them in Settings → AI providers.');
  process.exit(1);
}

const blocked: string[] = [];
const badKeys: string[] = [];
let failures = 0;

for (const provider of providers) {
  const shape = KEY_SHAPE[provider.id];
  if (shape && !shape.test.test(provider.apiKey.trim())) {
    badKeys.push(`${provider.label}: ${shape.hint}`);
    console.log(`WARN ${provider.label.padEnd(16)} ${provider.model.padEnd(28)} key shape looks wrong — ${shape.hint}`);
  }
  const result = await testProvider({ ...provider, enabled: true });
  if (!result.ok) {
    failures++;
    if (/ECONNRESET|ENOTFOUND|ETIMEDOUT|EAI_AGAIN|could not reach/i.test(result.message)) blocked.push(provider.label);
    else badKeys.push(`${provider.label}: ${result.message}`);
  }
  console.log(`${result.ok ? 'OK  ' : 'FAIL'} ${provider.label.padEnd(16)} ${provider.model.padEnd(28)} ${String(result.latencyMs).padStart(5)}ms  ${result.message}`);
}

console.log('');
console.log(`Media · image: ${readiness.image.resolved} · narration: ${readiness.tts.resolved ?? 'none'}`);
for (const kind of ['image', 'tts'] as const) {
  const provider = kind === 'image' ? (readiness.image.gemini ? 'gemini' : 'openai') : readiness.tts.resolved;
  if (!provider || provider === 'pollinations' || provider === 'local') continue;
  const result = await testMediaProvider(db.settings, kind, provider);
  if (!result.ok) failures++;
  console.log(`${result.ok ? 'OK  ' : 'FAIL'} media/${kind.padEnd(10)} ${provider.padEnd(12)} ${String(result.latencyMs).padStart(5)}ms  ${result.message}`);
}

console.log('');
if (failures === 0) {
  console.log('All configured keys work.');
  process.exit(0);
}

if (blocked.length) {
  console.log(`Network: this machine could not open a connection to ${blocked.join(', ')}.`);
  console.log('  The key itself is untested — the request never reached the provider. Try a different network/VPN,');
  console.log('  or switch the active provider in Settings to one that answered OK.');
}
if (badKeys.length) {
  console.log('Keys to fix:');
  for (const line of badKeys) console.log(`  - ${line}`);
}
console.log('');
console.log('The app runs on the first enabled provider that has a key — enable only the one that answered OK.');
process.exit(1);
