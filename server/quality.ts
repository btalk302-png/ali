import type { Project, Quality, QualityCheck } from '../shared/types.js';
import { timecode, wordCount } from './util.js';

function paletteContrast(palette: [string, string, string] | string[] | undefined): number {
  if (!palette?.length) return 0;
  const lum = (hex: string) => {
    const clean = hex.replace('#', '');
    const [r, g, b] = [0, 2, 4].map((i) => parseInt(clean.slice(i, i + 2) || '00', 16) / 255);
    const channel = (c: number) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
    return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
  };
  const values = palette.map(lum).sort((a, b) => a - b);
  return (values[values.length - 1] + 0.05) / (values[0] + 0.05);
}

/** Automated checks against the artefacts themselves — no model call, no vibes. */
export function evaluateQuality(project: Project): Quality {
  const checks: QualityCheck[] = [];
  const add = (c: QualityCheck) => checks.push(c);
  const { research, script, seo, visuals } = project;

  add({
    id: 'research-evidence',
    label: 'Real research evidence attached',
    status: research && research.sources.length >= 3 ? 'pass' : research ? 'warn' : 'fail',
    detail: research
      ? `${research.sources.length} sources · ${research.videos.length} real videos · ${research.providers.join(', ') || 'no providers'}`
      : 'No research yet',
    fix: 'Run title research with a YouTube Data API key',
  });

  if (research) {
    add({
      id: 'title-evidence',
      label: 'Title chosen from researched options',
      status: research.selectedTitle ? 'pass' : 'warn',
      detail: research.selectedTitle ? `“${research.selectedTitle}”` : 'No title selected from the research list',
      fix: 'Pick a researched title in the Research tab',
    });
  }

  if (script) {
    const target = project.format === 'short' ? 60 : project.durationMin * 60;
    const drift = Math.abs(script.estimatedDurationSec - target) / target;
    add({
      id: 'runtime',
      label: 'Runtime matches the promise',
      status: drift < 0.12 ? 'pass' : 'warn',
      detail: `${timecode(script.estimatedDurationSec)} estimated vs ${timecode(target)} target (${Math.round(drift * 100)}% drift)`,
      fix: 'Trim or expand a beat',
    });
    add({
      id: 'hook',
      label: 'Hook lands inside 12 seconds',
      status: wordCount(script.hook) <= 30 ? 'pass' : 'warn',
      detail: `${wordCount(script.hook)} words in the opening line (~${Math.round((wordCount(script.hook) / script.wpm) * 60)}s)`,
      fix: 'Cut the first sentence and start on the tension',
    });
    const minimum = project.format === 'short' ? 3 : 6;
    const thin = script.beats.filter((b) => wordCount(b.narration) <= 12);
    add({
      id: 'beats',
      label: 'Beat structure is complete',
      status: script.beats.length >= minimum && thin.length === 0 ? 'pass' : 'warn',
      detail:
        thin.length > 0
          ? `${script.beats.length} beats · ${thin.length} too short to speak: ${thin.map((b) => `“${b.title}”`).join(', ')}`
          : `${script.beats.length} beats (minimum ${minimum}) · each with narration and b-roll direction`,
      fix: thin.length ? 'Expand the short beats in the Script tab, or regenerate the script' : 'Regenerate the script with more beats',
    });
    add({
      id: 'cta',
      label: 'Ends with a specific next step',
      status: script.cta && script.outro ? 'pass' : 'warn',
      detail: script.cta ? script.cta.slice(0, 120) : 'No call to action',
      fix: 'Add one concrete next video or checklist',
    });
  } else {
    add({ id: 'script', label: 'Script exists', status: 'fail', detail: 'No script generated yet', fix: 'Run the script stage' });
  }

  add({
    id: 'visuals',
    label: 'Shot list + thumbnails',
    status: visuals && visuals.scenes.length >= 3 && visuals.thumbnails.length >= 2 ? 'pass' : 'warn',
    detail: visuals ? `${visuals.scenes.length} scenes · ${visuals.thumbnails.length} thumbnail concepts` : 'No visual plan yet',
  });

  add({
    id: 'title-length',
    label: 'Title fits the browse shelf',
    status: !seo ? 'warn' : (seo.selectedTitle?.length ?? 0) <= 62 ? 'pass' : 'warn',
    detail: seo
      ? `${seo.selectedTitle.length} characters — ${seo.selectedTitle.length > 62 ? 'will truncate on mobile' : 'safe on desktop and mobile'}`
      : 'No title selected',
    fix: 'Pick a shorter variant in the SEO tab',
  });

  add({
    id: 'thumbnail-contrast',
    label: 'Thumbnail has enough contrast',
    status: visuals ? (paletteContrast(visuals.thumbnails[0]?.palette) > 4.5 ? 'pass' : 'warn') : 'warn',
    detail: visuals ? `${paletteContrast(visuals.thumbnails[0]?.palette).toFixed(1)}:1 luminance contrast across the palette` : 'No thumbnail palette',
    fix: 'Use a palette with a light and a dark anchor',
  });

  add({
    id: 'claims',
    label: 'Claims need a human fact pass',
    status: 'warn',
    detail: 'Model-written draft. Check every figure, name and date against the research sources before publishing.',
    fix: 'Open the Research tab and verify the cited sources',
  });

  add({
    id: 'production',
    label: 'Video rendered',
    status: project.production?.status === 'ready' ? 'pass' : 'warn',
    detail: project.production?.status === 'ready' ? `${timecode(project.production.durationSec ?? 0)} MP4 ready to download` : 'No MP4 yet — render it in the Production tab',
    fix: 'Generate visuals + narration, then render',
  });

  const blockers = checks.filter((c) => c.status === 'fail').map((c) => c.label);
  const score = Math.round(
    (checks.reduce((sum, c) => sum + (c.status === 'pass' ? 1 : c.status === 'warn' ? 0.5 : 0), 0) / Math.max(1, checks.length)) * 100,
  );
  return { score, checks, blockers, reviewedAt: new Date().toISOString() };
}
