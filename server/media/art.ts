import type { Project, Scene } from '../../shared/types.js';
import { hashSeed, rng } from '../util.js';

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/**
 * Procedural "cinematic still" used when no image model is available.
 * Deterministic per scene, palette-aware, and rendered to a real PNG by sharp.
 */
export function sceneArtSvg(project: Project, scene: Scene, index: number, aspect: '16:9' | '9:16'): string {
  const W = aspect === '16:9' ? 1280 : 720;
  const H = aspect === '16:9' ? 720 : 1280;
  const palette = project.visuals?.palette ?? ['#0B0F1A', '#2B4F8A', '#F4C77B', '#FFFFFF'];
  const bg = palette[0];
  const mid = palette[1];
  const accent = palette[2] ?? '#F4C77B';
  const r = rng(`${project.id}:${scene.id}:art`);
  const hueShift = Math.round(r() * 24) - 12;

  const cx = [0.18, 0.78, 0.5, 0.3, 0.68][index % 5];
  const cy = [0.26, 0.32, 0.48, 0.74, 0.7][index % 5];
  const rot = -18 + r() * 36;
  const bands = 5 + Math.round(r() * 4);
  const rings = 2 + Math.round(r() * 2);
  const label = `SCENE ${String(index + 1).padStart(2, '0')}`;
  const mood = (scene.composition || 'cinematic').split(',')[0].slice(0, 34).toUpperCase();

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
    <defs>
      <linearGradient id="base" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stop-color="${bg}"/>
        <stop offset="60%" stop-color="${mid}"/>
        <stop offset="100%" stop-color="${bg}"/>
      </linearGradient>
      <radialGradient id="glow" cx="50%" cy="50%" r="50%">
        <stop offset="0%" stop-color="${accent}" stop-opacity="0.75"/>
        <stop offset="55%" stop-color="${accent}" stop-opacity="0.16"/>
        <stop offset="100%" stop-color="${accent}" stop-opacity="0"/>
      </radialGradient>
      <linearGradient id="beam" x1="0" y1="0" x2="1" y2="0">
        <stop offset="0%" stop-color="${accent}" stop-opacity="0"/>
        <stop offset="50%" stop-color="${accent}" stop-opacity="0.35"/>
        <stop offset="100%" stop-color="${accent}" stop-opacity="0"/>
      </linearGradient>
      <radialGradient id="vignette" cx="50%" cy="50%" r="75%">
        <stop offset="55%" stop-color="rgba(0,0,0,0)"/>
        <stop offset="100%" stop-color="rgba(0,0,0,0.62)"/>
      </radialGradient>
      <filter id="soft"><feGaussianBlur stdDeviation="${Math.round(Math.min(W, H) * 0.06)}"/></filter>
      <filter id="grain"><feTurbulence type="fractalNoise" baseFrequency="0.86" numOctaves="3" stitchTiles="stitch"/><feColorMatrix type="saturate" values="0"/></filter>
    </defs>

    <rect width="${W}" height="${H}" fill="url(#base)"/>
    <g filter="url(#soft)" opacity="0.85">
      <ellipse cx="${cx * W}" cy="${cy * H}" rx="${W * 0.34}" ry="${H * 0.34}" fill="url(#glow)"/>
    </g>

    <g transform="rotate(${rot} ${W / 2} ${H / 2})" opacity="0.5">
      ${Array.from({ length: bands }, (_, i) => {
        const y = (i / bands) * H * 1.2 - H * 0.1;
        return `<rect x="${-W * 0.2}" y="${y}" width="${W * 1.4}" height="${1.2 + (i % 3) * 0.6}" fill="rgba(255,255,255,${0.05 + (i % 4) * 0.015})"/>`;
      }).join('')}
    </g>

    <g opacity="0.4">
      <rect x="${W * 0.5 - 1}" y="0" width="${W * 0.5}" height="${H}" fill="url(#beam)" opacity="0.35"/>
    </g>

    <g fill="none" stroke="rgba(255,255,255,0.12)" stroke-width="1.2">
      ${Array.from({ length: rings }, (_, i) => {
        const radius = Math.min(W, H) * (0.22 + i * 0.11);
        return `<circle cx="${cx * W}" cy="${cy * H}" r="${radius}"/>`;
      }).join('')}
    </g>

    <g opacity="0.9">
      <circle cx="${W * 0.5}" cy="${H * 0.5}" r="${Math.min(W, H) * 0.004}" fill="${accent}"/>
    </g>

    <g opacity="0.55">
      ${subjectShapes(W, H, index, accent, mid)}
    </g>

    <g opacity="0.35" fill="none" stroke="rgba(255,255,255,0.22)" stroke-width="1">
      ${Array.from({ length: 4 }, (_, i) => `<path d="M${W * 0.08 + i * 12} ${H * 0.72} q ${W * 0.18} ${-H * (0.06 + i * 0.02)} ${W * 0.36} 0"/>`).join('')}
    </g>

    <g opacity="0.55">
      ${Array.from({ length: 7 }, (_, i) => {
        const x = (i / 6) * W;
        return `<line x1="${x}" y1="${H - 84}" x2="${x}" y2="${H - 30}" stroke="rgba(255,255,255,0.28)" stroke-width="1"/>`;
      }).join('')}
    </g>

    <rect width="${W}" height="${H}" fill="url(#vignette)"/>
    <rect width="${W}" height="${H}" filter="url(#grain)" opacity="0.07" style="mix-blend-mode:overlay"/>

    <g>
      <rect x="${Math.round(W * 0.055)}" y="${H - Math.round(H * 0.135)}" width="${Math.min(W * 0.5, 52 + label.length * 13)}" height="34" rx="17" fill="rgba(0,0,0,0.28)" stroke="rgba(255,255,255,0.18)"/>
      <circle cx="${Math.round(W * 0.055) + 17}" cy="${H - Math.round(H * 0.135) + 17}" r="5" fill="${accent}"/>
      <text x="${Math.round(W * 0.055) + 30}" y="${H - Math.round(H * 0.135) + 22}" font-family="'Inter','Helvetica Neue',Arial,sans-serif" font-size="14" font-weight="700" letter-spacing="2.6" fill="rgba(255,255,255,0.78)">${esc(label)}</text>
      <text x="${Math.round(W * 0.055) + 30}" y="${H - Math.round(H * 0.135) + 46}" font-family="'Inter','Helvetica Neue',Arial,sans-serif" font-size="12" letter-spacing="2.2" fill="rgba(255,255,255,0.42)">${esc(mood)}</text>
    </g>
  </svg>`;
}

/** Abstract focal "subject" so the frame reads as a designed still, never an empty gradient. */
function subjectShapes(W: number, H: number, index: number, accent: string, mid: string): string {
  const variant = index % 4;
  const cx = W * 0.5;
  const cy = H * 0.5;
  const r = Math.min(W, H);
  if (variant === 0) {
    return `<rect x="${cx - r * 0.24}" y="${cy - r * 0.3}" width="${r * 0.48}" height="${r * 0.6}" rx="${r * 0.06}" fill="${mid}" opacity="0.55"/>
      <rect x="${cx - r * 0.16}" y="${cy - r * 0.18}" width="${r * 0.32}" height="${r * 0.42}" rx="${r * 0.05}" fill="${accent}" opacity="0.22"/>`;
  }
  if (variant === 1) {
    return `<circle cx="${cx + r * 0.12}" cy="${cy}" r="${r * 0.26}" fill="${accent}" opacity="0.28"/>
      <path d="M${cx - r * 0.34} ${cy + r * 0.26} L${cx} ${cy - r * 0.3} L${cx + r * 0.34} ${cy + r * 0.26} Z" fill="${mid}" opacity="0.5"/>`;
  }
  if (variant === 2) {
    return `<path d="M${cx - r * 0.3} ${cy} q ${r * 0.3} ${-r * 0.34} ${r * 0.6} 0 q ${-r * 0.3} ${r * 0.34} ${-r * 0.6} 0 Z" fill="${accent}" opacity="0.26"/>
      <path d="M${cx - r * 0.24} ${cy + r * 0.16} h ${r * 0.48}" stroke="${accent}" stroke-width="${Math.max(2, r * 0.006)}" opacity="0.6"/>`;
  }
  return `<rect x="${cx - r * 0.3}" y="${cy - r * 0.12}" width="${r * 0.6}" height="${r * 0.24}" rx="${r * 0.02}" fill="${mid}" opacity="0.6"/>
    <rect x="${cx - r * 0.18}" y="${cy - r * 0.24}" width="${r * 0.36}" height="${r * 0.12}" rx="${r * 0.02}" fill="${accent}" opacity="0.24"/>`;
}

/** Simple deterministic hash so providers can seed free endpoints stably. */
export const artSeed = (project: Project, scene: Scene) => hashSeed(`${project.id}-${scene.id}`);
