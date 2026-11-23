# 0003. Lista `bulbs` w kopiach w automatyzacjach, synchronizacja tylko przez REST

- Status: Przyjęta, do ponownej oceny (użytkownik jeszcze nie zdecydował, 2026-11-23)
- Data: 2026-11-23
- Decyduje: Claude, do potwierdzenia przez użytkownika

## Kontekst
Lista żarówek jest w trzech automatyzacjach: „sterowanie”, „sterowanie cykliczne” i „wykrywanie ręcznych zmian”. Repo już trzy razy rozjechało się z HA. Przegląd 2026-11-23 zaproponował jedną listę jako makro w `/config/custom_templates`.

`sync_ha.py` porównuje i wysyła elementy wyłącznie przez REST API HA (token, bez SSH). Pliki z `custom_templates` nie są dostępne przez to API.

## Decyzja
Kopie zostają. `sync_ha.py` sprawdza, czy wszystkie listy są zgodne (pary `entity` / `switch` wszędzie, pełne wpisy w „sterowaniu cyklicznym”). Krzywe zostają w dwóch szablonach sensorów, bo generuje je konfigurator.

## Odrzucone opcje
- **Makro w `custom_templates`.** Jedno źródło listy, ale `sync_ha.py` przestałby widzieć listę. Wykonalne po przerobieniu `sync_ha.py` na dostęp przez `ssh pve` i `qm guest exec`. To nowa zależność, poza tokenem.

## Konsekwencje
- Dodanie żarówki wymaga zmiany trzech list oraz triggerów `fresh` i `off`; instrukcja w `README.md`.
- Jeśli użytkownik wybierze jedną listę: nowy ADR zastępujący ten, przeróbka `sync_ha.py` i test importu makra w `variables` automatyzacji (`POST /api/template`).
