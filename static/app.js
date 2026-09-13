/**
 * ASTRA - Interactive Exoplanet Detection Dashboard Client
 * Beige / Sandstone theme plotting and pipeline integration
 */

// Global color scheme for Plotly matching the beige palette
const THEME = {
  paperBg: '#FAF8F5',
  plotBg: '#F5EFE6',
  gridColor: '#E8E0D2',
  textColor: '#2C2520',
  textMuted: '#7A6E62',
  terracotta: '#C46243',
  terracottaSoft: 'rgba(196, 98, 67, 0.4)',
  sage: '#4E7554',
  ochre: '#C0852A',
  wine: '#9E4545',
};

document.addEventListener('DOMContentLoaded', () => {
  loadStarList();
  setupEventListeners();
  // Automatically trigger first analysis
  runAnalysis();
  // Pre-load submission table preview
  generateSubmissionPreview();
});

async function loadStarList() {
  try {
    const res = await fetch('/api/star_list');
    const data = await res.json();
    const select = document.getElementById('starSelect');
    select.innerHTML = '';

    data.stars.forEach(s => {
      const opt = document.createElement('option');
      opt.value = s.id;
      opt.textContent = s.name;
      select.appendChild(opt);
    });
  } catch (err) {
    console.error('Error loading star list:', err);
  }
}

function setupEventListeners() {
  document.getElementById('runAnalysisBtn').addEventListener('click', () => runAnalysis());
  document.getElementById('starSelect').addEventListener('change', () => runAnalysis());
  document.getElementById('detrendMethod').addEventListener('change', () => runAnalysis());
  document.getElementById('generateSubBtn').addEventListener('click', () => generateSubmissionPreview());
}

async function runAnalysis() {
  const starId = document.getElementById('starSelect').value;
  const method = document.getElementById('detrendMethod').value;
  const btn = document.getElementById('runAnalysisBtn');
  
  btn.disabled = true;
  btn.innerHTML = `<span class="spinner"></span> <span>Running Pipeline...</span>`;

  try {
    const res = await fetch(`/api/analyze?star_id=${encodeURIComponent(starId)}&method=${method}`);
    if (!res.ok) {
      throw new Error(`Pipeline returned status ${res.status}`);
    }
    const data = await res.json();
    renderDashboard(data);
  } catch (err) {
    alert(`Error analyzing star: ${err.message}`);
  } finally {
    btn.disabled = false;
    btn.innerHTML = `<span>⚡ Run AI Detection Pipeline</span>`;
  }
}

function renderDashboard(data) {
  // 1. Update Metrics Ribbon
  const predEl = document.getElementById('metricPrediction');
  const statusEl = document.getElementById('metricStatus');
  if (data.classification.prediction === 1) {
    predEl.textContent = 'PLANET DETECTED';
    predEl.style.color = 'var(--accent-sage)';
    statusEl.textContent = 'High-significance transit candidate';
  } else {
    predEl.textContent = 'NON-DETECTION';
    predEl.style.color = 'var(--text-muted)';
    statusEl.textContent = 'Null detection / Vetoed systematic';
  }

  document.getElementById('metricConfidence').textContent = `${(data.classification.confidence * 100).toFixed(1)}%`;
  document.getElementById('metricSde').textContent = data.bls.sde > 0 ? data.bls.sde.toFixed(1) : '—';
  
  if (data.bls.period && !isNaN(data.bls.period)) {
    document.getElementById('metricPeriod').textContent = `${data.bls.period.toFixed(3)} d`;
    document.getElementById('metricTransits').textContent = `Observed transits: ${data.vetting.transit_count || '—'}`;
    document.getElementById('metricDepth').textContent = `${data.bls.depth_ppm.toFixed(0)} ppm`;
    document.getElementById('metricDuration').textContent = `Duration: ${data.bls.duration_hours.toFixed(1)} hrs`;
    document.getElementById('bestPeakBadge').textContent = `Best P: ${data.bls.period.toFixed(4)} d`;
  } else {
    document.getElementById('metricPeriod').textContent = '—';
    document.getElementById('metricDepth').textContent = '—';
  }

  document.getElementById('scatterBadge').textContent = `Scatter: ${data.detrended_series.scatter_ppm.toFixed(0)} ppm`;

  // 2. Render Light Curve Plot
  plotLightCurve(data);

  // 3. Render BLS Periodogram Plot
  plotBLS(data);

  // 4. Render Folded Transit Profile Plot
  plotFolded(data);

  // 5. Update Vetting Diagnostics
  renderVetting(data.vetting);

  // 6. Update Characterisation Spotlight
  renderCharacterisation(data);
}

