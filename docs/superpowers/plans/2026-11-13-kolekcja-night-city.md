# Kolekcja Night City Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Aplikacja PWA na iPhone'a do skanowania kart Cyberpunk TCG, prowadzenia inwentarza z cenami Cardmarket i gradingu przez folder na komputerze.

**Architecture:** Statyczna aplikacja React serwowana z GitHub Pages; dane kart i cen to pliki JSON generowane skryptami Node. Rozpoznawanie kart działa w przeglądarce (wykrycie prostokątów, porównanie odcisku obrazu z wzorcami). Grading idzie przez mały serwer Node na komputerze, wystawiony tunelem HTTPS i parowany kodem QR.

**Tech Stack:** Vite, React 18, TypeScript, Vitest, vite-plugin-pwa, idb, @techstark/opencv-js, jsqr, sharp (skrypty), qrcode-terminal i cloudflared (stacja gradingu), GitHub Actions.

**Spec:** `docs/superpowers/specs/2026-11-13-kolekcja-night-city-design.md`

## Global Constraints

- Wszystko darmowe: żadnych płatnych API, kluczy ani kont poza darmowym GitHubem.
- Interfejs po polsku, kwoty w euro w formacie `84,90 €`.
- Kolory z makiety: `--void:#0a0612; --panel:#160e26; --line:#3a2a5c; --pink:#ff2e88; --cyan:#2de2e6; --amber:#ffc400; --text:#ece6f7; --dim:#9486b3`. Bursztyn tylko dla cen. Czcionki Oxanium (nagłówki, liczby) i Chakra Petch (tekst).
- Jedyny ruch bez akcji użytkownika to linia skanera; `prefers-reduced-motion` ją zatrzymuje.
- Ocena z gradingu zawsze podpisana „szacunkowa ocena ze zdjęć”.
- Rozpoznanie poniżej progu pewności nigdy nie dodaje karty samo; pokazuje do 3 kandydatów.
- Cardmarket: gra `23`, kategoria singli `1661`. Pliki: `products_singles_23.json`, `price_guide_23.json` pod `https://downloads.s3.cardmarket.com/productCatalog/`.
- Repozytorium git zakładane w zadaniu 1; commit po każdym zadaniu.
- Pobranie `cloudflared` i publikacja na GitHubie wymagają osobnej zgody właściciela w chwili wykonania.

## Review Focus

1. Dwie karty o tej samej ilustracji w różnych wydaniach (Beta i Retail): aplikacja pyta o wydanie, nie wybiera po cichu. Test w zadaniu 6.
2. Karta z oficjalnej bazy bez odpowiednika w Cardmarket albo z `trend: 0`: widoczna z napisem „brak ceny”, wartość kolekcji liczy ją jako 0. Testy w zadaniach 2 i 4.
3. Import kopii inwentarza z uszkodzonego lub obcego pliku: odrzucony z komunikatem, istniejące dane nietknięte. Test w zadaniu 4.
4. Stacja gradingu wyłączona lub tunel z nieaktualnym adresem w trakcie wysyłki: zdjęcia zostają w telefonie ze statusem „nie wysłano”, ponowienie jednym przyciskiem. Test w zadaniu 9.
5. Plik cen niedostępny lub starszy niż 2 dni: aplikacja używa ostatnich cen i pokazuje ich datę z ostrzeżeniem. Test w zadaniu 5.

---

## File Structure

