# Orba Lab V1.3 — wersja do testów

Pełna aplikacja: index.html. Wymaga hostowania przez HTTPS dla USB MIDI i mikrofonu (localhost do testów na komputerze). Nie otwieraj index.html jako pliku na telefonie do testowania USB.

Sample: nowy edytor P5, import/nagrywanie, zoom/pan, dotknięcie ustawiające START, uchwyty, długości 1/2/5/10/20 s zachowujące START, odsłuch ze wskaźnikiem, pętla, przycinanie ciszy, opcjonalny magnes, normalize/gain/fade, eksport WAV z nazwą źródła i zakresem.
Magnes: 3 ms zapasu przed początkiem, 5 ms za końcem; zachowuje audio oryginału, nie generuje ciszy. Szuka lokalnych zmian poziomu. Nie rozdziela instrumentów w miksie; w ciągłej muzyce może nie znaleźć pewnej granicy.
Logo Play Epistemic: przygaszone bez połączenia, rozświetlone po połączeniu USB/BLE. Połączono/Rozłączono pojawia się chwilowo. Stan oznacza połączenie transportu; nie potwierdza obsługi transferu sampli.

## Test telefonu
1. Importuj piosenkę, przybliż i przesuń do późniejszej części.
2. Dotknij wykresu. START ma przejść w to miejsce. Przeciągnięcie tła nie zmienia zaznaczenia.
3. Wybierz 2 s, następnie 5 s: START pozostaje. Blisko końca pliku koniec jest ograniczony długością pliku.
4. W zakładce Auto włącz Magnes i przesuń uchwyt blisko wyraźnego początku dźwięku. Porównaj z magnesem wyłączonym.
5. Odsłuch/Pętla/Stop i zapis WAV. Wyjście do Gra/Ustawienia zatrzymuje odsłuch.
6. Połącz prawdziwą Orbę przez USB, potem osobno BT. Sprawdź logo i znikający napis. Samo połączenie pozostaje pasywne.

Transfer WAV/presetów do Orby nie jest wdrożony. Urządzenie i firmware nie były dostępne w środowisku testów. Testy przeglądarkowe edytora, integracji i symulowanego USB oraz testy regresji protokołu przeszły. Fizyczna Orba wymaga testu użytkownika.
