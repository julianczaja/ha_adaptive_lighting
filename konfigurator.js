/* ═══════════════════════════════════════════════════════════
   Adaptive Lighting Konfigurator – Logic (ECharts/SVG)
   ═══════════════════════════════════════════════════════════ */

const $ = (id) => document.getElementById(id);

// ── Parameter registry ──────────────────────────────────
const paramDefs = [
  ['min_b', 'min_b_val', 'min_b', 20],
  ['max_b', 'max_b_val', 'max_b', 100],
  ['dawn_min_b', 'dawn_min_b_val', 'dawn_min_b', 60],
  ['dusk_min_b', 'dusk_min_b_val', 'dusk_min_b', 60],
  ['dusk_offset_b', 'dusk_offset_b_val', 'dusk_offset_b', 30],
  ['min_t', 'min_t_val', 'min_t', 2200],
  ['max_t', 'max_t_val', 'max_t', 4000],
  ['dawn_min_t', 'dawn_min_t_val', 'dawn_min_t', 30],
  ['dusk_offset_t', 'dusk_offset_t_val', 'dusk_offset_t', 45],
  ['dusk_min_t', 'dusk_min_t_val', 'dusk_min_t', 0],
];
const params = {};
paramDefs.forEach(([, , key, def]) => { params[key] = def; });

// ── Sun helpers ─────────────────────────────────────────
function getSunriseHours() {
  const [h, m] = $('sunrise').value.split(':').map(Number);
  return h + m / 60 + (Number($('sunrise_offset').value) || 0) / 60;
}
function getSunsetHours() {
  const [h, m] = $('sunset').value.split(':').map(Number);
  return h + m / 60 + (Number($('sunset_offset').value) || 0) / 60;
}

// ── Easing (sinusoidal in/out – natural sunlight feel) ──
function easeInOutSine(t) {
  return (1 - Math.cos(t * Math.PI)) / 2;
}

// ── Compute curves ──────────────────────────────────────
function computeBrightness(hour, p) {
  const sr = getSunriseHours(), ss = getSunsetHours();
  const dawnEnd = sr + p.dawn_min_b / 60;
  const duskStart = ss - p.dusk_offset_b / 60;
  const duskEnd = ss + p.dusk_min_b / 60;
  const totalDusk = (p.dusk_offset_b + p.dusk_min_b) / 60;
  let val;
  if (hour < sr) val = p.min_b;
  else if (hour <= dawnEnd) {
    val = p.dawn_min_b === 0 ? p.max_b
      : p.min_b + (p.max_b - p.min_b) * easeInOutSine((hour - sr) / (p.dawn_min_b / 60));
  } else if (hour < duskStart) val = p.max_b;
  else if (hour <= duskEnd) {
    val = totalDusk === 0 ? p.min_b
      : p.max_b - (p.max_b - p.min_b) * easeInOutSine((hour - duskStart) / totalDusk);
  } else val = p.min_b;
  return Math.round(val);
}

function computeTemperature(hour, p) {
  const sr = getSunriseHours(), ss = getSunsetHours();
  const dawnEnd = sr + p.dawn_min_t / 60;
  const duskStart = ss - p.dusk_offset_t / 60;
  const duskEnd = ss + p.dusk_min_t / 60;
  const totalDusk = (p.dusk_offset_t + p.dusk_min_t) / 60;
  let val;
  if (hour < sr) val = p.min_t;
  else if (hour <= dawnEnd) {
    val = p.dawn_min_t === 0 ? p.max_t
      : p.min_t + (p.max_t - p.min_t) * easeInOutSine((hour - sr) / (p.dawn_min_t / 60));
  } else if (hour < duskStart) val = p.max_t;
  else if (hour <= duskEnd) {
    val = totalDusk === 0 ? p.min_t
      : p.max_t - (p.max_t - p.min_t) * easeInOutSine((hour - duskStart) / totalDusk);
  } else val = p.min_t;
  return Math.round(val);
}

