# Orba Lab — plan projektu po teście V1

## Kierunek UX
Nie kopiujemy starego Artiphon Connect. Robimy **mały groovebox / control surface**:
- **Simple / PERFORMANCE** — jeden kompaktowy ekran do grania,
- **Simple / SAMPLE** — osobny ekran nagrywania i importu audio,
- **Advanced** — techniczne ustawienia i diagnostyka.

## V1.1 — aktualny build
- kompaktowy PERFORMANCE pod S24,
- osobny widok SAMPLE,
- USB/BLE,
- Drum/Bass/Chord/Lead + presety,
- looper + BPM + metronom,
- mixer Volume/Reverb/Delay (+Pan Advanced),
- Haptics on/off,
- automatyczny punkt startowy + `↶ START`,
- ponowne odpytanie baterii po połączeniu,
- ostrzeżenie o lokalnym `content://` i wymaganiu HTTPS dla Web MIDI/SysEx,
- sample recorder/import + waveform + lokalna biblioteka.

## V1.2 — stabilizacja sprzętowa
- test realnego odczytu Battery % na Orba 2,
- dopracowanie USB na wersji HTTPS,
- lepszy status transportu/record,
- favorites i recent presets,
- snapshoty/sceny użytkownika A/B/C poza automatycznym START,
- test layoutu Tab S7 landscape jako większa konsola.

## V1.3 — transfer sampli
- rozpracowanie `SampleRecordController`, `SampleImporter`, `queueFileWrite`, `queueAssignMediaToSlot`,
- WAV/sample pool + `.artipreset`,
- przypisanie do slotu/pada,
- `SEND TO ORBA` po USB,
- lista sampli zapisanych w urządzeniu.

## V2 — Motion / Gesture Lab
- live expression monitor,
- Bump / Shake / Tilt / Radiate / Vibrato,
- krzywe i progi tylko tam, gdzie są potwierdzone,
- profile ruchowe pod sposób grania użytkownika.

## V3 — Android native
Tylko jeśli browser API będzie blokować potrzebny dostęp USB/file-transfer:
- ten sam UI,
- natywna warstwa USB,
- opcjonalny wrapper/PWA → APK.

## Zasady
- brak blind-scan rejestrów,
- brak DFU/firmware,
- restore START nie kasuje loopów/sampli,
- transfer sampli dopiero po pełnym potwierdzeniu protokołu.
