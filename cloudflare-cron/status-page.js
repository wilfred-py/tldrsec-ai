// status-page.js - Static HTML status page served from Cloudflare Worker
// Reads component health from KV store, renders server-side HTML
// No client-side JS required - timestamps are absolute UTC

/**
 * HTML-entity-escape a string to prevent XSS from KV values
 * @param {string} str
 * @returns {string}
 */
function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Format a UTC timestamp as human-readable absolute time
 * @param {string|null} isoString
 * @returns {string}
 */
function formatTime(isoString) {
  if (!isoString) return 'Unknown';
  try {
    const d = new Date(isoString);
    if (isNaN(d.getTime())) return 'Unknown';
    const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    const month = months[d.getUTCMonth()];
    const day = d.getUTCDate();
    const hours = String(d.getUTCHours()).padStart(2, '0');
    const minutes = String(d.getUTCMinutes()).padStart(2, '0');
    return `${month} ${day}, ${hours}:${minutes} UTC`;
  } catch {
    return 'Unknown';
  }
}

/**
 * Calculate minutes since a given ISO timestamp
 * @param {string|null} isoString
 * @returns {number|null}
 */
function minutesSince(isoString) {
  if (!isoString) return null;
  try {
    const ms = Date.now() - new Date(isoString).getTime();
    return Math.round(ms / 60000);
  } catch {
    return null;
  }
}

/**
 * Determine component status from age in minutes
 * @param {number|null} ageMinutes
 * @returns {{ status: string, color: string, dot: string }}
 */
function deriveStatus(ageMinutes) {
  if (ageMinutes === null || ageMinutes === undefined) {
    return { status: 'Unknown', color: '#6B7280', dot: '#6B7280' };
  }
  if (ageMinutes < 10) {
    return { status: 'Operational', color: '#059669', dot: '#10B981' };
  }
  if (ageMinutes < 30) {
    return { status: 'Degraded', color: '#D97706', dot: '#F59E0B' };
  }
  return { status: 'Outage', color: '#DC2626', dot: '#EF4444' };
}

/**
 * Determine overall status from component statuses
 * @param {Array<{ status: string }>} components
 * @returns {{ text: string, bg: string, color: string }}
 */
function overallStatus(components) {
  const hasOutage = components.some(c => c.status === 'Outage');
  const hasDegraded = components.some(c => c.status === 'Degraded');
  const hasUnknown = components.some(c => c.status === 'Unknown');

  if (hasOutage) {
    return { text: 'Major Outage', bg: '#FEE2E2', color: '#DC2626' };
  }
  if (hasDegraded) {
    return { text: 'Partial Degradation', bg: '#FEF3C7', color: '#D97706' };
  }
  if (hasUnknown) {
    return { text: 'Status Unknown', bg: '#F3F4F6', color: '#6B7280' };
  }
  return { text: 'All Systems Operational', bg: '#D1FAE5', color: '#059669' };
}

/**
 * Render the status page HTML from KV data
 * @param {object|null} kvData - Parsed JSON from STATUS_KV, or null if unavailable
 * @param {object} handlerHealth - In-memory handler health fallback
 * @returns {string} HTML string
 */
export function renderStatusPage(kvData, handlerHealth) {
  const now = new Date().toISOString();

  // Check for staleness: if lastCheck is >15 min old, data is stale
  let stale = false;
  let staleMessage = '';

  if (!kvData) {
    // KV empty or unavailable - first deploy or KV not provisioned
    return renderInitializingPage(now);
  }

  const lastCheckAge = minutesSince(kvData.lastCheck);
  if (lastCheckAge !== null && lastCheckAge > 15) {
    stale = true;
    staleMessage = 'Status data is stale. The monitoring system may be experiencing issues.';
  }

  // Build component list
  const components = [];

  if (kvData.components?.web) {
    const age = minutesSince(kvData.components.web.checkedAt);
    const s = stale ? deriveStatus(null) : deriveStatus(age);
    components.push({
      name: 'Web Application',
      description: 'Dashboard and API',
      ...s,
      checkedAt: kvData.components.web.checkedAt,
    });
  }

  if (kvData.components?.pipeline) {
    const age = minutesSince(kvData.components.pipeline.lastCompletion);
    const s = stale ? deriveStatus(null) : deriveStatus(age);
    components.push({
      name: 'Filing Pipeline',
      description: 'SEC filing discovery and processing',
      ...s,
      checkedAt: kvData.components.pipeline.lastCompletion,
    });
  }

  if (kvData.components?.worker) {
    const workerStatus = kvData.components.worker;
    let s;
    if (stale) {
      s = deriveStatus(null);
    } else if (workerStatus.circuitBreaker === 'OPEN') {
      s = { status: 'Outage', color: '#DC2626', dot: '#EF4444' };
    } else if (workerStatus.consecutiveFailures > 0) {
      s = { status: 'Degraded', color: '#D97706', dot: '#F59E0B' };
    } else {
      s = { status: 'Operational', color: '#059669', dot: '#10B981' };
    }
    components.push({
      name: 'Cron Worker',
      description: 'Scheduled task execution',
      ...s,
      checkedAt: kvData.components.worker.checkedAt || kvData.lastCheck,
    });
  }

  // If no components found, use handler health fallback
  if (components.length === 0) {
    return renderFromHandlerHealth(handlerHealth, now);
  }

  const overall = overallStatus(components);

  return renderPage({ components, overall, stale, staleMessage, lastCheck: kvData.lastCheck, now });
}

