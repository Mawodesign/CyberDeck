# Kolekcja Night City

Aplikacja na iPhone'a do zbierania kart Cyberpunk Trading Card Game: skaner aparatem, inwentarz z cenami Cardmarket i grading ze zdjęć.

## Uruchomienie na komputerze

```bash
npm install
```

```bash
npm run data
```

```bash
npm run dev
```

`npm run data` pobiera bazę kart z oficjalnej strony, dzienne ceny Cardmarket i liczy wzorce do rozpoznawania. Aplikacja działa pod adresem http://localhost:5173.

## Instalacja na iPhonie

1. Opublikuj aplikację na GitHub Pages (plik `.github/workflows/deploy.yml` robi to po każdym wypchnięciu na gałąź `main` i codziennie o 4:00 UTC odświeża ceny). W ustawieniach repozytorium wybierz Pages → Source → GitHub Actions.
2. Otwórz adres strony w Safari.
3. Stuknij Udostępnij → Do ekranu początkowego.

Aparat działa tylko przez HTTPS, dlatego skaner na żywo wymaga opublikowanej wersji. Opcja „Ze zdjęcia” w skanerze działa wszędzie.

## Skaner

Skieruj aparat na jedną lub kilka kart (do sześciu). Ramka cyjanowa oznacza kartę gotową do dodania, bursztynowa wymaga stuknięcia i wyboru wydania lub karty. Aplikacja pamięta ostatnio wybrany zestaw (np. Retail) i kolejne karty z tego zestawu wybiera sama.

## Grading

1. Na komputerze, w folderze projektu:

   ```bash
   npm run grading
   ```

   Stacja wyświetli kod QR. Telefon łączy się z nią przez darmowy tunel HTTPS Cloudflare (paczka `cloudflared`, instalowana razem z projektem). Z opcją `-- --local` stacja działa tylko dla przeglądarki na tym samym komputerze.
2. W aplikacji: Grading → Połącz ze stacją → zeskanuj kod.
3. Wybierz kartę, zrób sześć zdjęć, stuknij „Wyślij do oceny”. Zdjęcia trafiają do `grading/inbox/`.
4. W Claude Code napisz „oceń karty”. Claude zapisze wynik w `grading/results/` (instrukcja w `grading/README.md`).
5. W aplikacji stuknij „Sprawdź, czy jest ocena”.

Adres tunelu zmienia się przy każdym uruchomieniu stacji, więc kod trzeba zeskanować ponownie.

## Kopia inwentarza

Inwentarz jest zapisany tylko w telefonie. W zakładce Inwentarz → Kopia można go wyeksportować do pliku i wczytać z powrotem.

## Dane

- Karty i obrazki: oficjalna baza cyberpunktcg.com. Obrazki należą do WeirdCo.
- Ceny: dzienny plik Cardmarket (trend w euro). Wydania, których nie udało się jednoznacznie dopasować do produktu Cardmarket, mają „brak ceny”; ręczne dopasowania można dopisać w `scripts/data/cm-overrides.json` (id wydania → idProduct).

## Testy

```bash
npm test
```
