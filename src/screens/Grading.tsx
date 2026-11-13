import jsQR from 'jsqr';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useActions, useCatalog, useInventory } from '../data/hooks';
import { inventory } from '../data/inventory';
import { sendPending, station, submitGrading, syncResults } from '../data/station';
import { PHOTO_SLOTS, SLOT_LABELS, type PhotoSlot } from '../domain/grading';
import type { GradeResult, InventoryItem, Printing } from '../domain/types';
import { grabFrame, startCamera } from '../scan/camera';
import { CardRow, RarityChip } from '../ui/parts';

const num = (v: number) => String(v).replace('.', ',');

function statusText(item: InventoryItem): string {
  if (item.gradingStatus === 'graded' && item.grade) return `ocena ${num(item.grade.overall)}`;
  if (item.gradingStatus === 'waiting') return 'czeka na ocenę';
  if (item.gradingStatus === 'not-sent') return 'nie wysłano';
  return 'bez oceny';
}

function Result({ grade }: { grade: GradeResult }) {
  const bars: Array<[string, number]> = [
    ['Centrowanie', grade.centering], ['Rogi', grade.corners], ['Krawędzie', grade.edges], ['Powierzchnia', grade.surface],
  ];
  return (
    <div className="panel cut" style={{ margin: '0 18px' }}>
      <div className="score">
        <b>{num(grade.overall)}</b>
        <span>szacunkowa ocena<br />ze zdjęć</span>
      </div>
      {bars.map(([label, v]) => (
        <div className="bar" key={label}>
          <span>{label}</span>
          <i style={{ '--w': `${v * 10}%` } as React.CSSProperties} />
          <span>{num(v)}</span>
        </div>
      ))}
      {grade.notes && <p className="note">{grade.notes}</p>}
    </div>
  );
}

