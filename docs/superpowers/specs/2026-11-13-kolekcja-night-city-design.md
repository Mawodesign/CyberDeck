# Kolekcja Night City: projekt aplikacji

Data: 2026-11-13. Status: do zatwierdzenia.

## Po co to jest

Aplikacja na iPhone'a dla jednej osoby zbierającej karty Cyberpunk Trading Card Game (WeirdCo), przede wszystkim z zestawu Welcome to Night City. Właściciel bierze kartę albo kilka kart do ręki, skanuje je aparatem, od razu widzi co to za karta, jakie ma rarity i ile kosztuje na Cardmarket, i dodaje ją do inwentarza. Dla cenniejszych kart robi serię dokładnych zdjęć i dostaje ocenę stanu (grading).

## Co ustalił właściciel

- Skan jednej karty lub wielu kart naraz, z dokładnym rozpoznaniem karty.
- Po skanie: rarity, cena, możliwość dodania do inwentarza.
- Tryb gradingu: więcej dokładnych zdjęć, po których karta dostaje ocenę.
- Wszystko musi być darmowe. Brak płatnego konta Apple Developer.
- Grading odbywa się tak: aplikacja wysyła zdjęcia do folderu na komputerze, Claude ogląda je w sesji Claude Code, odpisuje w czacie i zapisuje wynik, który pojawia się w aplikacji.
- Wygląd: futurystyczny, cyberpunkowy. Zatwierdzona makieta: `.superpowers/brainstorm/193-1794594662/content/screens-v1.html` (fioletowa czerń, róż dla akcji, cyjan dla skanera, bursztyn tylko dla cen, ścięte narożniki paneli, dolna nawigacja: Skaner, Inwentarz, Grading, Ceny).

## Cele

1. Skaner wykrywa do około 6 kart w kadrze, każdą rozpoznaje i pokazuje nazwę oraz cenę przy ramce.
2. Ekran karty: ilustracja, nazwa, numer, zestaw i wersja, rarity, cena trend z Cardmarket, wykres ceny, przyciski „Dodaj do inwentarza” i „Wyślij do gradingu”.
3. Inwentarz: lista kart z ilością, wersją (zwykła lub foil), ceną i oceną, łączna wartość kolekcji ze zmianą od poprzedniego dnia, sortowanie po cenie, rarity i numerze, wyszukiwanie po nazwie.
4. Ceny odświeżane raz dziennie z publicznego pliku Cardmarket.
5. Grading przez folder na komputerze, z wynikiem widocznym w aplikacji.
6. Skaner, inwentarz i ceny działają poza domem, bez włączonego komputera, także bez internetu (z ostatnimi pobranymi cenami).

## Czego nie robimy

- Sprzedaży, wystawiania ofert, kont użytkowników, synchronizacji między urządzeniami.
- Publikacji w App Store.
- Oficjalnego gradingu. Ocena jest szacunkiem ze zdjęć i tak jest podpisana w aplikacji.
- Cen co do sekundy. Cardmarket publikuje plik raz na dobę.
- Innych gier karcianych.

## Co byłoby porażką

- Karta rozpoznana błędnie i po cichu dodana do inwentarza pod złą nazwą lub ceną. Przy niskiej pewności aplikacja pokazuje kandydatów do wyboru zamiast zgadywać.
- Utrata inwentarza. Musi istnieć eksport i import kopii do pliku.
- Jakikolwiek koszt lub wymóg płatnego konta.

## Fakty sprawdzone 2026-11-13

- Cardmarket publikuje pliki dla gry o identyfikatorze 23 (Cyberpunk):
  - katalog: `https://downloads.s3.cardmarket.com/productCatalog/productList/products_singles_23.json` (570 kart w 17 rozszerzeniach; pola: idProduct, name, idExpansion, idMetacard),
  - ceny: `https://downloads.s3.cardmarket.com/productCatalog/priceGuide/price_guide_23.json` (pola: avg, low, trend, avg1, avg7, avg30 oraz te same z końcówką `-foil`; kwoty w euro).
- Odpowiedź z cenami nie zawiera nagłówka Access-Control-Allow-Origin, więc strona w przeglądarce telefonu nie pobierze pliku bezpośrednio. Potrzebny pośrednik.
- Katalog Cardmarket nie zawiera numeru karty, rarity ani obrazka. Oficjalna baza `https://cyberpunktcg.com/cards` ma karty z osobnymi wydaniami (parametr `printing`) i obrazkami.
- Na komputerze są Node 24, npm 11 i git. Nie ma `gh` ani `cloudflared`.

## Jak to będzie zrobione (decyzje Claude'a, nie właściciela)

**Forma.** Aplikacja webowa instalowana z Safari na ekranie głównym (PWA), działająca offline. Interfejs po polsku, ceny w euro tak jak na Cardmarket.

