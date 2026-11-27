/* ═══════════════════════════════════════════════════════════════════
   TUTORIAL SYSTEM
   Sequential step-card onboarding. A sequence is a named, ordered list
   of steps; each step shows a short instruction and auto-advances once
   its check() passes. Sequences are triggered by game state (not just
   at new-game start) so later mechanics (substations, coal, etc.) can
   pop their own short tutorial the first time they become relevant.
   Reuses existing UI language: the bottom-left card mirrors NotificationStack's
   card styling, and highlight() reuses hotbar_ui's flashUnlockButton() pulse
   (which already self-clears when the player opens that hotbar category).
   Never pauses the sim and is always skippable — see SEQUENCES below to add more.
   ═══════════════════════════════════════════════════════════════════ */

const TutorialSystem = (() => {
  // 'demandceiling' thresholds: the city has to be drawing at least this much
  // before running tight is worth mentioning, and consumption has to be at
  // least this share of generation for it to be running tight at all.
  const DEMAND_CEILING_W    = 275;
  const DEMAND_CEILING_LOAD = 0.85;   // under 15% spare generation

  const SEQUENCES = [
    {
      id: 'intro',
      title: 'Getting Started',
      trigger: () => true,
      steps: [
        {
          text: () => `Welcome to GRIDWORKS!\n\nYou own ${CityInfo.getCompanyName()}, hired by ${CityInfo.getCityName()} to build its power grid. Build it, grow it and keep it running.`,
          more: () => `Welcome to GRIDWORKS!\n\nYou own ${CityInfo.getCompanyName()}, hired by the local government of ${CityInfo.getCityName()} to build its power grid.\n\nBuild it, grow it and keep it running. More advanced power comes as you progress.`,
          manual: true,
        },
        {
          text: "Show tutorial cards? (Recommended for first-time players)\n\nYou can change this in OPTIONS, and every tutorial is kept in the Compendium.",
          choice: true,
        },
        {
          text: "W-A-S-D, ARROW KEYS or drag with LMB to move\n\nScroll to zoom\n\nQ duplicates a placed item\n\nX toggles deletion mode\n\nM opens the map\n\nTAB shows / hides the build bar\n\nF2 quicksaves\n\nF toggles the night flashlight\n\nE opens your highest-tier Research Station",
          manual: true,
          controls: [
            { desc: 'Move around the world', keys: [['W','A','S','D'], ['↑','↓','←','→']] },
            { desc: 'Drag to pan', keys: [['Hold LMB']] },
            { desc: 'Zoom in / out', keys: [['Scroll']] },
            { desc: 'Duplicate a placed item', keys: [['Q']] },
            { desc: 'Toggle deletion mode', keys: [['X']] },
            { desc: 'Open the map', keys: [['M']] },
            { desc: 'Show / hide the build bar', keys: [['Tab']] },
            { desc: 'Quicksave', keys: [['F2']] },
            { desc: 'Toggle nighttime flashlight', keys: [['F']] },
            { desc: 'Highest-tier Research Station', keys: [['E']] },
          ],
          // Shown instead on a phone (see _touchOn() and js/mobile.js).
          touchText: "Drag one finger to move around the world\n\nPinch with two fingers to zoom in/out\n\nTap to place, select and inspect. Long-press to remove a building or chop a tree\n\nThe buttons on the right edge: ✕ puts a tool away, ⟳ rotates, ⌖ picks up a copy of a placed item, ⇧ is Shift\n\n⋯ opens every other control: Map, Quicksave, Flashlight, Research, Undo, Copy / Paste, Pause and more",
          touchControls: [
            { desc: 'Move around the world', keys: [['Drag']] },
            { desc: 'Zoom in / out', keys: [['Pinch']] },
            { desc: 'Place / select', keys: [['Tap']] },
            { desc: 'Remove / chop', keys: [['Long-press']] },
            { desc: 'Put the tool away', keys: [['✕']] },
            { desc: 'Rotate', keys: [['⟳']] },
            { desc: 'Duplicate a placed item', keys: [['⌖']] },
            { desc: 'Map, Quicksave, Flashlight, Research…', keys: [['⋯']] },
          ],
          // Shown instead while a controller is connected (see _padOn()).
          padText: "Move the cursor with the LEFT STICK and pan the camera with the RIGHT STICK\n\nLT / RT to zoom out/in\n\nA places and selects, B removes, hold B to chop\n\nY duplicates a placed item, X rotates\n\nLB / RB bring up the build bar and switch category\n\nVIEW opens the map, hold it for your highest-tier Research Station\n\nR3 plays / pauses, hold R3 to fast forward\n\nHold L3 and drag with A to select, VIEW + X toggles the nighttime flashlight\n\nMENU opens the pause menu",
          padControls: [
            { desc: 'Move the cursor', keys: [['Left Stick']] },
            { desc: 'Pan the camera', keys: [['Right Stick']] },
            { desc: 'Zoom out / in', keys: [['LT'], ['RT']] },
            { desc: 'Step one tile', keys: [['D-Pad']] },
            { desc: 'Place / select', keys: [['A']] },
            { desc: 'Remove / hold to chop', keys: [['B']] },
            { desc: 'Duplicate a placed item', keys: [['Y']] },
            { desc: 'Rotate', keys: [['X']] },
            { desc: 'Build bar / switch category', keys: [['LB'], ['RB']] },
            { desc: 'Open the map', keys: [['View']] },
            { desc: 'Play / pause', keys: [['R3']] },
            { desc: 'Fast forward', keys: [['Hold R3']] },
            { desc: 'Select (drag)', keys: [['Hold L3 + A']] },
            { desc: 'Toggle nighttime flashlight', keys: [['View + X']] },
            { desc: 'Highest-tier Research Station', keys: [['Hold View']] },
            { desc: 'Pause menu', keys: [['Menu']] },
          ],
        },
        {
          // Item hotkeys (ToolHotkeys, hotbar_ui.js).
          touchText: "QUICK PICK: on a phone, ⌖ on the right edge does the job of item hotkeys. Tap it, then tap anything you've built to pick up that item and place more of it.",
          touchControls: [
            { desc: 'Pick up a placed item to build more', keys: [['⌖'], ['Tap item']] },
          ],
          text: "HOTKEYS: open the build bar, hover an item and press a key from 1 to 0. That key now picks the item up.\n\nPress its number over it again to clear it.",
          manual: true,
          controls: [
            { desc: 'Hotkey an item: hover it in the build menu, press', keys: [['1 – 0']] },
            { desc: 'Pick up the assigned item', keys: [['1 – 0']] },
            { desc: 'Clear: hover it, press its own number', keys: [['1 – 0']] },
          ],
        },
        {
          text: "The top bar: INCOME and BALANCE (you start with $20,000), POPULATION, GOVERNMENT approval, CITY SCORE, GRID supply and demand, WEATHER and PROGRESS.\n\nRequests come as your total kWh grows: if they feel slow, build more generators.",
          more: "INCOME and BALANCE: what you earn and hold (you start with $20,000). POPULATION grows as customers move in. GOVERNMENT is the council\'s happiness and CITY SCORE grades your grid\'s stability; blackouts hurt both.\n\nGRID breaks down supply and demand. WEATHER: heat waves and cold snaps raise demand, rain cuts solar, rainstorms bring lightning.\n\nPROGRESS lists upcoming requests and unlocks. Requests come as your total kWh grows, so if it feels slow, build more generators. (A Monitoring Station adds full breakdowns later.)",
          manual: true,
          highlightDom: ['income-balance-group', 'population-stat-btn', 'gov-stat-btn', 'score-stat-btn', 'grid-tab-btn', 'weather-tab-btn', 'btn-progress'],
        },
        {
          text: "Pause with SPACE and change speed (up to 10x) with ALT.\n\nPANELS (bottom right) opens the Compendium, Research, Achievements and Message Log. RECENTER takes you back to City Hall.",
          more: "The clock shows the time. Pause with SPACE and change speed (up to 10x) with ALT.\n\nPANELS (bottom right) opens the side panels: the COMPENDIUM (every item and tutorial), RESEARCH, ACHIEVEMENTS and the MESSAGE LOG. More appear as you unlock them. RECENTER, just above PANELS, takes you back to City Hall.",
          manual: true,
          highlightDom: ['clock', 'playback-controls', 'btn-side-dock', 'btn-compendium', 'btn-achievements', 'btn-recenter', 'btn-msglog'],
        },
        {
          text: () => `This is ${CityInfo.getCityName()} City Hall, your first customer. It needs up to 8 kW.\n\nFrom the GENERATION tab, place 3 Biofuel Generators near it.`,
          more: () => `This is ${CityInfo.getCityName()} City Hall, your first customer. It needs up to 8 kW, day and night.\n\nFrom the GENERATION tab, place at least 3 Biofuel Generators near it (3 kW each, constant).\n\nMost buildings have an upkeep fee, so watch your INCOME.`,
          subject: [T.BIOFUELGEN],
          highlight: T.BIOFUELGEN,
          highlightWorld: true,
          onEnter: () => {
            const gb = typeof GovernmentSystem !== 'undefined' ? GovernmentSystem.getGovEntity() : null;
            if (!gb) return;
            const wx = (gb.col + (gb.width  || 1) / 2) * TILE;
            const wy = (gb.row + (gb.height || 1) / 2) * TILE;
            Camera.recentreOn(wx, wy);
          },
          check: () => EntityRegistry.getByType(T.BIOFUELGEN).size >= 3,
        },
        {
          text: "Now collect biofuel: Hold right-click over trees and bushes. Your generators burn a lot of it.\n\n50 biofuel unlocks Cable.",
          more: () => `Now collect biofuel. Hold right-click over trees and bushes around ${CityInfo.getCityName()}. Your generators burn a lot of it.\n\n50 biofuel unlocks Cable.`,
          subject: ['veg:tree'],
          check: () => Progression.isUnlocked(T.WIRE),
        },
        {
          text: "Cable unlocked! Wire your generators together, then run a cable to City Hall.\n\nAt most 3 cables in a row between buildings or poles.",
          more: "Cable unlocked! Wire your generators together to stack their power, then run a cable to City Hall.\n\nAt most 3 cables in a row without a building or pole between them.",
          subject: [T.WIRE],
          highlight: T.WIRE,
          highlightWorld: true,
          // No read-pause here: the player wires up while reading, and the
          // freeze plus its CONTINUE button flashed by as soon as the wiring
          // check passed.
          noReadPause: true,
          check: () => {
            const gb = typeof GovernmentSystem !== 'undefined' ? GovernmentSystem.getGovEntity() : null;
            return !!(gb && gb.powered);
          },
        },
        {
          text: "City Hall is powered! Keep collecting: 125 biofuel unlocks the Research Station.",
          more: "City Hall is powered! Keep collecting: 125 biofuel unlocks the Research Station.",
          subject: [T.RESEARCH],
          check: () => Progression.isUnlocked(T.RESEARCH),
        },
        {
          text: "Research Station MK1 unlocked! Place it, then click it to unlock new items.\n\nIt needs 3 kW of spare power.",
          more: "Research Station MK1 unlocked! Click it to unlock new items once you meet their requirements.\n\nPlace it now. It needs power, so keep 3 kW spare.",
          subject: [T.RESEARCH],
          highlight: T.RESEARCH,
          check: () => EntityRegistry.getByType(T.RESEARCH).size > 0,
        },
        {
          text: "Mae\'s Cabin wants power: your first residential customer!\n\nOpen the requests window and pick a site. It starts your first residential zone.\n\nTIP: with the window open, press M to see the sites on the map.",
          more: "Mae\'s Cabin wants a connection: your first residential customer!\n\nOpen the requests window to see the payment and daily fee, then pick a site. Your pick starts your first residential zone; later requests always offer a spot near it, and a far one starts a new zone.\n\nTIP: with the window open, press M to see the sites (A to G) on the map.",
          subject: ['tier:budget'],
          highlightDom: ['hotbar-req-btn'],
          check: () => HouseRequestSystem.getCabinCleared(),
          pauseAnyway: true,
        },
        {
          text: "Power Pole can now be unlocked. You need one after every 3 cables: Hold LMB and drag to place them in a line.\n\nHOOKUP DEAL: until Mae\'s Cabin has power, cables are FREE and poles are 50% off.",
          more: "Power Pole can now be unlocked at the Research Station.\n\nYou need a pole after every 3 cables. Hold LMB and drag to place one every 4 tiles.\n\nNow get Mae\'s Cabin online. HOOKUP DEAL: until it has power, cables are FREE and poles are 50% off.",
          subject: [T.POLE],
          highlight: T.POLE,
          check: () => {
            const cabin = [...EntityRegistry.getByType(T.HOUSE)][0];
            return !!(cabin && cabin.powered);
          },
          // Time keeps running while the player wires the cabin up.
          noPause: true,
          // `powered` is only ever set by the power pass, which a paused
          // game skips: wiring the cabin up while paused by hand left it
          // dark and the card waiting until the player unpaused.
          probePower: true,
        },
        {
          text: "Your first customer is connected! It paid up front, and its daily fee pays out through the day.\n\nKeep customers lit: a customer left dark too long leaves and charges you a fee.",
          more: "Your first residential customer is connected!\n\nYou got an upfront payment, and its daily fee pays out through the day. Click a property to see its draw and income.\n\nKeep customers lit: blackouts cut satisfaction and income, and one left dark too long leaves and charges you a fee.\n\nKeep collecting biofuel for your next generator. PROGRESS (or a Research Station) shows what\'s coming.",
          subject: ['tier:budget'],
          manual: true,
        },
      ],
    },
    {
      // Its own card rather than a Getting Started step, since seasons are a
      // per-world setting (Seasons, daynight.js) and a step can't be skipped.
      // Comes straight after Getting Started.
      id: 'seasons',
      title: 'Seasons',
      trigger: () => typeof Seasons !== 'undefined' && Seasons.enabled() && _isSeqDone(SEQUENCES[0]),
      steps: [
        {
          text: "Four seasons of 14 days each. Summer brings more sun and heat waves; winter less sun, more heating demand and blizzards.\n\nSeasonal town events pay a bonus if you keep the pledged buildings lit.",
          more: "The year runs Spring, Summer, Autumn, Winter, 14 days each; the clock shows the season.\n\nSUMMER: about 2 more hours of sun, but more cooling demand and heat waves.\nWINTER: about 2 hours less sun, more heating demand, snow instead of rain and blizzards instead of rainstorms.\n\nEach season brings town events: keep the pledged buildings lit for a bonus.",
          manual: true,
          highlightDom: ['clock'],
        },
      ],
    },
    {
      id: 'contracts',
      title: 'Contract Work',
      trigger: () => typeof T !== 'undefined' && T.BEACON !== undefined
                  && Progression.isUnlocked(T.BEACON),
      steps: [
        {
          // Waits until the beacon is actually standing — this step is the
          // instruction to build it, so advancing off it early would leave the
          // player reading about a board they cannot open. Dismissable, so a
          // player who wants no contract work can close it for good.
          dismissable: true,
          text: "Companies around the world pay contractors to build power. That\'s you.\n\nUnlock and place a Communications Beacon to hear from them. It\'s expensive and always draws power.",
          more: "Companies around the world will pay a contractor to build generation, run lines and restore supply. That contractor is you.\n\nUnlock a Communications Beacon at a Research Station and place it to hear from them. It\'s expensive and draws power constantly, so make it pay.",
          subject: [T.BEACON],
          highlight: T.BEACON,
          check: () => EntityRegistry.getByType(T.BEACON).size > 0,
        },
        {
          // Shown once the beacon exists. Dismissed with Continue, since
          // it is the player's to read at their own pace.
          text: "Click your beacon and choose OPEN CONTRACT BOARD. Each offer lists the client, site, scope and pay.\n\nMost clients fund the equipment up front. FIXED BID jobs don\'t: you pay, and are repaid with a bigger margin.",
          more: "Click your beacon and choose OPEN CONTRACT BOARD.\n\nEach offer lists client, site, scope and pay. Most clients fund the equipment up front: build under budget and keep the difference, plus your margin, paid on sign-off.\n\nFIXED BID jobs pay no advance: you buy the kit and are repaid with a bigger margin on sign-off, so make sure you can afford it.\n\nOffers expire after a few days. The board holds ten, you can run three at once, and accepting takes you to the site.",
          subject: [T.BEACON],
          manual: true,
        },
        {
          // A short holding card so dismissing the one above cannot drop
          // the player straight into "You are now at the jobsite" while
          // they are still standing at home. Dismissable rather than
          // manual: its Continue closes the card but leaves the sequence
          // parked here until the player actually reaches a site.
          text: "Open your beacon and run a sweep to find work. It takes about a day and turns up one to five offers.",
          more: "Work doesn\'t come to you: open your beacon and run a sweep. It draws 12 kW while searching (3 kW on standby) and finds one to five offers, usually two or three, in about a day.",
          subject: [T.BEACON],
          dismissable: true,
          check: () => typeof ContractSystem !== 'undefined' && ContractSystem.isAtSite(),
        },
        {
          // First arrival on a job site. Rings the two marker regions the
          // text is describing so "the highlighted areas" is unambiguous.
          text: "You\'re at the jobsite. Build inside the highlighted area; the checklist tracks every requirement live.\n\nYou can travel home and back freely, but the deadline keeps running. Miss it and the contract fails.",
          more: "You\'re at the jobsite.\n\nThe highlighted areas are the build area and the client\'s existing works your supply must reach; nothing outside the boundary is your job. The checklist tracks every requirement live: equipment must be WORKING, and the client\'s dark buildings must be back on supply.\n\nRETURN HOME and RETURN TO SITE travel freely, with the site kept as you left it, but the deadline keeps running. Miss it (or ABANDON) and the contract fails: no profit, the budget goes back and everything on site is lost. Finish on time and repeat work pays better.",
          manual: true,
          highlightWorld: () => {
            if (typeof ContractSystem === 'undefined' || !ContractSystem.isAtSite()) return null;
            const a = ContractSystem.getActive();
            return a ? Object.values(a.markers) : null;
          },
        },
      ],
    },
    {
      id: 'contract-kinds',
      title: 'Kinds of Job',
      // After the first contract is finished: the board has more to say than
      // the first few jobs showed.
      trigger: () => typeof ContractSites !== 'undefined' && ContractSites.contractorRank().count >= 1,
      steps: [
        {
          text: "Kinds of job: RUSH (half the deadline, paid a premium), RETAINER (a supply guarantee), PEAK SUPPORT (batteries for the evening peak) and SHOWCASE (for known contractors).\n\nBigger jobs pay more. Some pay partly in perks.",
          more: "Not every contract is the same job.\n\nRUSH: small, half the deadline, paid a premium.\nRETAINER: a 2 to 4 day supply guarantee with little new kit.\nPEAK SUPPORT: batteries holding a client\'s evening peak.\nSHOWCASE: extra work for better pay, only for contractors with a name.\n\nThe badge shows job size, SMALL to FLAGSHIP: bigger pays more and takes longer.\n\nCASH + PERK jobs pay a little less cash plus a perk; PAID MOSTLY IN KIND jobs pay little cash and a longer perk. Perks: free cables for a few days, an equipment discount, cheaper repairs or running costs, faster sweeps, or an extra job next sweep. They count down in home time only.",
          manual: true,
        },
        {
          text: "Clients only ask for power you\'ve run on your own grid, and pay better as you finish their jobs.\n\nA client\'s reactor can melt down like yours, and you\'re liable for their losses.",
          more: "Clients only ask for power you\'ve proven by running it on your own grid.\n\nEach client\'s rank lifts their rates as you finish their jobs, and your contractor rank opens Showcase work.\n\nReactor jobs carry a warning: a client\'s reactor can melt down like yours, ending the contract and making you liable for their losses, which can put you in debt. Keep it cooled and its steam drawn.",
          manual: true,
        },
      ],
    },
    {
      id: 'crewdispatch',
      title: 'Dispatching a Crew',
      // The first time a repeat order the player could send a crew to right
      // now is on the board (ContractSystem.dispatchBlocker clears it): the
      // DISPATCH CREW button is live, so this is when it is worth explaining.
      trigger: () => typeof ContractSystem !== 'undefined' && typeof ContractSites !== 'undefined'
                  && ContractSystem.getOffers().some(o => {
                       const c = ContractSites.getContract(o.contractId);
                       return !!(c && c.repeat && !ContractSystem.dispatchBlocker(c));
                     }),
      steps: [
        {
          text: "A client you\'ve done three jobs for may send a REPEAT ORDER.\n\nDo it yourself for full pay, or DISPATCH CREW: your crew rebuilds your last build there for half the profit while you stay home.",
          more: "After three finished jobs, a client trusts your crew: when they want the same job again, a REPEAT ORDER appears on the board.\n\nACCEPT & TRAVEL to do it yourself for full pay, or DISPATCH CREW: the crew rebuilds your last build there while you stay home. The client pays for the equipment, and you get half the usual profit on sign-off.\n\nYou have one crew. It takes one of your three contract slots and is sent from home. The deadline still runs; if the crew hits a snag, or the finished build fails the checklist, a notification calls you to the site. You can visit any time to help.",
          manual: true,
        },
      ],
    },
    {
      id: 'blackout',
      title: 'Power Failure',
      trigger: () => {
        const now = Date.now();
        const gb = typeof GovernmentSystem !== 'undefined' ? GovernmentSystem.getGovEntity() : null;
        if (gb && gb._insufficient && gb._deficitStartTime && now - gb._deficitStartTime >= 10000) return true;
        for (const t of [T.HOUSE, T.COMMERCIAL, T.INDUSTRIAL]) {
          for (const e of EntityRegistry.getByType(t)) {
            if (e._insufficient && e._deficitStartTime && now - e._deficitStartTime >= 10000) return true;
          }
        }
        return false;
      },
      steps: [
        {
          text: "You have a blackout!\n\nDark properties pay less the longer they\'re out, and may leave (costing you 90% of their upfront fee). Get power back fast.",
          more: "You have a blackout!\n\nBlackouts cut the daily fees your properties pay, more the longer they last. Get power back fast; you may need more generators.\n\nLeft dark long enough, customers threaten to leave, and one that leaves costs you 90% of its upfront fee.",
          manual: true,
        },
      ],
    },
    {
      id: 'wirefault',
      title: 'Cable Fault',
      trigger: () => !!_findFirstFaultedWire(),
      steps: [
        {
          // Names what actually knocked the wire out (weather_events.js
          // _markFault, lightning fire): it used to blame a storm every time,
          // even for a fault in fog, a heat wave or a dead calm.
          text: () => _wireFaultCause() + "\n\nClick the red cable and hit Repair Cable, or Repair All Faults to fix them all.",
          more: () => _wireFaultCause() + "\n\nClick the red faulted cable and hit Repair Cable, or click any cable and use Repair All Faults to fix every broken cable at once.\n\nRepairs cost money per cable, 25% less with a Monitoring Station.",
          subject: [T.WIRE],
          manual: true,
          highlightWorld: () => _findFirstFaultedWire(),
          onEnter: () => {
            const wire = _findFirstFaultedWire();
            if (!wire) return;
            const wx = (wire.col + (wire.width  || 1) / 2) * TILE;
            const wy = (wire.row + (wire.height || 1) / 2) * TILE;
            Camera.recentreOn(wx, wy);
          },
        },
      ],
    },
    {
      id: 'lightningstrike',
      title: 'Struck By Lightning',
      trigger: () => !!_findFirstLightningDamaged(),
      steps: [
        {
          text: "Lightning hit one of your buildings! It does nothing until repaired, and a struck pole cuts power past it.\n\nClick it and hit Repair.",
          more: "Lightning hit one of your buildings!\n\nA struck building draws, makes and pays nothing until repaired; a struck Power Pole stops conducting, so everything past it goes dark.\n\nClick it and hit Repair. The cost scales with its value (25% off with a Monitoring Station), and it takes minutes for a pole, hours for a reactor.\n\nStrikes only come in rainstorms, and bigger grids and buildings are hit more often.",
          subject: [T.LIGHTNINGROD],
          manual: true,
          highlightWorld: () => _findFirstLightningDamaged(),
          onEnter: () => {
            const e = _findFirstLightningDamaged();
            if (!e) return;
            const wx = (e.col + (e.width  || 1) / 2) * TILE;
            const wy = (e.row + (e.height || 1) / 2) * TILE;
            Camera.recentreOn(wx, wy);
          },
        },
      ],
    },
    {
      id: 'lightningrod',
      title: 'Lightning Rods',
      trigger: () => Progression.isReady(T.LIGHTNINGROD) || Progression.isUnlocked(T.LIGHTNINGROD),
      steps: [
        {
          text: "That strike earned you the Lightning Rod! It draws strikes away from everything within 14 tiles.\n\nUnlock it at your Research Station MK2.",
          more: "That strike earned you the Lightning Rod!\n\nA 3x4 grounded mast that draws strikes away from everything within 14 tiles. Rods are never damaged.\n\nUnlock it at your Research Station MK2.",
          subject: [T.LIGHTNINGROD],
          highlight: T.LIGHTNINGROD,
          // Unlocking is a menu click, not something that needs sim time
          // to elapse, so it's safe to pause and let the player read.
          pauseAnyway: true,
          manual: true,
          check: () => Progression.isUnlocked(T.LIGHTNINGROD),
        },
        {
          text: "Place rods near what you can least afford to lose: power plants and big customers.\n\nOverlapping rods protect better. Click a rod to see its coverage.",
          more: "Place rods near what you can least afford to lose: power plants and big customers.\n\nOne rod cuts strikes in its radius by about 60%; two overlapping, about 85%; three, about 95%.\n\nWired in, each intercepted strike feeds 10 kW back, fading over an in-game hour (an unwired rod still protects). Click a rod to see its coverage.",
          subject: [T.LIGHTNINGROD],
          highlight: T.LIGHTNINGROD,
          manual: true,
          check: () => EntityRegistry.getByType(T.LIGHTNINGROD).size > 0,
        },
      ],
    },
    {
      id: 'lamp',
      title: 'Amenity Requests',
      trigger: () => Progression.isUnlocked(T.LAMP),
      steps: [
        {
          text: "Street Lamp unlocked! Properties sometimes ask for an amenity like this; watch your notifications.\n\nPlace it within 1 tile of the building that asked.",
          more: "Street Lamp unlocked!\n\nProperties sometimes request an amenity like a Street Lamp or Security Camera; watch your notifications.\n\nPlace it within 1 tile of the building that asked. It boosts satisfaction for everyone nearby.",
          subject: [T.LAMP, T.CAMERA],
          manual: true,
          highlight: T.LAMP,
        },
      ],
    },
    {
      id: 'survey',
      title: 'Resource Surveys',
      trigger: () => Progression.isUnlocked(T.SURVEY),
      steps: [
        {
          text: "Resource Survey Station unlocked! Place it, power it and click it to run a Geothermal Scan, which reveals hidden deposits.",
          more: "Resource Survey Station unlocked: the way to geothermal power.\n\nPlace it, power it and click it to run a Geothermal Scan, which reveals hidden deposits.\n\nA scan takes 8 to 12 in-game hours (rarer resources take longer) and draws 40 kW (8 kW idle). Without power it pauses, keeping its progress. Each scan costs more and draws 5 kW more than the last.",
          subject: [T.SURVEY],
          // Dismissable, not manual: `manual` ADVANCES on Continue, so this
          // card handed straight over to "You have completed your first
          // resource scan!" the instant the player closed it - before they
          // had placed the station, let alone run a scan. Dismissable closes
          // the card but parks the sequence here until a scan really lands.
          //
          // Geothermal deposits on the map are the proof: they exist only
          // once a scan has finished spawning them, which is also exactly
          // what the next card tells the player to go and look at.
          dismissable: true,
          highlight: T.SURVEY,
          check: () => GeothermalSystem.hasDeposits(),
        },
        {
          text: "First scan complete! Open the map (M) to see the geothermal deposits it found.",
          more: "First scan complete! Open the map (M) to see the geothermal deposits it found.\n\nThe geothermal chain is now open at your Research Station.",
          subject: [T.GEOWELL],
          // Manual, and deliberately WITHOUT a check. The old check here
          // waited on Progression.isUnlocked(T.GEOWELL) - but the well
          // unlocks on GeothermalSystem.hasDeposits() (progression.js), the
          // very same condition that advances the card above. Both passed on
          // the same tick, so the engine advanced twice and this card never
          // got seen at all. By the time it shows, the well IS unlocked, so
          // the next card's claim is already true and a plain Continue is
          // the right control.
          manual: true,
        },
        {
          text: "Geothermal Well unlocked! Place one on a geothermal deposit and wire it in.\n\nThe turbine goes on its steam port: press R before placing to turn it.",
          more: "Geothermal Well unlocked.\n\nPlace one on a geothermal deposit, one per deposit (the map (M) shows them). The marked steam output port is where the turbine goes: press R before placing to turn it.\n\nThe well\'s pump needs power, so wire it in.",
          subject: [T.GEOWELL],
          highlight: T.GEOWELL,
          // Dismissable, not manual: the next card says to unlock the
          // Geothermal Turbine, which only unlocks once a well is down
          // (progression.js), so Continue must not hand straight over to it.
          dismissable: true,
          check: () => EntityRegistry.getByType(T.GEOWELL).size > 0,
        },
        {
          text: "Now unlock the Geothermal Turbine (E opens the Research Station from anywhere) and place it over the well\'s steam port.\n\nRun three at once to unlock the Coal Scan.",
          more: "Now unlock the Geothermal Turbine (E opens the Research Station from anywhere) and place it over the well\'s steam port, one per well.\n\nEach makes 35 to 55 kW depending on the world\'s heat and the weather, day and night; deposits never run dry.\n\nRun three turbines at once to unlock the Coal Scan.",
          subject: [T.GEOTURBINE],
          highlight: T.GEOTURBINE,
          manual: true,
          check: () => EntityRegistry.getByType(T.GEOTURBINE).size > 0,
        },
      ],
    },
    {
      id: 'coalmine',
      title: 'Digging In',
      // Coal is no longer the survey station's first find — the Coal Scan
      // only opens once three Geothermal Turbines have run, so these two
      // cards live here rather than in the survey sequence, where they
      // used to fire hours before the player could act on them.
      trigger: () => Progression.isReady(T.COALMINE) || Progression.isUnlocked(T.COALMINE),
      steps: [
        {
          text: "Your Coal Scan found coal and unlocked the Research Station MK2. Place it: the Coal Mine is researched there.",
          more: "Your Coal Scan found coal, and unlocked the Research Station MK2.\n\nPlace it: the Coal Mine is researched there.",
          subject: [T.RESEARCH2],
          highlight: T.RESEARCH2,
          // Dismissable, not manual: `manual` advances on Continue, so closing
          // this card jumped straight to "Click the NEW Research Station"
          // before the MK2 had been placed - the card pointed at a building
          // that did not exist yet. Dismissable closes the card and leaves the
          // sequence parked here until the station is actually standing.
          dismissable: true,
          check: () => EntityRegistry.getByType(T.RESEARCH2).size > 0,
        },
        {
          text: "Click the new Research Station and unlock the Coal Mine, then place one on a coal deposit.",
          more: "Click the new Research Station and unlock the Coal Mine.\n\nThen place one on a coal deposit.",
          subject: [T.COALMINE],
          highlight: T.COALMINE,
          // Same again: the next card opens "By placing the coal mine, you can
          // now unlock Power Tower!", which is only true once a mine is down -
          // Power Tower's own gate is exactly that (Progression
          // .checkPowerTowerReady). Hold here until it is.
          dismissable: true,
          check: () => EntityRegistry.getByType(T.COALMINE).size > 0,
        },
        {
          text: "Power Tower unlocked: it carries cable twice as far as a pole. Use it to power your Coal Mine.\n\nLike poles, holding down LMB and dragging places them in a line.",
          more: "Placing a coal mine unlocks the Power Tower: it carries cable twice as far as a pole, handy for reaching a distant mine. Power up the Coal Mine!\n\nLike poles, holding down LMB and dragging places towers at their maximum spacing.",
          subject: [T.POWERTOWER],
          manual: true,
          highlight: T.POWERTOWER,
        },
      ],
    },
    {
      id: 'wireoverload',
      title: 'Running Hot',
      // Fires while a line is still glowing red rather than after it burns
      // out — PowerNetwork flags the first time any wire/pole runs at 90%+
      // of its network cap. Also waits for the Surge Protector to actually
      // be researchable, since the card says so.
      trigger: () => typeof PowerNetwork !== 'undefined'
                  && PowerNetwork.everRedlined()
                  && (Progression.isReady(T.PROTECTOR) || Progression.isUnlocked(T.PROTECTOR)),
      steps: [
        {
          text: "Your cables are running hot! Past 80% load a cable can burn out.\n\nThe Surge Protector can now be unlocked: each one raises its network\'s cable capacity by 170 kW.",
          more: "Your cables are running hot; the Surge Protector can now be unlocked.\n\nEach cable network carries 85 kW to start. Green is comfortable, yellow tight, red at the limit. Past 80% a cable can burn out, darkening everything past it until repaired.\n\nMove load off the network or raise its cap: each Surge Protector on it adds 170 kW (255 kW with one, 425 kW with two). It needs no power, just $7/s upkeep.",
          subject: [T.PROTECTOR],
          manual: true,
          highlight: T.PROTECTOR,
        },
      ],
    },
    {
      id: 'demandceiling',
      title: 'Nearing Capacity',
      // Fires when the city is drawing real load AND there is almost no spare
      // generation left under it. Both halves matter: 275 kW on a grid making
      // 600 kW is a healthy city, not a warning, and a thin margin at 40 kW is
      // just the early game.
      //
      // Demand follows the time-of-day curves, so this will usually land on
      // an evening peak - which is exactly the moment the player is closest
      // to the ceiling, and the moment the advice is worth acting on.
      trigger: () => {
        if (typeof PowerNetwork === 'undefined') return false;
        const { totalConsumed: used, totalGenerated: made } = PowerNetwork.stats;
        return used >= DEMAND_CEILING_W && made > 0 && used >= made * DEMAND_CEILING_LOAD;
      },
      steps: [
        {
          text: "Your grid is close to its limit. Add power before accepting many more requests, especially industrial ones.\n\nThe GRID panel shows your headroom.",
          more: "Careful accepting more requests: your grid is close to its limit.\n\nAdd power before taking many more, especially industrial customers, which draw heavily around the clock.\n\nThe GRID panel shows live supply against demand, so check your headroom first.",
          manual: true,
          highlightDom: ['grid-tab-btn'],
        },
      ],
    },
    {
      id: 'substation',
      title: 'Substations',
      trigger: () => Progression.isReady(T.SUBSTATION) || Progression.isUnlocked(T.SUBSTATION),
      steps: [
        {
          text: "Substation unlocked! It stores spare power and releases it when demand runs ahead.\n\n⚠ Lightning detonates a charged substation: keep it away from town or under a Lightning Rod.",
          more: "Substation unlocked!\n\nIt\'s big storage: it charges when you generate more than you use and covers the gap when demand runs ahead (an evening peak, a still night, a generator dropping out). Wire it in like anything else.\n\nWARNING: lightning detonates a charged substation, burning everything within several tiles. Keep it away from town or under a Lightning Rod.",
          subject: [T.SUBSTATION],
          manual: true,
          highlight: T.SUBSTATION,
        },
      ],
    },
    {
      id: 'monitor',
      title: 'Eyes on the Grid',
      trigger: () => Progression.isReady(T.MONITOR) || Progression.isUnlocked(T.MONITOR),
      steps: [
        {
          text: "Monitoring Station unlocked! Keep one powered for your city\'s analytics and 25% off every repair.",
          more: "Monitoring Station unlocked!\n\nKeep one powered to open your city\'s analytics, including the population breakdown. It also takes 25% off every repair.",
          subject: [T.MONITOR],
          manual: true,
          highlight: T.MONITOR,
        },
      ],
    },
    {
      id: 'circuitswitch',
      title: 'Load Shedding',
      trigger: () => Progression.isReady(T.CIRCUITSWITCH) || Progression.isUnlocked(T.CIRCUITSWITCH),
      steps: [
        {
          text: "Circuit Switch unlocked: a manual breaker. Assign buildings to it, and when power runs short, open it to cut just those, keeping the rest lit.",
          more: "Circuit Switch unlocked: a manual breaker.\n\nFrom its panel, assign buildings up to 500 kW of peak load (MK2: 1.4 MW). When power runs short, open the circuit: those buildings go dark so the rest stays lit instead of the whole grid browning out.\n\nIt needs no power, so it works mid-blackout. Shed buildings don\'t pay, so close it once power is back.",
          subject: [T.CIRCUITSWITCH],
          manual: true,
          highlight: T.CIRCUITSWITCH,
        },
      ],
    },
    {
      id: 'debt',
      title: 'In the Red',
      trigger: () => typeof Economy !== 'undefined' && Economy.balance < 0 && !(typeof DevMode !== 'undefined' && DevMode.enabled),
      steps: [
        {
          text: "Your balance is negative! Every 6 hours in debt, a customer leaves.\n\nCut upkeep, connect more customers, or take a loan from the GOVERNMENT panel.",
          more: "Your balance is negative!\n\nEvery 6 in-game hours in debt, a customer disconnects and leaves without paying.\n\nGet back above $0: cut upkeep, connect more customers, or borrow $5,000 to $100,000 from the GOVERNMENT panel. Interest is 8% of the loan daily at noon until repaid ($800 a day on $10,000), so borrow what you can repay.",
          manual: true,
          highlightDom: ['income-balance-group', 'gov-stat-btn'],
        },
      ],
    },
    {
      id: 'overdrive',
      title: 'Red Line',
      trigger: () => !!_findCritical([T.COALGENERATOR, T.FUELGEN]),
      steps: [
        {
          text: "A generator has gone CRITICAL! At zero it explodes.\n\nClick it and switch to NORMAL or ECO now. A Throttle Governor can do this for you.",
          more: "A generator has gone CRITICAL!\n\nOVERDRIVE gives Coal and Fuel Generators 50% more power for double the fuel, but at 100% heat or pressure a meltdown countdown starts, and at zero it explodes and takes out what\'s around it.\n\nClick it and switch to NORMAL or ECO now; the countdown drains once it\'s under 100%. A Throttle Governor (Research Station MK3) eases Overdrive back automatically.",
          subject: [T.GOVERNOR],
          manual: true,
          highlightWorld: () => _findCritical([T.COALGENERATOR, T.FUELGEN]),
          onEnter: () => _jumpTo(_findCritical([T.COALGENERATOR, T.FUELGEN])),
        },
      ],
    },
    {
      id: 'pollution',
      title: 'Air Quality',
      trigger: () => typeof PollutionSystem !== 'undefined' && PollutionSystem.average() >= 20,
      steps: [
        {
          text: "Your city\'s air is getting dirty. Smog drifts downwind, lowers satisfaction and City Score, and costs carbon tax.\n\nKeep dirty plants downwind and away from housing. The map\'s SHOW AIR POLLUTION toggle shows where it\'s worst.",
          more: "Your city\'s air is getting dirty.\n\nCoal and Fuel Generators, Refineries, Chemical Plants and Nuclear Reactors make smog that drifts downwind. It caps nearby satisfaction, dims solar and lowers your City Score; over the emissions allowance you pay carbon tax and lose approval. A plant with a full waste buffer pollutes up to twice as much, so keep the trucks hauling.\n\nKeep dirty plants downwind and away from housing, leave trees and parks between them, and lean on clean power. After $100,000 in carbon tax, with a Research Station MK2, you can fit scrubbers.\n\nThe map\'s SHOW AIR POLLUTION toggle shows where it\'s worst.",
          manual: true,
        },
      ],
    },
    {
      id: 'scrubber',
      title: 'Cleaner Stacks',
      trigger: () => T.SCRUBBER && (Progression.isReady(T.SCRUBBER) || Progression.isUnlocked(T.SCRUBBER)),
      steps: [
        {
          text: "Scrubbers unlocked! Click a polluting plant and choose FIT SCRUBBER to cut its emissions by 60%.",
          more: "Scrubbers unlocked (Research Station MK2)!\n\nA scrubber is an upgrade, not a building: click a polluting plant like a Coal Generator and choose FIT SCRUBBER. It cuts that plant\'s emissions by 60%, shrinking its smog, its carbon tax and most of its approval hit.\n\nOne-off fee plus $4/s upkeep; removing the plant refunds two thirds of the fee. Fit the biggest burners and plants upwind of housing first. If smog still reaches town, move the plant or add a Carbon Capture Plant later.",
          subject: [T.COALGENERATOR],
          manual: true,
          highlightWorld: () => _dirtiestUnscrubbed(),
          onEnter: () => _jumpTo(_dirtiestUnscrubbed()),
        },
      ],
    },
    {
      id: 'carboncapture',
      title: 'Pulling It Back Out',
      trigger: () => T.CARBONCAPTURE && (Progression.isReady(T.CARBONCAPTURE) || Progression.isUnlocked(T.CARBONCAPTURE)),
      steps: [
        {
          text: "Carbon Capture Plant unlocked! While powered, it captures half the emissions of every polluting plant within 40 tiles.\n\nBuild it beside your dirtiest plants.",
          more: "Carbon Capture Plant unlocked (Research Station MK3)!\n\nIt\'s a building of its own. While powered it captures half the emissions of every polluting plant within 40 tiles, straight off the carbon tax (the approval hit goes too once the city is under its 12-unit allowance), and pulls smog from the air in that ring.\n\nBuild it beside your dirtiest plants: the placement ring shows its reach, and a second plant overlapping it takes half of what\'s left. It draws 120 kW plus upkeep. Pair it with scrubbers: they shrink each plant\'s output, and capture takes half the rest.",
          subject: [T.CARBONCAPTURE],
          manual: true,
          highlight: T.CARBONCAPTURE,
        },
      ],
    },
    {
      id: 'solar',
      title: 'Catching Rays',
      trigger: () => Progression.isReady(T.SOLAR) || Progression.isUnlocked(T.SOLAR),
      steps: [
        {
          text: "Solar Panel MK1 can now be unlocked! It follows the sun: up to 7.5 kW at noon, nothing at night.\n\nLeave two empty rows between rows of panels, or they shade each other.",
          more: "Solar Panel MK1 can now be unlocked at the Research Station!\n\nOutput follows the sun: up to 7.5 kW around noon, nothing at night, and some weather cuts it.\n\nThe sun is in the south (bottom of the map), so a panel shades the row north of it. Side by side is fine; leave two empty rows between rows of panels. Shadows reach farther early, late and in winter.",
          subject: [T.SOLAR],
          highlight: T.SOLAR,
          manual: true,
          check: () => Progression.isUnlocked(T.SOLAR),
        },
      ],
    },
    {
      id: 'wind',
      title: 'Harnessing the Wind',
      trigger: () => Progression.isReady(T.WIND) || Progression.isUnlocked(T.WIND),
      steps: [
        {
          text: "Wind Turbine MK1 can now be unlocked! It makes 5 to 12.5 kW, following the wind.",
          more: "Wind Turbine MK1 can now be unlocked!\n\nOutput follows the wind through the day: 5 to 12.5 kW.\n\nTurbines placed touching share one grid; only one of them needs a cable.",
          subject: [T.WIND],
          highlight: T.WIND,
          manual: true,
          check: () => Progression.isUnlocked(T.WIND),
        },
      ],
    },
    {
      id: 'battery',
      title: 'Storing Power',
      trigger: () => Progression.isReady(T.BATTERY) || Progression.isUnlocked(T.BATTERY),
      steps: [
        {
          text: "Battery Block can now be unlocked! It stores 50 kWh for when generation falls short, like nights without solar.",
          more: "Battery Block can now be unlocked at the Research Station!\n\nEach stores 50 kWh and releases up to 50 kW, ideal for nights without solar. Blocks on the same grid stack.",
          subject: [T.BATTERY],
          highlight: T.BATTERY,
          // Dismissible with CONTINUE rather than only on the unlock landing —
          // the check still closes it automatically if they unlock it first.
          manual: true,
          check: () => Progression.isUnlocked(T.BATTERY),
        },
      ],
    },
    {
      id: 'fishing',
      title: 'Something in the Water',
      trigger: () => Progression.isReady(T.FISHINGPOLE) || Progression.isUnlocked(T.FISHINGPOLE),
      steps: [
        {
          subject: [T.FISHINGPOLE],
          text: 'Check the Research Station. You can now unlock the Fishing Pole!',
          highlight: T.FISHINGPOLE,
          manual: true,
          check: () => Progression.isUnlocked(T.FISHINGPOLE),
        },
        {
          text: "Fish hold oil you can extract as biofuel, far more than trees.\n\nHold down LMB within 3 tiles of water to cast.",
          more: "Why a fishing pole? Fish hold oil you can extract as biofuel, far more than trees and bushes.\n\nFind water and hold down LMB within 3 tiles of it to cast. If you can\'t find any, press M to open the map.",
          subject: [T.FISHINGPOLE],
          manual: true,
          highlight: T.FISHINGPOLE,
        },
        {
          subject: [T.FISHINGPOLE],
          text: "Go ahead and catch your first fish!",
          // The next card talks about the fish you caught, so this waits for
          // one — but it can be closed, for a player who'd rather not fish.
          dismissable: true,
          check: () => FishingSystem.hasCaughtAny(),
        },
        {
          id: 'fishreward',
          text: "You got biofuel and cash from the fish! Rarer fish give more.\n\nEvery tutorial is kept in the Compendium (PANELS, bottom right).",
          more: "You extracted biofuel from the fish, and got some money for it! Rarer fish give more; junk gives nothing.\n\nKeep the grid running on fish and plants until your next generator unlocks.\n\nEvery tutorial is kept in the Compendium (PANELS, bottom right), along with everything you unlock.",
          subject: [T.FISHINGPOLE],
          manual: true,
          highlightDom: ['btn-side-dock', 'btn-compendium'],
        },
      ],
    },
    {
      id: 'commercial',
      title: 'Going Commercial',
      trigger: () => HouseRequestSystem.hasCommercialRequestFired(),
      steps: [
        {
          text: "Your city now attracts Commercial customers! The first one you accept starts a COMMERCIAL ZONE.\n\nThey usually need more power than homes.",
          more: "Your city now attracts Commercial customers!\n\nThe first one you accept starts a COMMERCIAL ZONE, separate from your residential one. Commercial properties usually need more power than homes; click one to see its economics, draw and opening hours.",
          subject: ['commercial:cafe'],
          highlight: T.COMMERCIAL,
          manual: true,
          check: () => HouseRequestSystem.getCommercialsAccepted() >= 1,
        },
      ],
    },
    {
      id: 'industrial',
      title: 'Going Industrial',
      trigger: () => HouseRequestSystem.hasIndustrialRequestFired(),
      steps: [
        {
          text: "Heavy industry has noticed you! The first industrial customer you accept starts an INDUSTRIAL ZONE.\n\nIndustry needs the most power of all.",
          more: "Geothermal power is running, and heavy industry has noticed!\n\nThe first industrial customer you accept starts an INDUSTRIAL ZONE. Industry usually needs more power than commercial.",
          highlight: T.INDUSTRIAL,
          manual: true,
          check: () => HouseRequestSystem.getIndustrialsAccepted() >= 1,
        },
      ],
    },
    {
      // The coal chain unlocks in three beats, each when it is first needed,
      // so the Research Station never hands over five items at once: belts
      // with the Storage Container at 500t mined, the generator at 2,000t, and its
      // water supply once a generator is placed. A thread per beat. The two
      // new ones only fire for a player who is at that beat (not for a save
      // that is already past it).
      id: 'coal_belts',
      title: 'Moving Coal',
      trigger: () => Progression.isReady(T.CONVEYOR)
        || (Progression.isUnlocked(T.CONVEYOR) && !Progression.isReady(T.WATEREXTRACTOR) && !Progression.isUnlocked(T.WATEREXTRACTOR)),
      steps: [
        {
          text: "Your Coal Mine has dug 500t: Conveyor Belts and Storage Containers can now be unlocked.\n\nBelt the coal toward where your Coal Power Generator will stand.",
          more: "Your Coal Mine has dug 500t: the Conveyor Belt and Storage Container can now be unlocked.\n\nBelts carry solids between buildings; a belt into a Storage Container keeps the mine digging. The Underground Belt unlocks with them, to tunnel under anything in the way.\n\nAt 2,000t mined the Water Extractor unlocks, and running one unlocks the Coal Power Generator, so lay the belt toward where it will stand.",
          subject: [T.CONVEYOR, T.SOLIDSTORAGE],
          manual: true,
          highlight: T.CONVEYOR,
        },
      ],
    },
    {
      id: 'coal',
      title: 'Scaling Up',
      trigger: () => Progression.isReady(T.COALGENERATOR) || Progression.isUnlocked(T.COALGENERATOR),
      steps: [
        {
          text: "Coal Power Generator unlocked: your first production chain!\n\nFeed it coal by belt and water by pipe. Fully supplied, it makes 100 kW.",
          more: "Coal Power Generator unlocked: your first real production chain!\n\nIt needs coal by belt from your Coal Mine and water from your Water Extractor (Pipes unlock with it). Fully supplied it makes 100 kW, and a Coal Mine MK1 can feed nearly three.\n\nWatch three things: Ash Waste (at 100% it shuts down until cleared; waste management unlocks later), pollution (too much lowers nearby satisfaction) and your deposits, which run out.",
          subject: [T.COALGENERATOR],
          manual: true,
          highlight: T.COALGENERATOR,
        },
      ],
    },
    {
      id: 'coal_water',
      title: 'Water Supply',
      trigger: () => Progression.isReady(T.WATEREXTRACTOR)
        || (Progression.isUnlocked(T.WATEREXTRACTOR) && !Progression.isReady(T.COALGENERATOR) && !Progression.isUnlocked(T.COALGENERATOR)),
      steps: [
        {
          text: "Water Extractor unlocked! Place it on a lake or river and power it. Press R to turn its pipe output.\n\nOnce it\'s pumping, Pipes and the Coal Power Generator unlock.",
          more: "Your Coal Mine has dug 2,000t: the Water Extractor can now be unlocked, the Coal Power Generator\'s water supply.\n\nIt needs power. Place it on a lake or river, and press R to rotate its pipe output. Once it\'s pumping, the Coal Power Generator and Pipes unlock.\n\nPipes run from a liquid output to a liquid input. Each generator drinks 10 units/s and an extractor gives 25, so one extractor runs two generators.",
          subject: [T.WATEREXTRACTOR],
          manual: true,
          highlight: T.WATEREXTRACTOR,
        },
      ],
    },
    {
      // The first Coal Generator down: what its smoke does, before the city's
      // air is bad enough for the general 'pollution' card.
      id: 'coal_smoke',
      title: 'Smoke Stacks',
      trigger: () => EntityRegistry.getByType(T.COALGENERATOR).size > 0,
      steps: [
        {
          text: "Your Coal Generator pollutes as it burns. Its smog drifts downwind.\n\nKeep it well away from housing.",
          more: "Your Coal Generator pollutes as it burns.\n\nIts smoke becomes smog that drifts downwind and clears slowly, capping satisfaction and dimming solar beneath it. More in OVERDRIVE, less in ECO, and up to double when its Ash Waste backs up.\n\nBuild it downwind and well away from housing, with trees or parks in between. The map\'s SHOW AIR POLLUTION toggle shows where it goes.",
          subject: [T.COALGENERATOR],
          manual: true,
          highlightWorld: () => [...EntityRegistry.getByType(T.COALGENERATOR)][0],
        },
      ],
    },
    {
      id: 'evcharger',
      title: 'Premium Amenities',
      trigger: () => Progression.isUnlocked(T.EVCHARGER),
      steps: [
        {
          text: "EV Charging Station unlocked! Residential zones will ask for one; you can only build it where a zone asked.\n\nIt gives a strong satisfaction boost.",
          more: "EV Charging Station unlocked!\n\nWith an EV Battery Factory running, residential zones will request chargers (like Cell Towers and Fiber Hubs); you can only build one in a zone that asked.\n\nIt gives a strong satisfaction boost and attracts higher-paying residents.",
          subject: [T.EVCHARGER],
          manual: true,
          highlight: T.EVCHARGER,
        },
      ],
    },
    {
      id: 'celltower',
      title: 'Passive Income',
      trigger: () => Progression.isUnlocked(T.CELLTOWER),
      steps: [
        {
          text: "Cell Tower unlocked! Place it in a zone big enough to need one for steady passive income.",
          more: "Cell Tower unlocked!\n\nPlaced in a zone big enough to need one, it earns steady passive income and gives a modest satisfaction boost nearby. The later Fiber Hub is pure income.",
          subject: [T.CELLTOWER],
          manual: true,
          highlight: T.CELLTOWER,
        },
      ],
    },
    {
      id: 'fasttravel',
      title: 'Getting Around Faster',
      trigger: () => Progression.isReady(T.FASTTRAVEL) || Progression.isUnlocked(T.FASTTRAVEL),
      steps: [
        {
          text: "Fast Travel can now be unlocked! Double-click anywhere on the World Map to jump your camera there.",
          more: "Fast Travel can now be unlocked!\n\nDouble-click anywhere on the World Map to jump your camera there.",
          manual: true,
        },
      ],
    },
    // The oil chain, like coal, is a thread per unlock, each card arriving
    // when its building is ready to unlock. It used to be one sequence of
    // Continue cards, so unlocking Oil Scan walked straight through the whole
    // chain before any of it was available. See _shownIn for saves that saw the old
    // sequence.
    {
      id: 'oil',
      title: 'Striking Oil',
      trigger: () => Progression.isReady(T.OILSCAN) || Progression.isUnlocked(T.OILSCAN),
      steps: [
        {
          text: "Oil Scan can now be unlocked! It reveals crude oil deposits.",
          more: "Oil Scan can now be unlocked!\n\nLike the geothermal scan, it reveals crude oil deposits around the map.",
          subject: [T.SURVEY],
          manual: true,
          check: () => Progression.isUnlocked(T.OILSCAN),
        },
      ],
    },
    {
      id: 'oil_pumpjack',
      title: 'Pumping Crude',
      trigger: () => !_shownIn('oil', 1) && (Progression.isReady(T.PUMPJACK)
        || (Progression.isUnlocked(T.PUMPJACK) && !Progression.isReady(T.OILSTORAGE) && !Progression.isUnlocked(T.OILSTORAGE))),
      steps: [
        {
          text: "Pump Jack can now be unlocked! It pumps crude from a deposit until the deposit runs dry.",
          more: "Pump Jack can now be unlocked!\n\nIt pumps crude from a deposit until the deposit runs dry.\n\nThe Liquid Storage Tank unlocks after " + OILSTORAGE_CRUDE.toLocaleString('en-US') + " units of crude.",
          subject: [T.PUMPJACK],
          manual: true,
          highlight: T.PUMPJACK,
        },
      ],
    },
    {
      id: 'oil_storage',
      title: 'Storing Liquids',
      trigger: () => !_shownIn('oil', 2) && (Progression.isReady(T.OILSTORAGE)
        || (Progression.isUnlocked(T.OILSTORAGE) && !Progression.isReady(T.REFINERY) && !Progression.isUnlocked(T.REFINERY))),
      steps: [
        {
          text: "Liquid Storage Tank unlocked! It banks 1,000 units of one liquid. Pipe any liquid output into it.",
          more: "Liquid Storage Tank unlocked!\n\nIt banks surplus liquid: 1,000 units of one kind (oil, water, acid or fuel), locked to whichever fills it first. Pipe any liquid output into its input.\n\nThe Oil Refinery unlocks after " + REFINERY_CRUDE.toLocaleString('en-US') + " units of crude pumped in total.",
          subject: [T.OILSTORAGE],
          manual: true,
          highlight: T.OILSTORAGE,
        },
      ],
    },
    {
      id: 'oil_refinery',
      title: 'Refining Oil',
      trigger: () => !_shownIn('oil', 3) && (Progression.isReady(T.REFINERY)
        || (Progression.isUnlocked(T.REFINERY) && !Progression.isReady(T.FUELGEN) && !Progression.isUnlocked(T.FUELGEN))),
      steps: [
        {
          text: "Oil Refinery unlocked: it turns crude into fuel oil. Pipe your Pump Jack into it.\n\nIts sludge has to be trucked away, or it stops.",
          more: "Oil Refinery unlocked: it turns crude into fuel oil.\n\nPipe your Pump Jack into it, or through a Liquid Storage Tank to stockpile crude.\n\nRefining makes sludge. When its waste buffer fills it stops, until a truck hauls the sludge to an Oil Waste Processing Facility.",
          subject: [T.REFINERY],
          manual: true,
          highlight: T.REFINERY,
        },
      ],
    },
    {
      id: 'oil_fuelgen',
      title: 'Fuel Power',
      trigger: () => !_shownIn('oil', 4) && (Progression.isReady(T.FUELGEN)
        || (Progression.isUnlocked(T.FUELGEN) && EntityRegistry.getByType(T.FUELGEN).size === 0)),
      steps: [
        {
          text: "Fuel Power Generator unlocked! Pipe fuel oil from the refinery into it and wire it to your grid. It makes 165 kW.",
          more: "Fuel Power Generator unlocked!\n\nWire it to your grid and pipe fuel from the refinery into its input. It makes 165 kW.\n\nLike the Coal Generator it needs outside power already on its network to start, and the fuel pipe carries no power, so it still needs a cable.",
          subject: [T.FUELGEN],
          manual: true,
          highlight: T.FUELGEN,
          check: () => EntityRegistry.getByType(T.FUELGEN).size > 0,
        },
      ],
    },
    {
      id: 'truck',
      title: 'Hauling Waste',
      trigger: () => Progression.isReady(T.TRUCK) || Progression.isUnlocked(T.TRUCK),
      steps: [
        {
          text: "Waste Trucks can now be unlocked! A generator stops when its waste fills up; trucks haul it to a Waste Processing Facility.",
          more: "Waste Trucks can now be unlocked!\n\nA Coal Generator stops when its Ash Waste hits 100%, until cleared; a Waste Processing Facility appears nearby once waste builds up.\n\nAssign a truck to haul there with a Path Tool patrol route or by queueing destinations.",
          subject: [T.TRUCK],
          manual: true,
          highlight: T.TRUCK,
          check: () => EntityRegistry.getByType(T.TRUCK).size > 0,
        },
      ],
    },
    {
      // A working truck getting low with no Gas Station able to fill it. The
      // fuel watch in OilSystem says the same thing as a notification once
      // it is already a problem; this explains what to do about it, which on
      // coal (no Gas Station until a Refinery makes fuel oil) is mostly
      // "make the tank last and get to oil".
      id: 'truckfuel',
      title: 'Running on Empty',
      trigger: () => _truckLowNoFuel(),
      steps: [
        {
          subject: [T.GASSTATION],
          text: () => {
            const gas = Progression.isReady(T.GASSTATION) || Progression.isUnlocked(T.GASSTATION);
            const head = "Your trucks are running low on fuel!\n\nTrucks burn fuel whenever they drive, and the only place to fill up is a Gas Station. A truck that runs dry stops where it is until it can be refuelled.";
            if (gas) return head + (Progression.isUnlocked(T.GASSTATION) ? "\n\nBuild a Gas Station." : "\n\nUnlock a Gas Station at your Research Station and build one.") + " It needs power, and fuel oil piped in from a Refinery's fuel output or a tank of fuel oil.\n\nTrucks top up when they pass close to it, and trucks on auto-dispatch detour to it when they run low, so put it near their routes.";
            const save = "\n\nUntil then, make the fuel last:\n• Park trucks you don't need right now. A parked truck burns nothing.\n• Keep routes short: build the waste facility close to the generators it serves.";
            const fuelOil = GASSTATION_FUELOIL.toLocaleString('en-US');
            if (Progression.isUnlocked(T.OILSCAN)) return head + `\n\nThe Gas Station unlocks once an Oil Refinery has produced ${fuelOil} fuel oil, so keep pushing the oil chain: Pump Jack, Liquid Storage Tank, then Refinery.` + save;
            const coal = typeof OILSCAN_COAL_MINED !== 'undefined' ? OILSCAN_COAL_MINED.toLocaleString('en-US') : '20,000';
            return head + `\n\nOn coal you don't have one yet: the Gas Station unlocks once an Oil Refinery has produced ${fuelOil} fuel oil.` + save
              + `\n\nThen push for oil. Mine ${coal}t of coal with a Research Station MK2 standing to unlock the Oil Scan, and work up the oil chain to a Refinery.`;
          },
          manual: true,
        },
      ],
    },
    {
      id: 'govcontracts',
      title: "The Mayor's Commissions",
      trigger: () => typeof GovernmentSystem !== 'undefined' && GovernmentSystem.getContracts().some(c => !c._completed),
      steps: [
        {
          text: "The mayor sent you a commission! Meet its goals for cash and government approval. No deadline.\n\nThe GOVERNMENT panel shows open commissions.",
          more: "The mayor sent you a commission!\n\nCommissions are City Hall jobs: connect customers, put up street lamps, bring new power online. Up to three are open at once, and a new one comes every few minutes.\n\nNo deadline, nothing to hand in: once its goals are met it pays cash, +8 government approval and a little lasting trust.\n\nThe GOVERNMENT panel shows open commissions and the civic buildings the city is working toward, like a Town Hall. Those are built for you as population and reliability grow, and then need power.",
          manual: true,
          highlightDom: ['gov-stat-btn'],
        },
      ],
    },
    {
      id: 'hauler',
      title: 'Hauling Resources',
      trigger: () => Progression.isReady(T.HAULER) || Progression.isUnlocked(T.HAULER),
      steps: [
        {
          text: "Hauler unlocked: a cargo truck for resources.\n\nOpen a storage building, click REQUEST TRUCK SUPPLY and pick a material. Haulers do the rest.",
          more: "Hauler unlocked: a cargo truck.\n\nIt carries ore, coal, fuel rods, crude, fuel oil, water or acid by road, 200 units a trip (750 of a process gas), one kind at a time, never waste.\n\nOpen a Storage Container, Liquid Storage Tank or Gas Holder where you need a material, click REQUEST TRUCK SUPPLY and pick it. Then place a Hauler: it runs itself, moving surplus from producers and unflagged storage and refuelling at Gas Stations.\n\nHaulers are slower and thirstier than Waste Trucks and need roads at both ends, so a belt or pipe is cheaper where it reaches.",
          subject: [T.HAULER],
          manual: true,
          highlight: T.HAULER,
        },
      ],
    },
    {
      id: 'government',
      title: 'City Services',
      trigger: () => {
        for (const t of [T.TOWNHALL, T.CIVICCENTER, T.COURTHOUSE, T.EMS, T.HOSPITAL, T.UNIVERSITY, T.TRANSPORTHUB]) {
          if (EntityRegistry.getByType(t).size > 0) return true;
        }
        return false;
      },
      steps: [
        {
          text: "A new civic building is going up! Once finished it needs power like City Hall.",
          more: "A new civic building is going up!\n\nThe council builds these as population and reliability grow, faster if you power the site. Once finished it needs power like City Hall; leaving it dark hurts government approval.",
          manual: true,
          onEnter: () => {
            for (const t of [T.TOWNHALL, T.CIVICCENTER, T.COURTHOUSE, T.EMS, T.HOSPITAL, T.UNIVERSITY, T.TRANSPORTHUB]) {
              const set = EntityRegistry.getByType(t);
              if (set.size > 0) {
                const e = set.values().next().value;
                const wx = (e.col + (e.width  || 1) * 0.5) * TILE;
                const wy = (e.row + (e.height || 1) * 0.5) * TILE;
                Camera.recentreOn(wx, wy);
                break;
              }
            }
          },
        },
      ],
    },
    {
      id: 'park',
      title: 'Neighborhood Perks',
      trigger: () => !!_findFirstPark(),
      steps: [
        {
          text: "A park has appeared! Parks need no power, earn a little income and help nearby homes recover from outages.",
          more: "A park has appeared in a residential zone!\n\nParks come as a reward when a zone grows big enough, and need no power. They earn you a little passive income and help nearby houses recover satisfaction faster.",
          subject: [T.SMALLPARK],
          manual: true,
          highlightWorld: () => _findFirstPark(),
          onEnter: () => {
            const park = _findFirstPark();
            if (!park) return;
            const wx = (park.col + (park.width  || 1) / 2) * TILE;
            const wy = (park.row + (park.height || 1) / 2) * TILE;
            Camera.recentreOn(wx, wy);
          },
        },
      ],
    },
    {
      id: 'blueprint',
      title: 'Blueprints',
      trigger: () => Progression.isReady(T.BLUEPRINT) || Progression.isUnlocked(T.BLUEPRINT),
      steps: [
        {
          text: "Blueprints can now be unlocked! Drag-select a group of placed buildings to save it, then stamp copies anywhere.\n\nEach stamp costs full price.",
          more: "Blueprints can now be unlocked!\n\nDrag-select a group of placed buildings to save a blueprint, then stamp copies elsewhere (press R to rotate). It also unlocks Copy (Ctrl+C, or the Copy tile in the Function tab): drag over what you built, then click to paste; Ctrl+V pastes again.\n\nEach stamp costs full price. Trees, water, deposits, customers, trucks and roads aren\'t captured.",
          subject: [T.BLUEPRINT],
          manual: true,
          highlight: T.BLUEPRINT,
        },
      ],
    },
    {
      id: 'nuclear',
      title: 'Going Nuclear',
      trigger: () => Progression.isReady(T.URANIUMSCAN) || Progression.isUnlocked(T.URANIUMSCAN),
      steps: [
        {
          text: "Uranium Scan and Sulfur Scan can now be unlocked! Mine both: enough sulfur unlocks the Chemical Plant.",
          more: "Uranium Scan and Sulfur Scan can now be unlocked!\n\nThey reveal uranium and sulfur deposits. Mine both; mining enough sulfur unlocks the Chemical Plant.",
          subject: [T.URANIUMMINE, T.SULFURMINE],
          manual: true,
        },
      ],
    },
    // The rest of the nuclear chain, a thread per unlock like oil: these
    // were Continue cards straight after the scans, hours before either
    // building could be unlocked.
    {
      id: 'nuclear_chem',
      title: 'Sulfuric Acid',
      trigger: () => !_shownIn('nuclear', 1) && (Progression.isReady(T.CHEMICALPLANT)
        || (Progression.isUnlocked(T.CHEMICALPLANT) && !Progression.isReady(T.NUCLEARREACTOR) && !Progression.isUnlocked(T.NUCLEARREACTOR))),
      steps: [
        {
          text: "Chemical Plant unlocked! It makes sulfuric acid, which the Fuel Processing Plant turns into fuel rods.\n\n800 fuel rods unlock the Nuclear Reactor.",
          more: "Chemical Plant unlocked!\n\nIt turns mined sulfur and piped water into sulfuric acid. The Fuel Processing Plant then turns acid and uranium ore into fuel rods.\n\n800 fuel rods unlock the Nuclear Reactor.",
          subject: [T.CHEMICALPLANT, T.FUELPLANT],
          manual: true,
          highlight: T.CHEMICALPLANT,
        },
      ],
    },
    {
      id: 'nuclear_reactor',
      title: 'Splitting Atoms',
      trigger: () => !_shownIn('nuclear', 2) && (Progression.isReady(T.NUCLEARREACTOR)
        || (Progression.isUnlocked(T.NUCLEARREACTOR) && EntityRegistry.getByType(T.NUCLEARREACTOR).size === 0)),
      steps: [
        {
          text: "Nuclear Reactor unlocked! It turns fuel rods into steam for Steam Turbines. Each reactor needs two Cooling Towers.\n\n⚠ An uncooled reactor melts down and EXPLODES. Build it far from your city.",
          more: "Nuclear Reactor unlocked!\n\nIt burns fuel rods into steam and waste, not grid power. It needs 20 u/s of cooled water at COOL IN or its steam drops to 40%; a Cooling Tower fed water at H₂O IN makes 15 u/s, so pipe two per reactor. Steam Turbines turn the steam into 300 kW each; one reactor runs up to 3.\n\n⚠ WARNING: an uncooled reactor heats up, and pulling its rods won\'t stop it at once. At critical it melts down and EXPLODES, levelling everything around it. Keep its towers powered and watered, and build it far from your city.",
          subject: [T.NUCLEARREACTOR, T.COOLINGTOWER, T.STEAMTURBINE],
          manual: true,
          highlight: T.NUCLEARREACTOR,
          check: () => EntityRegistry.getByType(T.NUCLEARREACTOR).size > 0,
        },
      ],
    },
    {
      id: 'hydro',
      title: 'Damming the River',
      trigger: () => Progression.isReady(T.DAM) || Progression.isUnlocked(T.DAM),
      steps: [
        {
          text: "The Dam can now be unlocked! Build it across a river to form a reservoir, then put a Hydro Turbine in it.",
          more: "The Dam can now be unlocked!\n\nBuild it across a river to form a reservoir, then place a Hydro Turbine partly submerged in it. The turbine makes rotation, not electricity.\n\nRun it a while to unlock the Drive Shaft and Hydroelectric Generator.",
          subject: [T.DAM],
          manual: true,
          highlight: T.DAM,
        },
      ],
    },
    {
      // Its own thread: as a Continue card after the Dam it described the
      // generator 18 in-game hours of turbine running before it unlocked.
      id: 'hydro_generator',
      title: 'Making It Electric',
      trigger: () => !_shownIn('hydro', 1) && (Progression.isReady(T.HYDROGENERATOR)
        || (Progression.isUnlocked(T.HYDROGENERATOR) && EntityRegistry.getByType(T.HYDROGENERATOR).size === 0)),
      steps: [
        {
          text: "Hydroelectric Generator unlocked! Connect it to your Hydro Turbine with Drive Shafts in a straight line, then wire it in.",
          more: "Drive Shaft and Hydroelectric Generator unlocked!\n\nShafts carry the turbine\'s rotation to the generator in one unbroken line. Output follows turbine speed, up to 235 kW. Wire the generator in like any other.",
          subject: [T.HYDROGENERATOR],
          manual: true,
          highlight: T.HYDROGENERATOR,
          check: () => EntityRegistry.getByType(T.HYDROGENERATOR).size > 0,
        },
      ],
    },
    {
      id: 'reactorcritical',
      title: 'Core Temperature',
      trigger: () => !!_findCritical([T.NUCLEARREACTOR]),
      steps: [
        {
          text: "A Nuclear Reactor is close to meltdown!\n\nCheck its Cooling Towers are powered and fed, and that a Steam Turbine is drawing its steam.",
          more: "A Nuclear Reactor is close to meltdown!\n\nIt\'s only safe while cooled and while its steam has somewhere to go:\n\n• Heat: its cooling water stopped (a burst pipe, an unpowered tower, a dry extractor). Check the tower is powered and fed, and its pipe reaches COOL IN.\n\n• Pressure: no Steam Turbine is drawing its steam. Pipe a working turbine to STEAM OUT, or cut its fuel rods to vent.\n\nIf it goes, it levels the neighbourhood around it.",
          subject: [T.NUCLEARREACTOR],
          manual: true,
          highlightWorld: () => _findCritical([T.NUCLEARREACTOR]),
          onEnter: () => _jumpTo(_findCritical([T.NUCLEARREACTOR])),
        },
      ],
    },
    {
      id: 'mk4',
      title: 'Big Science',
      trigger: () => Progression.isReady(T.MK4RESEARCH) || Progression.isUnlocked(T.MK4RESEARCH),
      steps: [
        {
          text: "Six turbines at once: the MK4 Research Station is yours! It opens the next era of research.",
          more: "Six turbines at once: the MK4 Research Station is yours!\n\nIt researches faster and opens the next era: spent fuel reprocessing, plutonium and the Advanced Nuclear Reactor.\n\nPlacing it brings the National Government, who will set up a zone far out in the world, so be ready to run a long line.",
          subject: [T.MK4RESEARCH],
          manual: true,
          highlight: T.MK4RESEARCH,
        },
      ],
    },
    {
      id: 'spentfuel',
      title: 'Closing the Loop',
      trigger: () => Progression.isReady(T.SPENTFUELPOOL) || Progression.isUnlocked(T.SPENTFUELPOOL) || Progression.isReady(T.REPROCESSOR) || Progression.isUnlocked(T.REPROCESSOR),
      steps: [
        {
          text: "Spent fuel doesn\'t have to be waste. Cool it in a Spent Fuel Pool, then reprocess it into uranium and plutonium.",
          more: "Spent fuel doesn\'t have to be waste.\n\nBelt it from a reactor\'s SPENT FUEL OUT into a Spent Fuel Pool to cool, then to a Reprocessing Plant with a water pipe. It becomes recovered uranium, plutonium and a little high-level waste, which is trucked to the Nuclear Waste Processing Facility.\n\nAny full output stops the plant, so give the uranium somewhere to go even if you only want plutonium.",
          subject: [T.SPENTFUELPOOL, T.REPROCESSOR],
          manual: true,
          highlight: T.SPENTFUELPOOL,
        },
      ],
    },
    {
      id: 'mox',
      title: 'Mixed Oxide',
      trigger: () => Progression.isReady(T.MOXPLANT) || Progression.isUnlocked(T.MOXPLANT),
      steps: [
        {
          text: "Advanced Fuel Processing unlocked! It blends plutonium and uranium into MOX fuel rods for the Advanced Nuclear Reactor.",
          more: "Advanced Fuel Processing unlocked!\n\nIt blends plutonium and uranium into MOX fuel rods: belt plutonium into one intake and uranium (recovered or fresh ore) into the other. MOX fuels the Advanced Nuclear Reactor.",
          subject: [T.MOXPLANT],
          manual: true,
          highlight: T.MOXPLANT,
        },
      ],
    },
    {
      id: 'cryotower',
      title: 'Colder Still',
      trigger: () => Progression.isReady(T.COOLINGTOWER2) || Progression.isUnlocked(T.COOLINGTOWER2),
      steps: [
        {
          text: "Cryogenic Cooling Tower unlocked! It makes the coolant a MOX reactor needs, from 70 u/s of cooled water.",
          more: "Cryogenic Cooling Tower unlocked!\n\nThe MOX reactor needs Cryogenic Coolant, and this makes it. Pipe 70 u/s of cooled water into its COOL IN (five MK1 Cooling Towers on one line); short of that it makes nothing. It also draws 110 kW.\n\nOnce it runs, the Advanced Nuclear Reactor unlocks.",
          subject: [T.COOLINGTOWER2],
          manual: true,
          highlight: T.COOLINGTOWER2,
        },
      ],
    },
    {
      id: 'advreactor',
      title: 'Handle With Care',
      trigger: () => Progression.isReady(T.ADVREACTOR) || Progression.isUnlocked(T.ADVREACTOR),
      steps: [
        {
          text: "Advanced Nuclear Reactor unlocked! It burns MOX and drives twelve Steam Turbines.\n\nPipe Cryogenic Coolant into its CRYO IN before loading rods.",
          more: "Advanced Nuclear Reactor unlocked!\n\nIt burns MOX and raises steam for twelve Steam Turbines, four times a standard reactor on the same burn.\n\nIt needs Cryogenic Coolant: pipe a Cryogenic Cooling Tower\'s CRYO OUT to its CRYO IN before loading rods. One tower per reactor is enough.",
          subject: [T.ADVREACTOR],
          manual: true,
          highlight: T.ADVREACTOR,
        },
        {
          text: "☢ READ THIS BEFORE YOU BUILD ONE ☢\n\nLose cooling and a MOX core goes critical in seconds. Its meltdown is EXTREMELY CATASTROPHIC.\n\nKeep its Cryogenic Cooling Tower supplied and powered.",
          more: "☢ READ THIS BEFORE YOU BUILD ONE ☢\n\nA MOX core is far less forgiving: lose cooling and it goes critical in seconds, not minutes. Its meltdown is EXTREMELY CATASTROPHIC, worse than any standard reactor, and there is no cleaning up after it.\n\nKeep its Cryogenic Cooling Tower supplied and powered, and keep lightning away from all of it.",
          subject: [T.ADVREACTOR],
          manual: true,
          danger: true,
          highlight: T.ADVREACTOR,
        },
      ],
    },
    {
      id: 'droneport',
      title: 'Drone Fleet',
      trigger: () => Progression.isReady(T.DRONEPORT) || Progression.isUnlocked(T.DRONEPORT),
      steps: [
        {
          text: "Drone Port unlocked! Its ten drones fly straight, fast and fuel-free, inside its coverage square.",
          more: "Drone Port unlocked!\n\nA 9×9 vertiport with ten drones that fly straight, with no roads or fuel, at over twice a truck\'s speed, inside its coverage square (220 tiles across). Ports whose areas touch form one network, and drones top up at ports they pass, so a chain covers a district; long haul is still for trucks.\n\nPorts can also be placed from the World Map, handy for long chains. Each costs $300,000 and $60/s.",
          subject: [T.DRONEPORT],
          manual: true,
          highlight: T.DRONEPORT,
        },
        {
          text: "Drones choose their own work: REPAIR damage, SERVICE busy lines, SHAVE WASTE off full plants and FLY CARGO you request.",
          more: "Drones choose their own work, in this order:\n\nREPAIR damage from lightning, fire or blasts. You pay the usual cost, and a repair runs 60% faster with a drone on it, including ones you started.\n\nSERVICE lines at 80-100% of their rating, cutting their fault chance (an overloaded line still fails).\n\nSHAVE WASTE off a coal generator, refinery or reactor from 85% full until it\'s under 70%. That buys time; it doesn\'t replace trucks.\n\nFLY CARGO: open a container, tank or gas holder and click REQUEST DRONE SUPPLY. Drones fetch from producers and unflagged storage in the network, so a bin beside a plant feeds it with no belt or pipe.",
          subject: [T.DRONEPORT],
          manual: true,
          highlight: T.DRONEPORT,
        },
        {
          text: "Drones need a powered port to launch, and storms slow them down.\n\nDRONES in the side panels shows what each port is doing.",
          more: "What limits the fleet:\n\nPOWER: a port idles at 40 kW, plus up to 30 kW per drone recharging (340 kW for a full fleet landing empty). An unpowered port can\'t launch.\n\nBATTERY: 66 seconds of flight, enough for its coverage in normal weather.\n\nWEATHER: storms, rainstorms and blizzards halve their speed or worse. Light rain is fine. A cold snap cuts range by 30%, a heat wave halves recharging.\n\nDRONES in the side panels shows what each port is doing, and why one isn\'t flying.",
          subject: [T.DRONEPORT],
          manual: true,
          highlightDom: ['btn-drones'],
        },
      ],
    },
    {
      id: 'fusion',
      title: 'The Final Tier',
      trigger: () => EntityRegistry.getByType(T.MK5RESEARCH).size > 0,
      steps: [
        {
          text: "You\'ve reached the final tier: the MK5 Research Station! It opens the long chain to fusion fuel.\n\nIt starts at the Fusion Research Facility. Keep it powered.",
          more: "You\'ve reached the final tier: the MK5 Research Station!\n\nIt opens a long chain ending in frozen fusion fuel pellets: Electrolyzer, Lithium Mine, Atmosphere Collector, Haber-Bosch Complex, Isotopic Wash Tower and Fusion Fuel Plant.\n\nIt starts at the Fusion Research Facility, just arrived in the National Government Zone. Keep it powered through its plasma shots: achieving fusion unlocks the Electrolyzer.",
          subject: [T.MK5RESEARCH],
          manual: true,
        },
        {
          text: "Make D-T Fuel Pellets to unlock the Helium Scan. The Fusion Reactor\'s magnets need liquid helium.",
          more: "Make D-T Fuel Pellets (bank them in Storage Containers) to unlock the Helium Scan.\n\nThe Fusion Reactor\'s magnets need liquid helium: scan for a helium field, put a Helium Well on it and bank enough helium in Gas Holders to unlock the Cryo Plant. Once it makes liquid helium, the Fusion Reactor unlocks.",
          subject: [T.FUSIONFUELPLANT],
          manual: true,
          check: () => Progression.isUnlocked(T.HELIUMSCAN),
        },
      ],
    },
    {
      // Its own thread: as a Continue card in the MK5 sequence it arrived
      // long before the reactor could be unlocked.
      id: 'fusion_reactor',
      title: 'Fusion Reactor',
      trigger: () => !_shownIn('fusion', 2) && (Progression.isReady(T.HULKINGFUSIONREACTOR)
        || (Progression.isUnlocked(T.HULKINGFUSIONREACTOR) && EntityRegistry.getByType(T.HULKINGFUSIONREACTOR).size === 0)),
      steps: [
        {
          text: "Fusion Reactor unlocked! It burns D-T pellets, and its magnets need liquid helium from a Cryo Plant.\n\nIts steam drives twenty Steam Turbines.",
          more: "Fusion Reactor unlocked!\n\nIt burns D-T pellets and breeds its own tritium: belt Lithium Compound into Li COMPOUND IN and pipe TRITIUM OUT back to the Fuel Plant. Until it runs, a Tritium Breeding Facility piped to the Fuel Plant\'s TRITIUM IN starts the loop.\n\nPipe your Cryo Plant\'s LHe OUT into its LHe IN. Once the magnets are cold, a 5 MW surge ignites it. It makes steam: twenty Steam Turbines give about 6 MW.\n\nOnce helium-3 flows, the Fuel Plant also makes D-He3 pellets for the Advanced Fusion Reactor.",
          subject: [T.HULKINGFUSIONREACTOR],
          manual: true,
          highlight: T.HULKINGFUSIONREACTOR,
          check: () => EntityRegistry.getByType(T.HULKINGFUSIONREACTOR).size > 0,
        },
      ],
    },
    // ── Fusion Research Facility (FusionResearch) ──
    // One card per stage of the programme, each the first time it happens.
    {
      id: 'fusionlab',
      title: 'Fusion Research',
      trigger: () => { const v = _fusionV(); return !!(v && v.researching); },
      steps: [
        {
          text: "This is the Fusion Research Facility. Every half hour from 09:00 to 18:00 it fires a 1 MW plasma shot.\n\n45 fully powered shots achieve fusion.",
          more: "This is the Fusion Research Facility, researching fusion one plasma shot at a time.\n\nEvery half hour from 09:00 to 18:00 it fires a shot that pulls 1 MW (it idles at 280–430 kW). A shot that stays powered is a GOOD SHOT; one that browns out is ABORTED.\n\n45 good shots achieve fusion and unlock the Electrolyzer: about two and a half days if your grid carries every spike. The ring round the tokamak and the control board track the count (click the facility for the exact number).\n\nSize your supply for the 1 MW spikes: batteries and substations cover them without a whole new plant.",
          subject: [T.FUSIONLAB],
          manual: true,
          highlightWorld: () => _fusionLab(),
          onEnter: () => _jumpTo(_fusionLab()),
        },
      ],
    },
    {
      id: 'fusionabort',
      title: 'Shot Aborted',
      trigger: () => { const v = _fusionV(); return !!(v && v.researching && v.lastFailed && v.everPowered); },
      steps: [
        {
          text: "A plasma shot browned out and was aborted. It needs its full 1 MW for the whole shot.",
          more: "A plasma shot browned out and was aborted.\n\nThe facility needs its full 1 MW for the whole shot, or it counts for nothing: half an hour of research lost. Add generation, or batteries and substations to cover the spikes.",
          subject: [T.FUSIONLAB],
          manual: true,
          highlightWorld: () => _fusionLab(),
          onEnter: () => _jumpTo(_fusionLab()),
        },
      ],
    },
    {
      id: 'fusionmilestone',
      title: 'Research Milestone',
      trigger: () => { const v = _fusionV(); return !!(v && v.researching && v.stage > 0); },
      steps: [
        {
          text: "The fusion programme hit its first milestone! Keep the shots coming.",
          more: "The fusion programme hit its first milestone!\n\nMilestones at 25%, 50% and 75% each light a beacon on the progress ring. Keep the shots coming.",
          subject: [T.FUSIONLAB],
          manual: true,
          highlightWorld: () => _fusionLab(),
        },
      ],
    },
    {
      id: 'fusionimminent',
      title: 'Ignition Imminent',
      trigger: () => { const v = _fusionV(); return !!(v && v.imminent); },
      steps: [
        {
          text: "The Fusion Research Facility is a couple of shots from ignition! Keep it powered until it ignites.",
          more: "The Fusion Research Facility is a couple of good shots from ignition!\n\nIf it loses power now, the experiment is ruined and you lose 2 good shots of data. Keep it powered until it ignites.",
          subject: [T.FUSIONLAB],
          manual: true,
          highlightWorld: () => _fusionLab(),
          onEnter: () => _jumpTo(_fusionLab()),
        },
      ],
    },
    {
      id: 'fusionachieved',
      title: 'Fusion Achieved',
      trigger: () => typeof FusionResearch !== 'undefined' && FusionResearch.isComplete() && !FusionResearch.isActive() && !!_fusionLab(),
      steps: [
        {
          text: "Fusion achieved! The Electrolyzer is ready to research at your MK5 Research Station.",
          more: "Fusion achieved! The Electrolyzer is ready to research at your MK5 Research Station.\n\nThe facility keeps firing: every good shot now cuts the remaining fusion-chain goals (hydrogen, lithium, nitrogen and the rest) by 1%, up to 20%. The gold ring shows how far it has got, so keep it powered.",
          subject: [T.ELECTROLYZER],
          manual: true,
          highlightWorld: () => _fusionLab(),
        },
      ],
    },
    // Straight after the Fusion Achieved card: the endgame, and the Field
    // Cores that make the reactors already built run harder.
    {
      id: 'finalstretch',
      title: 'The Final Stretch',
      trigger: () => typeof FusionResearch !== 'undefined' && FusionResearch.isComplete() && !FusionResearch.isActive()
        && _isSeqDone(SEQUENCES.find(s => s.id === 'fusionachieved')),
      steps: [
        {
          text: "You\'re in the final stretch: Operation Hyperion, powering the whole nation.\n\nField Cores make your fusion reactors run harder. Start mining rare earths early.",
          more: "You\'re in the final stretch.\n\nOperation Hyperion stands between your city and powering the nation: 10 MW commissioning surges, then 20 MW around the clock, then 30 MW for a full day with no coal or oil running.\n\nMore reactors will get you there, but Field Cores make the ones you have run harder: up to three in a Fusion or Advanced Fusion Reactor add +50%, +30% and +20% output for a little more fuel.\n\nBurn 100 D-He3 pellets in an Advanced Fusion Reactor to unlock the Rare Earth Scan; the Leach Plant follows at Hyperion Stage II, the Superconductor Mill at Stage III and the Core Works at Stage IV. Start mining rare earths early.",
          manual: true,
        },
      ],
    },
    // The first Core Works placed: how it makes and charges Field Cores, then
    // how they get into the reactors.
    {
      id: 'coreworks',
      title: 'Core Works',
      trigger: () => T.COREWORKS && EntityRegistry.getByType(T.COREWORKS).size > 0,
      steps: [
        {
          text: "This is the Core Works: it turns superconductor tape into Field Cores and charges them. Belt tape into TAPE IN.",
          more: "This is the Core Works: it winds HTS tape into Field Cores and charges them.\n\nBelt tape from your Superconductor Mills (or a Storage Container) into TAPE IN on its bottom face.\n\nIt has four bays and charges one core at a time: 4 in-game hours at 800 kW (100 kW idle). Spent cores are recharged first (28 tape, 56 if quenched); otherwise it winds a new core for 120 tape.\n\nClick it for OFF-PEAK CHARGING (22:00 to 06:00 only) or to turn off WIND NEW CORES.",
          subject: [T.COREWORKS],
          manual: true,
          highlightWorld: () => { for (const e of EntityRegistry.getByType(T.COREWORKS)) return e; return null; },
          onEnter: () => { for (const e of EntityRegistry.getByType(T.COREWORKS)) { _jumpTo(e); break; } },
        },
        {
          text: "Drones and Haulers carry cores to your fusion reactors. Up to 3 per reactor add +50%, +30% and +20% output.",
          more: "Cores never ride belts: Drones and Haulers carry them to your Fusion and Advanced Fusion Reactors and bring spent ones back.\n\nClick a reactor to set up to 3 cores: +50%, +30% and +20% output, for 0.7x that boost in extra fuel. A starved reactor loses the boost first, never its base output.\n\nA core lasts 24 in-game hours of running. Each boils off 1.5 liquid helium a second, so leave cryo headroom. A quench takes every core in the reactor down.\n\nRule of thumb: 3 Core Works keep 12 cores charged, enough for 4 reactors running 3 each.",
          subject: [T.COREWORKS],
          manual: true,
          highlightWorld: () => { for (const e of EntityRegistry.getByType(T.COREWORKS)) return e; return null; },
        },
      ],
    },
    {
      id: 'storage',
      title: 'Stockpiles',
      trigger: () => Progression.isReady(T.GASSTORAGE) || Progression.isUnlocked(T.GASSTORAGE),
      steps: [
        {
          text: "Gas Holder unlocked! It banks 5,000 units of one gas, so a full buffer doesn\'t stop production.",
          more: "Gas Holder unlocked!\n\nThe fusion chain\'s unlock goals are bigger than any producer\'s buffer, and a full buffer stops production, so bank the surplus.\n\nA Gas Holder stores 5,000 units of one gas: producer into GAS IN, GAS OUT to what uses it. Plants fed straight off the producer come first; only the spare is banked. Storage Containers do the same for solids. Neither needs power.",
          subject: [T.GASSTORAGE],
          manual: true,
          highlight: T.GASSTORAGE,
        },
      ],
    },
    {
      id: 'cryo',
      title: 'Cold Magnets',
      trigger: () => Progression.isReady(T.CRYOPLANT) || Progression.isUnlocked(T.CRYOPLANT),
      steps: [
        {
          text: "Cryo Plant unlocked! It liquefies helium for the Fusion Reactor\'s magnets. Pipe helium gas into HE IN.\n\nKeep it powered, or the magnets warm and quench.",
          more: "Cryo Plant unlocked!\n\nThe Fusion Reactor\'s superconducting magnets only work near 4 K, and this plant liquefies helium to keep them there. Pipe helium gas from your wells into HE IN; once it makes liquid helium (LHe), the Fusion Reactor unlocks.\n\nThen pipe LHe OUT to the reactor\'s LHe IN. The reactor\'s HE ASH OUT can be recycled back in.\n\nKeep it powered: an outage can trip its compressors, the magnets warm the whole time, and at 9 K they quench.",
          subject: [T.CRYOPLANT],
          manual: true,
          highlight: T.CRYOPLANT,
        },
      ],
    },
    {
      id: 'mhdring',
      title: 'Direct Conversion',
      trigger: () => Progression.isReady(T.MHDRING) || Progression.isUnlocked(T.MHDRING),
      steps: [
        {
          text: "The Advanced Fusion Reactor and MHD Decelerator Ring are unlocked! The ring turns its fuel straight into electricity: 4 MW each, four per reactor.",
          more: "The Advanced Fusion Reactor and MHD Decelerator Ring are unlocked: the top of the fusion chain!\n\nD-He3 fuel releases charged particles, which the ring turns straight into electricity: no steam, no turbines, 4 MW per ring, and one reactor feeds four.\n\nBelt D-He3 pellets (from your Fuel Plants\' D-He3 OUT, or banked) into the reactor\'s PELLETS IN and pipe its ION OUT ports into the rings. It needs serious cooling: two or three Cryo Plants on its magnets and two Cryogenic Cooling Towers on CRYO IN.",
          subject: [T.ADVFUSIONREACTOR, T.MHDRING],
          manual: true,
          highlight: T.MHDRING,
        },
        {
          subject: [T.MHDRING],
          text: () => (typeof NationalProject !== 'undefined' && NationalProject.reached('briefed'))
            ? "Unlocking the ring also means Hyperion Station can rise.\n\nOpen the ◈ HYPERION dossier in the top bar to see Stage II · Foundations."
            : "Keep an eye on the National Government Zone. The Ministry has plans that need a grid this size.",
          manual: true,
        },
      ],
    },
    // ── Operation Hyperion (NationalProject) — the endgame ──
    {
      id: 'nationalzone',
      title: 'The National Government',
      trigger: () => EntityRegistry.getByType(T.NATIONALGOV).size > 0,
      steps: [
        {
          text: "The National Government has arrived far out in the world! Run a line out there: it needs power.",
          more: "The National Government has arrived!\n\nIts Government Center founded a zone far out in the world. It needs power like any civic building, and leaving it dark hurts your approval. Run a line out there; Power Towers make it easier.",
          subject: [T.NATIONALGOV],
          manual: true,
          highlightWorld: () => { for (const e of EntityRegistry.getByType(T.NATIONALGOV)) return e; return null; },
          onEnter: () => { for (const e of EntityRegistry.getByType(T.NATIONALGOV)) { _jumpTo(e); break; } },
        },
      ],
    },
    {
      id: 'meridian_classified',
      title: 'Classified',
      trigger: () => _np() && NationalProject.reached('classified'),
      steps: [
        {
          text: "Something is happening in the National Government Zone. The ◈ CLASSIFIED button in the top bar is your file. Keep climbing.",
          more: "Something is happening in the National Government Zone.\n\nThe Ministry of Energy has fenced off a site there and opened a sealed file on your company. Nobody will say what it\'s for, or what it\'s called.\n\nThe ◈ CLASSIFIED button in the top bar is that file, nearly all blacked out for now. Keep climbing: the Ministry will be in touch once your fusion programme proves itself.",
          manual: true,
          onEnter: () => NationalProject.jumpToSite(),
        },
      ],
    },
    {
      id: 'meridian_briefed',
      title: 'Operation Hyperion',
      trigger: () => _np() && NationalProject.reached('briefed'),
      steps: [
        {
          text: "Operation Hyperion: build Hyperion Station and power the whole country from your city.\n\nThe ◈ HYPERION button in the top bar shows every requirement.",
          more: "Operation Hyperion is the end of the road: build Hyperion Station, tie the nation\'s grid to yours and power the whole country from your city.\n\nIt runs in five stages, each harder than the last. The ◈ HYPERION button in the top bar opens the dossier with every requirement and your progress.\n\nGround breaks the day your first Fusion Reactor ignites.",
          subject: [T.NATIONALGRID],
          manual: true,
        },
      ],
    },
    {
      id: 'meridian_s0',
      title: 'Stage I · Ignition',
      trigger: () => _np() && NationalProject.phase() === 'ignition' && !!NationalProject.station(),
      steps: [
        {
          text: "Hyperion Station has broken ground! Burn 500 pellets in Fusion Reactors while its site has power.",
          more: "Your Fusion Reactor is burning, and Hyperion Station has broken ground!\n\nThe Ministry wants proof the burn holds: burn 500 pellets in Fusion Reactors while the station\'s site has power. The station goes up as you do.\n\nRun power out to the site: only 500 kW for now, but that won\'t last.",
          subject: [T.NATIONALGRID],
          manual: true,
          highlightWorld: () => NationalProject.station(),
          onEnter: () => _jumpTo(NationalProject.station()),
        },
      ],
    },
    {
      id: 'meridian_s1',
      title: 'Stage II · Foundations',
      trigger: () => _np() && NationalProject.phase() === 'stage1' && !!NationalProject.station(),
      steps: [
        {
          text: "Construction on Hyperion Station can resume! Commit $2.5M in the dossier and burn 1,000 D-He3 pellets.",
          more: "Construction on Hyperion Station can resume!\n\nTo raise it:\n• Commit $2.5M of funding (the button in the dossier)\n• Burn 1,000 D-He3 pellets in an Advanced Fusion Reactor\n\nThe station rises as you go.",
          subject: [T.NATIONALGRID],
          manual: true,
          highlightWorld: () => NationalProject.station(),
          onEnter: () => _jumpTo(NationalProject.station()),
        },
      ],
    },
    {
      id: 'meridian_s2',
      title: 'Stage III · First Light',
      trigger: () => _np() && NationalProject.phase() === 'stage2',
      steps: [
        {
          text: "The station stands. Every hour it fires a 10 MW surge; 24 fully powered surges bring it online.",
          more: "The station stands. Now its converters have to be commissioned.\n\nEvery hour, day and night, it fires a 10 MW surge. A surge that stays powered counts; one that browns out is aborted. 24 good surges bring it online.\n\nThe line out to the station has to carry it: batteries and substations near the station help.",
          subject: [T.NATIONALGRID],
          manual: true,
          highlightWorld: () => NationalProject.station(),
          onEnter: () => _jumpTo(NationalProject.station()),
        },
      ],
    },
    {
      id: 'meridian_s3',
      title: 'Stage IV · The Line',
      trigger: () => _np() && NationalProject.phase() === 'stage3',
      steps: [
        {
          text: "The nation\'s grid is ready to tie in. Press INITIATE STAGE IV in the dossier, then hold 20 MW for two full days.\n\nBuild first: the Ready check shows your spare.",
          more: "The nation\'s grid is ready to tie in to yours, on your signal.\n\nOnce you press INITIATE STAGE IV in the dossier, the station draws 20 MW around the clock. While the line is up it pays 5× your city\'s net income after every deduction (7.5× on the final 30 MW day), so stay in profit: a city at a loss earns nothing from it.\n\nHold it for two full days. Every power loss trips the national grid and costs an hour of progress.\n\nNothing starts until you press INITIATE, so build first: the dossier\'s Ready check shows your spare at the tightest hour, and you want 20 MW and a little over. Use Power Towers, not cables.",
          subject: [T.NATIONALGRID],
          manual: true,
          highlightWorld: () => NationalProject.station(),
        },
      ],
    },
    {
      id: 'meridian_s4',
      title: 'Stage V · Hyperion',
      trigger: () => _np() && NationalProject.phase() === 'stage4',
      steps: [
        {
          text: "The final day: 24 hours at 30 MW, with no coal or oil running. Press INITIATE STAGE V when the Ready check is green.\n\nFinish the day and the country is yours.",
          more: "The final day. For 24 hours, all at once:\n• Keep Hyperion Station powered at 30 MW\n• No Coal or Fuel Generators anywhere on the map\n• City Score of 70 or better\n• $5M of Wind Turbines, Solar Panels and Hydro (Dams, Hydro Turbines, Hydroelectric Generators) standing, by build cost\n\nProgress only moves while all four hold. Press INITIATE STAGE V in the dossier once its Ready check is all green.\n\nFinish the day and the country is yours.",
          subject: [T.NATIONALGRID],
          manual: true,
          highlightWorld: () => NationalProject.station(),
          onEnter: () => _jumpTo(NationalProject.station()),
        },
      ],
    },
  ];

  function _np() { return typeof NationalProject !== 'undefined'; }
  // A working truck under 40% fuel while no Gas Station can fill it (none
  // powered with fuel in it). Parked trucks burn nothing, so they don't count.
  function _truckLowNoFuel() {
    let low = false;
    for (const trk of EntityRegistry.getByType(T.TRUCK)) {
      if (!(trk._patrolling || trk._autoDispatch || trk._autoHaulEnabled)) continue;
      const cap = truckSpec(trk).fuelCapacity || 100;
      if ((trk._fuel === undefined ? cap : trk._fuel) / cap < 0.4) { low = true; break; }
    }
    if (!low) return false;
    for (const stn of EntityRegistry.getByType(T.GASSTATION)) {
      if (stn._fuelDepot || (stn.powered && (stn._fuelStored || 0) > 1)) return false;
    }
    return true;
  }
  // First generator of these types whose meltdown clock is running.
  function _findCritical(types) {
    for (const t of types) for (const e of EntityRegistry.getByType(t)) if (e._meltdown > 0) return e;
    return null;
  }
  function _fusionLab() {
    for (const e of EntityRegistry.getByType(T.FUSIONLAB)) return e;
    return null;
  }
  function _fusionV() {
    const e = _fusionLab();
    return e && typeof FusionResearch !== 'undefined' ? FusionResearch.visual(e) : null;
  }
  // The plant putting out the most smog that could still take a scrubber.
  function _dirtiestUnscrubbed() {
    if (typeof PollutionSystem === 'undefined') return null;
    let best = null;
    for (const t of [T.COALGENERATOR, T.FUELGEN, T.REFINERY, T.CHEMICALPLANT]) {
      for (const e of EntityRegistry.getByType(t)) {
        if (e._scrubber || !PollutionSystem.canScrub(e)) continue;
        if (!best || (e._emission || 0) > (best._emission || 0)) best = e;
      }
    }
    return best;
  }
  function _jumpTo(e) {
    if (!e) return;
    Camera.recentreOn((e.col + (e.width || 1) / 2) * TILE, (e.row + (e.height || 1) / 2) * TILE);
  }

  let completed  = new Set();  // sequence ids fully finished
  let skipped    = false;      // player dismissed tutorials entirely
  let activeSeq  = null;
  let stepIdx    = 0;
  // Sequences set aside while their waiting card was closed — see tick().
  // Each is restored, still parked on the same step, once whatever took its
  // place has finished.
  let parked     = [];         // [{ seq, stepIdx }]
  let _tickDivider = 0;

  // Set when the player clicks a past note in the Compendium — displays
  // that single step read-only (Close button only, no auto-advance, no
  // Skip-all) without disturbing the real activeSeq/stepIdx underneath it.
  let forcedView = null; // { seq, step }

  // How far the player has actually been SHOWN into each sequence — feeds
  // the Compendium's "Tutorial Notes" category with "up to the point the
  // player is at", per seqId -> highest stepIdx actually rendered live
  // (never touched by a forced Compendium review, which is just re-reading,
  // not progress). Persists across skip/re-enable and save/load, so notes
  // already seen stay visible even after cards are turned off, but nothing
  // beyond what was actually displayed ever shows up.
  const furthestStep = new Map();
  // Whether a save got as far as card i of sequence `id`. The oil, nuclear,
  // hydro and fusion chains were split into a thread per unlock; this keeps
  // a save that saw a card under the old single sequence from seeing it again.
  const _shownIn = (id, i) => (furthestStep.get(id) ?? -1) >= i;

  // Derived from `furthestStep` rather than a separate done/not-done flag,
  // so extending a sequence with new steps after players have already
  // finished the old (shorter) version doesn't permanently lock them out
  // of the new tail — they just weren't "done" by the new step count yet.
  function _isSeqDone(seq) {
    return (furthestStep.get(seq.id) ?? -1) >= seq.steps.length - 1;
  }

  function _findEligible() {
    for (const seq of SEQUENCES) {
      if (_isSeqDone(seq) || seq === activeSeq || _quiet.has(seq.id) || parked.some(p => p.seq === seq)) continue;
      if (seq.trigger()) return seq;
    }
    return null;
  }

  function _begin(seq) {
    activeSeq = seq;
    _dismissedStep = null;
    // Resume right after whatever was already shown (relevant when a
    // sequence gained steps since the player last saw it), not always 0 —
    // unless the last card shown was waiting on something that still hasn't
    // happened (a sequence set aside and lost on reload): then that card
    // again, or the next one would claim something that isn't true yet.
    const shown = furthestStep.get(seq.id) ?? -1;
    const last = seq.steps[shown];
    let at = shown + 1;
    if (last && last.check && !last.manual) { let met = false; try { met = last.check(); } catch (_e) {} if (!met) at = shown; }
    stepIdx = Math.max(0, Math.min(at, seq.steps.length - 1));
    _render();
  }

  function _finishActive() {
    completed.add(activeSeq.id);
    activeSeq = null;
    stepIdx = 0;
    // Hand the slot back to a sequence that was set aside, still parked.
    const back = parked.pop();
    if (back) {
      activeSeq = back.seq;
      stepIdx = back.stepIdx;
      _dismissedStep = back.seq.steps[back.stepIdx] || null;
    }
    _render();
  }

  function _advance() {
    _dismissedStep = null;   // dismissal applies to one card, not the next
    stepIdx++;
    if (stepIdx >= activeSeq.steps.length) { _finishActive(); return; }
    _render();
  }

  function _worldHighlightTarget(step) {
    if (!step || !step.highlightWorld) return null;
    if (typeof step.highlightWorld === 'function') return step.highlightWorld();
    return typeof GovernmentSystem !== 'undefined' ? GovernmentSystem.getGovEntity() : null;
  }

  const PARK_TYPES = [T.SMALLPARK, T.COMMUNITYGARDEN, T.TREEDSTREET, T.BASKETBALLCOURT, T.FARMERSMARKET, T.FOUNTAIN, T.SPLASHPAD, T.BASEBALLFIELD, T.PLAYGROUND, T.ALLOTMENTS, T.DOGPARK, T.COMMUNITYCENTER, T.GREENHOUSE, T.CORNERSTORE, T.FARM];
  function _findFirstPark() {
    for (const t of PARK_TYPES) {
      for (const e of EntityRegistry.getByType(t)) return e;
    }
    return null;
  }

  // The first lines of the Wire Fault card: what knocked the wire out.
  function _wireFaultCause() {
    const w = _findFirstFaultedWire();
    const down = 'cutting power to anything downstream until it is repaired';
    const during = w && w._faultEvent ? ` during the ${w._faultEvent.toLowerCase()}` : ' while the weather was in';
    switch (w && w._faultCause) {
      case 'overload':
        return `One of your cables has failed.\n\nIt was overloaded${during}. Cables carrying more than they are rated for can fail whenever a spell of weather comes through, ${down}.`;
      case 'smoke':
        return `One of your cables has failed.\n\nWildfire smoke settled on a line strung beside trees and it flashed over, ${down}.`;
      case 'geomag':
        return `One of your cables has failed.\n\nThe geomagnetic storm drove currents through your long lines and tripped one open, ${down}. The longer a network, the more it picks up.`;
      case 'fire':
        return `One of your cables has failed.\n\nLightning set a line on fire. Burnt cable has to be replaced, and the line is ${down}.`;
      default:
        return `One of your cables has failed, ${down}.`;
    }
  }

  function _findFirstFaultedWire() {
    for (const e of EntityRegistry.getByType(T.WIRE)) {
      if (e._weatherFailed) return e;
    }
    return null;
  }

  // Any building currently knocked out by a direct strike. Unlike the
  // wire version above there's no single type to scan, so this walks the
  // whole registry — only called while hunting for an un-run sequence,
  // not per frame.
  function _findFirstLightningDamaged() {
    for (const e of EntityRegistry.all()) {
      if (e._lightningDamaged) return e;
    }
    return null;
  }

  // Pulsing glow around one or more arbitrary topbar/UI elements by id
  // (see `.tut-dom-glow` in index.html) — used for the UI-introduction
  // steps (INCOME/BALANCE, POPULATION, GRID, ...). Cleared and reapplied
  // on every render so leftover glow never lingers on the wrong element.
  let _domHighlighted = [];
  function _clearDomHighlight() {
    for (const id of _domHighlighted) {
      const el = document.getElementById(id);
      if (el) el.classList.remove('tut-dom-glow');
    }
    _domHighlighted = [];
  }
  function _applyDomHighlight(ids) {
    if (!ids) return;
    for (const id of ids) {
      const el = document.getElementById(id);
      if (el) { el.classList.add('tut-dom-glow'); _domHighlighted.push(id); }
    }
  }

  // Long informational cards in the opening sequence freeze the sim while
  // they are up. Those steps auto-advance on a `check` (place generators,
  // place the Research Station, ...) so they'd otherwise run the clock —
  // burning biofuel while the player is still reading. Time resumes when the
  // card's own check passes; the player can also just unpause from the
  // playback bar. No button is drawn for this — the card carrying one and
  // then re-rendering without it read as two different cards.
  //
  // Only safe for steps whose action needs no sim time (building, menu
  // clicks). Anything that has to WAIT for the world (chopping, fuel
  // accumulating) must opt out with `noReadPause: true` or stay under
  // READ_PAUSE_CHARS, or the freeze would never lift on its own.
  const READ_PAUSE_SEQS = new Set(['intro']);
  const READ_PAUSE_CHARS = 200;
  let _dismissedStep = null; // waiting-card the player has closed (see `dismissable`)
  // Waiting cards folded down to their title bar (see _renderStepCard). A
  // preference, not progress, so it lives in localStorage rather than the save.
  let _folded = false;
  try { _folded = localStorage.getItem('gw_tut_folded') === '1'; } catch (_e) {}

  // ── Controller wording ──────────────────────────────────────────────
  // Card text is written for mouse and keyboard. While a controller is
  // connected it's rewritten to the matching buttons (see gamepad_input.js
  // for the layout); a step can also carry its own padText / padControls.
  function _padOn() {
    return typeof GamepadInput !== 'undefined' && GamepadInput.connected;
  }
  const _cap = (c, s) => c === c.toUpperCase() ? s[0].toUpperCase() + s.slice(1) : s;
  const PAD_SUBS = [
    [/You can also press ALT to change time speed or SPACE to pause\./g, 'You can also tap R3 to play / pause, or hold it to step through the fast-forward speeds.'],
    [/Pause with SPACE and change speed \(up to 10x\) with ALT\./g, 'Tap R3 to play / pause, or hold it to step through the fast-forward speeds (up to 10x).'],
    [/Hold right-click over/g, 'Hold B over'],
    [/Hold LMB and drag to place/g, 'Hold A and move the cursor to place'],
    [/press M to see/g, 'press VIEW to see'],
    [/\(E opens the Research Station from anywhere\)/g, '(hold VIEW to open the Research Station from anywhere)'],
    [/hold down LMB and drag your cursor/g, 'hold A and move the cursor'],
    [/holding down LMB and dragging/g, 'holding A and moving the cursor'],
    [/hold down LMB/g, 'hold A'],
    [/Double-click anywhere/g, 'Double-tap A anywhere'],
    [/Drag-select a group of placed buildings/g, 'Press VIEW + RB, then hold A and move the cursor over a group of placed buildings'],
    [/\b([Cc])lick here\b/g, (m, c) => _cap(c, 'press A here')],
    [/\b([Cc])licking on\b/g, (m, c) => _cap(c, 'pressing A on')],
    [/\b([Cc])licking\b/g, (m, c) => _cap(c, 'pressing A on')],
    [/\b([Cc])lick on\b/g, (m, c) => _cap(c, 'press A on')],
    [/\b([Cc])lick\b/g, (m, c) => _cap(c, 'press A on')],
    [/\b([Pp])ress R\b/g, (m, p) => _cap(p, 'press X')],
    [/press M to open the map/g, 'press VIEW to open the map'],
    [/\(M\)/g, '(VIEW)'],
  ];
  // Phone wording (js/mobile.js sets GW_MOBILE): mouse and keys become
  // taps, holds and the on-screen buttons. A step can carry its own
  // touchText / touchControls.
  function _touchOn() { return !!window.GW_MOBILE && !_padOn(); }
  const TOUCH_SUBS = [
    [/You can also press ALT to change time speed or SPACE to pause\./g, 'You can also use the play, pause and fast-forward buttons by the clock.'],
    [/Pause with SPACE and change speed \(up to 10x\) with ALT\./g, 'Pause and change speed (up to 10x) with the buttons by the clock.'],
    [/Hold right-click over/g, 'Press and hold your finger on'],
    [/Hold LMB and drag to place/g, 'Hold a finger down and drag to place'],
    [/press M to see/g, 'tap ⋯ → Map to see'],
    [/\(E opens the Research Station from anywhere\)/g, '(⋯ → Research opens it from anywhere)'],
    [/hold down LMB and drag your cursor/g, 'hold a finger down and drag'],
    [/holding down LMB and dragging/g, 'holding a finger down and dragging'],
    [/hold down LMB/g, 'press and hold'],
    [/Double-click anywhere/g, 'Double-tap anywhere'],
    [/Drag-select a group of placed buildings/g, 'Tap ⇧, then drag a box over a group of placed buildings'],
    [/\(Ctrl\+C, or the Copy tile in the Function tab\)/g, '(⋯ → Copy area, or the Copy tile in the Function tab)'],
    [/Ctrl\+V pastes/g, '⋯ → Paste pastes'],
    [/\b([Cc])lick here\b/g, (m, c) => _cap(c, 'tap here')],
    [/\b([Cc])licking on\b/g, (m, c) => _cap(c, 'tapping')],
    [/\b([Cc])licking\b/g, (m, c) => _cap(c, 'tapping')],
    [/\b([Cc])lick on\b/g, (m, c) => _cap(c, 'tap')],
    [/\b([Cc])lick\b/g, (m, c) => _cap(c, 'tap')],
    [/\b([Pp])ress R\b/g, (m, p) => _cap(p, 'tap ⟳')],
    [/press M to open the map/g, 'tap ⋯ → Map'],
    [/\(M\)/g, '(⋯ → Map)'],
    [/\bHover\b/g, 'Tap'],
    [/\bhover\b/g, 'tap'],
  ];
  // full: the card's longer original wording (`more`), kept for the
  // Compendium's Tutorial Notes now the cards themselves are short.
  function _stepText(step, full = false) {
    if (_padOn() && step.padText && !(full && step.more)) return step.padText;
    if (_touchOn() && step.touchText && !(full && step.more)) return step.touchText;
    const src = (full && step.more) || step.text;
    const txt = typeof src === 'function' ? src() : (src || '');
    if (_touchOn()) return TOUCH_SUBS.reduce((t, [re, to]) => t.replace(re, to), txt);
    if (!_padOn()) return txt;
    return PAD_SUBS.reduce((t, [re, to]) => t.replace(re, to), txt);
  }
  // Swap the card on screen the moment a controller is plugged in or out.
  window.addEventListener('gw-padchange', () => _render());

  function _isLongRead(seq, step) {
    if (!seq || !step || !READ_PAUSE_SEQS.has(seq.id)) return false;
    if (step.noReadPause) return false;                          // opted out explicitly
    if (step.manual || step.choice || !step.check) return false; // already pauses, or needs sim time
    const txt = typeof step.text === 'function' ? step.text() : (step.text || '');
    return txt.length >= READ_PAUSE_CHARS;
  }

  // Keeps a card's "Time Paused" tag honest: shown only while the clock
  // really is stopped. Checked a few times a second while a tag is up.
  let _pausedTagTimer = 0;
  function _syncPausedTag() {
    const tag = document.querySelector('#tutorial-card .tut-paused');
    if (!tag) { clearInterval(_pausedTagTimer); _pausedTagTimer = 0; return; }
    const stopped = typeof DevMode === 'undefined' || DevMode.timeScale === 0;
    tag.classList.toggle('off', !stopped);
    if (!_pausedTagTimer) _pausedTagTimer = setInterval(_syncPausedTag, 250);
  }

  // ── Compendium links ─────────────────────────────────────────────────
  // A step's `subject` (a T type or a compendium key, or a list of them)
  // puts that object's picture on the card; clicking the picture, or the
  // "More info in the compendium" line, opens its Compendium entry. Cards
  // about a mechanic rather than an object link to their own Tutorial Notes
  // entry, which keeps the card's longer original wording (`more`).
  function _subjects(step) {
    const s = step.subject;
    return (Array.isArray(s) ? s : (s != null ? [s] : [])).filter(x => x != null);
  }
  function _openCompendium(subject) {
    if (typeof CompendiumSystem === 'undefined' || !CompendiumSystem.openTo) return;
    try { SFX.click?.(); } catch (_e) {}
    CompendiumSystem.openTo(subject);
  }
  function _subjectPics(step) {
    if (typeof CompendiumSystem === 'undefined' || !CompendiumSystem.iconFor) return null;
    const wrap = document.createElement('div');
    wrap.className = 'tut-pics';
    for (const subj of _subjects(step)) {
      const entry = CompendiumSystem.findEntry(subj);
      const icon = entry && CompendiumSystem.iconFor(subj, 56);
      if (!icon) continue;
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'tut-pic';
      btn.title = `${entry.label}: open in the Compendium`;
      btn.setAttribute('aria-label', btn.title);
      btn.appendChild(icon);
      btn.addEventListener('click', (e) => { e.stopPropagation(); _openCompendium(subj); });
      wrap.appendChild(btn);
    }
    return wrap.childElementCount ? wrap : null;
  }
  function _compendiumLink(seq, step, forced) {
    if (typeof CompendiumSystem === 'undefined' || !CompendiumSystem.openTo) return null;
    let target = _subjects(step).find(subj => CompendiumSystem.findEntry(subj));
    // A mechanic card links to its own note, unless it is that note being
    // re-read from the Compendium already.
    if (target == null && step.more && !forced) target = `tutnote:${seq.id}:${seq.steps.indexOf(step)}`;
    if (target == null) return null;
    const link = document.createElement('button');
    link.type = 'button';
    link.className = 'tut-cmp-link';
    link.textContent = 'More info in the compendium';
    link.addEventListener('click', (e) => { e.stopPropagation(); _openCompendium(target); });
    return link;
  }

  function _renderStepCard(seq, step, forced) {
    const host = document.getElementById('tutorial-card');
    if (!host) return;
    host.innerHTML = '';
    _clearDomHighlight();
    if (!step) return;
    // A dismissed waiting-card stays the ACTIVE step (its check still has to
    // pass before the sequence moves on) but takes itself off screen, so the
    // player is not left staring at a prompt for something they have already
    // read. Reviewing it from the Compendium ignores the dismissal.
    if (!forced && step.dismissable && _dismissedStep === step) return;
    _applyDomHighlight(step.highlightDom);

    if (!forced) {
      // Only flash the hotbar category once the item is actually unlocked —
      // sequences can trigger as soon as an item is merely "ready" (threshold
      // met, awaiting manual unlock via Research Station), and flashing the
      // category glow that early falsely implies it's already placeable.
      if (step.highlight != null && typeof flashUnlockButton === 'function'
          && (typeof Progression === 'undefined' || Progression.isUnlocked(step.highlight))) {
        flashUnlockButton(step.highlight);
      }
      if (typeof step.onEnter === 'function') step.onEnter();
    }

    const card = document.createElement('div');
    // danger: a red, pulsing card for the few warnings that must not be skimmed.
    card.className = 'tut-card' + (step.danger ? ' tut-danger' : '');
    // Scroll the card, not the map: the camera zooms on any wheel event
    // that reaches the canvas listeners.
    card.addEventListener('wheel', ev => ev.stopPropagation(), { passive: true });

    const title = document.createElement('div');
    title.className = 'tut-title';
    title.textContent = seq.title;
    card.appendChild(title);

    // A card that stops the clock says so on its title bar, so a still city
    // reads as paused rather than broken. It follows the real clock, not just
    // the card's rule: unpausing by hand from the playback bar hides it (see
    // _syncPausedTag).
    if (shouldPauseTime()) {
      const tag = document.createElement('span');
      tag.className = 'tut-paused';
      tag.textContent = 'Time Paused';
      tag.title = 'The game clock is stopped while this card is open';
      title.appendChild(tag);
      card.classList.add('tut-time-paused');
      setTimeout(_syncPausedTag, 0);   // once the card is on screen and the pause has applied
    }

    // A card that is waiting on the player (it has a check and no button to
    // press) can be folded down to its title bar and opened again, so it can
    // stay on screen without covering the work. Cards that hold the game
    // still for a Continue or a Yes / No are never folded: the button they
    // wait on would be hidden.
    const foldable = !forced && !!step.check && !step.manual && !step.choice;
    if (foldable) {
      const n = seq.steps.indexOf(step) + 1;
      card.classList.add('tut-foldable');
      if (_folded) card.classList.add('tut-folded');
      title.title = _folded ? 'Show this step' : 'Hide this step';
      const count = document.createElement('span');
      count.className = 'tut-fold-n';
      count.textContent = `${n} / ${seq.steps.length}`;
      // A real, labelled button: a bare chevron on the title bar was easy
      // to miss. The whole title still toggles it as well.
      const chev = document.createElement('button');
      chev.type = 'button';
      chev.className = 'tut-fold-btn';
      chev.innerHTML = _folded ? '<i>▴</i> Show' : '<i>▾</i> Hide';
      chev.setAttribute('aria-expanded', _folded ? 'false' : 'true');
      chev.title = _folded ? 'Show this step' : 'Fold this card down to its title bar';
      title.appendChild(count);
      title.appendChild(chev);
      title.addEventListener('click', (e) => {
        e.stopPropagation();
        _folded = !_folded;
        try { localStorage.setItem('gw_tut_folded', _folded ? '1' : '0'); } catch (_e) {}
        try { SFX.click?.(); } catch (_e) {}
        _render();
      });
    }

    const controls = (_padOn() && step.padControls) || (_touchOn() && step.touchControls) || step.controls;
    if (controls) {
      // Keyboard-shortcut steps render as a proper key list (matching the
      // Options ▸ Controls panel's <kbd> styling) instead of a wall of text.
      const list = document.createElement('div');
      list.className = 'tut-ctrl-list';
      for (const row of controls) {
        const rowEl = document.createElement('div');
        rowEl.className = 'tut-ctrl-row';
        const descEl = document.createElement('span');
        descEl.className = 'tut-ctrl-desc';
        descEl.textContent = row.desc;
        const keysEl = document.createElement('span');
        keysEl.className = 'tut-ctrl-keys';
        row.keys.forEach((group, i) => {
          if (i > 0) keysEl.appendChild(document.createTextNode(' / '));
          for (const k of group) {
            const kbd = document.createElement('kbd');
            kbd.textContent = k;
            keysEl.appendChild(kbd);
          }
        });
        rowEl.appendChild(descEl);
        rowEl.appendChild(keysEl);
        list.appendChild(rowEl);
      }
      card.appendChild(list);
    } else {
      const text = document.createElement('div');
      text.className = 'tut-text';
      text.textContent = _stepText(step);
      const pics = _subjectPics(step);
      if (pics) {
        const body = document.createElement('div');
        body.className = 'tut-body';
        body.appendChild(pics);
        body.appendChild(text);
        card.appendChild(body);
      } else {
        card.appendChild(text);
      }
      const link = _compendiumLink(seq, step, forced);
      if (link) card.appendChild(link);
    }

    if (forced) {
      const close = document.createElement('button');
      close.className = 'tut-continue';
      close.textContent = 'Close';
      close.addEventListener('click', (e) => { e.stopPropagation(); dismissForced(); });
      card.appendChild(close);
    } else if (step.choice) {
      const row = document.createElement('div');
      row.className = 'tut-choice-row';
      const yes = document.createElement('button');
      yes.className = 'tut-continue';
      yes.textContent = 'Yes';
      yes.addEventListener('click', (e) => { e.stopPropagation(); _advance(); });
      const no = document.createElement('button');
      no.className = 'tut-continue tut-choice-no';
      no.textContent = 'No';
      no.addEventListener('click', (e) => { e.stopPropagation(); TutorialSystem.skip(); });
      row.appendChild(yes);
      row.appendChild(no);
      card.appendChild(row);
    } else if (step.dismissable) {
      // Continue that hides the card WITHOUT advancing — the step is waiting
      // on a world condition, so advancing here would show the next card
      // before that condition is true.
      const cont = document.createElement('button');
      cont.className = 'tut-continue';
      cont.textContent = 'Continue';
      cont.title = 'Dismiss: the next card appears when you get there';
      cont.addEventListener('click', (e) => {
        e.stopPropagation();
        _dismissedStep = step;
        _render();
      });
      card.appendChild(cont);
    } else if (step.manual) {
      const cont = document.createElement('button');
      cont.className = 'tut-continue';
      cont.textContent = 'Continue';
      cont.addEventListener('click', (e) => { e.stopPropagation(); _advance(); });
      card.appendChild(cont);
    } else if (seq.steps.length > 1) {
      const prog = document.createElement('div');
      prog.className = 'tut-progress';
      prog.textContent = `STEP ${seq.steps.indexOf(step) + 1} / ${seq.steps.length}`;
      card.appendChild(prog);
    }

    host.appendChild(card);
  }

  function _render() {
    if (forcedView) { _renderStepCard(forcedView.seq, forcedView.step, true); return; }
    const host = document.getElementById('tutorial-card');
    if (!host) return;
    if (skipped || !activeSeq) { host.innerHTML = ''; _clearDomHighlight(); return; }
    const cur = furthestStep.get(activeSeq.id) ?? -1;
    if (stepIdx > cur) furthestStep.set(activeSeq.id, stepIdx);
    _renderStepCard(activeSeq, activeSeq.steps[stepIdx], false);
  }

  function tick() {
    // Checks are cheap (Set.size / Progression flags) but only need to run
    // a few times a second, not every 100ms sim tick.
    _tickDivider++;
    if (_tickDivider % 5 !== 0) return;

    // Demo scenarios run one walkthrough of their own (startSequence, below)
    // and nothing from the city tutorial: no sequence is ever started here.
    const _scn = typeof ScenarioSystem !== 'undefined' && ScenarioSystem.active();

    if (forcedView) return; // reviewing a past note — don't advance the real flow underneath it
    // Cards off: follow along without showing anything, so the notes fill in.
    if (skipped) { if (!_scn) _trackSilently(); return; }
    // Cards just turned back on: catch up first, so what the player went
    // through with cards off doesn't all pop up now, one after another.
    if (_catchUp) {
      _catchUp = false;
      if (!_scn) {
        _trackSilently();
        // The card each unfinished sequence is waiting on was reached with
        // cards off and is already in the notes: keep it quiet, and pop up
        // from the next card on.
        for (const seq of SEQUENCES) {
          const i = furthestStep.get(seq.id) ?? -1;
          if (i >= 0 && !_isSeqDone(seq)) _quiet.add(seq.id);
        }
      }
    }
    // A quiet sequence rejoins once the card it was held on is done; _begin
    // then starts it at the card after.
    for (const id of _quiet) {
      const seq = SEQUENCES.find(q => q.id === id);
      const st = seq && seq.steps[furthestStep.get(id) ?? -1];
      let done = !st;
      if (!done) { try { done = !!st.check && !!st.check(); } catch (_e) {} }
      if (done) _quiet.delete(id);
    }

    if (!activeSeq) {
      const next = _scn ? null : _findEligible();
      if (next) _begin(next);
      return;
    }
    const step = activeSeq.steps[stepIdx];
    if (step && step.check && step.check()) { try { SFX.step?.(); } catch (_e) {} _advance(); return; }
    if (_scn) return;
    // A waiting card the player has closed can sit for hours (a beacon they
    // haven't built, a fish they haven't caught). It must not hold up every
    // other card in the game meanwhile: set it aside for anything that comes
    // up, and pick it back up afterwards.
    if (step && step.dismissable && _dismissedStep === step) {
      const next = _findEligible();
      if (next) { parked.push({ seq: activeSeq, stepIdx }); activeSeq = null; _begin(next); }
    }
  }

  // The game loop skips every system while paused, tick() included — but the
  // current card still has to notice its action being done, or it waits
  // forever: placing the three Biofuel Generators the intro card asks for
  // never advanced it until the player unpaused by hand. Every step's check
  // runs here, not just cards that froze time themselves — the pause may
  // have come from the previous card, the playback bar or a menu, and the
  // player can still build while paused. Checks that need sim time simply
  // stay false until it runs again. Nothing new starts while paused.
  let _probeTopoVer = -1, _probeTicks = 0;
  function tickPaused() {
    if (forcedView || skipped || !activeSeq) return;
    const step = activeSeq.steps[stepIdx];
    // A `probePower` card waits on something being powered while it holds
    // time still. Run the power pass for about a second after each change to
    // the grid (long enough to cover a wire drag's batching and the deferred
    // steps inside the pass), so the hookup registers without unpausing. It
    // is not run constantly: see the note on PowerNetwork.tick in game_loop.
    if (step && step.probePower && typeof PowerNetwork !== 'undefined') {
      const tv = EntityRegistry.getTopologyVersion();
      if (tv !== _probeTopoVer) { _probeTopoVer = tv; _probeTicks = 10; }
      if (_probeTicks > 0) { _probeTicks--; PowerNetwork.tick(0.1); }
    }
    if (step && step.check && step.check()) { try { SFX.step?.(); } catch (_e) {} _advance(); }
  }

  // ── Cards off ─────────────────────────────────────────────────────────
  // Walks every sequence the way the player would with cards on, minus the
  // cards: a sequence starts when its trigger fires, a card that waits on
  // something (check) is passed once that is done, and a card that only has
  // to be read (Continue, Yes / No) is passed straight away. Each card
  // reached goes into furthestStep, which is what the Compendium's Tutorial
  // Notes list. No onEnter, camera jumps or sounds.
  let _catchUp = false;
  const _quiet = new Set();   // sequences held silent on a card reached with cards off
  function _trackSilently() {
    for (const seq of SEQUENCES) {
      let i = furthestStep.get(seq.id) ?? -1;
      if (i < 0) {
        let on = false;
        try { on = !!seq.trigger(); } catch (_e) {}
        if (!on) continue;
        i = 0;
        furthestStep.set(seq.id, 0);
      }
      for (;;) {
        const st = seq.steps[i];
        let passed = !!(st.manual || st.choice || !st.check);
        if (!passed) { try { passed = !!st.check(); } catch (_e) {} }
        if (!passed) break;
        if (i >= seq.steps.length - 1) { completed.add(seq.id); break; }
        i++;
        furthestStep.set(seq.id, i);
      }
    }
  }

  function skip() {
    skipped = true;
    activeSeq = null;
    stepIdx = 0;
    parked = [];
    _render();
  }

  // Demo scenarios (scenario_system.js): run a sequence that is not in
  // SEQUENCES, from step `at`. It behaves like any other from here on (cards,
  // checks, glow, the Yes / No choice) but never appears in the Compendium's
  // notes, which list SEQUENCES only. sequenceStep() is where it has got to,
  // or -1 once it is finished or the player turned cards off.
  function startSequence(seq, at = 0) {
    if (!seq || !seq.steps.length || at < 0 || at >= seq.steps.length) return;
    skipped = false;
    parked = [];
    forcedView = null;
    activeSeq = seq;
    stepIdx = at;
    _dismissedStep = null;
    _render();
  }
  function sequenceStep(seq) { return (!skipped && activeSeq === seq) ? stepIdx : -1; }

  // Options-menu toggle. Turning tutorials back on catches up silently on
  // the next tick (see _trackSilently), then any not-yet-finished sequence
  // resumes from where the player actually is.
  function setEnabled(v) {
    const wasOff = skipped;
    skipped = !v;
    if (!skipped) { activeSeq = null; stepIdx = 0; parked = []; _catchUp = wasOff; }
    _render();
  }

  // Compendium "click a note to pop it back up" entry point.
  function forceShow(seqId, index) {
    const seq = SEQUENCES.find(s => s.id === seqId);
    const step = seq && seq.steps[index];
    if (!step) return;
    forcedView = { seq, step };
    _render();
  }

  function dismissForced() {
    forcedView = null;
    _render();
  }

  // Pulsing ring drawn around the world-space highlight target (currently
  // only City Hall) for the active or forced-view step, if any. Called from
  // the main render loop every frame — see game_loop.js.
  function drawWorldHighlight(t) {
    const step = forcedView ? forcedView.step : (!skipped && activeSeq ? activeSeq.steps[stepIdx] : null);
    const e = _worldHighlightTarget(step);
    if (!e || typeof ctx === 'undefined') return;

    // An array of tile RECTS rather than a single entity — used to call out
    // regions the card is talking about (a contract's build area and the
    // client's works), which have no entity to ring.
    if (Array.isArray(e)) {
      const pulse = 0.5 + 0.5 * Math.sin(t * 3);
      ctx.save();
      ctx.strokeStyle = `rgba(64,160,255,${0.5 + pulse * 0.4})`;
      ctx.lineWidth = 4;
      ctx.shadowColor = 'rgba(64,160,255,0.8)';
      ctx.shadowBlur = 20;
      for (const r of e) {
        if (!r || r.minC === undefined) continue;
        const x = (r.minC * TILE - Camera.x) * Camera.zoom;
        const y = (r.minR * TILE - Camera.y) * Camera.zoom;
        const w = (r.maxC - r.minC + 1) * TILE * Camera.zoom;
        const h = (r.maxR - r.minR + 1) * TILE * Camera.zoom;
        const pad = 4 + pulse * 6;
        ctx.strokeRect(x - pad, y - pad, w + pad * 2, h + pad * 2);
      }
      ctx.restore();
      return;
    }

    const wx = (e.col + (e.width  || 1) / 2) * TILE;
    const wy = (e.row + (e.height || 1) / 2) * TILE;
    const sx = (wx - Camera.x) * Camera.zoom;
    const sy = (wy - Camera.y) * Camera.zoom;
    const baseR = Math.max(e.width || 1, e.height || 1) * TILE * Camera.zoom * 0.55;
    const pulse = 0.5 + 0.5 * Math.sin(t * 3);
    ctx.save();
    ctx.beginPath();
    ctx.arc(sx, sy, baseR + pulse * 8, 0, Math.PI * 2);
    ctx.strokeStyle = `rgba(64,160,255,${0.55 + pulse * 0.35})`;
    ctx.lineWidth = 4;
    ctx.shadowColor = 'rgba(64,160,255,0.8)';
    ctx.shadowBlur = 20;
    ctx.stroke();
    ctx.restore();
  }

  // For the Compendium: one entry per sequence, sub-categorized by the part
  // of the game it addresses — steps 0..furthestStep, i.e. exactly what's
  // been shown to the player so far. Choice steps (the yes/no prompt) carry
  // no informational content and are excluded.
  function getNotesData() {
    return SEQUENCES.map(seq => {
      const maxIdx = furthestStep.get(seq.id) ?? -1;
      const notes = [];
      for (let i = 0; i <= maxIdx; i++) {
        const step = seq.steps[i];
        if (!step || step.choice) continue;
        notes.push({ index: i, text: _stepText(step, true) });
      }
      return { id: seq.id, title: seq.title, notes };
    }).filter(s => s.notes.length);
  }

  // Whether the sim should be frozen while the current card is up (see the
  // MutationObserver in ui_bootstrap.js). Purely informational cards (no
  // `check`) pause so the player can read without the clock running; cards
  // that need a real action performed (chop a tree, place a generator,
  // wait for fuel to accumulate, ...) must NOT pause, since the sim time
  // those actions depend on would never advance. A forced review from the
  // Compendium is always just reading, so it always pauses regardless of
  // whether the original step had a check.
  function shouldPauseTime() {
    // A scenario's cards never stop the clock: the run is timed and scored,
    // and the player keeps building with a card up.
    if (typeof ScenarioSystem !== 'undefined' && ScenarioSystem.active()) return false;
    if (forcedView) return true;
    if (skipped || !activeSeq) return false;
    const step = activeSeq.steps[stepIdx];
    if (!step) return false;
    if (step.noPause) return false;
    // pauseAnyway overrides the "has a check → don't pause" rule for steps
    // whose action is a menu click (open a panel, confirm an unlock) rather
    // than something that needs real sim time to elapse (chopping, waiting
    // on fuel) — pausing there is safe and lets the player read at leisure.
    if (step.pauseAnyway) return true;
    if (_isLongRead(activeSeq, step)) return true;
    return !step.check;
  }

  // Is a specific step's card on screen right now? Lets other systems tie
  // transient UI to a tutorial card's lifetime — e.g. the fishing catch
  // toast stays up as long as the card explaining it does.
  function isShowing(seqId, step) {
    // `step` is either a step index or a step's `id` — ids survive steps
    // being inserted ahead of them, so prefer them for external callers.
    const match = (seq, s, i) => (typeof step === 'string' ? s && s.id === step : i === step);
    if (forcedView) {
      const i = forcedView.seq.steps.indexOf(forcedView.step);
      return forcedView.seq.id === seqId && match(forcedView.seq, forcedView.step, i);
    }
    if (skipped || !activeSeq) return false;
    return activeSeq.id === seqId && match(activeSeq, activeSeq.steps[stepIdx], stepIdx);
  }

  // Saves from before v2 count steps that have since been merged into the
  // step before them (the cards were cut down, and short ones joined). Per
  // sequence, the old indexes of the steps that went: a saved index is moved
  // down by how many of them lie at or before it, so a reload lands on the
  // same card, or on the one it was merged into.
  const SAVE_V = 2;
  const MERGED_V1 = {
    intro: [5], contracts: [4], 'contract-kinds': [2], crewdispatch: [1],
    fishing: [4], coal: [1], coal_water: [1], fusionlab: [1], finalstretch: [1],
  };
  function _fromV1(seqId, idx) {
    const gone = MERGED_V1[seqId];
    return gone ? Math.max(0, idx - gone.filter(g => g <= idx).length) : idx;
  }

  function serialise() {
    return {
      v: SAVE_V,
      completed: [...completed], skipped,
      furthestStep: [...furthestStep],
      // Mid-sequence position — without this, reloading mid-tutorial would
      // find the sequence not yet in `completed` and restart it from step 0.
      activeSeqId: activeSeq ? activeSeq.id : null,
      stepIdx,
      // A waiting card the player closed stays closed: without this it came
      // back on every reload until its check passed (the survey card, until
      // a scan that takes 8+ in-game hours finished).
      dismissed: !!(activeSeq && _dismissedStep && _dismissedStep === activeSeq.steps[stepIdx]),
      parked: parked.map(p => [p.seq.id, p.stepIdx]),
      quiet: [..._quiet],
    };
  }

  function loadState(d) {
    if (!d) return;
    const fix = (d.v || 1) < 2 ? _fromV1 : (_id, i) => i;
    completed = new Set(d.completed || []);
    skipped   = !!d.skipped;
    furthestStep.clear();
    (d.furthestStep || []).forEach(([id, idx]) => furthestStep.set(id, fix(id, idx)));
    const seq = d.activeSeqId ? SEQUENCES.find(s => s.id === d.activeSeqId) : null;
    if (seq) {
      activeSeq = seq;
      stepIdx   = Math.min(Math.max(0, fix(seq.id, d.stepIdx || 0)), seq.steps.length - 1);
      const st  = seq.steps[stepIdx];
      _dismissedStep = d.dismissed && st && st.dismissable ? st : null;
    } else {
      activeSeq = null;
      stepIdx   = 0;
      _dismissedStep = null;
    }
    parked = (d.parked || []).map(([id, i]) => ({ seq: SEQUENCES.find(s => s.id === id), stepIdx: fix(id, i | 0) })).filter(p => p.seq);
    _quiet.clear(); (d.quiet || []).forEach(id => _quiet.add(id));
    _render(); // reflect the resumed step immediately rather than waiting on the next check-passing tick
  }

  function reset() {
    completed = new Set();
    skipped   = false;
    _catchUp  = false;
    _quiet.clear();
    furthestStep.clear();
    activeSeq = null;
    stepIdx   = 0;
    parked    = [];
    forcedView = null;
    _render();
  }

  // The new-game intro cinematic delivers the welcome letter itself, so the
  // card that says the same thing is recorded as shown and the sequence
  // picks up at the card after it.
  function markShown(seqId, index) {
    if ((furthestStep.get(seqId) ?? -1) < index) furthestStep.set(seqId, index);
  }

  return {
    tick, skip, setEnabled, reset, serialise, loadState, markShown, startSequence, sequenceStep,
    getNotesData, isShowing, forceShow, dismissForced, drawWorldHighlight, shouldPauseTime, tickPaused,
    isSkipped: () => skipped,
  };
})();
