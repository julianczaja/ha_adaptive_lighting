# 0004. Zdejmowanie pauzy zależne od tego, kto zgasił światło

- Status: Przyjęta
- Data: 2026-11-23
- Decyduje: użytkownik (zgłoszony błąd), sposób naprawy Claude za zgodą

## Kontekst
Pokój wstrzymany po ręcznej zmianie wraca do adaptacji, gdy wszystkie jego światła zgasną. Automatyzacja czekała 3 s i dopiero wtedy sprawdzała, czy nic nie świeci. Użytkownik zgasił sypialnię z HA o 08:33:41 i zapalił ją o 08:33:43, więc po 3 s żarówka już świeciła i pauza została.

Opóźnienie nie było opisane, ale jest potrzebne: tryb kino („Salon: tryb kino”) przełącza scenę, w której światła salonu mogą na chwilę być wszystkie zgaszone. Natychmiastowe zdjęcie pauzy przełączyłoby salon na `on`, a kino wyłączyłoby się samo (trigger `salon_resumed`).

## Decyzja
W gałęzi `off` automatyzacji „sterowanie”:
- `trigger.to_state.context.parent_id` puste (gasi użytkownik z HA, wyłącznik, SONOFF, utrata zasilania): pauza schodzi od razu;
- `parent_id` ustawione (automatyzacja, skrypt, scena): jak dotąd po 3 s, jeśli nadal nic nie świeci;
- przy włączonym pełnym świetle pauza zostaje, bo tryby przywraca wyłączenie przełącznika.

## Odrzucone opcje
- **Zawsze od razu.** Psuje tryb kino.
- **Zdejmowanie pauzy przy ponownym zapaleniu przez użytkownika.** Stan żarówki nie pokazuje, czy zapalono ją z konkretną jasnością. „Wykrywanie” działa na `call_service` przed zmianą stanu, więc adaptacja nadpisałaby jasność wybraną przy zapalaniu.

## Konsekwencje
- Nowe automatyzacje lub sceny, które gaszą światła, dostają 3 s „spokoju” automatycznie, bo mają `parent_id`.
- Test trybu kino po tej zmianie: zgłoszony w `homelab/docs/todo.md`.