```
scripts/build-cards.ts        pobranie i parsowanie oficjalnej bazy -> public/data/cards.json
scripts/fetch-prices.ts       pobranie cen Cardmarket -> public/data/prices.json, price-history.json
scripts/build-fingerprints.ts odciski wzorców -> public/data/fingerprints.bin
scripts/lib/official.ts       parser strony cyberpunktcg.com/cards
scripts/lib/cardmarket.ts     dopasowanie wydań do idProduct
scripts/data/cm-overrides.json ręczne dopasowania
src/domain/types.ts           typy współdzielone
src/domain/pricing.ts         cena karty, wartość kolekcji, format euro
src/domain/match.ts           odcisk obrazu i dopasowanie
src/domain/grading.ts         format plików gradingu (wspólny z serwerem)
src/data/catalog.ts           ładowanie cards.json, prices.json
src/data/inventory.ts         IndexedDB, eksport, import
src/scan/detect.ts            wykrywanie prostokątów kart (OpenCV)
src/scan/camera.ts            strumień aparatu
src/screens/{Scanner,Card,Inventory,Grading,Prices}.tsx
src/ui/{theme.css,Nav.tsx,Panel.tsx,RarityChip.tsx,Price.tsx,Sparkline.tsx}
server/grading-station.ts     serwer HTTP + tunel + QR
grading/inbox, grading/results foldery wymiany (w .gitignore poza .gitkeep)
.github/workflows/{deploy.yml,prices.yml}
```

Wspólne typy (`src/domain/types.ts`), używane przez wszystkie zadania:

```ts
export type Rarity = 'Common'|'Uncommon'|'Rare'|'Nova Rare'|'Epic'|'Secret'|'Iconic Legend'|'Iconic Other'|'Iconic Secret';
export interface Printing { id: string; cardSlug: string; name: string; set: string; setCode: string;
  collectorNumber: string; rarity: Rarity; finish: string; imageUrl: string; artKey: string; cmProductId: number | null; }
export interface PriceEntry { trend: number|null; low: number|null; avg1: number|null; avg7: number|null; avg30: number|null;
  trendFoil: number|null; lowFoil: number|null; avg1Foil: number|null; avg7Foil: number|null; avg30Foil: number|null; }
export interface PriceFile { createdAt: string; prices: Record<number, PriceEntry>; }
export interface InventoryItem { id: string; printingId: string; foil: boolean; quantity: number; addedAt: string; grade?: GradeResult; gradingStatus?: 'not-sent'|'waiting'|'graded'; }
export interface GradeResult { overall: number; centering: number; corners: number; edges: number; surface: number; notes: string; gradedAt: string; }
```

`artKey` to identyfikator ilustracji wspólny dla wydań o tym samym obrazie (zadanie 6 go wypełnia; do tego czasu równy `id`).

---

### Task 1: Szkielet projektu i baza kart

**Files:**
- Create: `package.json`, `vite.config.ts`, `tsconfig.json`, `.gitignore`, `index.html`, `src/main.tsx`, `src/domain/types.ts`, `scripts/lib/official.ts`, `scripts/build-cards.ts`, `scripts/fixtures/cards-sample.html`
- Test: `scripts/lib/official.test.ts`

**Interfaces:**
- Produces: `parseOfficialCards(html: string): Printing[]` (z `cmProductId: null`, `artKey = id`); plik `public/data/cards.json` jako `Printing[]`; polecenia `npm run data:cards`, `npm test`, `npm run dev`.

- [ ] **Step 1:** `git init`; `npm create vite@latest . -- --template react-ts`; dodać `vitest`, `tsx`, `sharp`, `idb`, `vite-plugin-pwa`. `.gitignore`: `node_modules`, `dist`, `.superpowers`, `grading/inbox/*`, `grading/results/*`.
- [ ] **Step 2:** Zapisać fragment prawdziwej strony `https://cyberpunktcg.com/cards` (co najmniej 3 karty, w tym jedna z dwoma wydaniami) jako `scripts/fixtures/cards-sample.html`. Dane siedzą w skrypcie strony jako literał obiektu JS z polami `name`, `slug`, `set`, `code`, `collector_number`, `rarity`, `finish`, `image_url`, `id`.
- [ ] **Step 3: Test, który ma nie przejść**

```ts
test('parsuje wydania z oficjalnej strony', () => {
  const p = parseOfficialCards(readFileSync('scripts/fixtures/cards-sample.html','utf8'));
  expect(p.length).toBeGreaterThanOrEqual(3);
  const smasher = p.find(x => x.cardSlug === 'adam-smasher-ender-of-legends')!;
  expect(smasher.name).toBe('Adam Smasher — Ender of Legends');
  expect(smasher.imageUrl).toMatch(/^https:\/\//);
  expect(smasher.rarity).toMatch(/Iconic|Epic|Rare|Common|Uncommon|Secret/);
  expect(new Set(p.map(x => x.id)).size).toBe(p.length);
});
test('rzuca błąd, gdy strona nie zawiera kart', () => {
  expect(() => parseOfficialCards('<html></html>')).toThrow(/brak kart/);
});
```

