import type { ThumbnailConcept } from '../shared/types.js';

const esc = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const W = 1280;
const H = 720;
const FONT = "'Inter','Helvetica Neue',Arial,sans-serif";

function wrap(text: string, maxChars: number): string[] {
  const lines: string[] = [];
  for (const chunk of text.split('\n')) {
    const words = chunk.split(/\s+/).filter(Boolean);
    let line = '';
    for (const w of words) {
      if (!line) line = w;
      else if ((line + ' ' + w).length <= maxChars) line += ' ' + w;
      else {
        lines.push(line);
        line = w;
      }
    }
    if (line) lines.push(line);
  }
  return lines.slice(0, 3);
}

interface Geometry {
  lines: string[];
  fontSize: number;
  lineHeight: number;
  startY: number;
  lastBaseline: number;
  subY: number;
  blockTop: number;
}

function layout(headline: string, opts: { x: number; width: number; maxFont: number; top: number; bottom: number }): Geometry {
  const lines = wrap(headline, 13);
  const longest = Math.max(...lines.map((l) => l.length), 3);
  let fontSize = Math.min(opts.maxFont, Math.floor(opts.width / (longest * 0.575)));
  const subSpace = 44;
  const maxBlock = opts.bottom - opts.top - subSpace;
  let lineHeight = fontSize * 0.97;
  while (lines.length * lineHeight > maxBlock && fontSize > 46) {
    fontSize -= 4;
    lineHeight = fontSize * 0.97;
  }
  const startY = opts.top + fontSize * 0.82;
  const lastBaseline = startY + (lines.length - 1) * lineHeight;
  return {
    lines,
    fontSize,
    lineHeight,
    startY,
    lastBaseline,
    subY: Math.min(lastBaseline + Math.max(34, fontSize * 0.24), opts.bottom - 6),
    blockTop: startY - fontSize * 0.8,
  };
}

function textBlock(g: Geometry, x: number, fill: string, weight = 900, shadow = false) {
  return `<g${shadow ? ' filter="url(#tshadow)"' : ''}>${g.lines
    .map(
      (line, i) =>
        `<text x="${x}" y="${(g.startY + i * g.lineHeight).toFixed(1)}" font-family="${FONT}" font-size="${g.fontSize}" font-weight="${weight}" letter-spacing="${(-g.fontSize * 0.035).toFixed(1)}" fill="${fill}">${esc(line)}</text>`,
    )
    .join('')}</g>`;
}

function channelPill(x: number, y: number, channel: string, accent: string, dark: boolean) {
  const width = Math.min(420, 46 + channel.length * 15);
  return `<g>
    <rect x="${x}" y="${y}" width="${width}" height="40" rx="20" fill="${dark ? 'rgba(255,255,255,0.08)' : 'rgba(20,20,20,0.06)'}" stroke="${dark ? 'rgba(255,255,255,0.22)' : 'rgba(20,20,20,0.18)'}"/>
    <circle cx="${x + 22}" cy="${y + 20}" r="7" fill="${accent}"/>
    <text x="${x + 40}" y="${y + 26}" font-family="${FONT}" font-size="17" font-weight="600" letter-spacing="2" fill="${dark ? 'rgba(255,255,255,0.72)' : 'rgba(20,20,20,0.62)'}">${esc(channel.toUpperCase())}</text>
  </g>`;
}

function episodeLabel(x: number, y: number, label: string, color: string, anchor: 'start' | 'end' = 'start') {
  return `<text x="${x}" y="${y}" text-anchor="${anchor}" font-family="${FONT}" font-size="17" font-weight="600" letter-spacing="3.2" fill="${color}">${esc(label.toUpperCase())}</text>`;
}

