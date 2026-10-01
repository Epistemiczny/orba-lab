# Orba Lab V1.1

Nieoficjalny webowy panel do Artiphon Orba 2, projektowany głównie pod Samsung S24 i Tab S7.

## Co zmieniło się po pierwszym teście na prawdziwej Orbie
- **Simple** został przebudowany jako kompaktowy ekran PERFORMANCE, który na telefonie ma mieścić się możliwie w jednym widoku bez przewijania.
- SAMPLE jest osobnym widokiem zamiast długiej sekcji pod konsolą.
- dodany automatyczny **punkt startowy** po połączeniu z Orbą i przycisk **↶ START** do przywracania ustawień,
- usunięty przełącznik głośnika z UI,
- poprawiona diagnostyka USB/Web MIDI,
- bateria jest odpytywana ponownie po połączeniu zamiast pozostawiać martwe `--%` bez próby ponownego odczytu.

## Ważne o USB MIDI
Web MIDI z SysEx wymaga bezpiecznego kontekstu. Otwieranie pliku jako `content://...` / zwykłego lokalnego pliku na Androidzie może powodować błąd `Permission to use Web MIDI API was not granted`.

**Do USB używaj wersji opublikowanej po HTTPS** (np. GitHub Pages). Bluetooth może służyć do testów lokalnych, jeśli przeglądarka na to pozwala.

## Punkt startowy / restore
Po pierwszym pełnym odczycie stanu Orby aplikacja zapamiętuje ustawienia z chwili połączenia. `↶ START` przywraca:
- aktywną część,
- haptics,
- MIDI mode / pitch bend,
- BPM, key, scale, metronom,
- Volume / Pan / Reverb / Delay / Quantize każdej części,
- presety, jeśli aplikacja potrafi jednoznacznie dopasować ich nazwy do biblioteki.

Nie rusza loopów ani sampli — to celowe, żeby przycisk nie był destrukcyjny.

## Sample Workbench
- mikrofon telefonu,
- import pliku audio,
- waveform,
- okno 1/3/5/10/20 s,
- preview / normalize / eksport WAV,
- lokalna biblioteka sampli.

Bezpośredni `SEND TO ORBA` nadal jest zablokowany do czasu odtworzenia bezpiecznego transferu plikowego starego Artiphon Connect.

## Pierwszy test V1.1
1. Otwórz stronę po HTTPS.
2. Połącz Orbę przez USB albo Bluetooth.
3. Poczekaj chwilę na synchronizację i punkt START.
4. Sprawdź, czy bateria się pojawiła. Jeśli nadal jest `?`, wejdź w Advanced → Diagnostics i zachowaj log.
5. Zmień Haptics, Volume/Reverb lub preset.
6. Kliknij `↶ START` i sprawdź, czy ustawienia wróciły.

## Źródła / credits
Patrz `THIRD_PARTY_NOTICES.md`.
