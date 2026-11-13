import type { ReactNode } from 'react';
import { assetUrl } from '../data/catalog';
import { formatEur } from '../domain/pricing';
import type { Printing, Rarity } from '../domain/types';

export function Price({ value, className = '' }: { value: number | null; className?: string }) {
  return <span className={`price ${value === null ? 'none' : ''} ${className}`}>{formatEur(value)}</span>;
}

export function RarityChip({ rarity, plain = false }: { rarity: Rarity; plain?: boolean }) {
  const cls = `r-${rarity.toLowerCase().replace(/\s+/g, '-')}`;
  return <span className={plain ? cls : `chip ${cls}`}>{rarity}</span>;
}

export function Sparkline({ points, width = 96, height = 34 }: { points: number[]; width?: number; height?: number }) {
  if (points.length < 2) return null;
  const min = Math.min(...points);
  const max = Math.max(...points);
  const span = max - min || 1;
  const coords = points
    .map((v, i) => `${((i / (points.length - 1)) * width).toFixed(1)},${(height - 4 - ((v - min) / span) * (height - 8)).toFixed(1)}`)
    .join(' ');
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Wykres ceny">
      <polyline fill="none" stroke="var(--amber)" strokeWidth="2" strokeLinejoin="round" points={coords} />
    </svg>
  );
}

export function Thumb({ printing }: { printing: Printing }) {
  return <img className="thumb" src={assetUrl(printing.imageUrl)} alt="" loading="lazy" />;
}

/** Wiersz listy kart: miniatura, nazwa z opisem, prawa kolumna. */
export function CardRow({ printing, detail, right, onClick }: {
  printing: Printing; detail: ReactNode; right: ReactNode; onClick?: () => void;
}) {
  return (
    <button type="button" className="item" onClick={onClick}>
      <Thumb printing={printing} />
      <span className="n">
        <span className="title">{printing.name}</span>
        <small>{detail}</small>
      </span>
      <span className="r">{right}</span>
    </button>
  );
}

export const shortSet = (p: Printing) => `${p.set} ${p.collectorNumber}`;
