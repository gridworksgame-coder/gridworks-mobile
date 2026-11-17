/* ═══════════════════════════════════════════════════════════════════
   CITIZEN CHATTER
   Now and then a speech bubble rises from a home, a shop, a works or a
   civic building on screen: what the people in it are saying about their
   power, their zone, the weather and the season. A feel for the city's
   mood, never a warning on its own (the real warnings stay where they are).

   Sparing by design: only zoomed in close enough to see the buildings
   (CHAT_ZOOM), at most MAX_ON_SCREEN at once, one every GAP_MIN..GAP_MAX
   real seconds, none while time is paused, and a building that just spoke
   waits a while before it speaks again. Options → Citizen Chatter turns it
   off (localStorage, per player).

   What a building says comes from its own state first (no power, a long
   outage, about to leave, smog on the doorstep, delighted with its
   service), then the day's weather, the season, the hour, the Hyperion
   project, or just life in that kind of zone.
   ═══════════════════════════════════════════════════════════════════ */
const CitizenChatter = (() => {
  const KEY = 'gw_citizen_chatter';
  const CHAT_ZOOM = 0.5;          // below this the buildings are too small to speak for
  const CHAT_ZOOM_FULL = 0.62;    // fully shown from here (fades in between)
  const MAX_ON_SCREEN = 2;
  const GAP_MIN = 6, GAP_MAX = 13;  // real seconds between bubbles
  const LIFE = 5.2;               // seconds a bubble stays
  const QUIET_FOR = 90;           // seconds before the same building speaks again
  const RECENT_LINES = 40;        // lines not repeated until this many others have been said

  let enabled = true;
  try { enabled = localStorage.getItem(KEY) !== '0'; } catch (_e) {}

  // ── The lines ──────────────────────────────────────────────────────
  // By zone, then by situation. {city} and {co} are filled in with the
  // city and company names.
  const LINES = {
    residential: {
      outage: [
        "Lights are out again…", "Anyone else's power gone?", "Candles it is, then.",
        "The fridge just went quiet.", "Wi-Fi's down. Power's down. Everything's down.",
        "I was halfway through dinner!", "Kids, find the torch.", "Not again. NOT again.",
        "Who do I even call about this?", "My phone's on 4%…", "Pitch black out here.",
        "So much for movie night.",
      ],
      longOutage: [
        "Third blackout this week. I'm done.", "My freezer's toast. Again.",
        "Hours without power. Is anyone fixing this?", "We're thinking of moving.",
        "I've started keeping a diary of the outages.", "Neighbours have a generator. Must be nice.",
        "Paying for power I'm not getting.", "Writing to the council tonight.",
        "This town used to be nice.", "How long can a blackout even last?",
      ],
      leaving: [
        "Started browsing houses in other towns.", "We're putting the house on the market.",
        "One more outage and we're gone.", "My sister says her town never loses power.",
        "Honestly? Not worth the rent anymore.", "Packing boxes are in the garage, just saying.",
        "Who's buying houses round here, anyway?",
      ],
      smog: [
        "Can't even see the hills today.", "Kept the kids in again. The air…",
        "Washing came off the line grey.", "Is it fog, or is it the plant?",
        "My chest's been tight all week.", "You can taste it on your tongue.",
        "Smells like a tyre fire out there.", "Remember when the sky was blue?",
      ],
      happy: [
        "Lights haven't flickered once all month.", "Best power we've ever had.",
        "Honestly? I love living here.", "Bills are fair, power's steady. Can't complain.",
        "Never thought I'd be grateful for a power company.", "Kettle's on. Life's good.",
        "This street's got a good feel to it.", "The kids think power just… works. Ha.",
        "Ten years here and we're staying ten more.",
      ],
      weather: {
        heatwave: ["Thank god the AC works.", "Too hot to sleep.", "Fans on every room in the house.", "The road's melting out there!", "Ice lollies for dinner."],
        coldsnap: ["Heating's on full blast.", "Pipes'd better not freeze…", "Wearing two jumpers indoors.", "Cold enough to see your breath inside.", "Hot water bottle season."],
        snowfall: ["Kids are out sledding!", "Snowman in every front garden.", "Shovelling the drive, again.", "Snow day! Schools are shut!"],
        blizzard: ["Can't see the house next door.", "Nobody's going anywhere tonight.", "Hope the power holds out in this.", "Wind's howling down the chimney."],
        rainstorm: ["Listen to that rain!", "Gutters are overflowing.", "Thunder woke the baby.", "Water's coming under the door!"],
        storm: ["That lightning was close!", "Hope the lines hold up in this.", "Bins are blowing down the street.", "Unplugging the TV, just in case."],
        rainfall: ["Good day for staying in.", "The garden needed this.", "Umbrella weather.", "Puddles everywhere."],
        fog: ["Can barely see the street.", "Spooky out there this morning.", "Fog's thick as soup."],
        smog: ["Windows shut, it's that smoggy.", "Air smells like burnt toast.", "Masks on for the school run."],
        calm: ["Not a breath of wind today.", "Still and quiet. Lovely."],
        dust: ["Dust on everything, everywhere.", "Car's brown now. It was blue."],
        smoke: ["Smells like a wildfire.", "Ash on the windowsill…", "Sky's gone orange."],
        icing: ["Ice on every wire out there.", "Careful, the path's like glass."],
        geomag: ["Did you see the aurora?!", "The sky's glowing green!", "Compass is spinning, weird."],
      },
      season: {
        Spring: ["Blossom's out on our street.", "First barbecue of the year!", "Birds are back.", "Spring cleaning, ugh."],
        Summer: ["Long evenings in the garden.", "Paddling pool's out.", "Ice cream van's here!", "Too nice to be indoors."],
        Autumn: ["Leaves everywhere. Again.", "Cosy jumper season.", "Pumpkin on every doorstep.", "Dark by teatime already."],
        Winter: ["Fairy lights going up!", "Mince pies already?", "Too cold for the school run.", "Snuggled up with a film."],
      },
      morning: ["Morning! Kettle's on.", "Late for work, as usual.", "School run chaos.", "Who ate the last of the cereal?", "Coffee. Need coffee."],
      evening: ["Dinner's ready!", "What's on telly tonight?", "Kids! Bath time!", "Long day. Feet up."],
      night: ["Shh, baby's asleep.", "Can't sleep…", "Who's still up?", "Lights off, everyone."],
      hyperion: ["Did you see the sky last night?!", "We're on the news again!", "Our little town powers the whole country.", "Proud to live here.", "That station lit up the whole horizon."],
      flavour: [
        "Who keeps parking on my lawn?", "Next door's dog won't stop barking.", "Lost the remote again.",
        "Book club tonight! (It's wine club.)", "The kids want a trampoline.", "Has anyone seen my cat?",
        "Mowing the lawn, finally.", "New neighbours seem nice.", "The bins go out tomorrow, right?",
        "Is it me, or are the streetlights brighter?", "Grandma's visiting this weekend.", "Baking bread today.",
        "The ice cream van plays the wrong song.", "Teenager's been in the shower for an hour.",
        "Fixing the fence. Again.", "Somebody's playing drums. Badly.",
        "Bought another houseplant.", "The postman's late.", "Kids are building a fort.",
      ],
    },

    commercial: {
      outage: [
        "Tills are down! Cash only!", "Card machine's dead…", "Freezers are warming up!",
        "Customers are walking out.", "We're closing early, no power.", "Lost the whole lunch rush.",
        "Escalator's stuck mid-way. Great.", "Can't sell in the dark.",
      ],
      longOutage: [
        "Lost a whole day of trade.", "Stock's spoiled. All of it.", "Insurance won't cover this many.",
        "How do I run a shop like this?", "Thinking of moving the store.", "Tell {co} we're counting the losses.",
      ],
      leaving: [
        "Lease is up soon. We might not renew.", "Looking at shop units in the next town.",
        "Can't build a business on blackouts.", "Head office wants a new location.",
      ],
      smog: ["Nobody wants to shop in this smog.", "Customers are coughing at the tills.", "Dusting the shelves every hour."],
      happy: [
        "Sales are up since the lights got steady.", "Best quarter we've ever had!",
        "Lights on, doors open, customers in.", "Business is booming!", "Great spot for a shop, this.",
        "Power bill's fair. Margins are good.", "Opening a second branch, I think.",
      ],
      weather: {
        heatwave: ["Sold out of fans!", "Ice cream's flying off the shelves.", "AC's keeping the customers in."],
        coldsnap: ["Hot chocolate's our best seller.", "Coats and scarves sold out."],
        snowfall: ["Sold out of sledges!", "Salt and shovels, aisle three."],
        blizzard: ["Not a soul in today.", "Shutting early, it's wild out."],
        rainstorm: ["Umbrellas sold out!", "Wet footprints everywhere."],
        storm: ["Hope the sign holds up in this.", "Queue for batteries and candles."],
        rainfall: ["Quiet day. Rain keeps them home.", "Umbrella stand's full."],
        fog: ["Can't even see the shop sign."],
        smoke: ["Customers want masks, we're out."],
        geomag: ["Everyone's outside looking at the sky."],
      },
      season: {
        Spring: ["Spring sale starts today!", "Garden centre's packed."],
        Summer: ["Summer sale! Everything must go!", "Sun cream's flying off the shelves."],
        Autumn: ["Back-to-school rush!", "Halloween stock's in."],
        Winter: ["Holiday rush! All hands on deck!", "Gift wrapping queue's out the door.", "Festive lights are up!"],
      },
      morning: ["Opening up! Coffee's on.", "Doors open, let's go.", "Morning delivery's late."],
      evening: ["Last orders!", "Closing up soon, folks.", "Long day on the shop floor."],
      night: ["Night shift's restocking.", "Neon sign's buzzing again."],
      hyperion: ["Tourists keep asking about the station!", "Selling Hyperion mugs now.", "Business is up since Hyperion."],
      flavour: [
        "Price check on aisle five!", "Who left a trolley in the car park?", "Help wanted, apply within.",
        "The new barista's great.", "Inventory day. Pray for me.", "Somebody tried to return a used toaster.",
        "Our lunch special is a hit.", "Loyalty cards are working!", "Window display looks lovely.",
        "Customer of the month: Mrs. Patel.", "Delivery van's double-parked again.",
        "Free samples, step right up!", "Rent's due on the first.",
      ],
    },

    industrial: {
      outage: [
        "Line's stopped! No power!", "Machines just died mid-shift.", "Whole floor's gone dark.",
        "Shift's on hold, no power.", "Furnace is cooling, we need power!", "Half a batch, ruined.",
        "Production's frozen. Call the grid!",
      ],
      longOutage: [
        "We're missing every deadline.", "Orders are piling up. Power's not.", "Boss is furious about the outages.",
        "Sending the night shift home again.", "Losing a fortune every hour down.", "Tell {co} we need reliable power!",
      ],
      leaving: [
        "Management's looking at other sites.", "Rumour is they're moving the plant.",
        "Can't run a factory on maybe.", "Board wants a town with steady power.",
      ],
      smog: ["Even we think the air's bad today.", "Filters clogged by lunchtime."],
      happy: [
        "Running at full output!", "Record production this week!", "Steady power, steady work.",
        "Hiring another shift!", "Machines haven't missed a beat.", "Bonus this quarter, lads!",
        "Never had power this reliable.",
      ],
      weather: {
        heatwave: ["It's an oven on the shop floor.", "Water breaks every hour, everyone.", "Machines are overheating."],
        coldsnap: ["Diesel's gelling in the trucks.", "Gloves under gloves today."],
        snowfall: ["Clear the loading bay!", "Forklifts sliding everywhere."],
        blizzard: ["Half the shift couldn't get in.", "Trucks aren't moving in this."],
        rainstorm: ["Roof's leaking over line two.", "Loading bay's flooding."],
        storm: ["Shut the big doors, it's wild.", "Lightning hit the yard!"],
        rainfall: ["Wet boots, wet floors."],
        fog: ["Can't see the far end of the yard."],
        dust: ["Grit in every machine."],
        smoke: ["Air filters are working overtime."],
        icing: ["Ice on the gantries, careful."],
      },
      season: {
        Spring: ["New contracts coming in!"],
        Summer: ["Summer shutdown's next week, can't wait."],
        Autumn: ["Year-end orders are rolling in."],
        Winter: ["Holiday orders, double shifts!"],
      },
      morning: ["Shift change! Clock in.", "Morning briefing in five.", "Who drank all the coffee?"],
      evening: ["End of shift, home time!", "Overtime again tonight."],
      night: ["Night shift, quiet hum.", "Third coffee of the night shift."],
      hyperion: ["We built parts for that station!", "Hyperion orders kept us busy for months."],
      flavour: [
        "Hard hats on!", "Safety meeting at two.", "Forklift needs a new battery.",
        "Who parked in the loading bay?", "Fire drill, everyone out!", "New machine's arrived!",
        "Lunch whistle's gone!", "Quality check on batch 42.", "Foreman's in a mood today.",
        "Days without an accident: 14.", "Union meeting tonight.", "Order for {city}, rush job!",
      ],
    },

    government: {
      outage: [
        "Council chamber's gone dark!", "Records office is offline.", "Meeting adjourned, no power!",
        "Backup generators, now!", "Emergency services need power!",
      ],
      longOutage: [
        "Residents are flooding our phone lines.", "The mayor wants answers about the outages.",
        "Formal complaint to {co}, today.", "Public inquiry into the blackouts?",
      ],
      leaving: ["Approval ratings are sinking.", "The town's losing faith."],
      smog: ["Air quality report is… not good.", "We're getting complaints about the smog."],
      happy: [
        "Approval's never been higher!", "The town's thriving.", "Ribbon cutting at noon!",
        "Grid's in great shape, says the report.", "Another award for {city}!",
      ],
      weather: {
        heatwave: ["Cooling centres are open.", "Heat advisory issued."],
        coldsnap: ["Warming shelters open tonight.", "Gritters are out."],
        snowfall: ["Snow ploughs deployed."],
        blizzard: ["Emergency plan in effect.", "Stay home, stay safe, says the council."],
        storm: ["Storm warning issued for {city}."],
        rainstorm: ["Flood barriers are going up."],
        smog: ["Air quality alert for {city}."],
      },
      season: {
        Spring: ["Spring fair planning meeting."],
        Summer: ["Summer festival approved!"],
        Autumn: ["Budget season. Pray for us."],
        Winter: ["Holiday market approved!"],
      },
      morning: ["Council meeting at nine.", "Paperwork, paperwork, paperwork."],
      evening: ["Late session in the chamber."],
      night: ["Night desk's quiet tonight."],
      hyperion: ["A national landmark, right here!", "Hyperion has put {city} on the map.", "The Prime Minister called!"],
      flavour: [
        "Planning permission: denied.", "Pothole report number 300.", "Who approved this budget?",
        "Ribbon-cutting scissors are missing.", "Press conference in ten.", "Forms in triplicate, please.",
        "The mayor's portrait is crooked.", "Bake sale for the library!",
      ],
    },
  };

  // ── Who can speak ──────────────────────────────────────────────────
  const GOV_TYPES = ['TOWNHALL', 'CIVICCENTER', 'COURTHOUSE', 'EMS', 'HOSPITAL', 'UNIVERSITY', 'TRANSPORTHUB', 'NATIONALGOV'];
  function zoneOf(e) {
    if (!e) return null;
    if (e.isIndustrial || e.type === T.INDUSTRIAL) return 'industrial';
    if (e.type === T.COMMERCIAL) return 'commercial';
    if (e.type === T.HOUSE || e.type === T.CABIN) return 'residential';
    for (const n of GOV_TYPES) if (T[n] !== undefined && e.type === T[n]) return 'government';
    return null;
  }
  const SPEAKER_TYPES = () => ['HOUSE', 'CABIN', 'COMMERCIAL', 'INDUSTRIAL', ...GOV_TYPES].map(n => T[n]).filter(v => v !== undefined);

  // ── State ──────────────────────────────────────────────────────────
  const bubbles = [];             // { e, text, born }
  const spokeAt = new WeakMap();  // entity → real time it last spoke
  const recent = [];              // lines said lately
  let nextAt = 0;

  const now = () => performance.now() / 1000;
  const pick = a => a[Math.floor(Math.random() * a.length)];

  function _fill(s) {
    let city = 'town', co = 'the power company';
    try { if (typeof CityInfo !== 'undefined') { city = CityInfo.getCityName() || city; co = CityInfo.getCompanyName?.() || co; } } catch (_e) {}
    return s.replace(/\{city\}/g, city).replace(/\{co\}/g, co);
  }

  // The situations a building could speak to right now, with weights. Its own
  // trouble outweighs everything else, so a dark street talks about the dark.
  function _situations(e, zone) {
    const L = LINES[zone], out = [];
    const add = (w, list) => { if (list && list.length) out.push([w, list]); };
    const dark = typeof OutageWatch !== 'undefined' && OutageWatch.isFlagged && OutageWatch.isFlagged(e);
    if (dark) add(10, L.longOutage);
    else if (!e.powered) add(8, L.outage);
    if (e._churnWarned) add(6, L.leaving);
    let smog = 0;
    try { if (typeof PollutionSystem !== 'undefined') smog = PollutionSystem.exposureFor(e) || 0; } catch (_e) {}
    if (smog > 25) add(4 + Math.min(4, smog / 25), L.smog);
    if (e.powered && !dark && (e.satisfaction ?? 0) >= 85) add(2, L.happy);
    // The world around them.
    let ev = null;
    try { ev = typeof WeatherEventSystem !== 'undefined' ? WeatherEventSystem.getActiveEvent() : null; } catch (_e) {}
    if (ev && L.weather && L.weather[ev.type]) add(3.5, L.weather[ev.type]);
    try { if (typeof Seasons !== 'undefined' && L.season) add(1, L.season[Seasons.name()]); } catch (_e) {}
    const h = typeof DayNight !== 'undefined' ? DayNight.hour() : 12;
    if (h >= 6 && h < 9.5) add(1.2, L.morning);
    else if (h >= 17.5 && h < 21) add(1.2, L.evening);
    else if (h >= 22 || h < 5) add(1.4, L.night);
    try {
      if (typeof NationalProject !== 'undefined') {
        const v = NationalProject.visual();
        if (v && (v.complete || v.final || v.exporting)) add(1.5, L.hyperion);
      }
    } catch (_e) {}
    add(2, L.flavour);
    return out;
  }

  function _chooseLine(e, zone) {
    const sits = _situations(e, zone);
    let total = 0; for (const [w] of sits) total += w;
    let r = Math.random() * total, list = sits[sits.length - 1][1];
    for (const [w, l] of sits) { if ((r -= w) <= 0) { list = l; break; } }
    // Not one said lately, if the list has any left.
    const fresh = list.filter(s => !recent.includes(s));
    const line = pick(fresh.length ? fresh : list);
    recent.push(line); if (recent.length > RECENT_LINES) recent.shift();
    return _fill(line);
  }

  // Buildings that can speak and are on screen, well inside its edges.
  function _candidates() {
    const z = Camera.zoom, W = window.innerWidth, H = window.innerHeight;
    const x0 = Camera.x + 60 / z, y0 = Camera.y + 90 / z, x1 = Camera.x + (W - 60) / z, y1 = Camera.y + (H - 60) / z;
    const t = now(), out = [];
    for (const type of SPEAKER_TYPES()) {
      let set; try { set = EntityRegistry.getByType(type); } catch (_e) { continue; }
      if (!set) continue;
      for (const e of set) {
        if (e._constructing || e._irreparable || e._ghost) continue;
        const wx = (e.col + (e.width || 1) / 2) * TILE, wy = e.row * TILE;
        if (wx < x0 || wx > x1 || wy < y0 || wy > y1) continue;
        if (t - (spokeAt.get(e) || -1e9) < QUIET_FOR) continue;
        if (bubbles.some(b => b.e === e)) continue;
        out.push(e);
      }
    }
    return out;
  }

  function _spawn() {
    const list = _candidates();
    if (!list.length) return;
    // Buildings with something on their minds are likelier to be the ones heard.
    const weightOf = e => (!e.powered ? 4 : 1) * (e._churnWarned ? 2 : 1);
    let total = 0; for (const e of list) total += weightOf(e);
    let r = Math.random() * total, e = list[0];
    for (const c of list) { if ((r -= weightOf(c)) <= 0) { e = c; break; } }
    const zone = zoneOf(e);
    if (!zone) return;
    bubbles.push({ e, text: _chooseLine(e, zone), born: now() });
    spokeAt.set(e, now());
  }

  function _paused() {
    try { return typeof DevMode !== 'undefined' && DevMode.timeScale === 0; } catch (_e) { return false; }
  }

  // ── Drawing ────────────────────────────────────────────────────────
  // Screen space, over the world and under the HUD: the text stays the same
  // size at any zoom.
  function _wrap(ctx, text, maxW) {
    const words = text.split(' '), lines = [];
    let cur = '';
    for (const w of words) {
      const t = cur ? cur + ' ' + w : w;
      if (ctx.measureText(t).width > maxW && cur) { lines.push(cur); cur = w; }
      else cur = t;
    }
    if (cur) lines.push(cur);
    return lines;
  }

  function _draw(ctx, b, alpha) {
    const z = Camera.zoom;
    const e = b.e;
    const sx = ((e.col + (e.width || 1) / 2) * TILE - Camera.x) * z;
    const age = now() - b.born;
    const rise = Math.min(1, age / 0.5);
    const sy = (e.row * TILE - Camera.y) * z - 8 - 6 * (1 - (1 - rise) * (1 - rise));
    ctx.save();
    ctx.font = '600 12px Inter, Arial, sans-serif';
    const lines = _wrap(ctx, b.text, 190);
    const lh = 15, padX = 10, padY = 7;
    let tw = 0; for (const l of lines) tw = Math.max(tw, ctx.measureText(l).width);
    const bw = Math.ceil(tw) + padX * 2, bh = lines.length * lh + padY * 2;
    const bx = Math.round(sx - bw / 2), by = Math.round(sy - bh - 8);
    ctx.globalAlpha = alpha;
    ctx.shadowColor = 'rgba(0,0,0,0.35)'; ctx.shadowBlur = 8; ctx.shadowOffsetY = 2;
    ctx.fillStyle = 'rgba(252,253,255,0.97)';
    ctx.beginPath();
    ctx.roundRect(bx, by, bw, bh, 9);
    // Tail toward the building.
    ctx.moveTo(sx - 6, by + bh - 0.5); ctx.lineTo(sx, by + bh + 8); ctx.lineTo(sx + 6, by + bh - 0.5);
    ctx.fill();
    ctx.shadowColor = 'transparent';
    ctx.strokeStyle = 'rgba(30,50,70,0.35)'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.roundRect(bx + 0.5, by + 0.5, bw - 1, bh - 1, 9); ctx.stroke();
    ctx.fillStyle = '#1c2a38';
    ctx.textBaseline = 'middle';
    lines.forEach((l, i) => ctx.fillText(l, bx + padX, by + padY + lh * i + lh / 2 + 0.5));
    ctx.restore();
  }

  // Called once a frame by the renderer, after Camera.resetTransform(ctx).
  function render(ctx) {
    if (!enabled) { bubbles.length = 0; return; }
    if (typeof Camera === 'undefined' || typeof EntityRegistry === 'undefined') return;
    const t = now();
    for (let i = bubbles.length - 1; i >= 0; i--) {
      const b = bubbles[i];
      if (t - b.born > LIFE || !EntityRegistry.getByType(b.e.type)?.has(b.e)) bubbles.splice(i, 1);
    }
    const z = Camera.zoom;
    const zk = Math.max(0, Math.min(1, (z - CHAT_ZOOM) / (CHAT_ZOOM_FULL - CHAT_ZOOM)));
    if (zk <= 0) return;   // zoomed out: none shown, none started
    if (!nextAt) nextAt = t + 3 + Math.random() * 4;
    if (t >= nextAt && !_paused()) {
      if (bubbles.length < MAX_ON_SCREEN) _spawn();
      nextAt = t + GAP_MIN + Math.random() * (GAP_MAX - GAP_MIN);
    }
    for (const b of bubbles) {
      const age = t - b.born;
      const fade = Math.min(1, age / 0.35, (LIFE - age) / 0.6);
      if (fade > 0) _draw(ctx, b, fade * zk);
    }
  }

  function setEnabled(on) {
    enabled = !!on;
    try { localStorage.setItem(KEY, enabled ? '1' : '0'); } catch (_e) {}
    if (!enabled) bubbles.length = 0;
  }

  return { render, setEnabled, isEnabled: () => enabled, LINES,
    // Dev / tests: what is being said right now.
    current: () => bubbles.map(b => ({ text: b.text, zone: zoneOf(b.e) })) };
})();
