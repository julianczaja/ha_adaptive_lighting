# 0002. Sterowanie w dwóch automatyzacjach: cyklicznej i zdarzeniowej

- Status: Przyjęta
- Data: 2026-11-23
- Decyduje: użytkownik („wydłuż [ślady] na tyle, na ile potrzebujesz”)

## Kontekst
Jedna automatyzacja „sterowanie” obsługiwała zmiany celu, kontrolę co 5 min, start HA oraz zdarzenia (zapalenie, zgaszenie, `device_announce`, zmiana trybu). Okresowych przebiegów jest ok. 560 na dobę (11-20: 557, 11-21: 567, 11-22: 566), więc 30 przechowywanych śladów obejmowało 18 minut i wszystkie pochodziły z okresowych triggerów. Zdarzeń sprzed godziny nie dało się odtworzyć, np. podejrzanego samoczynnego zapalenia środka salonu 2026-11-22 19:44. Jeden ślad waży ok. 17 KB.

## Decyzja
- „Sterowanie cykliczne” (`1795000000201`): zmiana zadanych wartości, co 5 min, start HA; 10 śladów.
- „Sterowanie” (`1780307109863`): zdarzenia, południe, pełne światło; 100 śladów.

## Odrzucone opcje
- **Więcej śladów w jednej automatyzacji.** Pokrycie doby wymagałoby ok. 700 śladów, czyli ok. 12 MB w pamięci HA i przy zapisie na dysk.

## Konsekwencje
- Trzecia kopia listy `bulbs` (patrz 0003).
- Ślady „wykrywania ręcznych zmian” nadal obejmują tylko minuty, bo uruchamia je każde `light.turn_on`, także własnych skryptów. Historię pauz pokazuje historia `input_select`.
