/* ═══════════════════════════════════════════════════════════
   Adaptive Lighting Konfigurator – logika
   Krzywe liczone dokładnie tak jak szablony Jinja w Home Assistant
   ═══════════════════════════════════════════════════════════ */

const $ = (id) => document.getElementById(id);

// ── Parametry: [suwak, pole liczbowe, klucz, wartość domyślna] ──
const paramDefs = [
  ['min_b', 'min_b_val', 'min_b', 20],
  ['max_b', 'max_b_val', 'max_b', 100],
  ['dawn_min_b', 'dawn_min_b_val', 'dawn_min_b', 60],
  ['dusk_min_b', 'dusk_min_b_val', 'dusk_min_b', 80],
  ['dusk_offset_b', 'dusk_offset_b_val', 'dusk_offset_b', 40],
  ['min_t', 'min_t_val', 'min_t', 2200],
  ['max_t', 'max_t_val', 'max_t', 4000],
  ['dawn_min_t', 'dawn_min_t_val', 'dawn_min_t', 30],
  ['dusk_offset_t', 'dusk_offset_t_val', 'dusk_offset_t', 45],
  ['dusk_min_t', 'dusk_min_t_val', 'dusk_min_t', 60],
];
const params = {};

const DEFAULT_LOCATION = { lat: 53.1235, lng: 18.0084, name: 'Bydgoszcz' };

// ── Czas ────────────────────────────────────────────────
// Czas 24 h: przyjmuje „6:51”, „06.51”, „651”, „6” – zwraca godziny albo null
function parseTime(str) {
  const s = String(str || '').trim().replace(/[.,;\s]/g, ':');
  let h, m, mm;
  if ((mm = /^(\d{1,2}):(\d{1,2})$/.exec(s))) { h = +mm[1]; m = +mm[2]; }
  else if (/^\d{3,4}$/.test(s)) { h = +s.slice(0, -2); m = +s.slice(-2); }
  else if (/^\d{1,2}$/.test(s)) { h = +s; m = 0; }
  else return null;
  return h < 24 && m < 60 ? h + m / 60 : null;
}
function timeToHours(str, fallback) {
  const h = parseTime(str);
  return h === null ? fallback : h;
}
function hhmm(h) {
  const t = ((Math.round(h * 60) % 1440) + 1440) % 1440;
  return String(Math.floor(t / 60)).padStart(2, '0') + ':' + String(t % 60).padStart(2, '0');
}
function fmtTime(h) {
  if (h >= 24) return hhmm(h) + ' (+1 d)';
  if (h < 0) return hhmm(h) + ' (−1 d)';
  return hhmm(h);
}
function nowHours() {
  const d = new Date();
  return d.getHours() + d.getMinutes() / 60;
}

const offsetMin = (id) => Number($(id).value) || 0;
const sunriseH = () => timeToHours($('sunrise').value, 6) + offsetMin('sunrise_offset') / 60;
const sunsetH = () => timeToHours($('sunset').value, 20) + offsetMin('sunset_offset') / 60;

// ── Krzywe (ta sama logika i kolejność warunków co w Jinja) ──
const smoothstep = (x) => (3 - 2 * x) * x * x;

function channels(p) {
  const sr = sunriseH(), ss = sunsetH();
  const tDuskStart = ss - p.dusk_offset_t / 60;
  return {
    b: {
      lo: p.min_b, hi: p.max_b,
      rise: [sr, sr + p.dawn_min_b / 60],
      // jasność: od dusk_offset przed zachodem do dusk_dur po zachodzie
      fall: [ss - p.dusk_offset_b / 60, ss + p.dusk_min_b / 60],
      names: ['Rozjaśnianie', 'Ściemnianie'],
      unit: ' %',
    },
    t: {
      lo: p.min_t, hi: p.max_t,
      rise: [sr, sr + p.dawn_min_t / 60],
      // temperatura: start dusk_offset przed zachodem, trwa dusk_dur
      fall: [tDuskStart, tDuskStart + p.dusk_min_t / 60],
      names: ['Ochładzanie', 'Ocieplanie'],
      unit: ' K',
    },
  };
}

