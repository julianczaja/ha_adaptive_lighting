# Decyzje architektoniczne (ADR)

Tu są decyzje o budowie systemu: co z czym współpracuje i dlaczego. Nastawy (godziny, progi, wartości krzywej) i preferencje wyglądu ADR-ów nie dostają. Opisuje je `README.md` repo i dokumentacja homelabu (`homelab/docs/ha/oswietlenie.md`, sekcja „Decyzje i powody”).

Zasady:
- Plik `NNNN-krotki-tytul.md`, numery rosnące, bez luk.
- Przyjętego ADR-u nie przepisuj. Zmiana decyzji to nowy ADR ze statusem „Przyjęta”, a stary dostaje status „Zastąpiona przez NNNN”.
- Status: Proponowana, Przyjęta, Zastąpiona przez NNNN, Wycofana.

| Nr | Decyzja | Status |
|---|---|---|
| [0001](0001-wlasny-system-zamiast-adaptive-lighting.md) | Własny system na automatyzacjach zamiast integracji Adaptive Lighting z HACS | Przyjęta |
| [0002](0002-sterowanie-cykliczne-i-zdarzeniowe.md) | Sterowanie w dwóch automatyzacjach: cyklicznej i zdarzeniowej | Przyjęta |
| [0003](0003-lista-bulbs-w-kopiach.md) | Lista `bulbs` w kopiach w automatyzacjach, synchronizacja tylko przez REST | Przyjęta, do ponownej oceny |
| [0004](0004-zdejmowanie-pauzy-wg-kontekstu.md) | Zdejmowanie pauzy zależne od tego, kto zgasił światło | Przyjęta |

## Szablon

```markdown
# NNNN. Tytuł

- Status: Przyjęta
- Data: RRRR-MM-DD
- Decyduje: użytkownik / Claude za zgodą użytkownika

## Kontekst
Problem i ograniczenia, z liczbami lub dowodami.

## Decyzja
Co robimy.

## Odrzucone opcje
Co jeszcze rozważano i dlaczego nie.

## Konsekwencje
Co z tego wynika, także minusy i rzeczy, których odtąd pilnować.
```