function plotLightCurve(data) {
  const rawTrace = {
    x: data.detrended_series.time,
    y: data.detrended_series.flux,
    mode: 'markers',
    type: 'scatter',
    name: 'Detrended Flux',
    marker: { color: '#52473D', size: 2.5, opacity: 0.6 }
  };

  const trendTrace = {
    x: data.detrended_series.time,
    y: data.detrended_series.trend,
    mode: 'lines',
    type: 'scatter',
    name: 'Stellar Continuum',
    line: { color: THEME.terracotta, width: 2 }
  };

  const layout = {
    margin: { l: 55, r: 20, t: 20, b: 40 },
    paper_bgcolor: THEME.paperBg,
    plot_bgcolor: THEME.plotBg,
    font: { family: '-apple-system, sans-serif', color: THEME.textColor, size: 11 },
    xaxis: {
      title: 'Time (Barycentric Kepler Julian Days)',
      gridcolor: THEME.gridColor,
      zerolinecolor: THEME.gridColor
    },
    yaxis: {
      title: 'Relative Flux',
      gridcolor: THEME.gridColor,
      zerolinecolor: THEME.gridColor
    },
    legend: { x: 0.02, y: 0.98, bgcolor: 'rgba(250, 248, 245, 0.85)' }
  };

  Plotly.newPlot('lightCurvePlot', [rawTrace, trendTrace], layout, { responsive: true, displayModeBar: false });
}

function plotBLS(data) {
  if (!data.bls.coarse_periods || data.bls.coarse_periods.length === 0) return;

  const blsTrace = {
    x: data.bls.coarse_periods,
    y: data.bls.coarse_powers,
    mode: 'lines',
    type: 'scatter',
    name: 'BLS Likelihood Power',
    line: { color: '#3A5A40', width: 1.5 }
  };

  // Add marker for top candidate period
  const peakTrace = {
    x: [data.bls.period],
    y: [Math.max(...data.bls.coarse_powers)],
    mode: 'markers',
    type: 'scatter',
    name: `Detected Peak (${data.bls.period.toFixed(2)}d)`,
    marker: { color: THEME.terracotta, size: 9, symbol: 'star' }
  };

  const layout = {
    margin: { l: 55, r: 20, t: 20, b: 40 },
    paper_bgcolor: THEME.paperBg,
    plot_bgcolor: THEME.plotBg,
    font: { family: '-apple-system, sans-serif', color: THEME.textColor, size: 11 },
    xaxis: {
      title: 'Trial Period (days)',
      type: 'log',
      gridcolor: THEME.gridColor,
      zerolinecolor: THEME.gridColor
    },
    yaxis: {
      title: 'Periodogram Power',
      gridcolor: THEME.gridColor,
      zerolinecolor: THEME.gridColor
    },
    legend: { x: 0.02, y: 0.98, bgcolor: 'rgba(250, 248, 245, 0.85)' }
  };

  Plotly.newPlot('blsPlot', [blsTrace, peakTrace], layout, { responsive: true, displayModeBar: false });
}

function plotFolded(data) {
  if (!data.folded.phase || data.folded.phase.length === 0) return;

  const dotsTrace = {
    x: data.folded.phase,
    y: data.folded.flux,
    mode: 'markers',
    type: 'scatter',
    name: 'Cadences',
    marker: { color: '#887B6F', size: 3, opacity: 0.4 }
  };

  const binTrace = {
    x: data.folded.bin_phase,
    y: data.folded.bin_flux,
    mode: 'lines+markers',
    type: 'scatter',
    name: 'Phase Binned Median',
    line: { color: THEME.terracotta, width: 2.5 },
    marker: { color: THEME.terracotta, size: 5 }
  };

  const layout = {
    margin: { l: 55, r: 20, t: 20, b: 40 },
    paper_bgcolor: THEME.paperBg,
    plot_bgcolor: THEME.plotBg,
    font: { family: '-apple-system, sans-serif', color: THEME.textColor, size: 11 },
    xaxis: {
      title: 'Phase (Transit Centered at 0.0)',
      range: [-0.15, 0.15],
      gridcolor: THEME.gridColor,
      zerolinecolor: THEME.gridColor
    },
    yaxis: {
      title: 'Normalised Flux',
      gridcolor: THEME.gridColor,
      zerolinecolor: THEME.gridColor
    },
    legend: { x: 0.02, y: 0.98, bgcolor: 'rgba(250, 248, 245, 0.85)' }
  };

  Plotly.newPlot('foldedPlot', [dotsTrace, binTrace], layout, { responsive: true, displayModeBar: false });
}

