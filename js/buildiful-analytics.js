/*
 * Buildiful Analytics v2.1.0 — privacy-aware GA4 for independent web tools.
 * No tag requests before affirmative consent where consent is required.
 * Implicit activation in other eligible regions is never stored as consent.
 * Only approved, non-sensitive event names are accepted.
 */
(() => {
  'use strict';
  const script = document.currentScript;
  if (!script) return;
  const CONFIG = Object.freeze({
    measurementId: script.dataset.measurementId || '',
    toolName: script.dataset.toolName || document.title,
    allowedHosts: (script.dataset.allowedHosts || 'buildiful.github.io').split(',').map(v => v.trim()),
    privacyUrl: script.dataset.privacyUrl || './privacy.html',
    privacyPage: script.dataset.privacyPage === 'true',
    geoEndpoint: 'https://ipwho.is/',
    geoTimeoutMs: 4500,
    geoCacheMs: 12 * 60 * 60 * 1000,
    choiceMaxMs: 365 * 24 * 60 * 60 * 1000,
    choiceVersion: 2, // Retain compatible explicit preferences from the prior module.
    events: new Set((script.dataset.events || '').split(',').map(v => v.trim()).filter(v => /^[a-z][a-z0-9_]{0,39}$/.test(v)))
  });
  // Existing preference key preserved for interoperability with previously published tools.
  const CHOICE_KEY = 'buildiful.analytics.v2.choice';
  const REGION_KEY = 'buildiful.analytics.v2_1.region';
  const EEA = new Set(['AT','BE','BG','HR','CY','CZ','DK','EE','FI','FR','DE','GR','HU','IS','IE','IT','LV','LI','LT','LU','MT','NL','NO','PL','PT','RO','SK','SI','ES','SE']);
  // Jurisdictions where an eligible configuration is permitted to auto-start
  // but must provide a direct objection mechanism. Add ONLY after legal review.
  const OBJECTION_REGIONS = new Set([]);
  const root = document.getElementById('analyticsConsentRoot');
  const manageWrap = document.getElementById('analyticsManageWrap');
  const manageButton = document.getElementById('analyticsManage');
  let mode = 'unknown'; // consent | objection | auto | unknown
  let state = 'off';
  let tagLoaded = false;
  let trackingEnabled = false;
  let inited = false;
  let lastFocused = null;

  const getJSON = key => { try {return JSON.parse(localStorage.getItem(key) || 'null');} catch (_) {return null;} };
  const putJSON = (key, value) => { try {localStorage.setItem(key, JSON.stringify(value));} catch (_) {/* Storage can be blocked. */} };
  function hasPrivacySignal() {
    return navigator.globalPrivacyControl === true || navigator.doNotTrack === '1' || window.doNotTrack === '1';
  }
  function choice() {
    const saved = getJSON(CHOICE_KEY);
    if (!saved || saved.version !== CONFIG.choiceVersion || !['granted','denied'].includes(saved.value) || !Number.isFinite(saved.at)) return null;
    if (saved.at > Date.now() || Date.now() - saved.at > CONFIG.choiceMaxMs) return null;
    return saved.value;
  }
  function ensureTagQueue() {
    if (window.gtag) return;
    window.dataLayer = window.dataLayer || [];
    window.gtag = function () {window.dataLayer.push(arguments);};
  }
  function setConsent(analytics) {
    ensureTagQueue();
    window.gtag('consent', 'update', {
      analytics_storage: analytics, ad_storage: 'denied',
      ad_user_data: 'denied', ad_personalization: 'denied'
    });
  }
  function disableTracking() {
    state = 'denied';
    trackingEnabled = false;
    if (!CONFIG.measurementId) return;
    window['ga-disable-' + CONFIG.measurementId] = true;
    // A loaded tag cannot be unloaded. Prevent later hits and deny consent.
    if (tagLoaded) setConsent('denied');
  }
  function enableTracking() {
    if (!CONFIG.allowedHosts.includes(location.hostname) || hasPrivacySignal() || !/^G-[A-Z0-9]+$/.test(CONFIG.measurementId)) {
      disableTracking(); return;
    }
    state = 'granted';
    trackingEnabled = true;
    window['ga-disable-' + CONFIG.measurementId] = false;
    if (tagLoaded) {setConsent('granted'); return;}
    ensureTagQueue();
    // The defaults must be queued before loading Google code (Basic Consent Mode).
    window.gtag('consent','default', {
      analytics_storage: 'denied', ad_storage: 'denied',
      ad_user_data: 'denied', ad_personalization: 'denied'
    });
    window.gtag('set', 'ads_data_redaction', true);
    window.gtag('set', 'url_passthrough', false);
    setConsent('granted');
    window.gtag('js', new Date());
    window.gtag('config', CONFIG.measurementId, {
      send_page_view: true,
      page_location: location.origin + location.pathname,
      page_referrer: '',
      allow_google_signals: false,
      allow_ad_personalization_signals: false,
      anonymize_ip: true
    });
    tagLoaded = true;
    const ga = document.createElement('script');
    ga.async = true;
    ga.src = 'https://www.googletagmanager.com/gtag/js?id=' + encodeURIComponent(CONFIG.measurementId);
    ga.referrerPolicy = 'no-referrer';
    ga.onerror = () => {tagLoaded = false; trackingEnabled = false; ga.remove();};
    document.head.appendChild(ga);
  }
  function savedRegionMode() {
    const cached = getJSON(REGION_KEY);
    if (cached && ['consent','objection','auto'].includes(cached.mode) && Number.isFinite(cached.at) &&
        cached.at <= Date.now() && Date.now() - cached.at < CONFIG.geoCacheMs) return cached.mode;
    return null;
  }
  function classify(data) {
    if (!data || data.success === false) throw new Error('No region');
    const country = String(data.country_code || '').toUpperCase();
    const province = String(data.region_code || '').toUpperCase();
    if (!/^[A-Z]{2}$/.test(country)) throw new Error('Unknown country');
    if (EEA.has(country) || country === 'GB' || country === 'CH') return 'consent';
    // Province missing in Canada: do not presume the visitor is outside Quebec.
    if (country === 'CA' && (!province || province === 'QC' || /QUEBEC/i.test(String(data.region || '')))) return 'consent';
    if (OBJECTION_REGIONS.has(country)) return 'objection';
    return 'auto';
  }
  async function detectMode() {
    const cached = savedRegionMode();
    if (cached) return cached;
    const abort = new AbortController();
    const timer = setTimeout(() => abort.abort(), CONFIG.geoTimeoutMs);
    try {
      const response = await fetch(CONFIG.geoEndpoint, {
        method: 'GET', signal: abort.signal, credentials: 'omit',
        referrerPolicy: 'no-referrer', cache: 'no-store'
      });
      if (!response.ok) throw new Error('Region request failed');
      const modeFound = classify(await response.json());
      // Cache coarse policy category only; never IP address or location.
      putJSON(REGION_KEY, {mode: modeFound, at: Date.now()});
      return modeFound;
    } finally {clearTimeout(timer);}
  }
  function canManage() {
    // Prior explicit consent must remain withdrawable, even after travel.
    return mode !== 'auto' || choice() !== null;
  }
  function updateManageButton() {
    if (!manageWrap || !manageButton) return;
    const canShow = CONFIG.allowedHosts.includes(location.hostname) && !hasPrivacySignal() && canManage();
    manageWrap.hidden = !canShow;
    manageButton.disabled = !canShow;
  }
  function injectStyles() {
    if (document.getElementById('buildiful-analytics-style')) return;
    const style = document.createElement('style');
    style.id = 'buildiful-analytics-style';
    style.textContent = `
      .bf-consent-backdrop{position:fixed;inset:0;z-index:10000;background:rgba(13,27,44,.52);display:grid;place-items:center;padding:16px}
      .bf-consent{box-sizing:border-box;background:#fff;color:#152d42;border-radius:18px;box-shadow:0 12px 60px #0004;width:min(100%,540px);padding:clamp(22px,4vw,34px);font:18px/1.5 system-ui,sans-serif}
      .bf-consent h2{font-size:clamp(25px,3vw,32px);line-height:1.2;margin:0 0 12px}
      .bf-consent p{font-size:18px;margin:0 0 16px}
      .bf-consent a{color:#155ba9;text-decoration:underline}
      .bf-consent-actions{display:flex;flex-wrap:wrap;gap:12px;margin-top:22px}
      .bf-consent-actions button{min-height:50px;font:700 18px system-ui,sans-serif;border-radius:10px;padding:10px 20px;border:2px solid #173954;cursor:pointer}
      .bf-consent-actions .bf-primary{background:#173954;color:#fff}
      .bf-consent-actions .bf-secondary{background:#fff;color:#173954}
      .bf-consent-actions button:focus-visible,.bf-consent a:focus-visible{outline:3px solid #dd9a00;outline-offset:3px}
    `;
    document.head.appendChild(style);
  }
  function closeBanner() {
    if (root) root.replaceChildren();
    updateManageButton();
    if (lastFocused?.isConnected) lastFocused.focus();
    lastFocused = null;
  }
  function remember(value) {
    if (value === 'granted' && hasPrivacySignal()) value = 'denied';
    putJSON(CHOICE_KEY, {value, at: Date.now(), version: CONFIG.choiceVersion});
    if (value === 'granted') enableTracking(); else disableTracking();
    closeBanner();
  }
  function showBanner(settings = false) {
    if (!root || (mode === 'auto' && !canManage()) || !CONFIG.allowedHosts.includes(location.hostname)) return;
    injectStyles();
    lastFocused = document.activeElement;
    root.replaceChildren();
    const backdrop = document.createElement('div');
    backdrop.className = 'bf-consent-backdrop';
    const panel = document.createElement('section');
    panel.className = 'bf-consent';
    panel.setAttribute('role', 'dialog');
    panel.setAttribute('aria-modal', 'true');
    panel.setAttribute('aria-label', 'Analytics preferences');
    const heading = document.createElement('h2');
    heading.textContent = 'Optional analytics';
    const copy = document.createElement('p');
    copy.textContent = 'Allow Google Analytics to count visits and basic tool actions?';
    const link = document.createElement('a');
    link.href = CONFIG.privacyUrl;
    link.textContent = 'Privacy details';
    const controls = document.createElement('div');
    controls.className = 'bf-consent-actions';
    const decline = document.createElement('button');
    decline.type = 'button'; decline.className = 'bf-secondary';
    decline.textContent = mode === 'objection' ? 'Turn off analytics' : 'No thanks';
    decline.addEventListener('click', () => remember('denied'));
    const allow = document.createElement('button');
    allow.type = 'button'; allow.className = 'bf-primary'; allow.textContent = 'Allow analytics';
    allow.addEventListener('click', () => remember('granted'));
    if (mode === 'objection') copy.textContent = 'Analytics is enabled for basic statistics. You can turn it off here.';
    controls.append(decline, allow);
    if (settings) {
      const close = document.createElement('button');
      close.type = 'button'; close.textContent = 'Close'; close.className = 'bf-secondary';
      close.addEventListener('click', closeBanner);
      controls.append(close);
    }
    panel.append(heading, copy, link, controls);
    backdrop.append(panel);
    root.append(backdrop);
    allow.focus();
    const onKey = event => {
      if (event.key === 'Escape' && settings) { closeBanner(); return; }
      if (event.key !== 'Tab') return;
      const items = Array.from(panel.querySelectorAll('a[href],button:not([disabled])'));
      if (!items.length) return;
      const first = items[0], last = items[items.length - 1];
      if (event.shiftKey && document.activeElement === first) {event.preventDefault(); last.focus();}
      else if (!event.shiftKey && document.activeElement === last) {event.preventDefault(); first.focus();}
    };
    backdrop.addEventListener('keydown', onKey);
  }
  async function init() {
    if (inited) return;
    inited = true;
    if (manageButton) manageButton.addEventListener('click', () => showBanner(true));
    if (!CONFIG.allowedHosts.includes(location.hostname) || !/^G-[A-Z0-9]+$/.test(CONFIG.measurementId)) {
      updateManageButton(); return;
    }
    if (hasPrivacySignal()) {disableTracking(); updateManageButton(); return;}
    const previous = choice();
    // A prior explicit choice can determine tracking without a new lookup.
    if (previous === 'denied') disableTracking();
    if (previous === 'granted') enableTracking();
    try {mode = await detectMode();}
    catch (_) {mode = 'unknown';} // Unknown region => affirmative consent required.
    // Re-check because a user may act while the lookup is pending.
    const current = choice();
    if (hasPrivacySignal()) disableTracking();
    else if (current === 'denied') disableTracking();
    else if (current === 'granted') enableTracking();
    else if (mode === 'auto' || mode === 'objection') enableTracking();
    else if (!CONFIG.privacyPage) showBanner();
    updateManageButton();
  }
  window.BuildifulAnalytics = Object.freeze({
    version: '2.1.0',
    track(name) {
      if (!trackingEnabled || !tagLoaded || hasPrivacySignal() || !CONFIG.events.has(name)) return;
      window.gtag?.('event', name, {tool_name: CONFIG.toolName});
    },
    openSettings() { if (!hasPrivacySignal() && canManage()) showBanner(true); }
  });
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => {void init();}, {once:true});
  else void init();
})();
