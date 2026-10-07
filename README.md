# Adaptive Lighting dla Home Assistant

Oświetlenie, które przez całą dobę podąża za słońcem: rano się rozjaśnia i ochładza barwę,
w dzień świeci jasno i neutralnie, a wieczorem stopniowo ciemnieje i robi się ciepłe.
Każdy pokój ma własny przełącznik, a ręczna zmiana jasności lub barwy wstrzymuje
automatykę w danym pokoju.

System działa na zwykłych automatyzacjach, skryptach i pomocnikach Home Assistant,
bez dodatkowych integracji. Jest dopasowany do żarówek IKEA TRÅDFRI w Zigbee2MQTT,
także tych podłączonych pod zwykłe (niesmart) wyłączniki ścienne.

**Konfigurator krzywych:** https://julianczaja.github.io/ha_adaptive_lighting/

## Jak to działa

### Zadane wartości

Dwa pomocniki typu template liczą, jaka jasność (%) i temperatura barwowa (K)
powinny być w danej chwili. Bazują na godzinach wschodu i zachodu z `sun.sun`,
z opcjonalnym przesunięciem. Przejścia między nocą a dniem są płynne (funkcja smoothstep).

| Pomocnik | Wartość |
|---|---|
| `sensor.zadana_jasnosc_swiatla` | jasność w %, od `min_b` w nocy do `max_b` w dzień |
| `sensor.zadana_temperatura_swiatla` | barwa w K, od `min_t` w nocy do `max_t` w dzień |

Parametry krzywych najwygodniej dobrać w konfiguratorze. Wygenerowany kod wkleja się
do pomocników bez zmian.

### Sterowanie

Automatyzacja **sterowanie** reaguje na kilka zdarzeń:

| Zdarzenie | Co robi |
|---|---|
| zmiana zadanych wartości, co 5 min, start HA (po 30 s) | skrypt **uzgodnij** ustawia zadane wartości świecącym żarówkom w pokojach w trybie `on`. Zgaszonym żarówkom na smart switchach zapisuje barwę i poziom włączenia (`on_level`), żeby zapaliły się od razu z właściwym światłem |
| zapalenie żarówki (zmiana stanu albo `device_announce` z Z2M po podaniu zasilania) | skrypt **świeżo zapalona żarówka** dopasowuje ją po 0,5 s i ponownie po 3 s |
| zmiana trybu pokoju | przy przełączeniu na `on` od razu dopasowuje światło. Przy przełączeniu na `off` przywraca żarówkom na smart switchach poziom włączenia „jak ostatnio” |
| zgaszenie wszystkich świateł w pokoju | po 3 s zdejmuje pauzę, jeśli żadna żarówka w pokoju już nie świeci |

Polecenia są wysyłane tylko wtedy, gdy żarówka odbiega od celu: o co najmniej 30 K albo 3/255 jasności.

### Tryb pokoju

Każdy pokój ma pomocnik `input_select.oswietlenie_adaptacyjne_<pokój>` z opcjami:

| Stan | Znaczenie |
|---|---|
| `on` | adaptacja aktywna |
| `off` | adaptacja wyłączona – pokój jest ignorowany |
| `paused` | wstrzymana po ręcznej zmianie światła |

Automatyzacja **wykrywanie ręcznych zmian** obserwuje wywołania `light.turn_on`
(z panelu, aplikacji, asystenta głosowego, scen i innych automatyzacji). Jeśli jasność
lub barwa różni się od zadanej, wstrzymuje pokoje, których żarówki były celem.
Pauzę zdejmuje zgaszenie wszystkich świateł w pokoju albo użycie fizycznego wyłącznika.

### Żarówki pod zwykłymi wyłącznikami

Żarówka zasilana przez zwykły wyłącznik nie odbiera poleceń, dopóki jest bez prądu, więc po
włączeniu startuje z zapisanymi w niej ustawieniami startowymi. Są one ustawione na „jak ostatnio”
(`previous`). Gdy żarówka świeci, automatyka stale trzyma ją przy zadanych wartościach, dlatego
po ponownym włączeniu od razu świeci tak, jak zadano w chwili jej zgaszenia. Skrypt
**świeżo zapalona żarówka** koryguje tylko różnicę, która narosła od tamtej pory.

Zwykle ta różnica jest niewielka. Duża zdarza się wtedy, gdy żarówka była długo zgaszona,
a krzywa w tym czasie mocno się zmieniła, np. ostatnio świeciła po południu, a zapalasz ją w nocy.
Wtedy przez 1–2 s świeci jasno i neutralnie, zanim przyjdzie korekta.

Takie żarówki są oznaczone na liście `bulbs` jako `dumb: true`.

Żarówki na stałym zasilaniu (`dumb: false`) są sterowane przez SONOFF ZBMINIR2 z bindingiem
Zigbee, więc słuchają poleceń także wtedy, gdy są zgaszone.

### Obecna instalacja

