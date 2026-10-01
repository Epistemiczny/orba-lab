# Orba Lab V1.2

Nieoficjalny panel do Orba 2. Strona: https://epistemiczny.github.io/orba-lab/

## Interfejs
Gra / Sample / Ustawienia. Dotykowe pokrętła z pierścieniem wartości: przeciągaj w górę lub w dół. Klawiatura: strzałki na aktywnym pokrętle. Telefon w pionie: mikser nad looperem, naturalne przewijanie bez przycinania. Wzorcem podziału pracy są Ableton Note i OP-1; aplikacja nie kopiuje ich funkcji.

## Połączenie i diagnostyka
Samo połączenie USB/Bluetooth jest pasywne i nie wysyła poleceń. Kliknij Odczyt, aby pobrać stan. Transmisje są kolejkowane; pełne odczyty nie nakładają się. Przy rozłączeniu czyszczone są stan baterii i punkt przywracania. Odrzucane są odpowiedzi z błędnym CRC i nieznany format baterii. Brak odczytu oznacza —, nigdy domyślne 100%.

Przywracanie jest dostępne dopiero po odczycie wymaganych parametrów. Nie kasuje loopów ani sampli. Przyciskiem w Ustawieniach można świadomie włączyć głośnik; aplikacja nie robi tego automatycznie.

## Test na urządzeniu
1. Zamknij Artiphon Connect i inne aplikacje MIDI.
2. Włącz Orbę i sprawdź jej dźwięk bez kabla.
3. Podepnij kabel bez klikania USB w przeglądarce. Sprawdź dźwięk.
4. Kliknij USB, sprawdź dźwięk. Samo połączenie powinno pozostawić log bez TX.
5. Kliknij Odczyt, sprawdź dźwięk oraz baterię.
6. Przy problemie: Ustawienia → Zapisz log. Zanotuj, na którym kroku wystąpił.
7. Rozłącz, odłącz kabel i przetestuj Bluetooth osobno.

Przyczyna zgłoszonej ciszy po USB nie została potwierdzona na fizycznym urządzeniu. Zmiany transportu i walidacji wymagają testu sprzętowego. Transfer sampli nadal zablokowany; sample są lokalne.

## Źródła
- https://www.ableton.com/en/note/manual/
- https://teenage.engineering/guides/op-1
- https://github.com/holofermes/orba-protocol/blob/main/spec/SPEC.md
- THIRD_PARTY_NOTICES.md
