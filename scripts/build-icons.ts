// Generuje ikony aplikacji do public/icons.
import { mkdirSync } from 'node:fs';
import sharp from 'sharp';

const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
<rect width="512" height="512" fill="#0a0612"/>
<g transform="rotate(-8 256 256)">
<path d="M166 96h150l30 30v290H196l-30-30z" fill="#160e26" stroke="#ff2e88" stroke-width="14"/>
<rect x="196" y="140" width="120" height="120" fill="#2de2e6" opacity=".9"/>
<rect x="196" y="290" width="120" height="14" fill="#ffc400"/>
<rect x="196" y="322" width="80" height="14" fill="#3a2a5c"/>
</g>
<rect x="76" y="250" width="360" height="8" fill="#2de2e6"/>
</svg>`;
mkdirSync('public/icons', { recursive: true });
for (const s of [180, 192, 512]) await sharp(Buffer.from(svg)).resize(s, s).png().toFile(`public/icons/icon-${s}.png`);
console.log('Ikony zapisane');