| Pokój | Żarówki | Zasilanie |
|---|---|---|
| sypialnia | `light.sypialnia` | smart switch |
| salon | `light.salon_srodek_okno`, `light.salon_srodek_wejscie` | smart switch |
| salon | `light.salon_kanapa_stol`, `light.salon_kanapa_srodek`, `light.salon_kanapa_sciana` | zwykły wyłącznik |
| łazienka | `light.lazienka` | zwykły wyłącznik |
| korytarz | `light.korytarz` | zwykły wyłącznik |
| mały pokój | `light.maly_pokoj` | zwykły wyłącznik |
| kuchnia | `light.kuchnia_wejscie` | zwykły wyłącznik |

## Pliki

| Plik | Element w Home Assistant |
|---|---|
| `automatyzacja_adaptive_lighting_wielopokojowa.yaml` | automatyzacja „Oświetlenie adaptacyjne: sterowanie” |
| `automatyzacja_adaptive_lighting_wykrywanie_recznych_zmian.yaml` | automatyzacja „Oświetlenie adaptacyjne: wykrywanie ręcznych zmian” |
| `skrypt_adaptive_lighting_uzgodnij.yaml` | `script.oswietlenie_adaptacyjne_uzgodnij` |
| `skrypt_adaptive_lighting_swieza_zarowka.yaml` | `script.oswietlenie_adaptacyjne_swieza_zarowka` |
| `sensor_zadana_jasnosc.jinja` | szablon pomocnika `sensor.zadana_jasnosc_swiatla` |
| `sensor_zadana_temperatura.jinja` | szablon pomocnika `sensor.zadana_temperatura_swiatla` |
| `index.html`, `konfigurator.js`, `konfigurator.css` | konfigurator krzywych (GitHub Pages) |
| `automatyzacja_adaptive_lighting.yaml` | pierwsza, jednopokojowa wersja – nieużywana, zostawiona dla historii |

Źródłem prawdy jest konfiguracja w Home Assistant. Pliki YAML to jej eksport: po każdej
zmianie w HA skopiuj YAML z edytora automatyzacji lub skryptu do odpowiedniego pliku
i zrób commit.

## Instalacja

Wymagania: Home Assistant 2024.10 lub nowszy (składnia `triggers:` / `actions:`)
i Zigbee2MQTT z bazowym tematem `zigbee2mqtt`. Skrypty wysyłają ustawienia startowe
bezpośrednio na `zigbee2mqtt/<friendly_name>/set`. Atrybuty `color_temp_startup`
i `level_config` są obsługiwane przez żarówki IKEA TRÅDFRI.

1. **Pomocniki zadanych wartości.** *Ustawienia → Urządzenia i usługi → Pomocnicy →
   Utwórz pomocnika → Szablon → Czujnik*. Utwórz „Zadana jasność światła” (jednostka `%`)
   i „Zadana temperatura światła” (jednostka `K`) z kodem z plików `.jinja`
   albo z konfiguratora.
2. **Przełączniki pokoi.** Dla każdego pokoju utwórz pomocnik typu `input_select`
   o identyfikatorze `oswietlenie_adaptacyjne_<pokój>` z opcjami `on`, `off`, `paused`.
3. **Skrypty.** Utwórz dwa skrypty w edytorze YAML z plików `skrypt_*.yaml`.
   Identyfikatory muszą brzmieć `oswietlenie_adaptacyjne_uzgodnij`
   i `oswietlenie_adaptacyjne_swieza_zarowka`.
4. **Automatyzacje.** Utwórz obie automatyzacje w edytorze YAML z plików `automatyzacja_*.yaml`
   i uzupełnij listę `bulbs` swoimi żarówkami.

## Dodawanie żarówki lub pokoju

Lista żarówek `bulbs` występuje w obu automatyzacjach i musi być w nich taka sama:

```yaml
- entity: light.salon_kanapa_stol                  # encja światła
  switch: input_select.oswietlenie_adaptacyjne_salon  # przełącznik pokoju
  z2m: salon_kanapa_stol                           # friendly_name w Zigbee2MQTT
  dumb: true                                       # pod zwykłym wyłącznikiem
```

1. Dopisz żarówkę do `bulbs` w obu automatyzacjach. W automatyzacji „wykrywanie ręcznych zmian”
   wystarczą pola `entity` i `switch`.
2. W automatyzacji „sterowanie” dopisz encję światła do triggerów `fresh` i `off`.
3. Nowy pokój: utwórz jego `input_select` i dopisz go do triggera `mode`.

Po zmianie `friendly_name` urządzenia w Zigbee2MQTT zaktualizuj pole `z2m`.

## Konfigurator

Konfigurator to statyczna strona do strojenia krzywych jasności i barwy:

- podgląd przebiegu doby z symulacją koloru i jasności światła oraz dwoma wykresami,
- godziny wschodu i zachodu liczone dla podanej lokalizacji (algorytm NOAA, tak jak w HA)
  i przesunięcia do ±2 h,
- godziny poszczególnych faz i aktualne wartości,
- gotowe szablony Jinja do skopiowania.

Krzywe w podglądzie są liczone dokładnie tym samym wzorem co szablony, więc wykres pokazuje
to samo, co potem zwracają pomocniki w Home Assistant. Strona działa pod adresem
https://julianczaja.github.io/ha_adaptive_lighting/ albo lokalnie po otwarciu `index.html`.