/** Parowanie ze stacją: skan kodu QR aparatem albo wklejenie tekstu. */
function Pairing({ onDone, onClose }: { onDone: () => void; onClose: () => void }) {
  const { toast } = useActions();
  const videoRef = useRef<HTMLVideoElement>(null);
  const [text, setText] = useState('');
  const [camError, setCamError] = useState('');

  const pair = (value: string) => {
    try {
      station.pair(value);
      toast('Połączono ze stacją gradingu');
      onDone();
    } catch (e) {
      toast((e as Error).message, true);
    }
  };

  useEffect(() => {
    let stop: (() => void) | null = null;
    let timer = 0;
    let alive = true;
    const canvas = document.createElement('canvas');
    startCamera(videoRef.current!).then((s) => {
      if (!alive) return s();
      stop = s;
      const tick = () => {
        if (!alive || !videoRef.current) return;
        const frame = grabFrame(videoRef.current, canvas, 480);
        const code = frame && jsQR(frame.data, frame.width, frame.height);
        if (code?.data) {
          try {
            station.pair(code.data);
            toast('Połączono ze stacją gradingu');
            return onDone();
          } catch { /* inny kod QR w kadrze: szukamy dalej */ }
        }
        timer = window.setTimeout(tick, 250);
      };
      tick();
    }, (e: Error) => alive && setCamError(e.name === 'NotAllowedError' ? 'Brak dostępu do aparatu. Wklej kod poniżej.' : e.message));
    return () => {
      alive = false;
      window.clearTimeout(timer);
      stop?.();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="backdrop" onClick={onClose}>
      <div className="chooser" onClick={(e) => e.stopPropagation()}>
        <h2>Połącz ze stacją gradingu</h2>
        <div className="pad stack">
          <p className="small dim">Uruchom stację na komputerze i skieruj aparat na kod QR, który wyświetli.</p>
          <div style={{ position: 'relative', height: 200, background: '#0d0818', border: '1px solid var(--line)' }}>
            <video ref={videoRef} playsInline muted style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            {camError && <p className="cam-msg small">{camError}</p>}
          </div>
          <input className="field" placeholder="albo wklej kod stacji" value={text} onChange={(e) => setText(e.target.value)} />
          <button type="button" className="btn" disabled={!text.trim()} onClick={() => pair(text)}>Połącz</button>
        </div>
      </div>
    </div>
  );
}

function Capture({ item, printing }: { item: InventoryItem; printing: Printing }) {
  const { toast } = useActions();
  const [photos, setPhotos] = useState<Partial<Record<PhotoSlot, File>>>({});
  const [busy, setBusy] = useState(false);
  const previews = useMemo(
    () => Object.fromEntries(Object.entries(photos).map(([slot, file]) => [slot, URL.createObjectURL(file)])),
    [photos],
  );
  useEffect(() => () => Object.values(previews).forEach(URL.revokeObjectURL), [previews]);
  const done = PHOTO_SLOTS.filter((s) => photos[s]).length;

  const submit = async () => {
    setBusy(true);
    try {
      await submitGrading(item, printing, photos as Record<string, Blob>);
      toast('Wysłano do oceny');
    } catch (e) {
      toast(`Nie wysłano: ${(e as Error).message}`, true);
    }
    setBusy(false);
  };

  return (
    <>
      <p className="pad small dim" style={{ marginBottom: 10 }}>
        Zrób sześć ostrych zdjęć przy dobrym świetle, bez odblasków. Rogi fotografuj z bliska.
      </p>
      <div className="shots">
        {PHOTO_SLOTS.map((slot) => (
          <label key={slot} className={`shot ${photos[slot] ? 'ok' : ''}`}>
            {previews[slot] && <img src={previews[slot]} alt="" />}
            <span>{SLOT_LABELS[slot]}{!photos[slot] && <><br />zrób zdjęcie</>}</span>
            <input
              type="file" accept="image/*" capture="environment" aria-label={SLOT_LABELS[slot]}
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) setPhotos((p) => ({ ...p, [slot]: file }));
              }}
            />
          </label>
        ))}
      </div>
      <div className="pad" style={{ marginTop: 14 }}>
        <button type="button" className="btn" disabled={done < PHOTO_SLOTS.length || busy} onClick={submit}>
          {busy ? 'Wysyłanie…' : done < PHOTO_SLOTS.length ? `Zdjęcia: ${done} z ${PHOTO_SLOTS.length}` : 'Wyślij do oceny'}
        </button>
      </div>
    </>
  );
}