function defs(bg: string, mid: string, accent: string) {
  return `<defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="${bg}"/><stop offset="100%" stop-color="${mid}"/>
    </linearGradient>
    <radialGradient id="glow" cx="50%" cy="50%" r="50%">
      <stop offset="0%" stop-color="${accent}" stop-opacity="0.9"/>
      <stop offset="55%" stop-color="${accent}" stop-opacity="0.22"/>
      <stop offset="100%" stop-color="${accent}" stop-opacity="0"/>
    </radialGradient>
    <linearGradient id="textGrad" x1="0" y1="0" x2="1" y2="0.5">
      <stop offset="0%" stop-color="#FFFFFF"/><stop offset="72%" stop-color="#FFFFFF"/><stop offset="100%" stop-color="${accent}"/>
    </linearGradient>
    <filter id="grain"><feTurbulence type="fractalNoise" baseFrequency="0.85" numOctaves="3" stitchTiles="stitch"/><feColorMatrix type="saturate" values="0"/></filter>
    <filter id="soft" x="-40%" y="-40%" width="180%" height="180%"><feGaussianBlur stdDeviation="52"/></filter>
    <filter id="tshadow" x="-20%" y="-20%" width="140%" height="140%"><feDropShadow dx="0" dy="6" stdDeviation="14" flood-color="rgba(0,0,0,0.45)"/></filter>
  </defs>`;
}

