# Grading: instrukcja dla Claude'a

Gdy właściciel napisze „oceń karty”, oceń każde zgłoszenie z `grading/inbox/`, które nie ma jeszcze pliku w `grading/results/`.

## Co jest w zgłoszeniu

`grading/inbox/<id>/` zawiera `request.json` (nazwa karty, zestaw, numer, foil) i sześć zdjęć:
`front.jpg`, `back.jpg`, `corner-tl.jpg`, `corner-tr.jpg`, `corner-br.jpg`, `corner-bl.jpg`.
Folder `inbox/.incoming/` to niedokończone wysyłki; pomiń go.

## Jak oceniać

Obejrzyj wszystkie sześć zdjęć (narzędzie Read). Oceń cztery cechy w skali 1–10, z dokładnością do 0,5:

- **centering**: równość marginesów przodu (lewo/prawo, góra/dół) i tyłu. 10 to około 50/50, 9 do 55/45, 8 do 60/40, 7 do 65/35, niżej przy większym przesunięciu.
- **corners**: ostrość czterech rogów. Szukaj wybielenia, zaokrąglenia, rozwarstwienia, zagięć.
- **edges**: krawędzie na przodzie i tyle. Szukaj wybielenia, wyszczerbień, nierównego cięcia.
- **surface**: rysy, wgniecenia, odciski, zabrudzenia, linie drukarskie, zmatowienia folii.

`overall` nie jest średnią: najsłabsza cecha ciągnie ocenę w dół. Przyjmij najniższą z czterech ocen plus najwyżej 1 punkt, jeśli pozostałe są wyraźnie lepsze.

Jeśli zdjęcie jest nieostre, prześwietlone albo z odblaskiem zasłaniającym kartę, napisz to w `notes` i poproś o powtórkę zamiast zgadywać.

## Zapis wyniku

Zapisz `grading/results/<id>.json`:

```json
{
  "overall": 8.5,
  "centering": 9,
  "corners": 8,
  "edges": 8.5,
  "surface": 8.5,
  "notes": "Po polsku, 1–4 zdania: co obniżyło ocenę i gdzie to widać.",
  "gradedAt": "2026-11-13T20:00:00Z"
}
```

Wszystkie oceny muszą być liczbami od 1 do 10, inaczej aplikacja odrzuci wynik. To samo podsumowanie napisz właścicielowi w czacie. Ocena jest szacunkiem ze zdjęć, nie oficjalnym gradingiem.