export function GradingScreen({ itemId, onSelect }: { itemId: string | null; onSelect: (id: string | null) => void }) {
  const catalog = useCatalog();
  const { toast } = useActions();
  const items = useInventory();
  const [paired, setPaired] = useState(() => station.config() !== null);
  const [reachable, setReachable] = useState<boolean | null>(null);
  const [pairing, setPairing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [retake, setRetake] = useState(false);

  const item = items.find((i) => i.id === itemId) ?? null;
  const printing = item ? catalog.byId.get(item.printingId) ?? null : null;
  const waitingCount = items.filter((i) => i.gradingStatus === 'waiting').length;

  // Przy wejściu na ekran: sprawdź stację i pobierz gotowe oceny.
  useEffect(() => {
    let alive = true;
    if (!paired) return setReachable(null);
    station.isReachable().then(async (ok) => {
      if (!alive) return;
      setReachable(ok);
      if (!ok) return;
      const n = await syncResults(await inventory.all()).catch(() => 0);
      if (alive && n > 0) toast(n === 1 ? 'Przyszła nowa ocena' : `Przyszły nowe oceny: ${n}`);
    });
    return () => {
      alive = false;
    };
  }, [paired, toast]);
  useEffect(() => setRetake(false), [itemId]);

  const check = async () => {
    setBusy(true);
    try {
      const n = await syncResults(await inventory.all());
      setReachable(true);
      toast(n > 0 ? 'Przyszła nowa ocena' : 'Oceny jeszcze nie ma');
    } catch {
      setReachable(false);
      toast('Stacja gradingu nie odpowiada', true);
    }
    setBusy(false);
  };
  const resend = async () => {
    if (!item || !printing) return;
    setBusy(true);
    try {
      await sendPending(item, printing);
      toast('Wysłano do oceny');
    } catch (e) {
      toast(`Nie wysłano: ${(e as Error).message}`, true);
    }
    setBusy(false);
  };

  const stationLine = !paired ? 'Stacja niepołączona' : reachable === null ? 'Sprawdzanie stacji…' : reachable ? 'Stacja połączona' : 'Stacja nie odpowiada';

  return (
    <div className="screen">
      <div className="top">
        <h1>Grading</h1>
        <button type="button" className="icon-btn" onClick={() => setPairing(true)}>{paired ? 'Stacja' : 'Połącz ze stacją'}</button>
      </div>
      <p className="pad small" style={{ marginBottom: 12, color: reachable ? 'var(--green)' : 'var(--dim)' }}>{stationLine}</p>

      {item && printing ? (
        <>
          <div className="pad row" style={{ marginBottom: 12 }}>
            <div>
              <div className="name" style={{ fontSize: 18 }}>{printing.name}</div>
              <div className="small dim">{printing.set} {printing.collectorNumber}</div>
            </div>
            <button type="button" className="icon-btn" onClick={() => onSelect(null)}>Inna karta</button>
          </div>

          {item.gradingStatus === 'graded' && item.grade && !retake && (
            <>
              <Result grade={item.grade} />
              <div className="pad" style={{ marginTop: 12 }}>
                <button type="button" className="btn ghost" onClick={() => setRetake(true)}>Oceń ponownie z nowymi zdjęciami</button>
              </div>
            </>
          )}
          {item.gradingStatus === 'waiting' && !retake && (
            <>
              <p className="notice">Czeka na ocenę na komputerze. Napisz do Claude'a w Claude Code: „oceń karty”.</p>
              <div className="pad"><button type="button" className="btn alt" disabled={busy} onClick={check}>Sprawdź, czy jest ocena</button></div>
            </>
          )}
          {item.gradingStatus === 'not-sent' && !retake && (
            <>
              <p className="notice">Nie wysłano. Zdjęcia czekają w telefonie, aż stacja będzie dostępna.</p>
              <div className="pad stack">
                <button type="button" className="btn" disabled={busy} onClick={resend}>{busy ? 'Wysyłanie…' : 'Wyślij ponownie'}</button>
                <button type="button" className="btn ghost" onClick={() => setRetake(true)}>Zrób zdjęcia od nowa</button>
              </div>
            </>
          )}
          {(!item.gradingStatus || retake) && <Capture key={item.id} item={item} printing={printing} />}
        </>
      ) : items.length === 0 ? (
        <div className="empty">
          <b>Brak kart do oceny</b>
          Najpierw dodaj kartę do inwentarza, potem wróć tutaj, żeby zrobić jej zdjęcia.
        </div>
      ) : (
        <>
          {waitingCount > 0 && (
            <div className="pad" style={{ marginBottom: 10 }}>
              <button type="button" className="btn alt" disabled={busy} onClick={check}>Sprawdź oceny ({waitingCount} czeka)</button>
            </div>
          )}
          <p className="pad small dim" style={{ marginBottom: 6 }}>Wybierz kartę do oceny</p>
          {items.map((i) => {
            const p = catalog.byId.get(i.printingId);
            return p && (
              <CardRow
                key={i.id}
                printing={p}
                onClick={() => onSelect(i.id)}
                detail={<><RarityChip rarity={p.rarity} plain />, {p.set} {p.collectorNumber}</>}
                right={<small style={{ color: i.gradingStatus === 'graded' ? 'var(--cyan)' : undefined }}>{statusText(i)}</small>}
              />
            );
          })}
        </>
      )}

      {pairing && (
        <Pairing
          onClose={() => setPairing(false)}
          onDone={() => {
            setPairing(false);
            setPaired(false);
            setTimeout(() => setPaired(true));
          }}
        />
      )}
    </div>
  );
}