- [ ] **Step 4:** `npx vitest run scripts/lib/official.test.ts` → FAIL (brak funkcji).
- [ ] **Step 5:** Zaimplementować `parseOfficialCards` w `scripts/lib/official.ts`. Jeśli literał nie da się sparsować wyrażeniami regularnymi stabilnie, wykonać skrypt strony w `node:vm` z pustym kontekstem i odczytać dane.
- [ ] **Step 6:** `scripts/build-cards.ts`: pobiera stronę, woła parser, zapisuje `public/data/cards.json`; kończy się błędem przy mniej niż 300 wydaniach.
- [ ] **Step 7:** `npx vitest run` → PASS; `npm run data:cards` → plik z co najmniej 300 wydaniami.
- [ ] **Step 8:** Commit `feat: szkielet projektu i import bazy kart`.

### Task 2: Ceny Cardmarket i dopasowanie

**Files:**
- Create: `scripts/lib/cardmarket.ts`, `scripts/fetch-prices.ts`, `scripts/data/cm-overrides.json`
- Modify: `scripts/build-cards.ts` (uzupełnia `cmProductId`)
- Test: `scripts/lib/cardmarket.test.ts`

**Interfaces:**
- Consumes: `Printing`, `PriceEntry`, `PriceFile`.
- Produces: `normalizeName(s: string): string`; `matchPrintings(printings: Printing[], cmProducts: CmProduct[], overrides: Record<string, number>): { matched: Printing[]; unmatched: Printing[] }`; `toPriceFile(raw: CmPriceGuide): PriceFile`; `appendHistory(history: PriceHistory, file: PriceFile): PriceHistory` gdzie `PriceHistory = Record<number, Array<[date: string, trend: number|null, trendFoil: number|null]>>`; pliki `public/data/prices.json`, `public/data/price-history.json`; polecenie `npm run data:prices`.

- [ ] **Step 1: Testy**

```ts
test('normalizuje nazwy', () => {
  expect(normalizeName('Adam Smasher — Ender of Legends')).toBe(normalizeName('Adam Smasher - Ender of Legends'));
});
test('dopasowuje po nazwie i rozszerzeniu, override wygrywa', () => { /* 2 wydania tej samej nazwy w 2 rozszerzeniach -> różne idProduct; override nadpisuje */ });
test('niedopasowane trafiają do unmatched z cmProductId null', () => {});
test('toPriceFile zamienia 0 na null i mapuje pola -foil', () => {
  const f = toPriceFile({ createdAt:'2026-11-13T02:44:35+0100', priceGuides:[{ idProduct:904772, trend:0, low:98.99, 'trend-foil':58.97 } as any] });
  expect(f.prices[904772].trend).toBeNull();
  expect(f.prices[904772].trendFoil).toBe(58.97);
});
test('appendHistory nie dubluje tego samego dnia i trzyma najwyżej 90 dni', () => {});
```

- [ ] **Step 2:** uruchomić → FAIL.
- [ ] **Step 3:** Implementacja. Mapowanie rozszerzenia Cardmarket (`idExpansion`) na `setCode` oficjalnej bazy wyznaczyć z danych: dla każdego `idExpansion` wybrać `setCode`, z którym pokrywa się najwięcej znormalizowanych nazw; wynik wypisać w logu skryptu.
- [ ] **Step 4:** `npm run data:cards && npm run data:prices`; skrypt wypisuje liczbę dopasowanych i listę niedopasowanych. Niedopasowane, które da się rozstrzygnąć ręcznie, dopisać do `cm-overrides.json` (klucz: `Printing.id`).
- [ ] **Step 5:** testy → PASS. Commit `feat: ceny Cardmarket i dopasowanie wydań`.

