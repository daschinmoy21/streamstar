'use strict';

const $ = (id) => document.getElementById(id);

const POLL_INTERVAL_MS = 1000;
const HISTORY_LIMIT = 120;
const COLORS = {
  grid: '#27272a',
  axis: '#a1a1aa',
  target: '#71717a',
  foreground: '#fafafa',
  success: '#22c55e',
  warning: '#f59e0b',
};

const VIEW_TITLES = {
  overview: ['Every event counts.', 'Frequency analytics that adapt to change, with privacy in the loop.'],
  comparison: ['Put the methods to the test.', 'Compare accuracy, communication, and privacy on the same live windows.'],
  privacy: ['Account for every query.', 'Private releases, private decisions, and a finite budget.'],
};

const SCENARIO_DRIFT = { stable: 0, fast: 5, drifting: 15 };

let state = null;
let history = [];
let generation = 0;
let selected = 'gated';
let metric = 'linf';
let view = 'overview';
let busy = false;
const visible = new Set(['hybrid', 'adaptive', 'gated']);

// ---------- formatting ----------

const iconSvg = (paths) => `<svg class="icon" viewBox="0 0 24 24">${paths}</svg>`;
const icons = {
  play: iconSvg('<path d="m6 3 14 9-14 9z"/>'),
  pause: iconSvg('<rect x="14" y="4" width="4" height="16" rx="1"/><rect x="6" y="4" width="4" height="16" rx="1"/>'),
};

const fmt = (n, digits = 3) => (Number.isFinite(n) ? n.toFixed(digits) : '—');
const int = (n) => new Intl.NumberFormat('en', { maximumFractionDigits: 0 }).format(n || 0);

function bytes(n) {
  if (n >= 1048576) return `${fmt(n / 1048576, 1)} MB`;
  if (n >= 1024) return `${fmt(n / 1024, 1)} KB`;
  return `${int(n)} B`;
}

function safe(text) {
  const entities = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
  return String(text).replace(/[&<>"']/g, (c) => entities[c]);
}

const colorDot = (color) => `<i class="color-dot" style="background:${color}"></i>`;
const capitalize = (s) => s[0].toUpperCase() + s.slice(1);

// ---------- state lookups ----------

function result(id = selected, round = state?.latest) {
  return round?.results.find((r) => r.id === id);
}

function method(id) {
  return state?.methods.find((m) => m.id === id);
}

// ---------- server communication ----------

async function poll() {
  try {
    const since = history.at(-1)?.number || 0;
    const response = await fetch(`/api/state?since=${since}&generation=${generation}`);
    if (!response.ok) throw new Error(`Engine returned ${response.status}`);
    const next = await response.json();

    if (generation !== next.generation) {
      history = [];
      generation = next.generation;
    }
    history.push(...next.history);
    history = history.slice(-HISTORY_LIMIT);
    state = next;

    document.body.classList.remove('offline');
    render();
  } catch (err) {
    $('run-status').textContent = 'Disconnected';
    $('footer-status').textContent = err.message;
    document.body.classList.add('offline');
  }
}

async function control(action, config) {
  if (busy) return;
  busy = true;
  try {
    const response = await fetch('/api/control', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action, ...(config ? { config } : {}) }),
    });
    if (!response.ok) throw new Error(await response.text());
    await poll();
  } catch (err) {
    const target = action === 'reset' ? $('settings-error') : $('error-notice');
    target.textContent = err.message;
    target.hidden = false;
  } finally {
    busy = false;
  }
}

// ---------- rendering ----------

function render() {
  renderSidebar();
  renderHeader();
  renderKpis();
  renderGate();
  renderHeavyHitters();
  renderComparison();
  renderPrivacy();

  const latest = state.latest;
  $('footer-status').textContent = latest
    ? `${int(latest.events)} events processed · ${int(latest.clipped)} clipped this round`
    : 'Connected · waiting for first round';

  renderLegend('accuracy-legend');
  renderLegend('privacy-legend');
  drawCharts();
}

function renderSidebar() {
  $('method-list').innerHTML = state.methods
    .map((m) => {
      const isSelected = m.id === selected;
      const label = m.id === 'gated' ? 'Adaptive + private gate' : safe(m.name);
      const note = m.id === 'privsketch' ? '<small>Conditional privacy · presence</small>' : '';
      return `<button class="method-button ${isSelected ? 'selected' : ''}" data-method="${m.id}" aria-pressed="${isSelected}">
        ${colorDot(m.color)}<span>${label}${note}</span>
      </button>`;
    })
    .join('');

  $('mobile-method-picker').innerHTML = state.methods
    .map((m) => `<option value="${m.id}" ${m.id === selected ? 'selected' : ''}>${safe(m.name)}</option>`)
    .join('');

  $('source-name').textContent =
    state.source === 'synthetic' ? 'Synthetic source connected' : `${state.source} source`;
}