// `| int` w Jinja obcina część ułamkową – stąd Math.trunc
function valueAt(h, c) {
  const [r0, r1] = c.rise, [f0, f1] = c.fall;
  if (h < r0) return c.lo;
  if (h <= r1) return r1 === r0 ? c.hi : Math.trunc(c.lo + (c.hi - c.lo) * smoothstep((h - r0) / (r1 - r0)));
  if (h < f0) return c.hi;
  if (h <= f1) return f1 === f0 ? c.lo : Math.trunc(c.hi - (c.hi - c.lo) * smoothstep((h - f0) / (f1 - f0)));
  return c.lo;
}
function phaseAt(h, c) {
  if (h < c.rise[0]) return 'noc';
  if (h <= c.rise[1]) return c.names[0].toLowerCase();
  if (h < c.fall[0]) return 'dzień';
  if (h <= c.fall[1]) return c.names[1].toLowerCase();
  return 'noc';
}

// ── Słońce: algorytm NOAA, zenit 90,833° (refrakcja + promień tarczy, jak w HA) ──
const RAD = Math.PI / 180, DEG = 180 / Math.PI;

function julianDay(y, m, d) {
  if (m <= 2) { y -= 1; m += 12; }
  const A = Math.floor(y / 100), B = 2 - A + Math.floor(A / 4);
  return Math.floor(365.25 * (y + 4716)) + Math.floor(30.6001 * (m + 1)) + d + B - 1524.5;
}

function solarPosition(t) {
  const L0 = (280.46646 + t * (36000.76983 + t * 0.0003032)) % 360;
  const M = 357.52911 + t * (35999.05029 - 0.0001537 * t);
  const e = 0.016708634 - t * (0.000042037 + 0.0000001267 * t);
  const C = Math.sin(M * RAD) * (1.914602 - t * (0.004817 + 0.000014 * t))
    + Math.sin(2 * M * RAD) * (0.019993 - 0.000101 * t)
    + Math.sin(3 * M * RAD) * 0.000289;
  const omega = 125.04 - 1934.136 * t;
  const lambda = L0 + C - 0.00569 - 0.00478 * Math.sin(omega * RAD);
  const eps0 = 23 + (26 + (21.448 - t * (46.815 + t * (0.00059 - t * 0.001813))) / 60) / 60;
  const eps = eps0 + 0.00256 * Math.cos(omega * RAD);
  const decl = Math.asin(Math.sin(eps * RAD) * Math.sin(lambda * RAD));
  const y = Math.tan((eps * RAD) / 2) ** 2;
  const eqTime = 4 * DEG * (y * Math.sin(2 * L0 * RAD) - 2 * e * Math.sin(M * RAD)
    + 4 * e * y * Math.sin(M * RAD) * Math.cos(2 * L0 * RAD)
    - 0.5 * y * y * Math.sin(4 * L0 * RAD) - 1.25 * e * e * Math.sin(2 * M * RAD));
  return { decl, eqTime };
}

// Minuty od północy UTC; null – tego dnia słońce nie wschodzi / nie zachodzi
function sunEventUTC(rising, jd0, lat, lng) {
  let minutes = 720;
  for (let i = 0; i < 3; i++) {
    const { decl, eqTime } = solarPosition((jd0 + minutes / 1440 - 2451545) / 36525);
    const cosH = Math.cos(90.833 * RAD) / (Math.cos(lat * RAD) * Math.cos(decl))
      - Math.tan(lat * RAD) * Math.tan(decl);
    if (cosH < -1 || cosH > 1) return null;
    const H = Math.acos(cosH) * DEG * (rising ? 1 : -1);
    minutes = 720 - 4 * (lng + H) - eqTime;
  }
  return minutes;
}

function sunTimes(lat, lng, date) {
  const y = date.getFullYear(), m = date.getMonth() + 1, d = date.getDate();
  const jd0 = julianDay(y, m, d);
  const toLocal = (min) => {
    if (min === null) return null;
    const t = new Date(Date.UTC(y, m - 1, d) + min * 60000);
    return t.getHours() + t.getMinutes() / 60 + t.getSeconds() / 3600;
  };
  return { sunrise: toLocal(sunEventUTC(true, jd0, lat, lng)), sunset: toLocal(sunEventUTC(false, jd0, lat, lng)) };
}