### Task 3: Powłoka aplikacji i wygląd

**Files:**
- Create: `src/ui/theme.css`, `src/ui/Nav.tsx`, `src/ui/Panel.tsx`, `src/ui/RarityChip.tsx`, `src/ui/Price.tsx`, `src/App.tsx`, `public/manifest.webmanifest`, ikony
- Modify: `vite.config.ts` (PWA, `base` z `process.env.BASE_PATH ?? '/'`), `index.html`
- Test: `src/ui/Price.test.tsx`

**Interfaces:**
- Consumes: `formatEur` z zadania 4 nie istnieje jeszcze, więc `Price` formatuje sam przez `Intl.NumberFormat('pl-PL',{style:'currency',currency:'EUR'})`; zadanie 4 wydziela to do `pricing.ts`.
- Produces: `<Nav current onChange>` z zakładkami `scanner|inventory|grading|prices`; `<Panel cut>`; `<RarityChip rarity>`; `<Price value: number|null>` (dla `null` tekst „brak ceny”); routing w `App.tsx` przez stan, bez biblioteki.

- [ ] **Step 1:** Test: `<Price value={84.9}/>` renderuje `84,90 €`; `<Price value={null}/>` renderuje `brak ceny`.
- [ ] **Step 2:** Przenieść tokeny i kształty z makiety `screens-v1.html` do `theme.css`; czcionki zainstalować lokalnie (`@fontsource/oxanium`, `@fontsource/chakra-petch`), żeby działały offline. Kontrast tekstu pomocniczego co najmniej 4.5:1 na `--void` i `--panel`.
- [ ] **Step 3:** PWA: `display: standalone`, `theme_color #0a0612`, cache plików aplikacji oraz `data/*.json` strategią stale-while-revalidate; `viewport-fit=cover` i odstępy `env(safe-area-inset-*)`.
- [ ] **Step 4:** `npm run dev`, sprawdzić w przeglądarce w szerokości 390 px cztery puste ekrany z nawigacją. Commit.

### Task 4: Inwentarz i wyceny

**Files:**
- Create: `src/domain/pricing.ts`, `src/data/inventory.ts`, `src/data/catalog.ts`
- Test: `src/domain/pricing.test.ts`, `src/data/inventory.test.ts` (z `fake-indexeddb`)

**Interfaces:**
- Produces:
  - `formatEur(v: number|null): string`
  - `priceOf(p: Printing, foil: boolean, prices: PriceFile): number|null` (foil → `trendFoil`, inaczej `trend`; brak → `null`)
  - `collectionValue(items: InventoryItem[], byId: Map<string,Printing>, prices: PriceFile): number`
  - `loadCatalog(): Promise<{ printings: Printing[]; byId: Map<string,Printing>; prices: PriceFile; history: PriceHistory; pricesStale: boolean }>` (`pricesStale` gdy `createdAt` starsze niż 48 h)
  - `inventory.add(printingId, foil, quantity=1)`, `inventory.setQuantity(id, n)` (0 usuwa), `inventory.all()`, `inventory.setGrade(id, GradeResult)`, `inventory.setGradingStatus(id, status)`, `inventory.exportJson(): Promise<string>`, `inventory.importJson(text): Promise<number>`; dodanie tej samej pary `printingId`+`foil` zwiększa ilość istniejącej pozycji.
  - Format kopii: `{ app: 'kolekcja-night-city', version: 1, items: InventoryItem[] }`.

- [ ] **Step 1: Testy** dla: ceny foil i zwykłej; `null` gdy `cmProductId` to `null` lub trend `null`; `collectionValue` mnoży przez ilość i traktuje `null` jako 0; dodanie duplikatu zwiększa ilość; `importJson('{"foo":1}')` i `importJson('nie json')` rzucają `Nieprawidłowy plik kopii` i nie zmieniają `all()`; eksport, wyczyszczenie, import odtwarza pozycje.
- [ ] **Step 2:** FAIL → implementacja → PASS. Commit.

### Task 5: Ekrany Karta, Inwentarz, Ceny