function renderHeader() {
  const config = state.config;
  const synthetic = state.source === 'synthetic';
  const controllable = synthetic || state.source === 'replay';

  $('seed-label').textContent = `Seed ${config.seed}`;
  $('scenario-name').textContent = synthetic
    ? config.drift_every ? 'Drifting Zipf stream' : 'Stationary Zipf stream'
    : `${capitalize(state.source)} event stream`;
  $('scenario-meta').textContent =
    `${int(config.clients)} client groups · ${int(config.domain)}-item domain · ${config.window_rounds} cohorts`;
  $('round-badge').textContent = `Round ${state.latest?.number || 0}`;

  $('run-status').innerHTML = `<i></i> ${state.running ? 'Live experiment' : 'Paused'}`;
  $('run-status').classList.toggle('paused', !state.running);
  $('live-chip').hidden = !state.running;

  $('play-button').innerHTML = state.running
    ? `${icons.pause}<span>Pause stream</span>`
    : `${icons.play}<span>Resume stream</span>`;
  $('play-button').disabled = !controllable;
  $('step-button').disabled = !controllable;
  $('drift-button').disabled = !synthetic;
  $('settings-button').disabled = !synthetic;

  $('error-notice').hidden = !state.error;
  $('error-notice').textContent = state.error || '';
}

function renderKpis() {
  const config = state.config;
  const latest = state.latest;
  const r = result();
  const epsilon = r?.epsilon || 0;
  const aboveTarget = r && r.metrics.linf > config.target_error;

  $('selected-name').textContent = method(selected)?.name || '';

  $('kpi-error').textContent = r ? fmt(r.metrics.linf, 4) : '—';
  $('error-tag').textContent = !r
    ? 'Waiting for first window'
    : aboveTarget ? 'Above target accuracy' : 'Within target accuracy';
  $('error-tag').style.color = aboveTarget ? COLORS.warning : COLORS.success;

  $('kpi-epsilon').innerHTML = `${r ? fmt(r.epsilon, 2) : '—'} <small>/ ${fmt(config.epsilon_limit, 0)}</small>`;
  $('budget-fill').style.width = `${Math.min(100, (epsilon / config.epsilon_limit) * 100)}%`;
  $('budget-fill').style.background = r?.exhausted ? COLORS.warning : '';
  $('remaining-budget').textContent = r?.exhausted
    ? 'Budget exhausted'
    : `${fmt(100 * (1 - epsilon / config.epsilon_limit), 0)}% budget remaining`;

  $('kpi-width').innerHTML = `${r?.width || '—'} <small>buckets</small>`;
  $('width-tag').textContent = r?.adaptive ? 'Selected from private probe' : 'Fixed experimental layout';
  $('sketch-size').textContent = `${config.rows} rows · ${bytes(r?.memory_bytes || 0)}`;

  $('kpi-throughput').innerHTML = `${latest ? int(latest.throughput) : '—'} <small>evt/s</small>`;
  $('latency-tag').textContent = `${fmt(latest?.latency_ms, 1)} ms per round`;
  $('window-count').textContent = `${int(latest?.window_events)} events in window`;
  $('accuracy-caption').textContent = latest
    ? `${history.length} rounds shown · ${latest.phase}`
    : 'Waiting for streaming events';
  $('communication-caption').textContent = r
    ? `${bytes(r.bytes_per_client)} / client this round · ${bytes(r.total_bytes)} total`
    : 'Includes both helper shares';
}

function renderGate() {
  const gate = result('gated');

  $('release-count').innerHTML = `${gate?.releases || 0} <small>of ${state.latest?.number || 0} rounds</small>`;
  $('release-grid').innerHTML = history
    .slice(-60)
    .map((round) => {
      const g = result('gated', round);
      const classes = ['release-cell', g?.released && 'published', round.injected_drift && 'injected'];
      return `<span class="${classes.filter(Boolean).join(' ')}" title="Round ${round.number}: ${safe(g?.reason ?? '')}"></span>`;
    })
    .join('');

  $('release-reason').textContent = gate?.reason || 'Awaiting a private probe';
  $('staleness').textContent = `${gate?.staleness || 0} rounds`;
  $('query-count').textContent = `${gate?.ledger.probe_queries || 0} / ${gate?.ledger.release_queries || 0}`;
  $('fit-alpha').textContent = `Zipf α ${gate?.fit.alpha ? fmt(gate.fit.alpha, 2) : '—'}`;
}