// ── Kelwiny → RGB (przybliżenie ciała doskonale czarnego) ──
function kelvinToRgb(k) {
  const kk = k / 100;
  let r, g, b;
  if (kk <= 66) {
    r = 255;
    g = 99.4708025861 * Math.log(kk) - 161.1195681661;
    b = kk <= 19 ? 0 : 138.5177312231 * Math.log(kk - 10) - 305.0447927307;
  } else {
    r = 329.698727446 * Math.pow(kk - 60, -0.1332047592);
    g = 288.1221695283 * Math.pow(kk - 60, -0.0755148492);
    b = 255;
  }
  const cl = (v) => Math.max(0, Math.min(255, v));
  return [cl(r), cl(g), cl(b)];
}

// ── Motyw ───────────────────────────────────────────────
const cssVar = (name) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();
function tokens() {
  const t = {};
  ['ink', 'muted', 'faint', 'line', 'sheet', 'night', 'bri', 'temp', 'font'].forEach((k) => { t[k] = cssVar('--' + k); });
  return t;
}
function rgba(hex, a) {
  const n = parseInt(hex.replace('#', ''), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}

let themeManual = false;
function applyTheme(theme) {
  document.documentElement.dataset.theme = theme;
  const dark = theme === 'dark';
  $('btnTheme').textContent = dark ? 'Jasny motyw' : 'Ciemny motyw';
  render();
}

// ── Wykresy (dwa, wspólna oś czasu, zsynchronizowany kursor) ──
// Obszar wykresu na całą szerokość – godziny pokrywają się z pasmem doby
const GRID = { left: 0, right: 0 };
const chartB = echarts.init($('chartB'), null, { renderer: 'svg' });
const chartT = echarts.init($('chartT'), null, { renderer: 'svg' });
chartB.group = 'curves';
chartT.group = 'curves';
echarts.connect('curves');

function curveData(c) {
  const pts = [];
  for (let m = 0; m <= 1440; m++) pts.push([m / 60, valueAt(m / 60, c)]);
  return pts;
}

function chartOption({ ch, color, name, yAxis, showX, tk, nowH, nightEdges }) {
  const sr = sunriseH(), ss = sunsetH();
  const inDay = (x) => x > 0 && x < 24;
  // Linie bez etykiet – godziny wschodu, zachodu i „teraz” są opisane w paśmie doby
  const vline = (x, lineStyle) => ({ xAxis: x, symbol: 'none', lineStyle, label: { show: false } });

  const marks = [];
  if (inDay(sr)) marks.push(vline(sr, { color: tk.faint, type: 'dashed', width: 1 }));
  if (inDay(ss)) marks.push(vline(ss, { color: tk.faint, type: 'dashed', width: 1 }));
  marks.push(vline(nowH, { color: tk.ink, type: 'solid', width: 1.5 }));

  const areas = [];
  if (nightEdges[0] > 0) areas.push([{ xAxis: 0 }, { xAxis: Math.min(nightEdges[0], 24) }]);
  if (nightEdges[1] < 24) areas.push([{ xAxis: Math.max(nightEdges[1], 0) }, { xAxis: 24 }]);

  return {
    animation: false,
    textStyle: { fontFamily: tk.font },
    grid: { left: GRID.left, right: GRID.right, top: 20, bottom: showX ? 26 : 4 },
    xAxis: {
      type: 'value', min: 0, max: 24, interval: 2,
      axisLabel: {
        show: showX, color: tk.muted, fontSize: 12, formatter: (v) => `${v}:00`,
        alignMinLabel: 'left', alignMaxLabel: 'right',
      },
      axisLine: { lineStyle: { color: tk.line } },
      axisTick: { show: false },
      splitLine: { lineStyle: { color: tk.line } },
    },
    yAxis: {
      type: 'value', ...yAxis,
      axisLabel: { inside: true, color: tk.muted, fontSize: 12, verticalAlign: 'bottom', formatter: (v) => v + ch.unit },
      axisLine: { show: false }, axisTick: { show: false },
      splitLine: { lineStyle: { color: tk.line } },
    },
    tooltip: {
      trigger: 'axis',
      backgroundColor: tk.sheet, borderColor: tk.line,
      textStyle: { color: tk.ink, fontSize: 12, fontFamily: tk.font },
      axisPointer: { type: 'line', lineStyle: { color: tk.faint } },
      formatter: (ps) => `${hhmm(ps[0].value[0])}<br>${name}: <b>${ps[0].value[1]}${ch.unit}</b>`,
    },
    series: [{
      type: 'line', data: curveData(ch), showSymbol: false, clip: false,
      lineStyle: { color, width: 2 }, itemStyle: { color },
      areaStyle: {
        color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
          { offset: 0, color: rgba(color, 0.16) },
          { offset: 1, color: rgba(color, 0) },
        ]),
      },
      markLine: { silent: true, symbol: 'none', data: marks, animation: false },
      markArea: { silent: true, itemStyle: { color: tk.night }, data: areas },
    }],
  };
}