/**
 * Render the initializing page (KV empty / first deploy)
 */
function renderInitializingPage(now) {
  return renderShell(`
    <div style="background:#F3F4F6;border-radius:8px;padding:16px 24px;text-align:center;margin-bottom:24px;">
      <span style="font-size:18px;font-weight:600;color:#6B7280;">Status Monitoring Initializing</span>
    </div>
    <p style="text-align:center;color:#6B7280;font-size:14px;">
      Check back in 5 minutes. The monitoring system is collecting its first data points.
    </p>
    <p style="text-align:center;color:#9CA3AF;font-size:12px;margin-top:24px;">
      Last rendered: ${escapeHtml(formatTime(now))}
    </p>
  `);
}

/**
 * Render from in-memory handler health (KV fallback)
 */
function renderFromHandlerHealth(handlerHealth, now) {
  const components = [];
  for (const [name, handler] of Object.entries(handlerHealth || {})) {
    const age = minutesSince(handler.lastSuccess);
    const s = deriveStatus(age);
    components.push({
      name: name === 'pipelineProcessing' ? 'Filing Pipeline' :
            name === 'autoRecovery' ? 'Auto Recovery' :
            name === 'dailyReport' ? 'Daily Tasks' :
            name,
      description: '',
      ...s,
      checkedAt: handler.lastSuccess,
    });
  }

  const overall = overallStatus(components);
  return renderPage({ components, overall, stale: false, staleMessage: '', lastCheck: now, now, fallback: true });
}

/**
 * Render the full status page
 */
function renderPage({ components, overall, stale, staleMessage, lastCheck, now, fallback = false }) {
  const componentRows = components.map(c => `
    <div style="display:flex;align-items:center;justify-content:space-between;padding:14px 20px;border-bottom:1px solid #E5E7EB;">
      <div style="display:flex;align-items:center;gap:12px;">
        <span style="display:inline-block;width:10px;height:10px;border-radius:50%;background:${escapeHtml(c.dot)};flex-shrink:0;"></span>
        <div>
          <span style="font-weight:500;color:#111827;">${escapeHtml(c.name)}</span>
          ${c.description ? `<span style="color:#6B7280;font-size:13px;margin-left:8px;">${escapeHtml(c.description)}</span>` : ''}
        </div>
      </div>
      <div style="text-align:right;">
        <span style="color:${escapeHtml(c.color)};font-size:13px;font-weight:500;">${escapeHtml(c.status)}</span>
        ${c.checkedAt ? `<div style="color:#9CA3AF;font-size:11px;">${escapeHtml(formatTime(c.checkedAt))}</div>` : ''}
      </div>
    </div>
  `).join('');

  const staleBanner = stale ? `
    <div style="background:#FEF3C7;border:1px solid #FCD34D;border-radius:8px;padding:12px 16px;margin-bottom:16px;text-align:center;">
      <span style="color:#92400E;font-size:13px;font-weight:500;">${escapeHtml(staleMessage)}</span>
    </div>
  ` : '';

  const fallbackNotice = fallback ? `
    <div style="background:#F3F4F6;border-radius:8px;padding:8px 16px;margin-bottom:16px;text-align:center;">
      <span style="color:#6B7280;font-size:12px;">Showing in-memory data. KV storage not yet provisioned.</span>
    </div>
  ` : '';

  return renderShell(`
    ${staleBanner}
    ${fallbackNotice}
    <div style="background:${escapeHtml(overall.bg)};border-radius:8px;padding:16px 24px;text-align:center;margin-bottom:24px;">
      <span style="font-size:18px;font-weight:600;color:${escapeHtml(overall.color)};">${escapeHtml(overall.text)}</span>
    </div>
    <div style="background:white;border:1px solid #E5E7EB;border-radius:8px;overflow:hidden;">
      ${componentRows}
    </div>
    <p style="text-align:center;color:#9CA3AF;font-size:12px;margin-top:24px;">
      Last checked: ${escapeHtml(formatTime(lastCheck))} &middot; Rendered: ${escapeHtml(formatTime(now))}
    </p>
  `);
}

/**
 * Render the HTML shell with head, styles, and body wrapper
 */
function renderShell(bodyContent) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>tldrSEC Status</title>
  <meta name="description" content="Current operational status of tldrSEC services">
  <meta property="og:title" content="tldrSEC Status">
  <meta property="og:description" content="Current operational status of tldrSEC services">
  <meta name="robots" content="noindex, nofollow">
</head>
<body style="margin:0;padding:0;background:#FAFAFA;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif;color:#111827;line-height:1.5;">
  <div style="max-width:600px;margin:0 auto;padding:40px 20px;">
    <div style="text-align:center;margin-bottom:32px;">
      <h1 style="font-size:24px;font-weight:700;margin:0 0 4px 0;">tldrSEC</h1>
      <p style="color:#6B7280;font-size:14px;margin:0;">System Status</p>
    </div>
    ${bodyContent}
    <div style="text-align:center;margin-top:32px;padding-top:16px;border-top:1px solid #E5E7EB;">
      <a href="https://tldrsec.app" style="color:#6B7280;font-size:12px;text-decoration:none;">tldrsec.app</a>
    </div>
  </div>
</body>
</html>`;
}