**Hosting.** Darmowy GitHub Pages. Aparat w Safari wymaga HTTPS i stałego adresu, a stały adres jest też potrzebny, żeby dane w telefonie nie znikały. Wymaga darmowego konta GitHub właściciela. To jest pytanie otwarte, patrz niżej.

**Ceny.** Codzienne zadanie GitHub Actions pobiera plik cen Cardmarket i zapisuje go w witrynie, skąd aplikacja czyta go bez problemu z CORS. To samo zadanie dopisuje dzienny trend do pliku historii, z którego powstaje wykres. Dopóki historii jest mało, wykres korzysta z pól avg30, avg7, avg1 i trend. Aplikacja pokazuje datę ostatniej aktualizacji cen.

**Baza kart.** Skrypt uruchamiany przy budowaniu pobiera listę kart, wydania, rarity, numery i obrazki z oficjalnej bazy i łączy je z produktami Cardmarket po nazwie i rozszerzeniu. Niedopasowane pozycje trafiają do ręcznie uzupełnianej tabeli. Karta bez dopasowania do Cardmarket jest w aplikacji widoczna z dopiskiem „brak ceny”. Obrazki kart należą do WeirdCo; używamy ich w prywatnej aplikacji jednej osoby, nie do publicznej dystrybucji.

**Rozpoznawanie, w całości na telefonie.**
1. Wykrycie prostokątów kart w klatce z aparatu i wyprostowanie każdego do stałego rozmiaru.
2. Porównanie ilustracji z wzorcami wszystkich kart (odcisk obrazu policzony przy budowaniu) i wybór najbliższej.
3. Pewność powyżej progu: ramka z nazwą i ceną. Poniżej progu: trzech kandydatów do wyboru.
4. Jeśli ta sama ilustracja występuje w kilku wydaniach (np. Beta i Retail), aplikacja prosi o wybór wydania i pamięta ostatni. Foil zaznacza użytkownik przełącznikiem. Automatyczne odróżnianie wydań i foilu nie jest obiecywane.

**Inwentarz.** Dane w pamięci przeglądarki telefonu (IndexedDB). Eksport i import całości do pliku JSON.

**Grading.**
- Na komputerze działa mały program „stacja gradingu” uruchamiany jednym poleceniem w folderze projektu. Zapisuje zdjęcia do `grading/inbox/<id>/` razem z plikiem `request.json` (karta, wydanie, data) i czyta wyniki z `grading/results/<id>.json`.
- Telefon łączy się ze stacją przez darmowy tunel HTTPS (Cloudflare quick tunnel, bez konta). Adres tunelu zmienia się przy każdym uruchomieniu, więc stacja pokazuje kod QR, który aplikacja skanuje, żeby się sparować. Pobranie programu `cloudflared` wymaga zgody właściciela przy budowie.
- W aplikacji: sześć prowadzonych zdjęć w pełnej rozdzielczości (przód, tył, cztery rogi), przycisk „Wyślij do oceny”, status „czeka na ocenę”.
- Ocena: właściciel pisze w sesji Claude Code „oceń karty”. Claude ogląda zdjęcia z `grading/inbox`, odpowiada w czacie i zapisuje wynik: ocena ogólna 1 do 10, cztery oceny cząstkowe (centrowanie, rogi, krawędzie, powierzchnia) i uwagi tekstem. Nie dzieje się to automatycznie w tle.
- Aplikacja pobiera wynik przy następnym połączeniu ze stacją i zapisuje go przy karcie w inwentarzu, gdzie zostaje widoczny także poza domem.

**Technologia.** Vite, React, TypeScript. Testy jednostkowe dla logiki: dopasowanie kart, łączenie bazy z Cardmarket, wyliczanie wartości kolekcji, format plików gradingu.

## Zostawione budującemu

- Wybór biblioteki do wykrywania kart w obrazie i rodzaju odcisku obrazu, pod warunkiem że działa płynnie na iPhonie i nic nie kosztuje.
- Próg pewności rozpoznania, dobrany na prawdziwych zdjęciach kart właściciela.
- Dokładny układ ekranu „Ceny” (nie było go na makiecie): największe zmiany cen w kolekcji i wyszukiwarka dowolnej karty z bazy.
- Szczegóły animacji; makieta zakłada jeden ruchomy element (linia skanera) i uszanowanie ustawienia „ogranicz ruch”.

## Kolejność budowy

1. Baza kart i ceny (skrypty, pliki danych, testy).
2. Aplikacja: inwentarz, ekran karty, ceny, wygląd z makiety.
3. Skaner z rozpoznawaniem.
4. Stacja gradingu i tryb gradingu.
5. Publikacja na GitHub Pages i codzienne odświeżanie cen.

Kroki 1 do 4 da się uruchomić i sprawdzić lokalnie, zanim powstanie konto GitHub.

## Pytanie otwarte do właściciela

Czy masz darmowe konto GitHub albo zgadzasz się je założyć? Bez niego aplikacja działałaby tylko w domu przy włączonym komputerze, bez codziennych cen poza domem.
