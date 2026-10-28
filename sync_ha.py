#!/usr/bin/env python3
"""Synchronizacja plików repo z konfiguracją oświetlenia adaptacyjnego w Home Assistant.

Użycie:
  python3 sync_ha.py                 porównaj repo z HA (nic nie zmienia)
  python3 sync_ha.py pull            zapisz stan z HA do plików w repo
  python3 sync_ha.py push [nazwa…]   wyślij pliki z repo do HA (pyta o potwierdzenie)

Nazwy elementów: sterowanie, wykrywanie, uzgodnij, swieza_zarowka, jasnosc, temperatura.
Bez nazw polecenie dotyczy wszystkich. Przy push opcja -y pomija pytanie.

Adres HA: zmienna HA_URL (domyślnie http://homeassistant.local:8123).
Token: zmienna HA_TOKEN albo plik ~/.config/ha/token.
Wymaga PyYAML (pakiet python3-yaml).

Kody wyjścia: 0 – zgodne lub zapisane, 1 – są różnice, 2 – błąd.
"""

import difflib
import json
import os
import sys
import urllib.error
import urllib.request
from pathlib import Path

import yaml

REPO = Path(__file__).resolve().parent
HA_URL = os.environ.get('HA_URL', 'http://homeassistant.local:8123').rstrip('/')

# Element systemu: plik w repo i to, gdzie leży w HA
ITEMS = {
    'sterowanie': {'file': 'automatyzacja_adaptive_lighting_wielopokojowa.yaml',
                   'kind': 'automation', 'id': '1780307109863'},
    'wykrywanie': {'file': 'automatyzacja_adaptive_lighting_wykrywanie_recznych_zmian.yaml',
                   'kind': 'automation', 'id': '1790900000001'},
    'uzgodnij': {'file': 'skrypt_adaptive_lighting_uzgodnij.yaml',
                 'kind': 'script', 'id': 'oswietlenie_adaptacyjne_uzgodnij'},
    'swieza_zarowka': {'file': 'skrypt_adaptive_lighting_swieza_zarowka.yaml',
                       'kind': 'script', 'id': 'oswietlenie_adaptacyjne_swieza_zarowka'},
    'jasnosc': {'file': 'sensor_zadana_jasnosc.jinja',
                'kind': 'template', 'id': '01KRZR0PWTPHX3C5FB5QQSWMCH'},
    'temperatura': {'file': 'sensor_zadana_temperatura.jinja',
                    'kind': 'template', 'id': '01KRZR37PCGSEKB1M8ATSFT11A'},
}


class SyncError(Exception):
    pass


# ── HA API ───────────────────────────────────────────────
def token():
    t = os.environ.get('HA_TOKEN')
    if t:
        return t.strip()
    path = Path.home() / '.config' / 'ha' / 'token'
    try:
        return path.read_text().strip()
    except OSError:
        raise SyncError(f'brak tokenu: ustaw HA_TOKEN albo zapisz go w {path}')


def api(method, path, body=None):
    req = urllib.request.Request(
        HA_URL + path, method=method,
        data=None if body is None else json.dumps(body).encode(),
        headers={'Authorization': 'Bearer ' + token(), 'Content-Type': 'application/json'},
    )
    try:
        with urllib.request.urlopen(req, timeout=20) as r:
            raw = r.read()
    except urllib.error.HTTPError as e:
        raise SyncError(f'{method} {path}: HTTP {e.code} {e.read().decode(errors="replace")[:300]}')
    except urllib.error.URLError as e:
        raise SyncError(f'brak połączenia z {HA_URL}: {e.reason}')
    return json.loads(raw) if raw else None


def config_path(item):
    return f"/api/config/{item['kind']}/config/{item['id']}"


def open_options_flow(item):
    """Otwiera options flow pomocnika template. Zwraca (flow_id, bieżące wartości pól)."""
    flow = api('POST', '/api/config/config_entries/options/flow', {'handler': item['id']})
    values = {}
    for field in flow.get('data_schema', []):
        v = (field.get('description') or {}).get('suggested_value')
        if v is not None:
            values[field['name']] = v
    if 'state' not in values:
        api('DELETE', f"/api/config/config_entries/options/flow/{flow['flow_id']}")
        raise SyncError(f"pomocnik {item['id']}: options flow nie zwrócił szablonu")
    return flow['flow_id'], values


def ha_read(item):
    """Treść elementu w HA: dict dla automatyzacji i skryptów, tekst dla szablonów."""
    if item['kind'] == 'template':
        flow_id, values = open_options_flow(item)
        api('DELETE', f'/api/config/config_entries/options/flow/{flow_id}')
        return values['state']
    cfg = api('GET', config_path(item))
    cfg.pop('id', None)
    return cfg


def ha_write(item, content):
    if item['kind'] == 'template':
        flow_id, values = open_options_flow(item)
        values['state'] = content
        res = api('POST', f'/api/config/config_entries/options/flow/{flow_id}', values)
        if res.get('type') != 'create_entry':
            raise SyncError(f"pomocnik {item['id']}: HA odrzucił zapis: {res.get('errors')}")
        return
    body = dict(content)
    if item['kind'] == 'automation':
        body['id'] = item['id']
    api('POST', config_path(item), body)


# ── Pliki w repo ─────────────────────────────────────────
class Dumper(yaml.SafeDumper):
    pass


# Wielolinijkowe teksty jako bloki „|”, tak jak w edytorze YAML w HA
Dumper.add_representer(str, lambda d, v: d.represent_scalar(
    'tag:yaml.org,2002:str', v, style='|' if '\n' in v else None))


