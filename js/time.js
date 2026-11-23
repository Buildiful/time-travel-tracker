/* Time Travel Tracker: dependency-free time zone arithmetic with IANA/Intl. */
(function (root) {
  'use strict';
  const HOUR = 3600000;
  const MINUTE = 60000;
  const cache = new Map();

  function formatter(zone) {
    if (!cache.has(zone)) {
      cache.set(zone, new Intl.DateTimeFormat('en-GB', {
        timeZone: zone, year: 'numeric', month: '2-digit', day: '2-digit',
        hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23'
      }));
    }
    return cache.get(zone);
  }
  function partsInZone(utcMs, zone) {
    const values = {};
    for (const part of formatter(zone).formatToParts(new Date(utcMs))) {
      if (['year', 'month', 'day', 'hour', 'minute', 'second'].includes(part.type)) values[part.type] = Number(part.value);
    }
    return values;
  }
  function wallAsUTC(p) {
    return Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second || 0);
  }
  function parseWall(input) {
    const matched = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(input || '');
    if (!matched) return null;
    const [year, month, day, hour, minute] = matched.slice(1).map(Number);
    if (year < 1900 || year > 2100 || hour > 23 || minute > 59 || month < 1 || month > 12 || day < 1 || day > 31) return null;
    const p = {year, month, day, hour, minute, second: 0};
    const actual = new Date(wallAsUTC(p));
    if (actual.getUTCFullYear() !== year || actual.getUTCMonth() + 1 !== month || actual.getUTCDate() !== day) return null;
    return p;
  }
  function offsetAt(utcMs, zone) {
    // Divide after converting the wall components. Supports half/quarter-hour zones and historic DST.
    return (wallAsUTC(partsInZone(utcMs, zone)) - utcMs) / MINUTE;
  }
  function resolveWall(input, zone, choice = 'earlier') {
    const p = parseWall(input);
    if (!p || !zone) return {status: 'invalid'};
    try {
      const approximate = wallAsUTC(p);
      const offsets = new Set();
      // Sampling both sides catches a transition adjacent to the requested wall time.
      for (let delta = -42; delta <= 42; delta += 3) {
        offsets.add(offsetAt(approximate + delta * HOUR, zone));
      }
      const possibilities = [];
      for (const offset of offsets) {
        const ms = approximate - offset * MINUTE;
        const converted = partsInZone(ms, zone);
        if (wallAsUTC(converted) === approximate && !possibilities.some(item => item.ms === ms)) {
          possibilities.push({ms, offsetMinutes: offset});
        }
      }
      possibilities.sort((a, b) => a.ms - b.ms);
      if (!possibilities.length) return {status: 'nonexistent'};
      const selected = choice === 'later' ? possibilities[possibilities.length - 1] : possibilities[0];
      return {status: 'ok', ...selected, ambiguous: possibilities.length > 1, alternatives: possibilities.length};
    } catch (_) {
      return {status: 'invalid_zone'};
    }
  }
  function parseDuration(f) {
    const raw = [f.days, f.hours, f.minutes];
    if (raw.every(v => v === '' || v === null || v === undefined)) return null;
    if (raw.some(v => v !== '' && v != null && !/^\d{1,3}$/.test(String(v)))) return NaN;
    const [days, hours, minutes] = raw.map(v => v === '' || v == null ? 0 : Number(v));
    if (days < 0 || days > 30 || hours < 0 || hours > 23 || minutes < 0 || minutes > 59) return NaN;
    return days * 1440 + hours * 60 + minutes;
  }
  function analyzeFlight(f) {
    const from = String(f.from || '').trim().toUpperCase();
    const to = String(f.to || '').trim().toUpperCase();
    if (!from && !to && !f.depart && !f.arrive && !f.departZone && !f.arriveZone) return {status: 'empty'};
    if (!from || !to || !f.depart || !f.arrive || !f.departZone || !f.arriveZone) return {status: 'incomplete'};
    if (!/^[A-Z]{3}$/.test(from) || !/^[A-Z]{3}$/.test(to)) return {status: 'invalid', message: 'Enter a 3-letter airport code.'};
    if (from === to) return {status: 'invalid', message: 'Choose different airports.'};
    const departure = resolveWall(f.depart, f.departZone, f.departChoice);
    const arrival = resolveWall(f.arrive, f.arriveZone, f.arriveChoice);
    if (departure.status === 'nonexistent' || arrival.status === 'nonexistent')
      return {status: 'invalid', message: 'Local time does not exist due to a clock change.'};
    if (departure.status !== 'ok' || arrival.status !== 'ok')
      return {status: 'invalid', message: 'Check the dates and timezones.'};
    const computedMinutes = Math.round((arrival.ms - departure.ms) / MINUTE);
    if (computedMinutes <= 0) return {status: 'invalid', message: 'Arrival must occur after departure in real time.'};
    if (computedMinutes > 30 * 1440) return {status: 'invalid', message: 'A flight cannot exceed 30 days in this tool.'};
    const enteredMinutes = parseDuration(f);
    if (Number.isNaN(enteredMinutes)) return {status: 'invalid', message: 'Check the duration fields.'};
    if (enteredMinutes === 0) return {status: 'invalid', message: 'Flight duration must be greater than zero.'};
    if (enteredMinutes !== null && Math.abs(computedMinutes - enteredMinutes) > 1)
      return {status: 'duration_mismatch', message: 'Duration differs from the dates and timezones.', computedMinutes, enteredMinutes};
    // "Time travel" is the change on the *local calendars and clocks*, not
    // a subtraction of UTC offsets. A flight HKG 06:00 -> SFO 02:00 on the
    // same date therefore counts as 4h backward, even though it took 12h.
    // Offsets are used for actual flight-duration validation and to determine
    // whether the flight crosses timezones, never to modify clockMinutes.
    const clockMinutes = Math.round((wallAsUTC(parseWall(f.arrive)) - wallAsUTC(parseWall(f.depart))) / MINUTE);
    const sameZone = f.departZone === f.arriveZone;
    const sameOffset = departure.offsetMinutes === arrival.offsetMinutes;
    return {
      status: sameZone || sameOffset || clockMinutes === 0 ? 'no_shift' : 'valid',
      sameZone, sameOffset, clockMinutes, computedMinutes,
      departureOffset: departure.offsetMinutes, arrivalOffset: arrival.offsetMinutes,
      departureAmbiguous: departure.ambiguous, arrivalAmbiguous: arrival.ambiguous
    };
  }
  function durationParts(minutes) {
    const m = Math.max(0, Math.abs(Math.round(minutes)));
    return {days: Math.floor(m / 1440), hours: Math.floor(m % 1440 / 60), minutes: m % 60};
  }
  function formatMinutes(minutes, compact = false) {
    const p = durationParts(minutes);
    if (compact) return [p.days ? `${p.days}d` : '', p.hours ? `${p.hours}h` : '', (!p.days && !p.hours) || p.minutes ? `${p.minutes}m` : ''].filter(Boolean).join(' ');
    return `${p.days}d ${String(p.hours).padStart(2, '0')}h ${String(p.minutes).padStart(2, '0')}m`;
  }
  function formatOffset(minutes) {
    if (!Number.isFinite(minutes)) return 'UTC';
    const abs = Math.abs(Math.round(minutes));
    return `UTC${minutes < 0 ? '−' : '+'}${String(Math.floor(abs / 60)).padStart(2,'0')}:${String(abs % 60).padStart(2,'0')}`;
  }
  const api = Object.freeze({parseWall, offsetAt, resolveWall, parseDuration, analyzeFlight, durationParts, formatMinutes, formatOffset});
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.TimeTravelMath = api;
})(typeof window !== 'undefined' ? window : globalThis);