function renderHeavyHitters() {
  const r = result();
  $('heavy-subtitle').textContent = r ? `${r.target} · ${r.name}` : 'Estimated leaders in the current window';

  if (!r) {
    $('heavy-body').innerHTML =
      '<tr><td colspan="5" class="empty-row">Waiting for the first streaming window…</td></tr>';
    return;
  }

  const maxValue = Math.max(0.0001, ...r.top.flatMap((item) => [item.estimate, item.truth]));
  $('heavy-body').innerHTML = r.top
    .map((item) => {
      const delta = item.estimate - item.truth;
      const estimateWidth = Math.max(0, (item.estimate / maxValue) * 100);
      const truthWidth = (item.truth / maxValue) * 100;
      return `<tr>
        <td>item_${String(item.id).padStart(3, '0')}</td>
        <td>${fmt(item.estimate, 4)}</td>
        <td>${fmt(item.truth, 4)}</td>
        <td class="delta">${delta >= 0 ? '+' : ''}${fmt(delta, 4)}</td>
        <td><div class="frequency-bars"><i style="width:${estimateWidth}%"></i><i class="truth" style="width:${truthWidth}%"></i></div></td>
      </tr>`;
    })
    .join('');
}

function renderComparison() {
  $('comparison-body').innerHTML = (state.latest?.results || [])
    .map((r) => `<tr class="${r.id === selected ? 'selected' : ''}">
      <td>${colorDot(r.color)}${safe(r.name)}<small>${safe(r.target)} · ${safe(r.privacy)}</small></td>
      <td>${fmt(r.metrics.linf, 4)}</td>
      <td>${fmt(r.metrics.mse, 6)}</td>
      <td>${fmt(r.metrics.ncr, 3)}</td>
      <td>${fmt(r.metrics.top_k_recall * 100, 0)}%</td>
      <td>${r.width}</td>
      <td class="${r.exhausted ? 'exhausted' : ''}">${fmt(r.epsilon, 2)}${r.id === 'privsketch' ? '*' : ''}</td>
      <td>${r.releases}</td>
      <td>${bytes(r.bytes_per_client)}</td>
      <td>${fmt(r.latency_ms, 1)} ms</td>
    </tr>`)
    .join('');
}

function renderPrivacy() {
  const config = state.config;

  $('privacy-body').innerHTML = (state.latest?.results || [])
    .map((r) => {
      const conditional = r.id === 'privsketch';
      const status = r.exhausted ? 'Cap reached' : conditional ? 'Conditional only' : 'Active';
      return `<tr>
        <td>${colorDot(r.color)}${safe(r.name)}</td>
        <td class="${conditional ? 'conditional' : ''}">${safe(r.privacy)}</td>
        <td>${r.ledger.probe_queries}</td>
        <td>${r.ledger.release_queries}</td>
        <td>${fmt(r.ledger.rho, 4)}</td>
        <td>${fmt(r.ledger.pure_epsilon, 2)}</td>
        <td>${fmt(r.epsilon, 2)}${conditional ? '*' : ''}</td>
        <td class="${r.exhausted ? 'exhausted' : ''}">${status}</td>
      </tr>`;
    })
    .join('');

  $('privacy-contribution').textContent =
    `Each client group contributes at most ${config.contribution_cap} events per cohort, ` +
    `across ${config.window_rounds} sliding cohorts. ` +
    `Public domain: ${int(config.domain)} items; public population: ${int(config.clients)} groups.`;
}

function renderLegend(id) {
  $(id).innerHTML = (state?.methods || [])
    .map((m) => {
      const on = visible.has(m.id);
      return `<button class="${on ? 'enabled' : ''}" data-series="${m.id}" aria-pressed="${on}">${colorDot(m.color)}${safe(m.name)}</button>`;
    })
    .join('');
}

// ---------- charts ----------

const axisLabel = (x, y, anchor, text) =>
  `<text x="${x}" y="${y}" text-anchor="${anchor}" fill="${COLORS.axis}" font-size="11">${text}</text>`;

