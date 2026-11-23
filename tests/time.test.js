'use strict';
const assert = require('node:assert/strict');
const t = require('../js/time.js');
let checks = 0;
function eq(actual,expected,message) { assert.equal(actual,expected,message); checks++; }
function flight(x) { return t.analyzeFlight({days:'0',hours:'12',minutes:'0',...x}); }

// The 12h flight produces a 4h BACKWARD movement on the destination clock,
// not the 16h timezone offset change.
const hkgSfo = flight({from:'HKG',to:'SFO',depart:'2026-12-25T06:00',arrive:'2026-12-25T02:00',departZone:'Asia/Hong_Kong',arriveZone:'America/Los_Angeles'});
eq(hkgSfo.status,'valid');
eq(hkgSfo.clockMinutes,-240);
eq(hkgSfo.computedMinutes,720);

// A 04:00 arrival is physically 14h later and shows 2h back on the clocks.
const hkgSfoFour = flight({from:'HKG',to:'SFO',depart:'2026-12-25T06:00',arrive:'2026-12-25T04:00',departZone:'Asia/Hong_Kong',arriveZone:'America/Los_Angeles',hours:'14'});
eq(hkgSfoFour.status,'valid');
eq(hkgSfoFour.clockMinutes,-120);
eq(hkgSfoFour.computedMinutes,840);
eq(flight({from:'HKG',to:'SFO',depart:'2026-12-25T06:00',arrive:'2026-12-25T04:00',departZone:'Asia/Hong_Kong',arriveZone:'America/Los_Angeles',hours:'12'}).status,'duration_mismatch');

// Forward travel is the actual difference in local dates and clocks (28h),
// not merely a difference in timezone offsets (16h).
const sfoHkg = flight({from:'SFO',to:'HKG',depart:'2026-12-26T08:00',arrive:'2026-12-27T12:00',departZone:'America/Los_Angeles',arriveZone:'Asia/Hong_Kong'});
eq(sfoHkg.status,'valid');
eq(sfoHkg.clockMinutes,1680);
eq(sfoHkg.computedMinutes,720);

const summer = flight({from:'LAX',to:'JFK',depart:'2026-07-04T09:00',arrive:'2026-07-04T17:00',departZone:'America/Los_Angeles',arriveZone:'America/New_York',hours:'5'});
eq(summer.clockMinutes,480);
eq(summer.computedMinutes,300);

const tokyoHawaii = flight({from:'HND',to:'HNL',depart:'2026-07-04T20:00',arrive:'2026-07-04T08:00',departZone:'Asia/Tokyo',arriveZone:'Pacific/Honolulu',hours:'7'});
eq(tokyoHawaii.status,'valid');
eq(tokyoHawaii.clockMinutes,-720);

const quarter = flight({from:'DEL',to:'KTM',depart:'2026-01-10T10:00',arrive:'2026-01-10T12:15',departZone:'Asia/Kolkata',arriveZone:'Asia/Kathmandu',hours:'2'});
eq(quarter.status,'valid');
eq(quarter.clockMinutes,135);
eq(quarter.computedMinutes,120);

// The zone database is still used to validate elapsed time across DST.
eq(t.resolveWall('2026-03-08T02:30','America/New_York').status,'nonexistent');
const first = t.resolveWall('2026-11-01T01:30','America/New_York','earlier');
const second = t.resolveWall('2026-11-01T01:30','America/New_York','later');
eq(first.ambiguous,true);
eq(second.ambiguous,true);
eq((second.ms - first.ms)/60000,60);
const spring = flight({from:'LAX',to:'JFK',depart:'2026-03-08T01:30',arrive:'2026-03-08T10:30',departZone:'America/Los_Angeles',arriveZone:'America/New_York',hours:'5'});
eq(spring.status,'valid');
eq(spring.clockMinutes,540);
eq(spring.computedMinutes,300);

// Only travel across different actual timezones qualifies.
eq(flight({from:'SFO',to:'LAX',depart:'2026-07-01T09:00',arrive:'2026-07-01T10:30',departZone:'America/Los_Angeles',arriveZone:'America/Los_Angeles',hours:'1',minutes:'30'}).status,'no_shift');
eq(flight({from:'LAX',to:'PHX',depart:'2026-07-01T09:00',arrive:'2026-07-01T10:30',departZone:'America/Los_Angeles',arriveZone:'America/Phoenix',hours:'1',minutes:'30'}).status,'no_shift');
eq(flight({from:'HKG',to:'SFO',depart:'2026-12-25T06:00',arrive:'2026-12-25T06:00',departZone:'Asia/Hong_Kong',arriveZone:'America/Los_Angeles',hours:'16'}).status,'no_shift');
eq(flight({from:'SFO',to:'SFO',depart:'2026-07-01T09:00',arrive:'2026-07-01T10:30',departZone:'America/Los_Angeles',arriveZone:'America/Los_Angeles',hours:'1',minutes:'30'}).status,'invalid');
eq(t.parseWall('2026-02-30T12:00'),null);
assert.deepEqual(t.durationParts(1501),{days:1,hours:1,minutes:1});checks++;
eq(t.formatMinutes(1501), '1d 01h 01m');
console.log(`${checks} core time/travel checks passed.`);