**Files:**
- Create: `src/screens/Card.tsx`, `src/screens/Inventory.tsx`, `src/screens/Prices.tsx`, `src/ui/Sparkline.tsx`
- Test: `src/screens/Inventory.test.tsx`, `src/ui/Sparkline.test.ts`

**Interfaces:**
- Consumes: wszystko z zadań 3 i 4.
- Produces: `<CardScreen printingId onAdd onGrade>`; `sparklinePoints(history: Array<[string, number|null, number|null]>, entry: PriceEntry, foil: boolean): number[]` (z historii, gdy ma co najmniej 5 punktów; inaczej `[avg30, avg7, avg1, trend]` bez `null`).

- [ ] **Step 1:** Testy: lista sortuje się po cenie, rarity i numerze; wyszukiwarka filtruje po nazwie bez względu na wielkość liter i znaki diakrytyczne; nagłówek pokazuje sumę i zmianę względem poprzedniego dnia z historii; przy `pricesStale` widać „Ceny z dnia DD.MM, mogą być nieaktualne”; `sparklinePoints` w obu trybach.
- [ ] **Step 2:** Implementacja według makiety. Ekran Karta: wybór wydania (lista wydań o tym samym `cardSlug`), przełącznik foil, przyciski „Dodaj do inwentarza” i „Wyślij do gradingu”; po dodaniu komunikat „Dodano do inwentarza”. Ekran Ceny: wyszukiwarka całej bazy i lista 10 największych zmian trendu wśród kart z inwentarza. Ustawienia (ikona w Inwentarzu): „Eksportuj kopię”, „Importuj kopię”.
- [ ] **Step 3:** PASS, przegląd w przeglądarce na 390 px, commit.

### Task 6: Odciski obrazów i dopasowanie

**Files:**
- Create: `src/domain/match.ts`, `scripts/build-fingerprints.ts`
- Modify: `scripts/build-cards.ts` (ustawia `artKey`)
- Test: `src/domain/match.test.ts`, fixtury `scripts/fixtures/img/*.webp` (4 prawdziwe obrazki kart, w tym 2 wydania tej samej ilustracji)

**Interfaces:**
- Produces:
  - `FP_W = 24`, `FP_H = 32`; `fingerprint(rgba: Uint8ClampedArray, w: number, h: number): Float32Array` (skala szarości, przeskalowanie do 24×32, odjęcie średniej, normalizacja do długości 1; wejście to wyprostowana karta w proporcji 5:7)
  - `similarity(a: Float32Array, b: Float32Array): number` (iloczyn skalarny)
  - `interface Candidate { artKey: string; printingIds: string[]; score: number }`
  - `matchCard(fp: Float32Array, index: FingerprintIndex): { confident: boolean; candidates: Candidate[] }`: kandydaci pogrupowani po `artKey`, najwyżej 3; `confident` gdy `score ≥ MATCH_MIN (0.80)` i przewaga nad drugim `≥ MATCH_MARGIN (0.05)`. Obie stałe eksportowane, do strojenia na zdjęciach właściciela.
  - `loadFingerprintIndex(): Promise<FingerprintIndex>` czyta `public/data/fingerprints.bin` (nagłówek JSON z listą `artKey` → `printingIds`, potem Float32).
  - `artKey`: wydania, których odciski mają `similarity ≥ 0.97`, dostają wspólny klucz.

- [ ] **Step 1: Testy:** ten sam obrazek pomniejszony i rozjaśniony o 20% dopasowuje się do siebie z `confident: true`; dwa wydania tej samej ilustracji dają jednego kandydata z dwoma `printingIds`; jednolicie szary obraz daje `confident: false`; `matchCard` nigdy nie zwraca więcej niż 3 kandydatów.
- [ ] **Step 2:** FAIL → implementacja → PASS.
- [ ] **Step 3:** `npm run data:fingerprints` pobiera obrazki wszystkich wydań (z cache w `.cache/images`), liczy odciski przez `sharp`, zapisuje plik i wypisuje liczbę grup `artKey`. Commit.

### Task 7: Skaner