export function thumbnailSvg(t: ThumbnailConcept, opts: { channel: string; episode?: string }): string {
  const [bg, mid, accent] = t.palette;
  const episode = opts.episode ?? '01';
  const variant = t.variant;
  const head = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(t.headline.replace(/\n/g, ' '))}">`;
  const grain = `<rect width="${W}" height="${H}" filter="url(#grain)" opacity="0.06" style="mix-blend-mode:overlay"/>`;

  if (variant === 'glow') {
    const g = layout(t.headline, { x: 80, width: 960, maxFont: 134, top: 150, bottom: 600 });
    return `${head}${defs(bg, mid, accent)}
      <rect width="${W}" height="${H}" fill="${bg}"/>
      <circle cx="${W * 0.8}" cy="${H * 0.28}" r="300" fill="url(#glow)" filter="url(#soft)"/>
      <circle cx="${W * 0.15}" cy="${H * 0.9}" r="220" fill="url(#glow)" opacity="0.65" filter="url(#soft)"/>
      <g stroke="rgba(255,255,255,0.055)" stroke-width="1">${Array.from({ length: 8 }, (_, i) => `<line x1="0" y1="${100 + i * 90}" x2="${W}" y2="${100 + i * 90}"/>`).join('')}</g>
      <rect x="80" y="${Math.max(96, g.blockTop - 34)}" width="120" height="8" rx="4" fill="${accent}"/>
      ${textBlock(g, 80, 'url(#textGrad)')}
      <text x="84" y="${g.subY + 22}" font-family="${FONT}" font-size="27" font-weight="500" fill="rgba(255,255,255,0.66)">${esc(t.subline)}</text>
      ${channelPill(72, H - 116, opts.channel, accent, true)}
      ${episodeLabel(W - 72, H - 90, `Episode ${episode}`, 'rgba(255,255,255,0.55)', 'end')}
      ${grain}
    </svg>`;
  }

  if (variant === 'editorial') {
    const splitX = 452;
    const g = layout(t.headline, { x: splitX + 56, width: W - splitX - 130, maxFont: 128, top: 170, bottom: 585 });
    return `${head}${defs(bg, mid, accent)}
      <rect width="${W}" height="${H}" fill="${bg}"/>
      <rect x="0" y="0" width="${splitX}" height="${H}" fill="${accent}"/>
      <g opacity="0.13" stroke="${mid}" stroke-width="2">
        ${Array.from({ length: 26 }, (_, i) => `<line x1="${splitX + 20 + i * 40}" y1="0" x2="${splitX - 220 + i * 40}" y2="${H}"/>`).join('')}
      </g>
      <g opacity="0.5" stroke="${mid}" stroke-width="2">
        <line x1="${splitX + 56}" y1="128" x2="${W - 72}" y2="128"/>
        <line x1="${splitX + 56}" y1="${H - 150}" x2="${W - 72}" y2="${H - 150}"/>
      </g>
      <text x="${splitX + 56}" y="112" font-family="${FONT}" font-size="17" font-weight="700" letter-spacing="5" fill="rgba(20,20,20,0.55)">FIELD NOTES</text>
      <g transform="rotate(-90 120 ${H / 2})">
        <text x="120" y="${H / 2}" text-anchor="middle" font-family="${FONT}" font-size="18" font-weight="700" letter-spacing="5" fill="rgba(20,20,20,0.5)">${esc(t.composition.slice(0, 30).replace(/\s+\S*$/, '').toUpperCase())}</text>
      </g>
      ${textBlock(g, splitX + 56, mid, 800)}
      <text x="${splitX + 58}" y="${g.subY + 20}" font-family="${FONT}" font-size="25" font-weight="500" fill="rgba(20,20,20,0.6)">${esc(t.subline)}</text>
      <g>
        <rect x="${W - 300}" y="${H - 116}" width="${230}" height="40" rx="20" fill="rgba(20,20,20,0.06)" stroke="rgba(20,20,20,0.18)"/>
        <circle cx="${W - 278}" cy="${H - 96}" r="7" fill="${accent}"/>
        <text x="${W - 260}" y="${H - 90}" font-family="${FONT}" font-size="16" font-weight="600" letter-spacing="2" fill="rgba(20,20,20,0.62)">${esc(opts.channel.toUpperCase().slice(0, 18))}</text>
      </g>
      ${grain}
    </svg>`;
  }

  if (variant === 'minimal') {
    const g = layout(t.headline, { x: 104, width: W - 208, maxFont: 142, top: 210, bottom: 590 });
    return `${head}${defs(bg, mid, accent)}
      <rect width="${W}" height="${H}" fill="${bg}"/>
      <rect x="40" y="40" width="${W - 80}" height="${H - 80}" fill="none" stroke="${accent}" stroke-width="2" opacity="0.45"/>
      <circle cx="${W - 190}" cy="${H - 250}" r="132" fill="none" stroke="${accent}" stroke-width="2" opacity="0.35"/>
      <circle cx="${W - 190}" cy="${H - 250}" r="84" fill="none" stroke="${accent}" stroke-width="1.5" opacity="0.22"/>
      <rect x="80" y="88" width="176" height="34" fill="${accent}"/>
      <text x="96" y="112" font-family="${FONT}" font-size="15" font-weight="800" letter-spacing="3" fill="${bg}">EPISODE ${episode}</text>
      ${textBlock(g, 104, mid, 800)}
      <text x="106" y="${g.subY + 22}" font-family="${FONT}" font-size="24" font-weight="500" letter-spacing="0.6" fill="rgba(255,255,255,0.5)">${esc(t.subline)}</text>
      ${channelPill(80, H - 116, opts.channel, accent, true)}
      <line x1="80" y1="${H - 150}" x2="${W - 80}" y2="${H - 150}" stroke="rgba(255,255,255,0.1)"/>
      ${grain}
    </svg>`;
  }

  // bold — the flagship layout
  const g = layout(t.headline, { x: 72, width: 660, maxFont: 152, top: 128, bottom: 580 });
  return `${head}${defs(bg, mid, accent)}
      <rect width="${W}" height="${H}" fill="url(#bg)"/>
      <path d="M ${W} 0 L ${W} ${H} L ${W * 0.63} ${H} Z" fill="${accent}" opacity="0.95"/>
      <path d="M ${W * 0.72} 0 L ${W * 0.95} 0 L ${W * 0.52} ${H} L ${W * 0.29} ${H} Z" fill="${bg}" opacity="0.18"/>
      <circle cx="${W * 0.22}" cy="${H * 0.16}" r="240" fill="url(#glow)" opacity="0.5" filter="url(#soft)"/>
      <rect x="72" y="${Math.max(78, g.blockTop - 36)}" width="132" height="9" rx="4.5" fill="${accent}"/>
      ${textBlock(g, 72, '#FFFFFF', 900, true)}
      <text x="76" y="${g.subY + 20}" font-family="${FONT}" font-size="27" font-weight="600" letter-spacing="0.4" fill="rgba(255,255,255,0.78)">${esc(t.subline)}</text>
      ${channelPill(72, H - 116, opts.channel, accent, true)}
      ${episodeLabel(W - 72, H - 90, `Episode ${episode}`, 'rgba(0,0,0,0.55)', 'end')}
      <g opacity="0.5"><circle cx="${W - 96}" cy="${H * 0.5}" r="28" fill="none" stroke="${bg}" stroke-width="2"/><path d="M ${W - 106} ${H * 0.5 - 10} l 20 10 l -20 10 z" fill="${bg}"/></g>
      ${grain}
    </svg>`;
}