function renderCharts(ch, tk, nowH) {
  // Noc: przed wschodem i po zakończeniu obu przejść wieczornych
  const nightEdges = [sunriseH(), Math.max(ch.b.fall[1], ch.t.fall[1], sunsetH())];
  const tMin = Math.floor((ch.t.lo - 200) / 500) * 500;
  const tMax = Math.ceil((ch.t.hi + 200) / 500) * 500;
  chartB.setOption(chartOption({
    ch: ch.b, color: tk.bri, name: 'Jasność', yAxis: { min: 0, max: 100, interval: 25 },
    showX: false, tk, nowH, nightEdges,
  }), { notMerge: true });
  chartT.setOption(chartOption({
    ch: ch.t, color: tk.temp, name: 'Temperatura', yAxis: { min: tMin, max: tMax, interval: 500 },
    showX: true, tk, nowH, nightEdges,
  }), { notMerge: true });
}

// ── Pasek światła: kolor ciała czarnego × jasność ───────
function renderStrip(ch, nowH) {
  const stops = [];
  for (let m = 0; m <= 1440; m += 10) {
    const h = m / 60;
    const f = 0.12 + 0.88 * (valueAt(h, ch.b) / 100);
    const [r, g, b] = kelvinToRgb(valueAt(h, ch.t)).map((v) => Math.round(v * f));
    stops.push(`rgb(${r},${g},${b}) ${((m / 1440) * 100).toFixed(2)}%`);
  }
  $('lightStrip').style.background = `linear-gradient(90deg, ${stops.join(', ')})`;
  $('stripNow').style.left = `${(nowH / 24) * 100}%`;

  [['mkSunrise', sunriseH(), 'wschód'], ['mkSunset', sunsetH(), 'zachód']].forEach(([id, h, word]) => {
    const visible = h > 0 && h < 24;
    const pos = `${(h / 24) * 100}%`;
    $(id).style.display = visible ? '' : 'none';
    $(id).style.left = pos;
    $(id + 'Label').style.display = visible ? '' : 'none';
    $(id + 'Label').style.left = pos;
    $(id + 'Label').textContent = `${word} ${hhmm(h)}`;
  });
}

function renderScale() {
  const spans = [];
  for (let h = 0; h <= 24; h += 2) spans.push(`<span style="left:${(h / 24) * 100}%">${h}:00</span>`);
  $('bandScale').innerHTML = spans.join('');
}

// ── Fazy i wartości „teraz” ─────────────────────────────
function renderPhases(el, c) {
  const row = (name, [a, b]) => {
    const dur = Math.round((b - a) * 60);
    const time = dur ? `${fmtTime(a)}–${fmtTime(b)}` : fmtTime(a);
    return `<dt>${name}</dt><dd>${time}</dd><dd class="dur">${dur ? dur + ' min' : 'skokowo'}</dd>`;
  };
  el.innerHTML = row(c.names[0], c.rise) + row(c.names[1], c.fall);
}