**Files:**
- Create: `src/scan/camera.ts`, `src/scan/detect.ts`, `src/screens/Scanner.tsx`
- Test: `src/scan/detect.test.ts` (geometria bez OpenCV)

**Interfaces:**
- Consumes: `fingerprint`, `matchCard`, `loadFingerprintIndex`, `inventory.add`, `priceOf`.
- Produces: `startCamera(video: HTMLVideoElement): Promise<() => void>` (tylna kamera, 1920×1080 ideal); `detectCards(frame: ImageData): Quad[]` gdzie `Quad = [Point,Point,Point,Point]` w kolejności od lewego górnego zgodnie z ruchem wskazówek zegara; `orderCorners(pts: Point[]): Quad`; `isCardShaped(q: Quad): boolean` (stosunek boków 0.60 do 0.82, pole co najmniej 2% klatki); `warpCard(frame: ImageData, q: Quad): ImageData` (250×350).

- [ ] **Step 1:** Testy `orderCorners` (dowolna kolejność wejścia, także karta obrócona o 90°, wtedy wynik ma dłuższy bok pionowo) i `isCardShaped` (kwadrat odrzucony, 63×88 przyjęty, za mały odrzucony).
- [ ] **Step 2:** `detectCards`: OpenCV ładowane leniwie przy pierwszym wejściu na ekran; szarość, rozmycie, Canny, `findContours`, `approxPolyDP` do 4 wierzchołków, filtr `isCardShaped`, najwyżej 6 największych. Przetwarzanie co około 300 ms na klatce pomniejszonej do 640 px szerokości.
- [ ] **Step 3:** `Scanner.tsx` według makiety: ramka i etykieta (nazwa, cena) przy każdej karcie; wynik stabilizowany, czyli etykieta pojawia się po 3 zgodnych rozpoznaniach z rzędu. Karta `confident` z jednym wydaniem: gotowa do dodania. Wiele wydań lub brak pewności: ramka bursztynowa z napisem „Wybierz”, stuknięcie otwiera listę kandydatów i wydań; ostatnio wybrany zestaw staje się domyślny. Dolny panel: „Rozpoznano X z Y”, suma, przycisk „Dodaj X kart do inwentarza” dodający tylko karty potwierdzone. Brak zgody na aparat: komunikat „Włącz dostęp do aparatu w Ustawieniach Safari” i przycisk ponowienia.
- [ ] **Step 4:** Sprawdzenie ręczne: `npm run dev -- --host` przez HTTPS (`@vitejs/plugin-basic-ssl`) albo na komputerze z kamerą internetową, karta wyświetlona na drugim ekranie. Commit.

### Task 8: Stacja gradingu

**Files:**
- Create: `src/domain/grading.ts`, `server/grading-station.ts`, `grading/inbox/.gitkeep`, `grading/results/.gitkeep`, `grading/README.md`
- Test: `server/grading-station.test.ts`, `src/domain/grading.test.ts`

**Interfaces:**
- Produces:
  - `interface GradingRequest { id: string; printingId: string; name: string; set: string; collectorNumber: string; foil: boolean; createdAt: string; photos: string[] }`
  - `PHOTO_SLOTS = ['front','back','corner-tl','corner-tr','corner-br','corner-bl'] as const`
  - `parseGradeResult(json: unknown): GradeResult` (rzuca przy ocenach spoza 1 do 10 lub braku pola)
  - Serwer `createStation({ dir, token }): http.Server`, wszystkie żądania wymagają nagłówka `X-Station-Token`, CORS dla dowolnego pochodzenia:
    - `GET /ping` → `{ ok: true }`
    - `POST /requests` (multipart: pole `request` z JSON, pliki `front.jpg` … ) → zapis do `grading/inbox/<id>/` → `{ id }`
    - `GET /results?ids=a,b` → `{ [id]: GradeResult }` dla istniejących plików `grading/results/<id>.json`
  - `npm run grading`: losowy token, start na porcie 5178, uruchomienie `cloudflared tunnel --url http://localhost:5178`, wypisanie kodu QR z treścią `{"url":"https://….trycloudflare.com","token":"…"}`.
  - `grading/README.md`: instrukcja dla Claude'a, jak ocenić kartę (obejrzeć 6 zdjęć, zapisać `grading/results/<id>.json` w formacie `GradeResult`, kryteria czterech ocen cząstkowych).

