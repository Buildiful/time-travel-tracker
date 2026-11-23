/* Time Travel Tracker by Buildiful® — on-device flight log. */
(() => {
  'use strict';
  const MathTZ = window.TimeTravelMath;
  const airportRows = window.TTT_AIRPORTS || [];
  const airportMap = new Map(airportRows.map(([code, city, zone]) => [code, {code, city, zone}]));
  const $ = id => document.getElementById(id);
  const list = $('flightList');
  const fileInput = $('projectFile');
  const music = $('bgMusic');
  const STORAGE_KEY = 'buildiful.timeTravelTracker.project.v1';
  const SETTINGS_KEY = 'buildiful.timeTravelTracker.settings.v1';
  const FILE_FORMAT = 'buildiful-time-travel-tracker';
  const MAX_ENTRIES = 1000;
  let flights = [];
  let nextId = 1;
  let sfxEnabled = true;
  let soundContext = null;
  let saveTimer = null;
  let toastTimer = null;
  let storageAvailable = true;

  function newFlight() {
    return {
      id: nextId++, from: '', to: '', depart: '', arrive: '', departZone: '', arriveZone: '',
      days: '', hours: '', minutes: '', durationManual: false, departChoice: 'earlier', arriveChoice: 'earlier'
    };
  }
  function cleanFlight(raw) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new Error('Invalid flight entry');
    const flight = newFlight();
    const strings = ['from','to','depart','arrive','departZone','arriveZone','days','hours','minutes'];
    for (const key of strings) {
      const val = raw[key] == null ? '' : String(raw[key]);
      if (val.length > 120) throw new Error('Flight entry is too long');
      flight[key] = val;
    }
    flight.from = flight.from.toUpperCase();
    flight.to = flight.to.toUpperCase();
    flight.durationManual = raw.durationManual === true;
    flight.departChoice = raw.departChoice === 'later' ? 'later' : 'earlier';
    flight.arriveChoice = raw.arriveChoice === 'later' ? 'later' : 'earlier';
    return flight;
  }
  function readProject(data) {
    if (!data || typeof data !== 'object' || Array.isArray(data) || data.format !== FILE_FORMAT || !Array.isArray(data.flights)) throw new Error('Not a Time Travel Tracker project');
    if (data.flights.length > MAX_ENTRIES) throw new Error('Too many flights in project');
    return data.flights.map(cleanFlight);
  }
  function projectData() {
    // Save typed inputs, not calculated results, to keep the JSON editable and self-contained.
    return {
      format: FILE_FORMAT,
      version: 1,
      savedAt: new Date().toISOString(),
      flights: flights.map(({from,to,depart,arrive,departZone,arriveZone,days,hours,minutes,durationManual,departChoice,arriveChoice}) =>
        ({from,to,depart,arrive,departZone,arriveZone,days,hours,minutes,durationManual,departChoice,arriveChoice}))
    };
  }
  function safeGet(key) { try { return localStorage.getItem(key); } catch (_) { storageAvailable = false; return null; } }
  function safeSet(key, value) { try { localStorage.setItem(key, value); return true; } catch (_) { storageAvailable = false; return false; } }
  function persistNow() {
    if (saveTimer) { clearTimeout(saveTimer); saveTimer = null; }
    safeSet(STORAGE_KEY, JSON.stringify(projectData()));
    $('saveStatus').textContent = storageAvailable ? 'Saved in this browser' : 'Use Save project to keep a copy';
  }
  function schedulePersist() {
    $('saveStatus').textContent = 'Saving locally…';
    if (saveTimer) clearTimeout(saveTimer);
    saveTimer = setTimeout(persistNow, 260);
  }
  function track(event) { window.BuildifulAnalytics?.track(event); }

  function setupSuggestions() {
    const suggestionRoot = $('airportSuggestions');
    const airportFragment = document.createDocumentFragment();
    for (const [code, city] of airportRows) {
      const option = document.createElement('option');
      option.value = code;
      option.label = `${code} · ${city}`;
      airportFragment.appendChild(option);
    }
    suggestionRoot.appendChild(airportFragment);

    const timeZones = new Set(airportRows.map(row => row[2]));
    if (typeof Intl.supportedValuesOf === 'function') {
      for (const zone of Intl.supportedValuesOf('timeZone')) timeZones.add(zone);
    }
    timeZones.add('UTC');
    const zoneDatalist = document.createElement('datalist');
    zoneDatalist.id = 'timezoneSuggestions';
    const zoneFragment = document.createDocumentFragment();
    for (const zone of [...timeZones].sort((a,b) => a.localeCompare(b))) {
      try { new Intl.DateTimeFormat('en-US', {timeZone: zone}); }
      catch (_) { continue; }
      const option = document.createElement('option'); option.value = zone; zoneFragment.appendChild(option);
    }
    zoneDatalist.appendChild(zoneFragment);
    document.body.appendChild(zoneDatalist);
  }
  function makeFlightCard(f, index) {
    const article = document.createElement('article');
    article.className = 'flight-card';
    article.dataset.id = String(f.id);
    article.dataset.state = 'empty';
    // Template contains only constant markup. All project content is assigned through DOM properties.
    article.innerHTML = `
      <div class="flight-top">
        <span class="flight-index">FLIGHT ${String(index+1).padStart(2,'0')}</span>
        <div class="flight-top-end">
          <span class="flight-status" data-role="status">Not counted</span>
          <button type="button" class="remove-flight" data-action="remove" aria-label="Remove flight ${index+1}">✕ Remove</button>
        </div>
      </div>
      <div class="place-grid">
        <label><span class="field-label">From airport</span><input class="field-input" data-field="from" type="text" list="airportSuggestions" placeholder="E.g. HKG or Hong Kong" autocomplete="off" spellcheck="false" maxlength="60"></label>
        <label><span class="field-label">To airport</span><input class="field-input" data-field="to" type="text" list="airportSuggestions" placeholder="E.g. SFO or San Francisco" autocomplete="off" spellcheck="false" maxlength="60"></label>
      </div>
      <div class="timing-grid">
        <div class="timing-panel">
          <label><span class="field-label">Departure · local date and time</span><input class="field-input" data-field="depart" type="datetime-local" step="60" min="1900-01-01T00:00" max="2100-12-31T23:59"></label>
          <label><span class="field-label">Departure timezone</span><input class="field-input zone-field" data-field="departZone" list="timezoneSuggestions" placeholder="Select or enter timezone" autocomplete="off" spellcheck="false"></label>
          <span class="timezone-note" data-role="departOffset"></span>
          <div class="ambiguous-wrap" data-role="departAmbiguous" hidden><span>Clock repeats:</span><select data-field="departChoice" aria-label="Departure clock occurrence"><option value="earlier">First occurrence</option><option value="later">Second occurrence</option></select></div>
        </div>
        <div class="timing-panel">
          <label><span class="field-label">Arrival · local date and time</span><input class="field-input" data-field="arrive" type="datetime-local" step="60" min="1900-01-01T00:00" max="2100-12-31T23:59"></label>
          <label><span class="field-label">Arrival timezone</span><input class="field-input zone-field" data-field="arriveZone" list="timezoneSuggestions" placeholder="Select or enter timezone" autocomplete="off" spellcheck="false"></label>
          <span class="timezone-note" data-role="arriveOffset"></span>
          <div class="ambiguous-wrap" data-role="arriveAmbiguous" hidden><span>Clock repeats:</span><select data-field="arriveChoice" aria-label="Arrival clock occurrence"><option value="earlier">First occurrence</option><option value="later">Second occurrence</option></select></div>
        </div>
      </div>
      <div class="duration-footer">
        <div>
          <div class="duration-label">Flight duration <span title="Filled automatically when both times are known, or edit it yourself" aria-label="Automatically filled but editable">ⓘ</span></div>
          <div class="duration-inputs">
            <label class="duration-cell"><input class="field-input" data-field="days" type="number" inputmode="numeric" min="0" max="30" placeholder="0" aria-label="Flight duration days"><span class="duration-unit">d</span></label>
            <label class="duration-cell"><input class="field-input" data-field="hours" type="number" inputmode="numeric" min="0" max="23" placeholder="0" aria-label="Flight duration hours"><span class="duration-unit">h</span></label>
            <label class="duration-cell"><input class="field-input" data-field="minutes" type="number" inputmode="numeric" min="0" max="59" placeholder="0" aria-label="Flight duration minutes"><span class="duration-unit">m</span></label>
          </div>
        </div>
        <div class="flight-math">
          <strong class="neutral" data-role="shift">—</strong>
          <p class="flight-explain" data-role="explain">Enter your flight details</p>
        </div>
      </div>`;
    for (const field of ['from','to','depart','arrive','departZone','arriveZone','days','hours','minutes','departChoice','arriveChoice']) {
      article.querySelector(`[data-field="${field}"]`).value = f[field];
    }
    updateCard(article, f);
    return article;
  }
  function renderAll(focusLast = false) {
    const fragment = document.createDocumentFragment();
    flights.forEach((flight, index) => fragment.appendChild(makeFlightCard(flight, index)));
    list.replaceChildren(fragment);
    $('entryCount').textContent = String(flights.length).padStart(2, '0');
    $('addFlight').disabled = $('addFlightBottom').disabled = flights.length >= MAX_ENTRIES;
    updateSummary();
    if (focusLast) {
      const focus = list.lastElementChild?.querySelector('[data-field="from"]');
      focus?.focus();
      list.lastElementChild?.scrollIntoView({behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth',block:'nearest'});
    }
  }
  function calculateDuration(f) {
    if (!f.depart || !f.arrive || !f.departZone || !f.arriveZone) return null;
    const dep = MathTZ.resolveWall(f.depart, f.departZone, f.departChoice);
    const arr = MathTZ.resolveWall(f.arrive, f.arriveZone, f.arriveChoice);
    if (dep.status !== 'ok' || arr.status !== 'ok') return null;
    const minutes = Math.round((arr.ms - dep.ms) / 60000);
    return minutes > 0 && minutes <= 30 * 1440 ? minutes : null;
  }
  function syncComputedDuration(f, card) {
    if (f.durationManual) return;
    const computed = calculateDuration(f);
    const values = computed == null ? {days:'',hours:'',minutes:''} : MathTZ.durationParts(computed);
    for (const key of ['days','hours','minutes']) {
      f[key] = String(values[key]);
      card.querySelector(`[data-field="${key}"]`).value = f[key];
    }
  }
  function setZoneNotes(card, f) {
    for (const type of ['depart','arrive']) {
      const zone = f[`${type}Zone`];
      const resolved = MathTZ.resolveWall(f[type], zone, f[`${type}Choice`]);
      const note = card.querySelector(`[data-role="${type}Offset"]`);
      const ambiguity = card.querySelector(`[data-role="${type}Ambiguous"]`);
      if (resolved.status === 'ok') note.textContent = MathTZ.formatOffset(resolved.offsetMinutes);
      else if (resolved.status === 'nonexistent') note.textContent = 'This clock time does not exist here';
      else note.textContent = zone && !f[type] ? 'Local timezone' : '';
      ambiguity.hidden = !(resolved.status === 'ok' && resolved.ambiguous);
    }
  }
  function updateCard(card, f) {
    const answer = MathTZ.analyzeFlight(f);
    card.dataset.state = answer.status;
    const status = card.querySelector('[data-role="status"]');
    const shift = card.querySelector('[data-role="shift"]');
    const explain = card.querySelector('[data-role="explain"]');
    shift.className = 'neutral';
    explain.replaceChildren();
    switch (answer.status) {
      case 'valid': {
        const backward = answer.clockMinutes < 0;
        status.textContent = 'Counted';
        shift.textContent = `${backward ? '−' : '+'}${MathTZ.formatMinutes(answer.clockMinutes, true)}`;
        shift.className = backward ? 'negative' : 'positive';
        explain.textContent = backward ? 'Arrival clock is earlier' : 'Arrival clock is later';
        break;
      }
      case 'no_shift':
        status.textContent = 'Not counted';
        shift.textContent = '0m';
        explain.textContent = answer.sameZone ? 'Same timezone — not counted' : answer.sameOffset ? 'No timezone difference on these dates' : 'Same local departure and arrival time';
        break;
      case 'duration_mismatch': {
        status.textContent = 'Check duration';
        shift.textContent = '—';
        explain.textContent = `Times imply ${MathTZ.formatMinutes(answer.computedMinutes,true)}.`;
        const fix = document.createElement('button'); fix.type = 'button'; fix.dataset.action = 'useComputed'; fix.textContent = 'Use calculated';
        explain.append(fix);
        break;
      }
      case 'invalid':
        status.textContent = 'Needs attention';
        shift.textContent = '—';
        explain.textContent = answer.message;
        break;
      default:
        status.textContent = 'Not counted';
        shift.textContent = '—';
        explain.textContent = 'Enter your flight details';
    }
    setZoneNotes(card, f);
    return answer;
  }
  function updateSummary() {
    let back = 0, forward = 0, count = 0;
    for (const f of flights) {
      const result = MathTZ.analyzeFlight(f);
      if (result.status !== 'valid') continue;
      count++;
      if (result.clockMinutes < 0) back += -result.clockMinutes;
      else forward += result.clockMinutes;
    }
    $('totalTime').textContent = MathTZ.formatMinutes(back+forward);
    $('backTime').textContent = MathTZ.formatMinutes(back);
    $('forwardTime').textContent = MathTZ.formatMinutes(forward);
    const net = forward - back;
    $('netTime').textContent = MathTZ.formatMinutes(net);
    $('netDirection').textContent = net === 0 ? 'Even' : net < 0 ? 'Backward' : 'Forward';
    $('flightCount').textContent = String(count);
  }
  function findAirport(text) {
    const val = String(text || '').trim();
    const exact = airportMap.get(val.toUpperCase());
    if (exact) return exact;
    const byCity = airportRows.filter(([code, city]) => city.toLocaleLowerCase() === val.toLocaleLowerCase());
    if (byCity.length === 1) return airportMap.get(byCity[0][0]);
    return null;
  }
  function updateField(target, commit = false) {
    const card = target.closest('.flight-card');
    const f = flights.find(item => String(item.id) === card?.dataset.id);
    if (!f || !target.dataset.field) return;
    const key = target.dataset.field;
    const previousValue = f[key];
    f[key] = target.value;
    if (key === 'from' || key === 'to') {
      const zoneKey = key === 'from' ? 'departZone' : 'arriveZone';
      const changed = previousValue.toUpperCase() !== String(target.value).trim().toUpperCase();
      const match = findAirport(target.value);
      if (match) {
        f[key] = match.code;
        target.value = match.code;
        if (changed) {
          f[zoneKey] = match.zone;
          card.querySelector(`[data-field="${zoneKey}"]`).value = match.zone;
        }
      } else {
        // Do not accidentally preserve a previous airport's auto-filled timezone.
        if (changed && airportMap.has(String(previousValue).toUpperCase())) {
          f[zoneKey] = '';
          card.querySelector(`[data-field="${zoneKey}"]`).value = '';
        }
        if (commit) {
          f[key] = String(target.value).trim().toUpperCase();
          target.value = f[key];
        }
      }
    }
    if (['days','hours','minutes'].includes(key)) f.durationManual = true;
    if (!f.durationManual && !['days','hours','minutes'].includes(key)) syncComputedDuration(f, card);
    updateCard(card, f);
    updateSummary();
    schedulePersist();
  }

  function showToast(message) {
    const node = $('toast');
    node.textContent = message;
    node.classList.add('visible');
    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(() => node.classList.remove('visible'), 2700);
  }
  function feedback(kind) {
    if (!sfxEnabled) return;
    try {
      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      if (!AudioContextClass) return;
      soundContext ||= new AudioContextClass();
      if (soundContext.state === 'suspended') soundContext.resume().catch(() => {});
      const start = soundContext.currentTime;
      const notes = kind === 'remove' ? [480,320] : kind === 'save' ? [640,850] : [520,660];
      notes.forEach((frequency, i) => {
        const osc = soundContext.createOscillator();
        const gain = soundContext.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(frequency,start+i*.065);
        const at = start+i*.065;
        gain.gain.setValueAtTime(.0001, at);
        gain.gain.exponentialRampToValueAtTime(.035,at+.012);
        gain.gain.exponentialRampToValueAtTime(.0001,at+.18);
        osc.connect(gain).connect(soundContext.destination);
        osc.start(at);osc.stop(at+.2);
      });
    } catch (_) { /* Sound is an enhancement, never a dependency. */ }
  }
  function addFlight() {
    if (flights.length >= MAX_ENTRIES) {showToast('Maximum number of flights reached');return;}
    flights.push(newFlight());
    renderAll(true);schedulePersist();feedback('add');track('flight_added');
  }
  function removeFlight(card) {
    const before = flights.length;
    flights = flights.filter(f => String(f.id) !== card.dataset.id);
    if (flights.length === before) return;
    renderAll();schedulePersist();feedback('remove');track('flight_removed');
  }
  function saveFile() {
    persistNow();
    const blob = new Blob([JSON.stringify(projectData(), null, 2)+'\n'],{type:'application/json'});
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url; anchor.download = 'time-travel-tracker-project.json';
    document.body.append(anchor);anchor.click();anchor.remove();
    setTimeout(() => URL.revokeObjectURL(url),30000);
    showToast('Project downloaded');feedback('save');track('project_saved');
  }
  async function openFile(event) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) {showToast('Project file is too large');return;}
    try {
      const parsed = JSON.parse(await file.text());
      // Parse and validate entirely before replacing existing entries.
      const newFlights = readProject(parsed);
      if (flights.some(f => f.from || f.to || f.depart || f.arrive) && !window.confirm('Replace the current flight log with this project?')) return;
      flights = newFlights;
      renderAll();persistNow();showToast('Project opened');feedback('save');track('project_opened');
    } catch (error) {showToast(`Could not open project: ${error.message || 'invalid file'}`);}
  }
  function clearAll() {
    if (!flights.length || window.confirm('Clear this flight log? Save a project file first if you want a backup.')) {
      flights = [newFlight(),newFlight()];renderAll();persistNow();feedback('remove');track('log_cleared');
      showToast('Flight log cleared');
    }
  }
  function initAudio() {
    try { const saved = JSON.parse(safeGet(SETTINGS_KEY) || 'null'); if (saved?.sfxEnabled === false) sfxEnabled = false; } catch (_) { /* Ignore malformed preferences. */ }
    const sfxButton = $('sfxToggle');
    const musicButton = $('musicToggle');
    sfxButton.setAttribute('aria-pressed',String(sfxEnabled));
    sfxButton.textContent = sfxEnabled ? '♪ Sounds on' : '♪ Sounds off';
    sfxButton.addEventListener('click', () => {
      sfxEnabled = !sfxEnabled;
      sfxButton.setAttribute('aria-pressed',String(sfxEnabled));
      sfxButton.textContent = sfxEnabled ? '♪ Sounds on' : '♪ Sounds off';
      safeSet(SETTINGS_KEY,JSON.stringify({sfxEnabled}));
      if (sfxEnabled) feedback('add');
    });
    // Music intentionally never autoplays, including when the browser restores a session.
    musicButton.addEventListener('click', async () => {
      if (!music.paused) {
        music.pause();musicButton.setAttribute('aria-pressed','false');musicButton.textContent = '♫ Music off';return;
      }
      try {
        await music.play();
        musicButton.setAttribute('aria-pressed','true');musicButton.textContent = '♫ Music on';
        track('music_enabled');
      } catch (_) {showToast('Music could not play in this browser');}
    });
    music.addEventListener('error',() => {
      musicButton.setAttribute('aria-pressed','false');musicButton.textContent = '♫ Music off';
    });
  }
  function init() {
    setupSuggestions();
    try {
      const saved = safeGet(STORAGE_KEY);
      if (saved) flights = readProject(JSON.parse(saved));
    } catch (_) {flights = [];}
    if (!flights.length) flights = [newFlight(),newFlight()];
    renderAll();
    $('saveStatus').textContent = storageAvailable ? 'Saved in this browser' : 'Use Save project to keep a copy';
    initAudio();
    $('addFlight').addEventListener('click',addFlight);
    $('addFlightBottom').addEventListener('click',addFlight);
    $('saveProject').addEventListener('click',saveFile);
    $('openProject').addEventListener('click',() => fileInput.click());
    fileInput.addEventListener('change',openFile);
    $('clearAll').addEventListener('click',clearAll);
    list.addEventListener('input', event => {if (event.target.dataset.field) updateField(event.target);});
    list.addEventListener('change', event => {
      if (event.target.dataset.field && !['days','hours','minutes'].includes(event.target.dataset.field)) updateField(event.target,true);
    });
    list.addEventListener('focusout', event => {
      if (['from','to'].includes(event.target.dataset.field)) updateField(event.target,true);
    });
    list.addEventListener('click', event => {
      const button = event.target.closest('button[data-action]');
      if (!button) return;
      const card = button.closest('.flight-card');
      if (button.dataset.action === 'remove') removeFlight(card);
      else if (button.dataset.action === 'useComputed') {
        const f = flights.find(item => String(item.id) === card.dataset.id);
        if (!f) return;
        f.durationManual = false;
        syncComputedDuration(f,card);
        updateCard(card,f);updateSummary();schedulePersist();feedback('add');
      }
    });
    $('showMethod').addEventListener('click', () => {
      const area = $('methodDetails');area.hidden = !area.hidden;
      $('showMethod').textContent = area.hidden ? 'How it works' : 'Hide explanation';
      $('showMethod').setAttribute('aria-expanded',String(!area.hidden));
    });
    window.addEventListener('pagehide',() => {if (saveTimer) persistNow();music.pause();});
  }
  init();
})();