// ── Generate curve (720 points, 1 per 2 minutes) ────────
function generateCurve(fn, p) {
  const pts = [];
  for (let m = 0; m < 1440; m += 2) pts.push([m / 60, fn(m / 60, p)]);
  return pts;
}

// ── Kelvin → RGB (blackbody approximation) ─────────────
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
  const cl = (v) => Math.max(0, Math.min(255, v)) | 0;
  return `rgb(${cl(r)},${cl(g)},${cl(b)})`;
}

// ── ECharts init (SVG renderer – single combined chart) ─
const chart = echarts.init($('chartCombined'), null, { renderer: 'svg' });

// ── Mark-line helpers ──────────────────────────────────
function ml(x, label, color) {
  return {
    xAxis: x,
    label: { show: true, formatter: label, position: 'start', color: '#fff', backgroundColor: color, fontSize: 10, padding: [2, 6, 2, 5], borderRadius: 3 },
    lineStyle: { color, width: 2, type: 'solid' },
    symbol: 'none',
  };
}
function mlDash(x) {
  return { xAxis: x, label: { show: false }, lineStyle: { color: '#94a3b8', width: 1, type: 'dashed' }, symbol: 'none' };
}

// ── Build combined option (brightness + temperature) ────
function buildCombinedOption(p) {
  const sr = getSunriseHours(), ss = getSunsetHours();

  // Brightness phase boundaries
  const bDawnEnd   = sr + p.dawn_min_b / 60;
  const bDuskStart = ss - p.dusk_offset_b / 60;
  const bDuskEnd   = ss + p.dusk_min_b / 60;

  // Temperature phase boundaries
  const tDawnEnd   = sr + p.dawn_min_t / 60;
  const tDuskStart = ss - p.dusk_offset_t / 60;
  const tDuskEnd   = ss + p.dusk_min_t / 60;

  const bData = generateCurve(computeBrightness, p);
  const tData = generateCurve(computeTemperature, p);

  // Shared markLines (vertical lines on brightness series)
  const markLines = [];
  markLines.push(ml(sr, 'wschód', '#f97316'));
  markLines.push(ml(ss, 'zachód', '#ef4444'));
  if (p.dawn_min_b > 0)     markLines.push(mlDash(bDawnEnd));
  if (p.dusk_offset_b > 0)  markLines.push(mlDash(bDuskStart));
  if (p.dusk_min_b > 0)     markLines.push(mlDash(bDuskEnd));
  if (p.dawn_min_t > 0)     markLines.push(mlDash(tDawnEnd));
  if (p.dusk_offset_t > 0)  markLines.push(mlDash(tDuskStart));
  if (p.dusk_min_t > 0)     markLines.push(mlDash(tDuskEnd));

  // Shared night shading (use the widest night range)
  const nightEndLeft  = sr;
  const nightStartRight = Math.max(bDuskEnd, tDuskEnd, ss);
  const markAreas = [];
  if (nightEndLeft > 0) markAreas.push([{ xAxis: 0 }, { xAxis: nightEndLeft }]);
  if (nightStartRight < 24) markAreas.push([{ xAxis: nightStartRight }, { xAxis: 24 }]);

  // Temperature color gradient
  const gradColors = [];
  for (let i = 0; i <= 10; i++) {
    gradColors.push(kelvinToRgb(p.min_t + (p.max_t - p.min_t) * i / 10));
  }

  const tYMin = Math.max(1000, p.min_t - 500);
  const tYMax = Math.min(6500, p.max_t + 500);

  return {
    animation: false,
    grid: { left: 55, right: 55, top: 32, bottom: 36 },
    xAxis: {
      type: 'value', min: 0, max: 24,
      axisLabel: { formatter: v => (v | 0) + ':00', color: '#94a3b8', fontSize: 10 },
      axisTick: { show: false },
      splitLine: { lineStyle: { color: '#f1f5f9', type: 'dashed' } },
      name: 'Godzina',
      nameTextStyle: { fontSize: 11, color: '#94a3b8' },
    },
    yAxis: [
      {
        type: 'value', min: 0, max: 105,
        axisLabel: { formatter: v => v + '%', color: '#0ea5e9', fontSize: 10 },
        splitLine: { show: false },
        name: 'Jasność',
        nameTextStyle: { fontSize: 11, color: '#0ea5e9' },
      },
      {
        type: 'value', min: tYMin, max: tYMax,
        axisLabel: { formatter: v => Math.round(v) + ' K', color: '#f97316', fontSize: 10 },
        splitLine: { show: false },
        name: 'Temperatura',
        nameTextStyle: { fontSize: 11, color: '#f97316' },
      },
    ],
    series: [
      {
        type: 'line', data: bData, smooth: 0,
        yAxisIndex: 0,
        showSymbol: false,
        lineStyle: { color: '#38bdf8', width: 2.5 },
        areaStyle: {
          color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
            { offset: 0, color: 'rgba(56,189,248,0.18)' },
            { offset: 1, color: 'rgba(56,189,248,0.0)' },
          ]),
        },
        markLine: { silent: true, symbol: 'none', data: markLines },
        markArea: {
          silent: true, data: markAreas,
          itemStyle: { color: 'rgba(15,23,42,0.04)', borderColor: 'transparent' },
        },
      },
      {
        type: 'line', data: tData, smooth: 0,
        yAxisIndex: 1,
        showSymbol: false,
        lineStyle: { width: 2.5 },
      },
    ],
    visualMap: {
      show: false,
      type: 'continuous',
      seriesIndex: 1,
      dimension: 1,
      min: p.min_t,
      max: p.max_t,
      inRange: { color: gradColors },
    },
    tooltip: {
      trigger: 'axis',
      formatter: (ps) => {
        const h = ps[0].value[0];
        const hh = (h | 0).toString().padStart(2, '0');
        const mm = Math.round((h % 1) * 60).toString().padStart(2, '0');
        let html = '<b>' + hh + ':' + mm + '</b>';
        html += '<br/>' + ps[0].marker + ' Jasność: ' + Math.round(ps[0].value[1]) + '%';
        if (ps[1]) html += '<br/>' + ps[1].marker + ' Temperatura: ' + Math.round(ps[1].value[1]) + ' K';
        return html;
      },
      axisPointer: { type: 'line', lineStyle: { color: '#cbd5e1', type: 'dashed' } },
    },
  };
}

