const el = (id) => document.getElementById(id);

const BAND_LABELS = {
  excellent: 'Excellent',
  good: 'Good',
  average: 'Average',
  belowAverage: 'Below average',
  poor: 'Needs work',
};

function formatPace(minPerKm) {
  if (typeof minPerKm !== 'number' || !isFinite(minPerKm)) return '--';
  const totalSec = Math.round(minPerKm * 60);
  const mm = Math.floor(totalSec / 60);
  const ss = String(totalSec % 60).padStart(2, '0');
  return `${mm}:${ss}/km`;
}

function formatDate(iso) {
  if (!iso) return '--';
  const d = new Date(iso);
  if (isNaN(d)) return '--';
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

function formatRelative(iso) {
  if (!iso) return null;
  const d = new Date(iso);
  if (isNaN(d)) return null;
  const diffMin = Math.round((Date.now() - d.getTime()) / 60000);
  if (diffMin < 1) return 'just now';
  if (diffMin < 60) return `${diffMin} min ago`;
  const diffHr = Math.round(diffMin / 60);
  if (diffHr < 24) return `${diffHr} hr ago`;
  return `${Math.round(diffHr / 24)} d ago`;
}

function metricCard({ label, unit, value, band }) {
  const decimals = unit === 'ms' || unit === 'spm' ? 0 : 1;
  return `
    <div class="metric-card band-${band}">
      <span class="metric-label">${label}</span>
      <span class="metric-value">${value.toFixed(decimals)}<small>${unit}</small></span>
      <span class="metric-band">${BAND_LABELS[band] || band}</span>
    </div>`;
}

function trendRow(trend) {
  const arrow = trend.direction === 'improving' ? '▲' : trend.direction === 'worsening' ? '▼' : '→';
  const cls = trend.direction === 'improving' ? 'is-good' : trend.direction === 'worsening' ? 'is-bad' : 'is-flat';
  return `
    <li class="trend-row ${cls}">
      <span>${trend.label}</span>
      <span class="trend-delta">${arrow} ${Math.abs(trend.deltaPct).toFixed(1)}%</span>
    </li>`;
}

function issueRow(issue) {
  return `
    <li class="issue-row severity-${issue.severity}">
      <span class="issue-dot"></span>
      <span>${issue.title}</span>
    </li>`;
}

function drillCard(drill) {
  return `
    <div class="drill-card">
      <div class="drill-head">
        <strong>${drill.name}</strong>
        <span class="pill">${drill.dosage}</span>
      </div>
      <p class="drill-cue">${drill.cue}</p>
      <p class="drill-why">${drill.why}</p>
    </div>`;
}

function runRow(run) {
  return `
    <tr>
      <td>${formatDate(run.date)}</td>
      <td>${run.distanceKm.toFixed(1)}km</td>
      <td>${formatPace(run.paceMinPerKm)}</td>
      <td>${run.cadence ? Math.round(run.cadence) : '--'}</td>
      <td>${run.groundContactTime ? Math.round(run.groundContactTime) : '--'}</td>
      <td>${run.verticalOscillation ? run.verticalOscillation.toFixed(1) : '--'}</td>
    </tr>`;
}

function renderAnalysis(analysis) {
  const section = el('runningAnalysis');
  if (!analysis || analysis.runsAnalyzed === 0) {
    section.hidden = false;
    el('techniqueScoreValue').textContent = '--';
    el('runsAnalyzedLabel').textContent = 'No running activities found yet in your Garmin history - go for a run, then sync again.';
    el('metricsGrid').innerHTML = '';
    el('trendsSection').hidden = true;
    el('issuesSection').hidden = true;
    el('drillsList').innerHTML = '';
    el('runsTableBody').innerHTML = '';
    return;
  }

  section.hidden = false;
  el('techniqueScoreValue').textContent = analysis.techniqueScore ?? '--';
  const synced = formatRelative(analysis.syncedAt);
  el('runsAnalyzedLabel').textContent = `Based on your last ${analysis.runsAnalyzed} run${analysis.runsAnalyzed === 1 ? '' : 's'}${synced ? ` - synced ${synced}` : ''}.`;

  el('metricsGrid').innerHTML = analysis.metrics.map(metricCard).join('');

  const trendsSection = el('trendsSection');
  trendsSection.hidden = analysis.trends.length === 0;
  el('trendsList').innerHTML = analysis.trends.map(trendRow).join('');

  const issuesSection = el('issuesSection');
  issuesSection.hidden = analysis.issues.length === 0;
  el('issuesList').innerHTML = analysis.issues.length
    ? analysis.issues.map(issueRow).join('')
    : '';

  el('drillsList').innerHTML = (analysis.drills || []).map(drillCard).join('');

  el('runsTableBody').innerHTML = analysis.runs.map(runRow).join('');
}

async function refreshStatus() {
  const res = await fetch('/api/garmin/status');
  const status = await res.json();

  el('garminConnectCard').hidden = status.connected;
  el('garminConnectedCard').hidden = !status.connected;

  if (status.connected) {
    el('garminAccountName').textContent = status.displayName ? `Connected as ${status.displayName}` : 'Connected';
    el('garminLastSynced').textContent = status.lastSyncedAt
      ? `Last synced ${formatRelative(status.lastSyncedAt)}`
      : 'Not synced yet - tap "Sync latest runs"';

    const cachedRes = await fetch('/api/garmin/analysis');
    if (cachedRes.ok) {
      renderAnalysis(await cachedRes.json());
    } else {
      el('runningAnalysis').hidden = true;
    }
  } else {
    el('runningAnalysis').hidden = true;
  }
}

async function connect() {
  const email = el('garminEmail').value.trim();
  const password = el('garminPassword').value;
  if (!email || !password) {
    el('garminConnectStatus').textContent = 'Enter your Garmin email and password.';
    return;
  }
  const btn = el('garminConnectBtn');
  btn.disabled = true;
  el('garminConnectStatus').textContent = 'Connecting to Garmin...';
  try {
    const res = await fetch('/api/garmin/connect', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Could not connect.');
    el('garminPassword').value = '';
    el('garminConnectStatus').textContent = '';
    await refreshStatus();
    await sync();
  } catch (err) {
    el('garminConnectStatus').textContent = err.message;
  } finally {
    btn.disabled = false;
  }
}

async function disconnect() {
  if (!confirm('Disconnect Garmin? Your stored credentials and synced analysis will be deleted from this server.')) return;
  await fetch('/api/garmin/disconnect', { method: 'POST' });
  el('garminEmail').value = '';
  el('garminPassword').value = '';
  await refreshStatus();
}

async function sync() {
  const btn = el('garminSyncBtn');
  btn.disabled = true;
  el('garminSyncStatus').textContent = 'Syncing your recent runs from Garmin - this can take a few seconds...';
  try {
    const res = await fetch('/api/garmin/sync', { method: 'POST' });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Sync failed.');
    el('garminSyncStatus').textContent = '';
    renderAnalysis(data);
    await refreshStatus();
  } catch (err) {
    el('garminSyncStatus').textContent = err.message;
  } finally {
    btn.disabled = false;
  }
}

export function initRunning() {
  el('garminConnectBtn').addEventListener('click', connect);
  el('garminDisconnectBtn').addEventListener('click', disconnect);
  el('garminSyncBtn').addEventListener('click', sync);
  refreshStatus();
}

export function refreshRunning() {
  return refreshStatus();
}
