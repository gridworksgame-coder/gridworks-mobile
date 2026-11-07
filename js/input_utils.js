/* ═══════════════════════════════════════════════════════════════════
   INPUT UTILITIES
   Small standalone helpers used by InputManager and HUD code.
   ═══════════════════════════════════════════════════════════════════ */

function hasActiveEVCharger() {
  for (const e of EntityRegistry.getByType(T.EVCHARGER)) if (e.powered) return true;
  return false;
}

// Returns true if at least one Monitoring Station is standing and intact.
//
// Deliberately does NOT require the station to be powered: once built, the
// GRID panel it unlocks stays available through a blackout, since a monitor
// losing grid power shouldn't blind the player to the very outage it'd help
// diagnose.
//
// A lightning-struck station is a different case, though. It isn't merely
// unpowered — it's a burning wreck, and it stays out of service until a crew
// repairs it. Every monitor-gated capability (the GRID panel, the population
// and income breakdowns, the 25% repair discount) routes through here, so
// none of them survive the fire.
function hasActiveMonitor() {
  for (const e of EntityRegistry.getByType(T.MONITOR)) {
    if (!e._lightningDamaged) return true;
  }
  return hasActiveMonitor2();   // the MK2 does everything the MK1 does
}
// The Monitoring Station MK2's own capabilities: the Network Breakdown window
// (GridAnalyzer) and the GRID panel's storage readout. Same rule as above:
// unpowered still counts, a lightning-struck wreck does not.
function hasActiveMonitor2() {
  for (const e of EntityRegistry.getByType(T.MONITOR2)) {
    if (!e._lightningDamaged) return true;
  }
  return false;
}

function formatMoney(n) {
  return '$' + Math.floor(n).toLocaleString();
}
function formatRate(n) {
  return '$' + n.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 }) + '/s';
}

// Temperature unit preference — persisted, defaults to Celsius (the game's
// original and only unit) so existing players see no change unless they opt in.
const TEMP_UNIT_KEY = 'gw_temp_fahrenheit';
let useFahrenheit = localStorage.getItem(TEMP_UNIT_KEY) === '1';
function isUseFahrenheit() { return useFahrenheit; }
function setUseFahrenheit(v) {
  useFahrenheit = !!v;
  localStorage.setItem(TEMP_UNIT_KEY, useFahrenheit ? '1' : '0');
}
// celsius in, formatted display string out — callers keep doing their own
// threshold checks (heatwave colors etc.) against the raw Celsius value.
function formatTemp(celsius) {
  if (useFahrenheit) return `${Math.round(celsius * 9 / 5 + 32)}°F`;
  return `${Math.round(celsius)}°C`;
}


// ── Kilowatt-hour formatting ─────────────────────────────────────────
// Energy numbers are kilowatt-hours, as power numbers are kilowatts (see
// formatPower in constants_core.js).
// Progression thresholds run into the millions and beyond, and a raw
// "1,118,428 / 1,177,482.091" tells the player nothing they can act on.
// Scale to the largest unit that leaves a mantissa of at least 1.
const WH_UNITS = ['kWh', 'MWh', 'GWh', 'TWh', 'PWh', 'EWh'];

function _whScale(n) {
  let v = n, i = 0;
  while (Math.abs(v) >= 1000 && i < WH_UNITS.length - 1) { v /= 1000; i++; }
  return { value: v, unit: WH_UNITS[i], step: i };
}

// Enough decimals to stay informative without turning into noise: a small
// mantissa needs them, a large one doesn't.
function _whDecimals(v) {
  const abs = Math.abs(v);
  return abs < 10 ? 2 : abs < 100 ? 1 : 0;
}

function formatWh(n) {
  const { value, unit, step } = _whScale(n);
  // Bare kilowatt-hours are whole numbers — nobody needs "847.00 kWh".
  return `${step === 0 ? Math.floor(value) : value.toFixed(_whDecimals(value))} ${unit}`;
}

// A "current / target" pair. Both sides are scaled to the TARGET's unit and
// carry one shared suffix, so the two numbers stay directly comparable —
// formatting each independently could render a progress bar's two ends in
// different units and read as though the player had overshot.
function formatWhPair(cur, target) {
  const t = _whScale(target);
  const c = cur / Math.pow(1000, t.step);
  // Decimals come from the TARGET alone. Taking the wider of the two would
  // let a near-zero current value ("0.00") force decimals onto a target that
  // reads perfectly well as a whole number.
  const dec = t.step === 0 ? 0 : _whDecimals(t.value);
  return `${c.toFixed(dec)} / ${t.value.toFixed(dec)} ${t.unit}`;
}
