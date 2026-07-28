// Benchmark bands for running-dynamics metrics, based on the ranges Garmin and
// run-science literature commonly publish for recreational-to-competitive runners.
// Bands are ordered from best to worst; `dir` says whether a higher or lower
// value is better so trends/issue detection can share one code path per metric.
const METRICS = {
  cadence: {
    label: 'Cadence', unit: 'spm', dir: 'higher',
    bands: [
      { max: Infinity, min: 183, band: 'excellent' },
      { max: 183, min: 174, band: 'good' },
      { max: 174, min: 163, band: 'average' },
      { max: 163, min: 153, band: 'belowAverage' },
      { max: 153, min: -Infinity, band: 'poor' },
    ],
  },
  verticalOscillation: {
    label: 'Vertical oscillation', unit: 'cm', dir: 'lower',
    bands: [
      { max: 6.7, min: -Infinity, band: 'excellent' },
      { max: 8.4, min: 6.7, band: 'good' },
      { max: 10.1, min: 8.4, band: 'average' },
      { max: 11.8, min: 10.1, band: 'belowAverage' },
      { max: Infinity, min: 11.8, band: 'poor' },
    ],
  },
  groundContactTime: {
    label: 'Ground contact time', unit: 'ms', dir: 'lower',
    bands: [
      { max: 208, min: -Infinity, band: 'excellent' },
      { max: 241, min: 208, band: 'good' },
      { max: 273, min: 241, band: 'average' },
      { max: 305, min: 273, band: 'belowAverage' },
      { max: Infinity, min: 305, band: 'poor' },
    ],
  },
  verticalRatio: {
    label: 'Vertical ratio', unit: '%', dir: 'lower',
    bands: [
      { max: 6.1, min: -Infinity, band: 'excellent' },
      { max: 7.4, min: 6.1, band: 'good' },
      { max: 8.7, min: 7.4, band: 'average' },
      { max: 10.1, min: 8.7, band: 'belowAverage' },
      { max: Infinity, min: 10.1, band: 'poor' },
    ],
  },
  gctBalanceDeviation: {
    label: 'L/R contact-time balance', unit: '% from even', dir: 'lower',
    bands: [
      { max: 1, min: -Infinity, band: 'excellent' },
      { max: 2, min: 1, band: 'good' },
      { max: 3, min: 2, band: 'average' },
      { max: 4, min: 3, band: 'belowAverage' },
      { max: Infinity, min: 4, band: 'poor' },
    ],
  },
};

const BAND_SCORE = { excellent: 95, good: 80, average: 60, belowAverage: 40, poor: 20 };
const BAND_WEAK = new Set(['belowAverage', 'poor']);

function classify(key, value) {
  const def = METRICS[key];
  const band = def.bands.find((b) => value >= b.min && value < b.max) || def.bands[def.bands.length - 1];
  return { band: band.band, score: BAND_SCORE[band.band] };
}

// --- unit normalization -----------------------------------------------------
// The unofficial Garmin API returns these fields without documented units, and
// they vary by device/firmware, so each normalizer guards against the
// alternate unit it's most commonly seen in.
function normStrideLength(raw) {
  if (typeof raw !== 'number' || !isFinite(raw) || raw <= 0) return null;
  return raw > 10 ? raw / 100 : raw; // cm -> m
}
function normVerticalOscillation(raw) {
  if (typeof raw !== 'number' || !isFinite(raw) || raw <= 0) return null;
  return raw > 30 ? raw / 10 : raw; // mm -> cm
}
function normGroundContactTime(raw) {
  if (typeof raw !== 'number' || !isFinite(raw) || raw <= 0) return null;
  return raw < 10 ? raw * 1000 : raw; // s -> ms
}
function normCadence(raw) {
  if (typeof raw !== 'number' || !isFinite(raw) || raw <= 0) return null;
  return raw < 120 ? raw * 2 : raw; // per-leg -> total spm
}
function parseGctBalance(raw) {
  if (raw == null) return null;
  if (typeof raw === 'object') {
    const left = raw.left ?? raw.phaseLeft ?? raw.groundContactTimeBalanceLeft;
    const right = raw.right ?? raw.phaseRight ?? raw.groundContactTimeBalanceRight;
    if (typeof left === 'number' && typeof right === 'number') return { left, right };
    return null;
  }
  if (typeof raw === 'string') {
    const nums = (raw.match(/-?\d+(\.\d+)?/g) || []).map(Number);
    if (nums.length >= 2) return { left: nums[0], right: nums[1] };
  }
  return null;
}

/** Normalizes one raw Garmin activity into the flat metrics this module works with. */
export function normalizeRun(activity) {
  if (!activity || !activity.distance || !activity.duration) return null;
  const gctBalance = parseGctBalance(activity.avgGroundContactBalance);
  return {
    id: activity.activityId,
    name: activity.activityName || 'Run',
    date: activity.startTimeLocal || activity.startTimeGMT || null,
    distanceKm: activity.distance / 1000,
    durationMin: activity.duration / 60,
    paceMinPerKm: activity.averageSpeed > 0 ? (1000 / activity.averageSpeed) / 60 : null,
    elevationGain: activity.elevationGain ?? null,
    avgHR: activity.averageHR ?? null,
    vo2max: activity.vO2MaxValue ?? null,
    cadence: normCadence(activity.averageRunningCadenceInStepsPerMinute),
    strideLength: normStrideLength(activity.avgStrideLength),
    verticalOscillation: normVerticalOscillation(activity.avgVerticalOscillation),
    groundContactTime: normGroundContactTime(activity.avgGroundContactTime),
    verticalRatio: typeof activity.avgVerticalRatio === 'number' ? activity.avgVerticalRatio : null,
    gctBalanceDeviation: gctBalance ? Math.abs(gctBalance.left - 50) : null,
    gctBalance,
  };
}