// ── Update chart ───────────────────────────────────────
function updateCharts() {
  chart.setOption(buildCombinedOption(params), { notMerge: true, lazyUpdate: true });
}

// ── Update cycle ───────────────────────────────────────
let updateTimer;
function scheduleUpdate() {
  clearTimeout(updateTimer);
  updateTimer = setTimeout(updateAll, 60);
}

function updateAll() {
  paramDefs.forEach(([sid, , key]) => { params[key] = Number($(sid).value); });
  updateCharts();
  if (!$('codeOutput').classList.contains('hidden')) generateCode();
}

// ── Jinja code generation ──────────────────────────────
function generateCode() {
  const p = params;
  const sro = $('sunrise_offset').value || '0';
  const sso = $('sunset_offset').value || '0';

  const tplB = `{# --- KONFIGURACJA JASNOŚCI --- #}
{% set min_b = ${p.min_b} %}
{% set max_b = ${p.max_b} %}
{% set dawn_min = ${p.dawn_min_b} %}
{% set dusk_min = ${p.dusk_min_b} %}
{% set dusk_offset_min = ${p.dusk_offset_b} %}
{% set sr_offset_min = ${sro} %}
{% set ss_offset_min = ${sso} %}

{# --- LOGIKA --- #}
{% set next_sr = state_attr('sun.sun', 'next_rising') %}
{% set next_ss = state_attr('sun.sun', 'next_setting') %}
{% if next_sr and next_ss %}
  {% set now_ts = as_timestamp(now()) %}
  {% set sr_ts = as_timestamp(next_sr, now_ts) %}
  {% set ss_ts = as_timestamp(next_ss, now_ts) %}
  {% set sr = sr_ts if (sr_ts - now_ts) < 43200 else sr_ts - 86400 %}
  {% set ss = ss_ts if (ss_ts - now_ts) < 43200 else ss_ts - 86400 %}
  {% set sr = sr + (sr_offset_min * 60) %}
  {% set ss = ss + (ss_offset_min * 60) %}
  {% set dawn_dur = dawn_min * 60 %}
  {% set dusk_dur = dusk_min * 60 %}
  {% set dusk_offset = dusk_offset_min * 60 %}
  {% set dusk_start = ss - dusk_offset %}
  {% set dusk_end = ss + dusk_dur %}
  {% set total_dusk = dusk_offset + dusk_dur %}
  {% if now_ts < sr %}
    {{ min_b }}
  {% elif now_ts <= (sr + dawn_dur) %}
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

  const tplT = `{# --- KONFIGURACJA TEMPERATURY BARWOWEJ --- #}
{% set min_t = ${p.min_t} %}
{% set max_t = ${p.max_t} %}
{% set dawn_min = ${p.dawn_min_t} %}
{% set dusk_offset_min = ${p.dusk_offset_t} %}
{% set dusk_min = ${p.dusk_min_t} %}
{% set sr_offset_min = ${sro} %}
{% set ss_offset_min = ${sso} %}

{# --- LOGIKA --- #}
{% set next_sr = state_attr('sun.sun', 'next_rising') %}
{% set next_ss = state_attr('sun.sun', 'next_setting') %}
{% if next_sr and next_ss %}
  {% set now_ts = as_timestamp(now()) %}
  {% set sr_ts = as_timestamp(next_sr, now_ts) %}
  {% set ss_ts = as_timestamp(next_ss, now_ts) %}
  {% set sr = sr_ts if (sr_ts - now_ts) < 43200 else sr_ts - 86400 %}
  {% set ss = ss_ts if (ss_ts - now_ts) < 43200 else ss_ts - 86400 %}
  {% set sr = sr + (sr_offset_min * 60) %}
  {% set ss = ss + (ss_offset_min * 60) %}
  {% set dawn_dur = dawn_min * 60 %}
  {% set dusk_offset = dusk_offset_min * 60 %}
  {% set dusk_dur = dusk_min * 60 %}
  {% set dusk_start = ss - dusk_offset %}
  {% set dusk_end = ss + dusk_dur %}
  {% set total_dusk = dusk_offset + dusk_dur %}
  {% if now_ts < sr %}
    {{ min_t }}
  {% elif now_ts <= (sr + dawn_dur) %}
    {% set progress = (now_ts - sr) / dawn_dur %}
    {% set eased = (3 - 2 * progress) * progress * progress %}
    {{ (min_t + (max_t - min_t) * eased) | int }}
  {% elif now_ts < dusk_start %}
    {{ max_t }}
  {% elif now_ts <= dusk_end %}
    {% set progress = (now_ts - dusk_start) / total_dusk %}
    {% set eased = (3 - 2 * progress) * progress * progress %}
    {{ (max_t - (max_t - min_t) * eased) | int }}
  {% else %}
    {{ min_t }}
  {% endif %}
{% else %}
  {{ min_t }}
{% endif %}`;

  $('codeOutput').value =
    '═══════════════════ sensor_zadana_jasnosc.jinja ═══════════════════\n' + tplB +
    '\n\n═══════════════════ sensor_zadana_temperatura.jinja ═══════════════════\n' + tplT;
}

// ── Event wiring ───────────────────────────────────────
paramDefs.forEach(([sid, vid]) => {
  $(sid).addEventListener('input', () => { $(vid).value = $(sid).value; scheduleUpdate(); });
  $(vid).addEventListener('change', () => {
    let v = Number($(vid).value);
    const s = $(sid);
    if (isNaN(v)) v = Number(s.value);
    v = Math.max(Number(s.min), Math.min(Number(s.max), v));
    $(vid).value = v; s.value = v;
    scheduleUpdate();
  });
});

$('sunrise').addEventListener('input', scheduleUpdate);
$('sunset').addEventListener('input', scheduleUpdate);

function bindOffset(sliderId, labelId) {
  $(sliderId).addEventListener('input', () => {
    const v = $(sliderId).value;
    $(labelId).textContent = (Number(v) >= 0 ? '+' : '') + v + ' min';
    scheduleUpdate();
  });
}
bindOffset('sunrise_offset', 'sr_offset_label');
bindOffset('sunset_offset', 'ss_offset_label');

$('btnExport').addEventListener('click', () => {
  const ta = $('codeOutput');
  ta.classList.toggle('hidden');
  if (!ta.classList.contains('hidden')) { generateCode(); ta.focus(); }
});

$('btnReset').addEventListener('click', () => {
  paramDefs.forEach(([sid, vid, , def]) => { $(sid).value = def; $(vid).value = def; });
  $('sunrise').value = detectedSunrise;
  $('sunset').value = detectedSunset;
  $('sunrise_offset').value = '0'; $('sunset_offset').value = '0';
  $('sr_offset_label').textContent = '0 min';
  $('ss_offset_label').textContent = '0 min';
  scheduleUpdate();
});

// ── Resize handler ─────────────────────────────────────
window.addEventListener('resize', () => { chart.resize(); });

// ── Solar calculation (NOAA) ───────────────────────────
function calcSunTimes(lat, lng, date) {
  const toRad = Math.PI / 180;
  const dayOfYear = Math.ceil((date - new Date(date.getFullYear(), 0, 1)) / 86400000);
  const latRad = lat * toRad;
  const decl = 23.44 * toRad * Math.sin(toRad * (360 / 365) * (dayOfYear - 81));
  const B = (360 / 365) * (dayOfYear - 81) * toRad;
  const eqTimeH = (9.87 * Math.sin(2 * B) - 7.53 * Math.cos(B) - 1.5 * Math.sin(B)) / 60;
  const cosHa = -Math.tan(latRad) * Math.tan(decl);
  let haH;
  if (cosHa > 1) haH = 0; else if (cosHa < -1) haH = 12;
  else haH = Math.acos(cosHa) / toRad / 15;
  const tzMeridian = -date.getTimezoneOffset() / 60 * 15;
  const solarNoon = 12 + (tzMeridian - lng) / 15 + eqTimeH;
  return {
    sunrise: ((solarNoon - haH) % 24 + 24) % 24,
    sunset:  ((solarNoon + haH) % 24 + 24) % 24,
  };
}
function hoursToTimeStr(h) {
  return (h | 0).toString().padStart(2, '0') + ':' + Math.round((h % 1) * 60).toString().padStart(2, '0');
}

// ── Geo-detect + init ──────────────────────────────────
let detectedSunrise = '06:00', detectedSunset = '20:00';

async function detectSunTimes() {
  let lat, lng;
  if (navigator.geolocation) {
    try {
      const pos = await new Promise((res, rej) =>
        navigator.geolocation.getCurrentPosition(res, rej, { timeout: 5000 }));
      lat = pos.coords.latitude;
      lng = pos.coords.longitude;
    } catch (_) { lat = 53.1235; lng = 18.0084; } // Bydgoszcz
  } else { lat = 53.1235; lng = 18.0084; }
  const times = calcSunTimes(lat, lng, new Date());
  detectedSunrise = hoursToTimeStr(times.sunrise);
  detectedSunset = hoursToTimeStr(times.sunset);
  $('sunrise').value = detectedSunrise;
  $('sunset').value = detectedSunset;
}

async function initAll() {
  await detectSunTimes();
  updateAll();
}

initAll();
