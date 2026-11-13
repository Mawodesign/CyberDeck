// Stacja gradingu: przyjmuje zdjęcia z telefonu do grading/inbox i oddaje wyniki z grading/results.
import { randomBytes } from 'node:crypto';
import { createWriteStream, existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { isPhotoSlot, isRequestId, parseGradeResult, PHOTO_SLOTS, type GradingRequest } from '../src/domain/grading';

export const STATION_PORT = 5178;
const MAX_PHOTO_BYTES = 25 * 1024 * 1024;
const MAX_JSON_BYTES = 64 * 1024;

export interface StationOptions { dir: string; token: string }

function send(res: ServerResponse, status: number, body?: unknown) {
  res.writeHead(status, {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'X-Station-Token, Content-Type',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, OPTIONS',
    'Content-Type': 'application/json; charset=utf-8',
  });
  res.end(body === undefined ? '' : JSON.stringify(body));
}

function readBody(req: IncomingMessage, limit: number): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let size = 0;
    req.on('data', (c: Buffer) => {
      size += c.length;
      if (size > limit) {
        reject(new Error('za duże'));
        req.destroy();
      } else chunks.push(c);
    });
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

/**
 * Protokół (każde żądanie z nagłówkiem X-Station-Token):
 *   GET  /ping
 *   PUT  /requests/<id>/photos/<slot>   treść: plik zdjęcia
 *   POST /requests/<id>                 treść: GradingRequest (JSON); zamyka zgłoszenie
 *   GET  /results?ids=a,b
 * Zdjęcia trafiają najpierw do inbox/.incoming/<id>; kompletne zgłoszenie jest przenoszone do inbox/<id>.
 */
export function createStation({ dir, token }: StationOptions): Server {
  const inbox = join(dir, 'inbox');
  const incoming = join(inbox, '.incoming');
  const results = join(dir, 'results');
  mkdirSync(incoming, { recursive: true });
  mkdirSync(results, { recursive: true });

  return createServer(async (req, res) => {
    try {
      if (req.method === 'OPTIONS') return send(res, 204);
      if (req.headers['x-station-token'] !== token) return send(res, 401, { error: 'Zły token stacji' });
      const url = new URL(req.url ?? '/', 'http://stacja');
      const parts = url.pathname.split('/').filter(Boolean);

      if (req.method === 'GET' && url.pathname === '/ping') return send(res, 200, { ok: true });

      if (req.method === 'GET' && url.pathname === '/results') {
        const out: Record<string, unknown> = {};
        for (const id of (url.searchParams.get('ids') ?? '').split(',')) {
          if (!isRequestId(id)) continue;
          const file = join(results, `${id}.json`);
          if (!existsSync(file)) continue;
          try {
            out[id] = parseGradeResult(JSON.parse(readFileSync(file, 'utf8')));
          } catch (e) {
            console.warn(`Wynik ${id} jest nieprawidłowy: ${(e as Error).message}`);
          }
        }
        return send(res, 200, out);
      }

      if (parts[0] === 'requests' && isRequestId(parts[1])) {
        const id = parts[1];
        const tmp = join(incoming, id);
        if (req.method === 'PUT' && parts[2] === 'photos' && isPhotoSlot(parts[3]) && parts.length === 4) {
          if (Number(req.headers['content-length'] ?? 0) > MAX_PHOTO_BYTES) return send(res, 413, { error: 'Zdjęcie jest za duże' });
          mkdirSync(tmp, { recursive: true });
          const body = await readBody(req, MAX_PHOTO_BYTES);
          await new Promise<void>((resolve, reject) => {
            const out = createWriteStream(join(tmp, `${parts[3]}.jpg`));
            out.on('error', reject);
            out.end(body, () => resolve());
          });
          return send(res, 200, { ok: true });
        }
        if (req.method === 'POST' && parts.length === 2) {
          const request = JSON.parse((await readBody(req, MAX_JSON_BYTES)).toString('utf8')) as GradingRequest;
          const missing = PHOTO_SLOTS.filter((s) => !existsSync(join(tmp, `${s}.jpg`)));
          if (missing.length) return send(res, 400, { error: `Brakuje zdjęć: ${missing.join(', ')}` });
          writeFileSync(join(tmp, 'request.json'), JSON.stringify({
            id,
            printingId: String(request.printingId ?? ''),
            name: String(request.name ?? ''),
            set: String(request.set ?? ''),
            collectorNumber: String(request.collectorNumber ?? ''),
            foil: !!request.foil,
            createdAt: String(request.createdAt ?? new Date().toISOString()),
            photos: PHOTO_SLOTS.map((s) => `${s}.jpg`),
          } satisfies GradingRequest, null, 1));
          const final = join(inbox, id);
          rmSync(final, { recursive: true, force: true });
          renameSync(tmp, final);
          console.log(`Nowa karta do oceny: ${request.name} (${id})`);
          return send(res, 200, { id });
        }
      }
      return send(res, parts[0] === 'requests' ? 400 : 404, { error: 'Nieznane żądanie' });
    } catch (e) {
      return send(res, 400, { error: (e as Error).message });
    }
  });
}

async function main() {
  const token = randomBytes(16).toString('hex');
  const server = createStation({ dir: 'grading', token });
  await new Promise<void>((resolve) => server.listen(STATION_PORT, resolve));
  const { default: qrcode } = await import('qrcode-terminal');

  const announce = (url: string) => {
    const code = JSON.stringify({ url, token });
    console.log(`\nStacja gradingu działa: ${url}`);
    console.log('W aplikacji: Grading → Połącz ze stacją → zeskanuj kod albo wklej tekst poniżej.\n');
    qrcode.generate(code, { small: true });
    console.log(`\n${code}\n`);
  };

  if (process.argv.includes('--local')) return announce(`http://localhost:${STATION_PORT}`);
  try {
    // Paczka „cloudflared” jest opcjonalna; bez niej stacja działa tylko lokalnie.
    const { tunnel } = await import('cloudflared' as string) as { tunnel: (o: Record<string, string>) => { url: Promise<string> } };
    console.log('Otwieram tunel HTTPS…');
    announce(await tunnel({ '--url': `http://localhost:${STATION_PORT}` }).url);
  } catch (e) {
    console.warn(`Tunel HTTPS niedostępny (${(e as Error).message.split('\n')[0]}).`);
    console.warn('Telefon nie połączy się bez tunelu. Zainstaluj go: npm i -D cloudflared');
    announce(`http://localhost:${STATION_PORT}`);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) void main();