def to_yaml(data):
    return yaml.dump(data, Dumper=Dumper, allow_unicode=True, sort_keys=False, width=110)


def split_header(text):
    """Nagłówek z komentarzy na początku pliku i treść YAML."""
    lines = text.splitlines(keepends=True)
    i = 0
    while i < len(lines) and (lines[i].startswith('#') or not lines[i].strip()):
        i += 1
    return ''.join(lines[:i]), ''.join(lines[i:])


def repo_read(item):
    text = (REPO / item['file']).read_text()
    if item['kind'] == 'template':
        return text
    return yaml.safe_load(split_header(text)[1])


def repo_write(item, content):
    path = REPO / item['file']
    if item['kind'] == 'template':
        path.write_text(content)
        return
    header = split_header(path.read_text())[0] if path.exists() else ''
    path.write_text(header + to_yaml(content))


# ── Porównanie ───────────────────────────────────────────
def as_lines(item, content):
    return (content if item['kind'] == 'template' else to_yaml(content)).splitlines()


def diff(name, item, repo, ha):
    """Różnice repo → HA jako linie unified diff; pusta lista, gdy zgodne."""
    if repo == ha:
        return []
    return list(difflib.unified_diff(
        as_lines(item, repo), as_lines(item, ha),
        f"repo/{item['file']}", f'HA/{name}', lineterm=''))


def check_bulbs(repo):
    """Listy bulbs w obu automatyzacjach muszą mieć te same pary entity/switch."""
    pairs = {}
    for name in ('sterowanie', 'wykrywanie'):
        bulbs = (repo[name].get('variables') or {}).get('bulbs') or []
        pairs[name] = [(b.get('entity'), b.get('switch')) for b in bulbs]
    if pairs['sterowanie'] != pairs['wykrywanie']:
        a, b = set(pairs['sterowanie']), set(pairs['wykrywanie'])
        print('UWAGA: listy bulbs w automatyzacjach sterowanie i wykrywanie się różnią')
        for e, s in sorted(a - b):
            print(f'  tylko w sterowaniu: {e} ({s})')
        for e, s in sorted(b - a):
            print(f'  tylko w wykrywaniu: {e} ({s})')
        if a == b:
            print('  te same żarówki, inna kolejność')
        return False
    return True


# ── Polecenia ────────────────────────────────────────────
def pick(names):
    unknown = [n for n in names if n not in ITEMS]
    if unknown:
        raise SyncError(f"nieznane elementy: {', '.join(unknown)}. Dostępne: {', '.join(ITEMS)}")
    return names or list(ITEMS)


def cmd_diff(names):
    changed = False
    for name in names:
        item = ITEMS[name]
        d = diff(name, item, repo_read(item), ha_read(item))
        print(f"{'RÓŻNE   ' if d else 'zgodne  '} {name:15} {item['file']}")
        if d:
            changed = True
            print('\n'.join(d))
    if {'sterowanie', 'wykrywanie'} <= set(names):
        ok = check_bulbs({n: repo_read(ITEMS[n]) for n in ('sterowanie', 'wykrywanie')})
        changed = changed or not ok
    return 1 if changed else 0


def cmd_pull(names):
    for name in names:
        item = ITEMS[name]
        ha = ha_read(item)
        if repo_read(item) == ha:
            print(f"bez zmian  {item['file']}")
        else:
            repo_write(item, ha)
            print(f"zapisany   {item['file']}")
    print('Sprawdź zmiany przez git diff i zrób commit.')
    return 0


def cmd_push(names, assume_yes):
    todo = []
    for name in names:
        item = ITEMS[name]
        repo, ha = repo_read(item), ha_read(item)
        # Przy push pokazujemy zmianę z perspektywy HA: co zniknie, co dojdzie
        d = list(difflib.unified_diff(as_lines(item, ha), as_lines(item, repo),
                                      f'HA/{name}', f"repo/{item['file']}", lineterm=''))
        if d:
            todo.append((name, item, repo))
            print('\n'.join(d))
    if not todo:
        print('HA jest zgodny z repo, nie ma czego wysyłać.')
        return 0
    print(f"\nDo wysłania: {', '.join(n for n, _, _ in todo)}")
    if not assume_yes and input('Wysłać do HA? [t/N] ').strip().lower() not in ('t', 'tak', 'y', 'yes'):
        print('Przerwano, nic nie wysłano.')
        return 1
    for name, item, repo in todo:
        ha_write(item, repo)
        ok = ha_read(item) == repo
        print(f"{'wysłany ' if ok else 'BŁĄD    '} {name}" + ('' if ok else ': HA ma inną treść niż repo po zapisie'))
        if not ok:
            return 2
    return 0


def main(argv):
    args = [a for a in argv if a not in ('-y', '--yes')]
    assume_yes = len(args) != len(argv)
    if args and args[0] in ('-h', '--help'):
        print(__doc__.strip())
        return 0
    cmd = args[0] if args and args[0] in ('diff', 'pull', 'push') else 'diff'
    names = pick(args[1:] if args and args[0] == cmd else args)
    if cmd == 'pull':
        return cmd_pull(names)
    if cmd == 'push':
        return cmd_push(names, assume_yes)
    return cmd_diff(names)


if __name__ == '__main__':
    try:
        sys.exit(main(sys.argv[1:]))
    except SyncError as e:
        print(f'Błąd: {e}', file=sys.stderr)
        sys.exit(2)
    except KeyboardInterrupt:
        sys.exit(1)