function renderNow(ch, nowH) {
  $('nowTime').textContent = hhmm(nowH);
  $('nowBval').textContent = valueAt(nowH, ch.b);
  $('nowBphase').textContent = phaseAt(nowH, ch.b);
  $('nowTval').textContent = valueAt(nowH, ch.t);
  $('nowTphase').textContent = phaseAt(nowH, ch.t);
}

// ── Kod Jinja (treść identyczna z szablonami używanymi w HA) ──
function generateCode() {
  const p = params;
  const sro = $('sunrise_offset').value || '0';
  const sso = $('sunset_offset').value || '0';

  $('codeB').textContent = `{# --- KONFIGURACJA JASNOŚCI --- #}
{% set min_b = ${p.min_b} %}
{% set max_b = ${p.max_b} %}
{% set dawn_dur = ${p.dawn_min_b} * 60 %}
{% set dusk_dur = ${p.dusk_min_b} * 60 %}
{% set dusk_offset = ${p.dusk_offset_b} * 60 %}
{% set sr_offset_min = ${sro} %}
{% set ss_offset_min = ${sso} %}

{# --- STABILNA LOGIKA CZASU --- #}
{% set now_dt = now() %}
{% set now_ts = as_timestamp(now_dt) %}
{% set today = now_dt.date() %}

{% set nr = as_datetime(state_attr('sun.sun', 'next_rising')) | as_local %}
{% set ns = as_datetime(state_attr('sun.sun', 'next_setting')) | as_local %}

{% if nr is not none and ns is not none %}
  {% set sr_dt = nr if nr.date() == today else nr - timedelta(days=1) %}
  {% set ss_dt = ns if ns.date() == today else ns - timedelta(days=1) %}
  {% set sr = as_timestamp(sr_dt) + (sr_offset_min * 60) %}
  {% set ss = as_timestamp(ss_dt) + (ss_offset_min * 60) %}

  {% set dawn_end = sr + dawn_dur %}
  {% set dusk_start = ss - dusk_offset %}
  {% set dusk_end = ss + dusk_dur %}
  {% set total_dusk = dusk_offset + dusk_dur %}

  {% if now_ts < sr %}
    {{ min_b }}
  {% elif now_ts <= dawn_end %}
    {% set progress = (now_ts - sr) / dawn_dur %}
    {% set eased = (3 - 2 * progress) * progress * progress %}
    {{ (min_b + (max_b - min_b) * eased) | int }}
  {% elif now_ts < dusk_start %}
    {{ max_b }}
  {% elif now_ts <= dusk_end %}
    {% set progress = (now_ts - dusk_start) / total_dusk %}
    {% set eased = (3 - 2 * progress) * progress * progress %}
    {{ (max_b - (max_b - min_b) * eased) | int }}
  {% else %}
    {{ min_b }}
  {% endif %}
{% else %}
  {{ min_b }}
{% endif %}`;

  $('codeT').textContent = `{# --- KONFIGURACJA TEMPERATURY BARWOWEJ --- #}
{% set min_t = ${p.min_t} %}
{% set max_t = ${p.max_t} %}
{% set dawn_dur = ${p.dawn_min_t} * 60 %}
{% set dusk_dur = ${p.dusk_min_t} * 60 %}
{% set dusk_offset = ${p.dusk_offset_t} * 60 %}
{% set sr_offset_min = ${sro} %}
{% set ss_offset_min = ${sso} %}

{# --- STABILNA LOGIKA CZASU --- #}
{% set now_dt = now() %}
{% set now_ts = as_timestamp(now_dt) %}
{% set today = now_dt.date() %}

{% set nr = as_datetime(state_attr('sun.sun', 'next_rising')) | as_local %}
{% set ns = as_datetime(state_attr('sun.sun', 'next_setting')) | as_local %}

{% if nr is not none and ns is not none %}
  {% set sr_dt = nr if nr.date() == today else nr - timedelta(days=1) %}
  {% set ss_dt = ns if ns.date() == today else ns - timedelta(days=1) %}
  {% set sr = as_timestamp(sr_dt) + (sr_offset_min * 60) %}
  {% set ss = as_timestamp(ss_dt) + (ss_offset_min * 60) %}

  {% set dawn_end = sr + dawn_dur %}
  {% set dusk_start = ss - dusk_offset %}
  {% set dusk_end = dusk_start + dusk_dur %}

  {% if now_ts < sr %}
    {{ min_t }}
  {% elif now_ts <= dawn_end %}
    {% set progress = (now_ts - sr) / dawn_dur %}
    {% set eased = (3 - 2 * progress) * progress * progress %}
    {{ (min_t + (max_t - min_t) * eased) | int }}
  {% elif now_ts < dusk_start %}
    {{ max_t }}
  {% elif now_ts <= dusk_end %}
    {% set progress = (now_ts - dusk_start) / dusk_dur %}
    {% set eased = (3 - 2 * progress) * progress * progress %}
    {{ (max_t - (max_t - min_t) * eased) | int }}
  {% else %}
    {{ min_t }}
  {% endif %}
{% else %}
  {{ min_t }}
{% endif %}`;
}

