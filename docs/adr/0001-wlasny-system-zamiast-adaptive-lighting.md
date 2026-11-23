# 0001. Własny system na automatyzacjach zamiast integracji Adaptive Lighting z HACS

- Status: Przyjęta
- Data: 2026-10-01 (początek repo), potwierdzona przeglądem 2026-11-23
- Decyduje: użytkownik

## Kontekst
Większość żarówek (7 z 10, IKEA LED2201G8) jest pod zwykłymi wyłącznikami ściennymi: bez prądu nie odbiera poleceń i po włączeniu startuje z ustawień zapisanych w żarówce. Trzy żarówki na SONOFF ZBMINIR2 są stale zasilane i można im ustawić `on_level` i barwę, zanim się zapalą. Salon ma też tryb kino i synchronizację środka salonu, które same przełączają tryb pokoju.

Pierwotny powód wyboru własnego systemu nie został zapisany. Przegląd z 2026-11-23 sprawdził alternatywę.

## Decyzja
System zostaje na zwykłych automatyzacjach, skryptach i pomocnikach HA, z bezpośrednimi publikacjami MQTT do Zigbee2MQTT (`color_temp_startup`, `current_level_startup`, `on_level`).

## Odrzucone opcje
- **Adaptive Lighting (HACS).** Ma tryb snu i wykrywanie zmian spoza HA, ale nie ustawia `on_level` zgaszonym żarówkom, nie reaguje na `device_announce` i nie zapisuje ustawień startowych żarówek pod zwykłymi wyłącznikami. Tryb kino i pauzy trzeba by przepiąć.

## Konsekwencje
- Cała logika jest w repo i trzeba ją utrzymywać samemu (`sync_ha.py`, `docs/adr`).
- Zależność od Zigbee2MQTT z bazowym tematem `zigbee2mqtt` i od atrybutów żarówek IKEA.