- [ ] **Step 1:** Testy: żądanie bez tokenu → 401; `POST /requests` tworzy folder z `request.json` i zdjęciami; identyfikator z `..` lub `/` → 400; `GET /results` zwraca tylko istniejące i poprawne wyniki; `parseGradeResult` odrzuca `overall: 11`.
- [ ] **Step 2:** FAIL → implementacja na `node:http` → PASS.
- [ ] **Step 3:** Po zgodzie właściciela dodać paczkę `cloudflared` i sprawdzić, że `npm run grading` wypisuje kod QR, a `/ping` odpowiada przez adres tunelu. Commit.

### Task 9: Tryb gradingu w aplikacji

**Files:**
- Create: `src/screens/Grading.tsx`, `src/data/station.ts`
- Test: `src/data/station.test.ts`

**Interfaces:**
- Consumes: zadanie 8, `inventory.setGrade`, `inventory.setGradingStatus`.
- Produces: `station.pair(qrText: string): void` (zapis w `localStorage`), `station.isReachable(): Promise<boolean>`, `station.send(req: GradingRequest, photos: Record<string, Blob>): Promise<void>`, `station.fetchResults(ids: string[]): Promise<Record<string, GradeResult>>`; zdjęcia niewysłane trzymane w IndexedDB do skutecznej wysyłki.

- [ ] **Step 1:** Testy z podmienionym `fetch`: błąd sieci przy `send` zostawia zdjęcia i status `not-sent`; ponowienie po udanym `fetch` ustawia `waiting` i usuwa zdjęcia z telefonu; `fetchResults` z poprawnym wynikiem ustawia `graded` i zapisuje ocenę; niepoprawny tekst QR → błąd `To nie jest kod stacji gradingu`.
- [ ] **Step 2:** Ekran według makiety: wybór karty z inwentarza (albo wejście z ekranu Karta), sześć pól zdjęć robionych przez `<input type="file" accept="image/*" capture="environment">` (pełna rozdzielczość aparatu), przycisk „Wyślij do oceny” aktywny po sześciu zdjęciach, statusy „nie wysłano”, „czeka na ocenę”, wynik z czterema paskami i uwagami, podpis „szacunkowa ocena ze zdjęć”. Parowanie: przycisk „Połącz ze stacją” otwiera skaner QR (`jsqr` na klatkach z `startCamera`). Wyniki pobierane przy wejściu na ekran, gdy stacja odpowiada.
- [ ] **Step 3:** PASS. Próba całej pętli: wysłanie z telefonu lub przeglądarki, ręczne wpisanie wyniku do `grading/results`, wynik widoczny w aplikacji. Commit.

### Task 10: Publikacja i codzienne ceny

**Files:**
- Create: `.github/workflows/deploy.yml`, `.github/workflows/prices.yml`, `README.md`

- [ ] **Step 1:** `deploy.yml`: przy pushu na `main` uruchamia testy, `npm run data:cards`, `data:prices`, `data:fingerprints`, buduje z `BASE_PATH=/<nazwa-repo>/` i publikuje na Pages. `price-history.json` jest przechowywany na gałęzi `data` i dociągany przed budową.
- [ ] **Step 2:** `prices.yml`: harmonogram `0 4 * * *` (po porannej publikacji Cardmarket), aktualizuje `prices.json` i historię na gałęzi `data`, potem wywołuje `deploy.yml`.
- [ ] **Step 3:** `README.md` po polsku: instalacja na iPhonie (Safari, Udostępnij, Do ekranu początkowego), uruchamianie stacji gradingu, kopia inwentarza.
- [ ] **Step 4:** Po zgodzie właściciela i utworzeniu przez niego repozytorium: push, sprawdzenie, że strona działa pod adresem Pages na iPhonie, w tym aparat. Commit.