function average(values) {
  const nums = values.filter((v) => typeof v === 'number' && isFinite(v));
  if (nums.length === 0) return null;
  return nums.reduce((a, b) => a + b, 0) / nums.length;
}

function trendDirection(metricKey, recentAvg, priorAvg) {
  if (recentAvg == null || priorAvg == null || priorAvg === 0) return null;
  const deltaPct = ((recentAvg - priorAvg) / Math.abs(priorAvg)) * 100;
  const higherIsBetter = METRICS[metricKey].dir === 'higher';
  const improvingUp = higherIsBetter ? deltaPct > 0 : deltaPct < 0;
  const flat = Math.abs(deltaPct) < 1.5;
  return {
    key: metricKey,
    recentAvg, priorAvg, deltaPct,
    direction: flat ? 'flat' : (improvingUp ? 'improving' : 'worsening'),
  };
}

const ISSUE_DEFS = [
  {
    key: 'lowCadence', title: 'Cadence lower than efficient',
    test: (m) => m.cadence?.band && ['average', 'belowAverage', 'poor'].includes(m.cadence.band),
    severity: (m) => (BAND_WEAK.has(m.cadence.band) ? 'high' : 'moderate'),
  },
  {
    key: 'highVerticalOscillation', title: 'Excess vertical bounce',
    test: (m) => m.verticalOscillation?.band && BAND_WEAK.has(m.verticalOscillation.band),
    severity: (m) => (m.verticalOscillation.band === 'poor' ? 'high' : 'moderate'),
  },
  {
    key: 'highGroundContactTime', title: 'Ground contact time longer than efficient',
    test: (m) => m.groundContactTime?.band && BAND_WEAK.has(m.groundContactTime.band),
    severity: (m) => (m.groundContactTime.band === 'poor' ? 'high' : 'moderate'),
  },
  {
    key: 'highVerticalRatio', title: 'Vertical ratio shows wasted vertical motion',
    test: (m) => m.verticalRatio?.band && BAND_WEAK.has(m.verticalRatio.band),
    severity: (m) => (m.verticalRatio.band === 'poor' ? 'high' : 'moderate'),
  },
  {
    key: 'gctImbalance', title: 'Left/right ground contact time imbalance',
    test: (m) => m.gctBalanceDeviation?.band && BAND_WEAK.has(m.gctBalanceDeviation.band),
    severity: (m) => (m.gctBalanceDeviation.band === 'poor' ? 'high' : 'moderate'),
  },
  {
    key: 'overstriding', title: 'Overstriding pattern (low cadence + long ground contact / bounce)',
    test: (m) => {
      const cadenceWeak = m.cadence?.band && ['belowAverage', 'poor'].includes(m.cadence.band);
      const supportWeak = (m.groundContactTime?.band && BAND_WEAK.has(m.groundContactTime.band))
        || (m.verticalOscillation?.band && BAND_WEAK.has(m.verticalOscillation.band));
      return cadenceWeak && supportWeak;
    },
    severity: () => 'high',
  },
];

/**
 * Turns a list of raw Garmin activities into a technique report: averaged
 * metrics with benchmark bands, a composite score, detected issues, and
 * recent-vs-prior trends.
 */
export function analyzeRuns(rawActivities) {
  const runs = (rawActivities || [])
    .map(normalizeRun)
    .filter((r) => r && r.distanceKm >= 0.8)
    .sort((a, b) => new Date(b.date || 0) - new Date(a.date || 0));

  if (runs.length === 0) {
    return { runsAnalyzed: 0, metrics: [], techniqueScore: null, issues: [], trends: [], runs: [] };
  }

  const metricKeys = Object.keys(METRICS);
  const overallAvgs = {};
  for (const key of metricKeys) overallAvgs[key] = average(runs.map((r) => r[key]));

  const metricsClassified = {};
  const metrics = [];
  for (const key of metricKeys) {
    const value = overallAvgs[key];
    if (value == null) continue;
    const { band, score } = classify(key, value);
    metricsClassified[key] = { band, score };
    metrics.push({ key, label: METRICS[key].label, unit: METRICS[key].unit, value, band, score });
  }

  const techniqueScore = metrics.length
    ? Math.round(metrics.reduce((sum, m) => sum + m.score, 0) / metrics.length)
    : null;

  const issues = ISSUE_DEFS
    .filter((def) => def.test(metricsClassified))
    .map((def) => ({ key: def.key, title: def.title, severity: def.severity(metricsClassified) }));

  const trends = [];
  const trendGroupSize = Math.min(5, Math.floor(runs.length / 2));
  if (trendGroupSize >= 2) {
    const recent = runs.slice(0, trendGroupSize);
    const prior = runs.slice(trendGroupSize, trendGroupSize * 2);
    for (const key of metricKeys) {
      const recentAvg = average(recent.map((r) => r[key]));
      const priorAvg = average(prior.map((r) => r[key]));
      const trend = trendDirection(key, recentAvg, priorAvg);
      if (trend) trends.push({ ...trend, label: METRICS[key].label });
    }
  }

  return {
    runsAnalyzed: runs.length,
    metrics,
    techniqueScore,
    issues,
    trends,
    runs: runs.slice(0, 10),
  };
}

export { METRICS };