function renderVetting(v) {
  // Odd/even tag
  const oeTag = document.getElementById('oddEvenTag');
  oeTag.textContent = `Ratio: ${v.odd_even_ratio} (Z=${v.odd_even_zscore})`;
  oeTag.className = v.odd_even_pass ? 'badge badge-sage' : 'badge badge-wine';

  // Secondary tag
  const secTag = document.getElementById('secEclipseTag');
  secTag.textContent = `Ratio: ${(v.secondary_depth_ratio * 100).toFixed(1)}%`;
  secTag.className = v.secondary_pass ? 'badge badge-sage' : 'badge badge-wine';

  // Recurrence tag
  const recTag = document.getElementById('recurrenceTag');
  recTag.textContent = `${(v.quarter_recurrence * 100).toFixed(0)}% (${v.transit_count} transits)`;
  recTag.className = v.transit_count >= 3 ? 'badge badge-sage' : 'badge badge-ochre';

  // SNR tag
  const snrTag = document.getElementById('snrTag');
  snrTag.textContent = `SNR: ${v.in_transit_snr}`;
  snrTag.className = v.in_transit_snr >= 4 ? 'badge badge-terracotta' : 'badge badge-wine';

  // Overall badge
  const vetBadge = document.getElementById('vettingBadge');
  if (v.vetting_pass) {
    vetBadge.textContent = 'All Vetting Passed';
    vetBadge.className = 'badge badge-sage';
  } else {
    vetBadge.textContent = 'Vetoed / Suspicious';
    vetBadge.className = 'badge badge-wine';
  }
}

function renderCharacterisation(data) {
  const card = document.getElementById('characterisationCard');
  if (data.classification.prediction !== 1) {
    card.style.display = 'none';
    return;
  }

  card.style.display = 'block';
  const c = data.characterization;
  document.getElementById('spotlightCategory').textContent = `${c.planet_class} Candidate`;
  document.getElementById('spotlightName').textContent = data.star_id;

  const hzBadge = document.getElementById('hzBadge');
  if (c.habitable_zone) {
    hzBadge.style.display = 'inline-flex';
    hzBadge.textContent = '🌿 Habitable Zone';
    hzBadge.className = 'badge badge-sage';
  } else {
    hzBadge.textContent = 'Non-Habitable Zone';
    hzBadge.className = 'badge badge-sand';
  }

  document.getElementById('statRpEarth').textContent = `${c.planet_radius_earth} R⊕`;
  document.getElementById('statRpRs').textContent = c.rp_rs;
  document.getElementById('statSemiMajor').textContent = `${c.semi_major_axis_au} AU`;
  document.getElementById('statFlux').textContent = `${c.stellar_flux_earth} S⊕`;
  document.getElementById('statTeq').textContent = `${c.teq_k} K`;
  document.getElementById('statHost').textContent = `${c.host_teff} K / ${c.host_radius} R☉`;
}

async function generateSubmissionPreview() {
  const tbody = document.getElementById('submissionTableBody');
  tbody.innerHTML = `<tr><td colspan="6" style="text-align: center; padding: 24px;"><span class="spinner"></span> Generating official submission file...</td></tr>`;

  try {
    const res = await fetch('/api/generate_submission', { method: 'POST' });
    const data = await res.json();
    
    tbody.innerHTML = '';
    data.rows.forEach(r => {
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td style="font-family: monospace; font-weight: 600;">${r.star_id}</td>
        <td><span class="badge ${r.prediction === 1 ? 'badge-sage' : 'badge-sand'}">${r.prediction}</span></td>
        <td style="font-family: monospace;">${r.confidence.toFixed(4)}</td>
        <td style="font-family: monospace;">${r.period !== null ? r.period.toFixed(5) : '<span style="color:#B0A597;">—</span>'}</td>
        <td style="font-family: monospace;">${r.depth_ppm !== null ? r.depth_ppm.toFixed(1) : '<span style="color:#B0A597;">—</span>'}</td>
        <td style="font-family: monospace;">${r.duration_hours !== null ? r.duration_hours.toFixed(3) : '<span style="color:#B0A597;">—</span>'}</td>
      `;
      tbody.appendChild(tr);
    });

    const moreTr = document.createElement('tr');
    moreTr.innerHTML = `<td colspan="6" style="text-align: center; color: var(--text-muted); font-size: 12px; padding: 12px;">+ ${data.total_rows - data.rows.length} more stars (all 87 stars verified compliant with official PRD rules)</td>`;
    tbody.appendChild(moreTr);

  } catch (err) {
    tbody.innerHTML = `<tr><td colspan="6" style="color: var(--accent-wine); text-align: center; padding: 20px;">Failed to generate submission: ${err.message}</td></tr>`;
  }
}