function chart(id, series, getValue, { target = null, step = false, height = 242 } = {}) {
  const svg = $(id);
  const width = Math.max(240, svg.clientWidth);
  const pad = { left: 51, right: 19, top: 14, bottom: 32 };
  const w = width - pad.left - pad.right;
  const h = height - pad.top - pad.bottom;
  svg.setAttribute('viewBox', `0 0 ${width} ${height}`);

  if (!history.length) {
    svg.innerHTML = `<text x="${width / 2}" y="${height / 2}" text-anchor="middle" class="chart-empty">The next window starts the story.</text>`;
    return;
  }

  const values = history
    .flatMap((round) => series.map((m) => getValue(result(m.id, round))))
    .filter(Number.isFinite);
  let ymax = Math.max(target || 0, ...values, step ? state.config.width : 0, 0.001) * 1.17;
  if (step) ymax = Math.max(state.config.max_width, ymax);

  const last = history.length - 1;
  const x = (i) => pad.left + (last === 0 ? w / 2 : (i * w) / last);
  const y = (v) => pad.top + h - (Math.max(0, v) / ymax) * h;
  let markup = '';

  // Horizontal grid lines with y-axis labels.
  for (let i = 0; i <= 4; i++) {
    const value = (ymax * i) / 4;
    const label = step ? Math.round(value) : fmt(value, value < 0.01 ? 4 : 2);
    markup += `<line x1="${pad.left}" x2="${width - pad.right}" y1="${y(value)}" y2="${y(value)}" stroke="${COLORS.grid}"/>`;
    markup += axisLabel(pad.left - 10, y(value) + 4, 'end', label);
  }

  // Round numbers along the x-axis.
  const tickCount = Math.min(6, history.length);
  for (let i = 0; i < tickCount; i++) {
    const index = tickCount === 1 ? 0 : Math.round((i * last) / (tickCount - 1));
    markup += axisLabel(x(index), height - 10, 'middle', String(history[index].number).padStart(2, '0'));
  }

  // Injected drift markers.
  history.forEach((round, i) => {
    if (!round.injected_drift) return;
    markup += `<line x1="${x(i)}" x2="${x(i)}" y1="${pad.top}" y2="${pad.top + h}" stroke="${COLORS.warning}" stroke-dasharray="4 4" opacity=".6"/>`;
  });

  if (target !== null) {
    markup += `<line x1="${pad.left}" x2="${width - pad.right}" y1="${y(target)}" y2="${y(target)}" stroke="${COLORS.target}" stroke-dasharray="5 5"/>`;
    markup += axisLabel(width - pad.right, y(target) - 6, 'end', `target ${target}`);
  }

  for (const m of series) {
    let path = '';
    history.forEach((round, i) => {
      const value = getValue(result(m.id, round));
      if (!Number.isFinite(value)) return;
      if (i === 0) path += `M ${x(i)} ${y(value)}`;
      else if (step) path += ` H ${x(i)} V ${y(value)}`;
      else path += ` L ${x(i)} ${y(value)}`;
    });

    const emphasized = m.id === 'gated';
    markup += `<path d="${path}" fill="none" stroke="${m.color}" stroke-width="${emphasized ? 2.3 : 1.6}" stroke-linejoin="round" stroke-linecap="round" opacity="${emphasized ? 1 : 0.85}"/>`;

    const lastValue = getValue(result(m.id, history[last]));
    if (Number.isFinite(lastValue)) {
      markup += `<circle cx="${x(last)}" cy="${y(lastValue)}" r="3" fill="${m.color}"/>`;
    }
  }

  svg.innerHTML = markup;

  if (id === 'accuracy-chart') attachTooltip(svg, series, getValue, { pad, w, width });
}

function attachTooltip(svg, series, getValue, { pad, w, width }) {
  const tooltip = $('accuracy-tooltip');

  svg.onpointermove = (event) => {
    const box = svg.getBoundingClientRect();
    const fraction = (event.clientX - box.left - pad.left) / w;
    const index = Math.max(0, Math.min(history.length - 1, Math.round(fraction * (history.length - 1))));
    const round = history[index];

    const rows = series
      .map((m) => `<div><span>${colorDot(m.color)}${safe(m.name)}</span><b>${fmt(getValue(result(m.id, round)), 4)}</b></div>`)
      .join('');
    tooltip.innerHTML = `<strong>Round ${round.number}${round.injected_drift ? ' · drift' : ''}</strong>${rows}`;
    tooltip.hidden = false;
    tooltip.style.left = `${Math.max(0, Math.min(width - 230, event.clientX - box.left + 10))}px`;
    tooltip.style.top = '30px';
  };

  svg.onpointerleave = () => {
    tooltip.hidden = true;
  };
}