// ── Render ──────────────────────────────────────────────
function render() {
  paramDefs.forEach(([sid, , key]) => { params[key] = Number($(sid).value); });
  const ch = channels(params);
  const tk = tokens();
  const nowH = nowHours();

  ['sunrise', 'sunset'].forEach((k) => {
    const off = offsetMin(k + '_offset');
    const label = $(k === 'sunrise' ? 'sr_offset_label' : 'ss_offset_label');
    label.textContent = (off > 0 ? '+' : '') + off + ' min';
    // Zawsze widoczne (stała szerokość) – inaczej pojawienie się napisu przesuwa sąsiednie pola
    const eff = $(k === 'sunrise' ? 'sr_effective' : 'ss_effective');
    eff.textContent = 'czyli ' + hhmm(k === 'sunrise' ? sunriseH() : sunsetH());
    eff.classList.toggle('is-shifted', off !== 0);
  });

  renderPhases($('phasesB'), ch.b);
  renderPhases($('phasesT'), ch.t);
  renderNow(ch, nowH);
  renderStrip(ch, nowH);
  renderCharts(ch, tk, nowH);
  generateCode();
}

let renderTimer;
function scheduleRender() {
  clearTimeout(renderTimer);
  renderTimer = setTimeout(render, 30);
}

// ── Lokalizacja ─────────────────────────────────────────
// Skąd są obecne współrzędne: 'default' | 'browser' | 'manual'
let locSource = 'default';
const LOC_STATUS = {
  default: `domyślna: ${DEFAULT_LOCATION.name}`,
  browser: 'z przeglądarki',
  manual: 'wpisana ręcznie',
};

function updateSunFromLocation(status) {
  const lat = Number($('lat').value), lng = Number($('lng').value);
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) {
    $('locStatus').textContent = 'nieprawidłowe współrzędne';
    return;
  }
  const t = sunTimes(lat, lng, new Date());
  if (t.sunrise === null || t.sunset === null) {
    $('locStatus').textContent = 'tego dnia słońce nie wschodzi lub nie zachodzi';
    return;
  }
  setTimeField('sunrise', t.sunrise);
  setTimeField('sunset', t.sunset);
  $('locStatus').textContent = status;
  scheduleRender();
}

function setLocation(lat, lng, source) {
  locSource = source;
  $('lat').value = lat.toFixed(4);
  $('lng').value = lng.toFixed(4);
  updateSunFromLocation(LOC_STATUS[source]);
}

function locate() {
  const failed = () => {
    $('locStatus').textContent = 'przeglądarka nie podała położenia';
    setTimeout(() => { $('locStatus').textContent = LOC_STATUS[locSource]; }, 4000);
  };
  if (!navigator.geolocation) return failed();
  $('locStatus').textContent = 'wykrywanie…';
  navigator.geolocation.getCurrentPosition(
    (pos) => setLocation(pos.coords.latitude, pos.coords.longitude, 'browser'),
    failed,
    { timeout: 8000 },
  );
}

// ── Kopiowanie ──────────────────────────────────────────
async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch (_) {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand('copy');
    ta.remove();
    return ok;
  }
}