function drawSparkline() {
  const values = history.slice(-20).map((round) => result(selected, round)?.metrics.linf || 0);
  const max = Math.max(0.001, ...values);
  const step = 82 / Math.max(1, values.length - 1);
  const path = values.map((v, i) => `${i ? 'L' : 'M'} ${i * step} ${30 - (v / max) * 25}`).join(' ');

  const spark = $('error-spark');
  spark.setAttribute('viewBox', '0 0 82 32');
  spark.innerHTML = `<path d="${path}" fill="none" stroke="${COLORS.foreground}" stroke-width="1.5" stroke-linejoin="round"/>`;
}

function drawCharts() {
  if (!state) return;
  const series = state.methods.filter((m) => visible.has(m.id));
  const adaptive = state.methods.filter((m) => m.id === 'adaptive' || m.id === 'gated');

  chart('accuracy-chart', series, (r) => r?.metrics[metric], {
    target: metric === 'linf' ? state.config.target_error : null,
    height: $('accuracy-chart').clientHeight,
  });
  chart('width-chart', adaptive, (r) => r?.width, {
    step: true,
    height: $('width-chart').clientHeight,
  });
  if (view === 'privacy') {
    chart('privacy-chart', series, (r) => r?.epsilon, {
      target: state.config.epsilon_limit,
      height: $('privacy-chart').clientHeight,
    });
  }
  drawSparkline();
}

// ---------- interaction ----------

function showView(nav) {
  view = nav.dataset.view;
  document.querySelectorAll('.view').forEach((el) => {
    el.hidden = el.id !== `${view}-view`;
  });
  document.querySelectorAll('[data-view]').forEach((el) => el.classList.toggle('active', el === nav));

  const [title, subtitle] = VIEW_TITLES[view];
  $('page-title').textContent = title;
  $('page-subtitle').textContent = subtitle;
  $('breadcrumb-view').textContent = nav.textContent.trim();
  drawCharts();
}

document.addEventListener('click', (event) => {
  const nav = event.target.closest('[data-view]');
  if (nav) showView(nav);

  const methodButton = event.target.closest('[data-method]');
  if (methodButton) {
    selected = methodButton.dataset.method;
    render();
  }

  const seriesButton = event.target.closest('[data-series]');
  if (seriesButton) {
    const id = seriesButton.dataset.series;
    if (visible.has(id)) visible.delete(id);
    else visible.add(id);
    render();
  }

  const metricButton = event.target.closest('[data-metric]');
  if (metricButton) {
    metric = metricButton.dataset.metric;
    document.querySelectorAll('[data-metric]').forEach((el) => el.classList.toggle('selected', el === metricButton));
    drawCharts();
  }
});

$('play-button').onclick = () => control(state?.running ? 'pause' : 'play');
$('step-button').onclick = () => control('step');
$('drift-button').onclick = () => control('drift');

$('mobile-method-picker').onchange = (event) => {
  selected = event.target.value;
  render();
};

// ---------- settings drawer ----------

function scenarioFor(driftEvery) {
  if (driftEvery === 0) return 'stable';
  return driftEvery <= 6 ? 'fast' : 'drifting';
}

function drawer(open) {
  $('settings-drawer').hidden = !open;
  $('drawer-backdrop').hidden = !open;

  if (!open) {
    $('settings-button').focus();
    return;
  }
  if (!state) return;

  const form = $('settings-form');
  for (const [key, value] of Object.entries(state.config)) {
    const input = form.elements.namedItem(key);
    if (input) input.value = value;
  }
  form.elements.scenario.value = scenarioFor(state.config.drift_every);
  $('settings-error').hidden = true;
  form.elements.scenario.focus();
}

$('settings-button').onclick = () => drawer(true);
$('close-settings').onclick = () => drawer(false);
$('drawer-backdrop').onclick = () => drawer(false);

document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape' && !$('settings-drawer').hidden) drawer(false);
});

$('settings-form').onsubmit = async (event) => {
  event.preventDefault();
  const data = new FormData(event.currentTarget);
  const config = { ...state.config };
  for (const [key, value] of data) {
    if (key !== 'scenario') config[key] = Number(value);
  }
  config.drift_every = SCENARIO_DRIFT[data.get('scenario')];

  $('settings-error').hidden = true;
  await control('reset', config);
  if ($('settings-error').hidden) drawer(false);
};

// ---------- startup ----------

let resizeTimer;
window.addEventListener('resize', () => {
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(drawCharts, 100);
});

(async () => {
  for (;;) {
    await poll();
    await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
  }
})();