// ── Zdarzenia ───────────────────────────────────────────
paramDefs.forEach(([sid, vid]) => {
  $(sid).addEventListener('input', () => { $(vid).value = $(sid).value; scheduleRender(); });
  $(vid).addEventListener('change', () => {
    const s = $(sid);
    let v = Number($(vid).value);
    if (!Number.isFinite(v)) v = Number(s.value);
    v = Math.max(Number(s.min), Math.min(Number(s.max), v));
    $(vid).value = v;
    s.value = v;
    scheduleRender();
  });
});

['sunrise_offset', 'sunset_offset'].forEach((id) => $(id).addEventListener('input', scheduleRender));

// Pola godzin wschodu/zachodu (24 h, własne zamiast <input type="time">,
// którego format zależy od ustawień regionalnych przeglądarki)
function setTimeField(id, h) {
  const el = $(id);
  el.value = hhmm(h);
  el.dataset.valid = el.value;
  el.classList.remove('invalid');
}
['sunrise', 'sunset'].forEach((id) => {
  const el = $(id);
  el.dataset.valid = el.value;
  el.addEventListener('input', () => {
    const ok = parseTime(el.value) !== null;
    el.classList.toggle('invalid', !ok);
    if (ok) scheduleRender();
  });
  el.addEventListener('change', () => {
    const h = parseTime(el.value);
    setTimeField(id, h === null ? parseTime(el.dataset.valid) : h);
    scheduleRender();
  });
  el.addEventListener('keydown', (e) => {
    if (e.key !== 'ArrowUp' && e.key !== 'ArrowDown') return;
    e.preventDefault();
    const h = parseTime(el.value) ?? parseTime(el.dataset.valid);
    const step = ((e.shiftKey ? 10 : 1) / 60) * (e.key === 'ArrowUp' ? 1 : -1);
    setTimeField(id, h + step);
    scheduleRender();
  });
});
['lat', 'lng'].forEach((id) => $(id).addEventListener('change', () => {
  locSource = 'manual';
  updateSunFromLocation(LOC_STATUS.manual);
}));
$('btnLocate').addEventListener('click', locate);

$('btnTheme').addEventListener('click', () => {
  themeManual = true;
  applyTheme(document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark');
});
matchMedia('(prefers-color-scheme: dark)').addEventListener('change', (e) => {
  if (!themeManual) applyTheme(e.matches ? 'dark' : 'light');
});

$('btnReset').addEventListener('click', () => {
  paramDefs.forEach(([sid, vid, , def]) => { $(sid).value = def; $(vid).value = def; });
  $('sunrise_offset').value = '0';
  $('sunset_offset').value = '0';
  updateSunFromLocation(LOC_STATUS[locSource]);
  scheduleRender();
});

document.querySelectorAll('[data-copy]').forEach((btn) => {
  btn.addEventListener('click', async () => {
    const ok = await copyText($(btn.dataset.copy).textContent);
    btn.textContent = ok ? 'Skopiowano' : 'Nie udało się skopiować';
    setTimeout(() => { btn.textContent = 'Kopiuj'; }, 1600);
  });
});

// Najechanie na pasek światła pokazuje wartości i kursor na wykresach
$('lightStrip').addEventListener('mousemove', (e) => {
  const r = e.currentTarget.getBoundingClientRect();
  const h = Math.max(0, Math.min(24, ((e.clientX - r.left) / r.width) * 24));
  const ch = channels(params);
  $('stripHover').textContent = `o ${hhmm(h)}: ${valueAt(h, ch.b)}${ch.b.unit}, ${valueAt(h, ch.t)}${ch.t.unit}`;
  const x = chartB.convertToPixel({ xAxisIndex: 0 }, h);
  chartB.dispatchAction({ type: 'showTip', x, y: 60 });
});
$('lightStrip').addEventListener('mouseleave', () => {
  $('stripHover').textContent = '';
  chartB.dispatchAction({ type: 'hideTip' });
});

window.addEventListener('resize', () => { chartB.resize(); chartT.resize(); });
setInterval(render, 60000);

// ── Start ───────────────────────────────────────────────
renderScale();
applyTheme(document.documentElement.dataset.theme);
setLocation(DEFAULT_LOCATION.lat, DEFAULT_LOCATION.lng, 'default');
locate();
