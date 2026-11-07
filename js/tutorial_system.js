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
          text: () => `Welcome to GRIDWORKS!\n\nYou are the owner of ${CityInfo.getCompanyName()}. You were recruited by the local government here in ${CityInfo.getCityName()} to establish a full-scale power grid.\n\nIt's up to you to build, grow and maintain the power grid.\n\nAs you progress, you'll discover more advanced forms of power generation.`,
          manual: true,
        },
        {
          text: "Do you want to see tutorial cards pop up? (Recommended for first time players)\n\nYou can turn them on anytime in the OPTIONS menu.\n\nAll tutorials will also be available in the compendium to view anytime.",
          choice: true,
        },
        {
          text: "Move around the world with W-A-S-D, ARROW KEYS, or Hold/Drag LMB\n\nScroll wheel to zoom in/out\n\nQ Duplicates a placed item\n\nX enables deletion mode\n\nM to open the map\n\nTAB shows / hides the build bar\n\nPress F2 to quicksave\n\nF to enable/disable the nighttime flashlight\n\nE opens the panel for your highest-tier Research Station",
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
          text: "HOTKEYS: put your favourite items on the number keys.\n\nOpen the build bar, hover an item and press any key from 1 to 0. The number appears in the item's corner, and pressing it from then on picks that item straight up.\n\nPress an item's own number over it again to clear it.",
          manual: true,
          controls: [
            { desc: 'Hotkey an item: hover it in the build menu, press', keys: [['1 – 0']] },
            { desc: 'Pick up the assigned item', keys: [['1 – 0']] },
            { desc: 'Clear: hover it, press its own number', keys: [['1 – 0']] },
          ],
        },
        {
          text: "INCOME and BALANCE show what you earn and hold; you start with $20,000.\n\nPOPULATION grows as customers move in.\n\nGOVERNMENT is the local government's happiness and CITY SCORE grades how stable your grid is. Blackouts hurt both!\n\nA Monitoring Station later adds full breakdowns.",
          manual: true,
          highlightDom: ['income-balance-group', 'population-stat-btn', 'gov-stat-btn', 'score-stat-btn'],
        },
        {
          text: "GRID breaks down everything producing and consuming power.\n\nWEATHER shows current conditions. Heat waves and cold snaps raise demand, rain cuts solar, and rainstorms bring lightning.\n\nPROGRESS lists upcoming customer requests and unlocks. Requests arrive as your total kWh grows, so if progress feels slow, add more generators!",
          manual: true,
          highlightDom: ['grid-tab-btn', 'weather-tab-btn', 'btn-progress'],
        },
        {
          text: "The clock shows the time of day. Pause with SPACE and change speed (up to 10x) with ALT.\n\nOn the right: the COMPENDIUM has details on every item plus all of these tutorials, then ACHIEVEMENTS, RECENTER (jumps back to City Hall) and the MESSAGE LOG of past notifications.",
          manual: true,
          highlightDom: ['clock', 'playback-controls', 'btn-compendium', 'btn-achievements', 'btn-recenter', 'btn-msglog'],
        },
        {
          text: () => `This is the ${CityInfo.getCityName()} City Hall, your first customer. It needs up to 8 kW of steady power.\n\nOpen the GENERATION tab and place at least 3 Biofuel Generators close to it. Each makes a constant 3 kW, day or night.\n\nNOTE: Most buildings you place have an upkeep fee that cuts into your profits, so keep an eye on INCOME.`,
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
          text: () => `Now collect biofuel. Hold right-click over any tree or bush around ${CityInfo.getCityName()} to extract it; your generators need lots to keep going.\n\n50 total biofuel collected unlocks Wire.`,
          check: () => Progression.isUnlocked(T.WIRE),
        },
        {
          text: "You've unlocked Wire! Wire your generators to each other to stack their power, then run a wire from one of them to the City Hall.\n\nOnly 3 wires can be joined in a row without a building or power pole between them.",
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
          text: "City Hall is powered! Keep collecting: 125 total biofuel unlocks the Research Station.",
          check: () => Progression.isUnlocked(T.RESEARCH),
        },
        {
          text: "You've unlocked the Research Station MK1! It is where you unlock new items once you've met their requirements: click it to open its panel.\n\nPlace it now. It needs power, so make sure you have at least 3 kW to spare.",
          highlight: T.RESEARCH,
          check: () => EntityRegistry.getByType(T.RESEARCH).size > 0,
        },
        {
          text: "You have a placement request for Mae's Cabin, your first residential customer!\n\nOpen the requests window to see the upfront payment and daily fee, then pick one of the 7 placement options. Your pick establishes your first residential zone. Later requests always offer at least one spot near it; choosing a far one starts a new zone.\n\nTIP: With the window open, press M to see options A to G on the map.",
          highlightDom: ['hotbar-req-btn'],
          check: () => HouseRequestSystem.getCabinCleared(),
          pauseAnyway: true,
        },
        {
          text: "You can now unlock Power Pole! Open the Research Station and click UNLOCK next to it.\n\nYou need a pole after every 3 wires. Hold LMB and drag to place one every 4 tiles.\n\nNow get Mae's Cabin online. HOOKUP DEAL: until it has power, wires are FREE and Power Poles are 50% off.",
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
          text: "You've connected your first residential customer!\n\nYou got an upfront payment and will earn a daily fee, paid out through each day. Click a property to see its power draw and income.\n\nKeep customers online. Blackouts lower their satisfaction and your income, and one left dark long enough leaves the grid and charges you a fee.\n\nKeep collecting biofuel toward your next generator, and check PROGRESS (or click a Research Station) for upcoming unlocks.",
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
          text: "The year turns through Spring, Summer, Autumn and Winter, 14 days each, starting in spring. The clock shows the season.\n\nSUMMER: about 2 more hours of sun for solar, but homes draw more for cooling and heat waves can strike.\n\nWINTER: about 2 hours less sun, more heating demand, and snow: rain falls as snow and rainstorms become blizzards.\n\nEach season brings town events: keep the pledged buildings lit for a bonus.",
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
          text: "Other companies around the world have noticed your grid, and they will pay a contractor to build generation, run lines and put towns back on supply. That contractor is you.\n\nTo hear from them, unlock a Communications Beacon at a Research Station and place it on your grid. It is expensive and draws power constantly, so it has to earn its keep.",
          highlight: T.BEACON,
          check: () => EntityRegistry.getByType(T.BEACON).size > 0,
        },
        {
          // Shown once the beacon exists. Dismissed with Continue, since
          // it is the player's to read at their own pace.
          text: "Click your Communications Beacon and choose OPEN CONTRACT BOARD.\n\nEach offer lists the client, site, scope of work and pay. Most clients fund the equipment up front: build it cheaper than their budget and the difference is yours. The margin on top is your profit, paid only when the job is signed off.\n\nSome jobs are marked FIXED BID and pay no advance. You buy the equipment yourself and are paid back for it, with a bigger margin, on sign-off, so make sure you can afford the kit before you accept.\n\nOffers are withdrawn after a few days. The board holds ten and you can run three contracts at once.\n\nAccepting a contract takes you to the client's site.",
          manual: true,
        },
        {
          // A short holding card so dismissing the one above cannot drop
          // the player straight into "You are now at the jobsite" while
          // they are still standing at home. Dismissable rather than
          // manual: its Continue closes the card but leaves the sequence
          // parked here until the player actually reaches a site.
          text: "Work does not come to you. Open your beacon and run a sweep; it draws 12 kW while it searches (3 kW on standby), and turns up between one and five offers, usually two or three, in a day or so.",
          dismissable: true,
          check: () => typeof ContractSystem !== 'undefined' && ContractSystem.isAtSite(),
        },
        {
          // First arrival on a job site. Rings the two marker regions the
          // text is describing so "the highlighted areas" is unambiguous.
          text: "You are now at the jobsite.\n\nThe highlighted areas are the build area and the client's existing works, which your new supply has to reach. Anything outside the boundary is not your job.\n\nThe checklist on the right tracks every requirement live. Equipment has to be WORKING, not just placed, and getting the client's own dark buildings back on supply is part of the job.",
          manual: true,
          highlightWorld: () => {
            if (typeof ContractSystem === 'undefined' || !ContractSystem.isAtSite()) return null;
            const a = ContractSystem.getActive();
            return a ? Object.values(a.markers) : null;
          },
        },
        {
          text: "RETURN HOME takes you back to your own world with the site held as you left it, and RETURN TO SITE brings you back. Travel as often as you like, but the deadline keeps running either way.\n\nMiss it (or ABANDON) and the contract fails: no profit, the equipment budget goes back to the client, and everything still standing on the site is lost.\n\nFinish on time and the client remembers; repeat work improves their rates.",
          manual: true,
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
          text: "Not every contract is the same job.\n\nRUSH: small and fast, half the deadline, paid a premium.\nRETAINER: a two to four day supply guarantee with little new kit.\nPEAK SUPPORT: batteries holding a client's evening peak.\nSHOWCASE: extra work for better pay, offered only to contractors with a name.\n\nThe badge also shows job size, SMALL to FLAGSHIP. Bigger jobs take longer and pay more.",
          manual: true,
        },
        {
          text: "Clients only ask for what you have proven: a job calls for a kind of power only once you have run it on your own grid.\n\nStanding counts too. Each client's rank lifts their rates as you finish their jobs, and your contractor rank opens Showcase work.\n\nJobs with a reactor carry a warning. A reactor on a client's site can melt down and explode like one at home, and if it does the contract ends and you are liable for their losses, which can put you in debt. Keep it cooled and its steam drawn.",
          manual: true,
        },
        {
          text: "Some clients pay partly in kind. CASH + PERK jobs pay a little less cash plus a perk on sign-off; PAID MOSTLY IN KIND jobs pay little cash but a longer perk.\n\nPerks are: free wires for a few days, a discount on a class of equipment, cheaper repairs or running costs, faster beacon sweeps, or an extra job from your next sweep. They count down in home time only.",
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
          text: "You're now experiencing a blackout!\n\nBlackouts affect your daily fee rate that you receive from properties on your grid. The longer the blackout, the heavier the cost.\n\nBe quick to get things back up and running. You may need to place more power generators.\n\nIf you're offline long enough, customers will threaten to leave the grid.\n\nIf a customer leaves, you'll have to pay them 90% of their upfront fee.",
          manual: true,
        },
      ],
    },
    {
      id: 'wirefault',
      title: 'Storm Damage',
      trigger: () => !!_findFirstFaultedWire(),
      steps: [
        {
          text: "Uh oh, a storm just knocked out one of your wires!\n\nOverloaded wires can fail during severe weather, cutting power to anything downstream until they're repaired.\n\nClick the red, faulted wire to open its panel, then hit Repair Wire to fix it. You can also click on any wire on the grid and click Repair All Faults to fix every broken wire on the map at once.\n\nNOTE: Repairs cost money per wire, discounted 25% if you have a Monitoring Station.",
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
          text: "Lightning just hit one of your buildings!\n\nA struck building is out of service: it draws and generates nothing and pays you nothing. A struck Power Pole stops conducting, so everything downstream goes dark.\n\nClick the damaged building and hit Repair. The cost scales with its value (25% off with a Monitoring Station) and takes time: minutes for a pole, hours for a reactor.\n\nStrikes only happen in rainstorms, and bigger grids and bigger buildings get hit more often.",
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
          text: "That strike just earned you the Lightning Rod!\n\nIt's a 3x4 grounded steel mast that pulls strikes away from everything around it. Any building within 14 tiles is far less likely to be hit, and when a rod does intercept a bolt, you can watch it take the hit. Rods are never damaged themselves.\n\nClick your Research Station MK2 to unlock it.",
          highlight: T.LIGHTNINGROD,
          // Unlocking is a menu click, not something that needs sim time
          // to elapse, so it's safe to pause and let the player read.
          pauseAnyway: true,
          manual: true,
          check: () => Progression.isUnlocked(T.LIGHTNINGROD),
        },
        {
          text: "Place a Lightning Rod near what you can least afford to lose: your power plants and biggest customers.\n\nOne rod cuts strikes in its radius by about 60%. Overlapping rods stack to roughly 85% with two and 95% with three.\n\nWire rods into the grid too: each intercepted strike feeds 10 kW back, fading over the next in-game hour. An unwired rod still protects.\n\nClick a placed rod to see what it covers.",
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
          text: "You've unlocked Street Lamp!\n\nJust like customers, your properties will sometimes request an amenity like a Street Lamp or Security Camera; keep an eye on your notifications.\n\nThe amenity must be placed within a few tiles of the building that requested it, and it'll boost satisfaction for everyone nearby.",
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
          text: "You've unlocked the Resource Survey Station, the way to your next form of power: geothermal heat.\n\nPlace it, power it and click it to run a Geothermal Scan, which reveals deposits hidden around the map.\n\nA geothermal survey takes 8 to 12 in-game hours (rarer resources take longer) and draws 40 kW while it runs (8 kW idle). If it loses power it stalls and keeps its progress. Each survey costs more than the last and draws 5 kW more.",
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
          text: "You have completed your first resource scan!\n\nIf you open the map (M) you can see that you discovered several geothermal deposits.\n\nThat also opened up the geothermal chain at your Research Station.",
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
          text: "You've unlocked the first part of the geothermal chain: Geothermal Well.\n\nPlace one on a geothermal deposit. One well per deposit. Again, check the world map (M) to find a deposit.\n\nIts steam output port is marked on the well: that is the side the turbine has to sit on. Press R before placing to turn it to whichever side suits.\n\nThe well needs power to run its downhole pump, so wire it in.",
          highlight: T.GEOWELL,
          // Dismissable, not manual: the next card says to unlock the
          // Geothermal Turbine, which only unlocks once a well is down
          // (progression.js), so Continue must not hand straight over to it.
          dismissable: true,
          check: () => EntityRegistry.getByType(T.GEOWELL).size > 0,
        },
        {
          text: "Now unlock the Geothermal Turbine (E opens the Research Station from anywhere) and place it over the well's steam output port. One turbine per well.\n\nExpect 35 kW to 55 kW per turbine depending on how hot this world runs, nudged by the weather. Geothermal deposits never run dry, so it produces day and night.\n\nGet three turbines running at once to unlock the Coal Scan.",
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
          text: "Your Coal Scan turned up coal deposits!\n\nFinding coal also unlocked the Research Station MK2.\n\nGo ahead and place it; the Coal Mine is researched there.",
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
          text: "Click the new Research Station and unlock the Coal Mine.\n\nThen place one on a coal deposit.",
          highlight: T.COALMINE,
          // Same again: the next card opens "By placing the coal mine, you can
          // now unlock Power Tower!", which is only true once a mine is down -
          // Power Tower's own gate is exactly that (Progression
          // .checkPowerTowerReady). Hold here until it is.
          dismissable: true,
          check: () => EntityRegistry.getByType(T.COALMINE).size > 0,
        },
        {
          text: "By placing the coal mine, you can now unlock Power Tower!\n\nThis is an upgrade from Power Pole, doubling the distance that you can extend wires.\n\nIt will make it much easier to power up your coal mine, as it's probably some distance from your power grid. Power up the Coal Mine!\n\nNOTE: Like the power pole, holding down LMB and dragging with the Power Tower will place them at their maximum wire distance.",
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
          text: "Your wires are running hot, and the Surge Protector is now unlockable.\n\nEvery wire network has a throughput cap, 85 kW to start. Wire colour shows the load: green is comfortable, yellow is tight, red is at the limit. Past 80% a wire can burn out, and everything downstream goes dark until you repair it.\n\nEither move load off that network or raise its cap. A Surge Protector placed anywhere on the network adds 170 kW, tripling the cap to 255 kW, and each one after adds another 170 kW (425 kW with two). It needs no power, just $7/s upkeep.",
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
          text: "Be careful not to accept too many property placement requests!\n\nYou are getting very close to what your grid can handle. Give it some time and supply more power before taking on many more requests.\n\nIndustrial customers especially; they take a lot of power to keep on your grid, and they draw it around the clock rather than tailing off overnight.\n\nThe GRID panel shows your live supply against demand, so you can see how much headroom you actually have before accepting the next one.",
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
          text: "You can now unlock the Substation!\n\nA Substation is big storage. It charges whenever you generate more than you use, and discharges to cover the gap when demand runs ahead of supply: an evening peak, a still night for your wind turbines, a generator that drops out.\n\nIt still has to be wired into the network like anything else.\n\nWARNING: lightning detonates a charged substation, wrecking and setting fire to everything within several tiles. Put it away from your city, or under a Lightning Rod.",
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
          text: "You can now unlock the Monitoring Station!\n\nBuild one and keep it powered to open up your city's analytics, including the full population breakdown.\n\nIt also takes 25% off every repair: storm-burnt wires and lightning-struck buildings alike.",
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
          text: "You can now unlock the Circuit Switch!\n\nIt's a manual breaker. From its panel, assign buildings to its circuit, up to 500 kW of peak load (the MK2 takes 1.4 MW).\n\nWhen you're short on power, open the circuit. Those buildings go dark and their draw leaves the network, so everything else stays lit instead of the whole grid browning out.\n\nIt draws no power itself, so you can still throw it in the middle of a blackout. Shed buildings don't pay while they're dark, so close it again once you have the power back.",
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
          text: "Your balance has gone negative!\n\nWhile you're in debt, customers give up on you: every 6 in-game hours in the red, one disconnects and leaves without paying.\n\nGet back above $0 quickly. Cut upkeep you don't need, bring more customers online, or take a loan of $5,000 to $100,000 from the GOVERNMENT panel. Interest is 8% of the loan, charged daily at noon until it's repaid: a $10,000 loan costs $800 a day, so borrow what you can pay back.",
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
          text: "One of your generators has gone CRITICAL!\n\nCoal and Fuel Generators run in ECO, NORMAL or OVERDRIVE. Overdrive gives 50% more power for double the fuel, but at 100% heat or pressure a meltdown countdown starts, and at zero the generator explodes and takes out what is around it.\n\nClick it and drop it to NORMAL or ECO right now; the countdown drains once it's back under 100%.\n\nA Throttle Governor, researched at a Research Station MK3, eases Overdrive back automatically.",
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
          text: "The air around your city is getting dirty.\n\nCoal and Fuel Generators, Refineries, Chemical Plants and Nuclear Reactors make smog that drifts downwind. It caps how happy nearby customers get, dims solar panels and drags down your City Score. Go over the city's emissions allowance and you pay a carbon tax and lose government approval.\n\nA generator sitting on a full waste buffer pollutes up to twice as hard, so keep the trucks hauling.\n\nTo fight it: keep dirty plants away from and downwind of housing, leave trees standing between them (trees and parks soak smog up), and lean on clean power. After $100,000 in carbon tax with a Research Station MK2 standing, you can fit scrubbers from a plant's panel.\n\nThe world map's SHOW AIR POLLUTION toggle shows where it's worst.",
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
          text: "You can now unlock Scrubbers!\n\nUnlock them from the Research Station MK2. A scrubber isn't a building you place: it's an upgrade fitted to a plant that's already standing. Click on a pollution producing building like a Coal Generator and click FIT SCRUBBER.\n\nEach one cuts that plant's emissions by 60%. That shrinks its smog cloud, cuts what it adds to the carbon tax, and takes away most of the approval hit for running a dirty plant.\n\nThey cost a one-off fee plus $4/s upkeep each. Remove a scrubbed plant and two thirds of that fee comes back with it. Fit your worst offenders first: the biggest burners, and any plant upwind of housing. A plant whose smog still reaches town once it's scrubbed needs moving, or a Carbon Capture Plant beside it later on.",
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
          text: "You can now unlock the Carbon Capture Plant!\n\nUnlock it from the Research Station MK3. Unlike a scrubber, it's a building of its own, and it does two jobs while it has power:\n\n• It captures half the emissions of every polluting plant within 40 tiles. That comes straight off the carbon tax, and once the city is back under its 12-unit allowance the approval hit for dirty plants goes too. So where it stands is what it's worth: build it right beside your dirtiest plants. The ring shown while placing marks its reach, and a second plant overlapping the first takes half of what's left.\n\n• It pulls smog out of the air in that ring too, strongest right beside it.\n\nIt draws 120 kW and has an upkeep of its own, and it stops capturing the moment it loses power. Pair it with scrubbers: they shrink what each plant puts out, and capture takes half of the rest.",
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
          text: 'You can now unlock a new power generator: Solar Panel MK1!\n\nSolar panels require sunlight to generate power. They do not work at night.\n\nOutput scales with the sun\'s position, peaking at 7.5 kW around solar noon and tapering to 0 kW by night. (0-7.5 kW)\n\nKeep in mind that some weather events will affect solar power generation.\n\nClick on the Research Station to unlock it.\n\nNOTE: The sun shines from the south (the bottom of the map), so a panel shades the row of panels just north of it. Side by side is fine; leave two empty rows between one row of panels and the next. Shadows reach farther when the sun is low: early, late and in winter.',
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
          text: 'You can now unlock your third form of power generation: Wind Turbine MK1\n\nWind causes the turbine to spin, generating power.\n\nWind speeds change throughout the day so its power output varies. (5-12.5 kW)\n\nNOTE: Wind turbines placed right next to each other share the same grid, with no wires needed between them. Only one of them has to be wired in.',
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
          text: "You can now unlock Battery Block!\n\nThese are extremely useful for storing excess grid power.\n\nEspecially useful at night when solar power is down.\n\nEach one stores 50 kWh and can release it at up to 50 kW.\n\nEach one placed stacks power storage capability as long as they're connected to the same grid.\n\nClick the Research Station to unlock it.",
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
          text: 'Check the Research Station. You can now unlock the Fishing Pole!',
          highlight: T.FISHINGPOLE,
          manual: true,
          check: () => Progression.isUnlocked(T.FISHINGPOLE),
        },
        {
          text: "You might be wondering what you need a fishing pole for.\n\nWell, fish contain oil which can be extracted from them to collect biofuel! Fish will contain much more biofuel than trees and bushes.\n\nTo use it, find a body of water. When you do, hold down LMB within 3 tiles of the water to cast the line.\n\nNOTE: If you can't find any water, press M to open the map.",
          manual: true,
          highlight: T.FISHINGPOLE,
        },
        {
          text: "Go ahead and catch your first fish!",
          // The next card talks about the fish you caught, so this waits for
          // one — but it can be closed, for a player who'd rather not fish.
          dismissable: true,
          check: () => FishingSystem.hasCaughtAny(),
        },
        {
          id: 'fishreward',
          text: "You can see that you have extracted biofuel from the fish. You also got some money for it!\n\nThe more rare the fish, the more biofuel and money you'll collect. Sometimes if you're unlucky, you'll catch junk which yields 0 biofuel.\n\nWe'll leave it at that for now.\n\nKeep your grid online by fishing and cutting plants until you've unlocked your next power generator.",
          manual: true,
        },
        {
          text: "Tutorials will be added to your compendium, along with everything else you unlock/discover in the world.\n\nOpen the compendium anytime to review tutorials or if you need information on items in the game.",
          manual: true,
          highlightDom: ['btn-compendium'],
        },
      ],
    },
    {
      id: 'commercial',
      title: 'Going Commercial',
      trigger: () => HouseRequestSystem.hasCommercialRequestFired(),
      steps: [
        {
          text: "Your city has grown enough to start attracting Commercial customers!\n\nAccepting your first commercial customer will form a COMMERCIAL ZONE separate from the RESIDENTIAL ZONE.\n\nClicking on a commercial property will give you information about its economics, power draw and hours of operation.\n\nCommercial properties typically require more power than residential properties.",
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
          text: "Your geothermal power is running, and heavy industry has taken notice!\n\nAccepting your first industrial customer will form an INDUSTRIAL ZONE separate from the RESIDENTIAL and COMMERCIAL ZONES.\n\nIndustrial properties typically require more power than commercial properties.",
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
        || (Progression.isUnlocked(T.CONVEYOR) && !Progression.isReady(T.COALGENERATOR) && !Progression.isUnlocked(T.COALGENERATOR)),
      steps: [
        {
          text: "Your Coal Mine has dug its first 500t, and you can now unlock the Conveyor Belt, along with the Storage Container.\n\nConveyor Belts run solid materials between buildings: a belt from the mine into a Storage Container keeps it digging. The Underground Belt unlocks with it, for tunnelling a belt under anything in the way.\n\nThe Coal Power Generator unlocks once 2,000t of coal has been mined, so this is a good time to lay the belt out to where it will stand.",
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
          text: "You can now unlock the Coal Power Generator, the heart of your first real production chain!\n\nIt needs coal from your Coal Mine, carried by Conveyor Belts, and water from a Water Extractor. Place the generator first: the Water Extractor and Pipes unlock as soon as one is down. Fully supplied, it puts 100 kW on your grid.\n\nA Coal Mine MK1 can feed nearly three generators at once.",
          manual: true,
          highlight: T.COALGENERATOR,
        },
        {
          text: "Three things to watch with coal.\n\nAsh Waste builds up as it burns; at 100% the generator shuts down until it's cleared. Waste management unlocks later.\n\nIt pollutes, and nearby satisfaction suffers if you overdo it.\n\nDeposits are finite, so check on your mines to avoid losing output.",
          manual: true,
          highlight: T.COALGENERATOR,
        },
      ],
    },
    {
      id: 'coal_water',
      title: 'Water Supply',
      trigger: () => Progression.isReady(T.WATEREXTRACTOR)
        || (Progression.isUnlocked(T.WATEREXTRACTOR) && !Progression.isReady(T.SOLIDSTORAGE) && !Progression.isUnlocked(T.SOLIDSTORAGE)),
      steps: [
        {
          text: "Your Coal Power Generator is placed, and it needs water. You can now unlock the Water Extractor.\n\nRequires power. Place it on a lake or river to draw water.\n\nPress R to rotate where the pipe output is facing.",
          manual: true,
          highlight: T.WATEREXTRACTOR,
        },
        {
          text: "Pipes unlock with it.\n\nRun pipes from a building that outputs liquids like the Water Extractor into a liquid input.\n\nEach generator drinks 10 units/s and an extractor only puts out 25, so one extractor keeps two generators running. Build another extractor for the third.",
          manual: true,
          highlight: T.PIPE,
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
          text: "Your Coal Generator gives off pollution while it burns.\n\nThe smoke builds up into smog around it and drifts downwind, clearing only slowly. Homes and businesses inside the smog have their satisfaction capped, and solar panels beneath it produce less power.\n\nIt smokes more in OVERDRIVE and less in ECO, and up to twice as hard when its Ash Waste backs up.\n\nBuild it well away from housing and downwind of it. Trees and parks soak smog up, so leave the woods standing between the plant and town. The world map's SHOW AIR POLLUTION toggle shows where it's going.",
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
          text: "You've unlocked EV Charging Station!\n\nNow that an EV Battery Factory is running, residential zones will start asking for somewhere to charge; the same zone-request path as Cell Towers and Fiber Hubs. You can only build a charger inside a zone that has requested one.\n\nIt gives a strong satisfaction boost and attracts higher-paying residents to future requests.",
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
          text: "You've unlocked Cell Tower!\n\nIt generates steady passive income once placed inside a zone that's grown large enough to need one, and also gives a modest satisfaction boost to everyone nearby.\n\nFiber Hub, unlocked later, is pure passive income with no satisfaction effect.",
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
          text: "You can now unlock Fast Travel!\n\nDouble-click anywhere on the World Map to instantly jump your camera there, instead of panning across the map.",
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
          text: "You can now unlock Oil Scan!\n\nJust like the Resource Survey Station, running a scan will reveal crude oil deposits hidden around the map.",
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
          text: "Pump Jack is now available to unlock!\n\nPump Jacks extract crude oil from a deposit; deposits will run dry over time.\n\nThe Liquid Storage Tank unlocks once " + OILSTORAGE_CRUDE.toLocaleString('en-US') + " units of crude have been pumped.",
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
          text: "Liquid storage tank unlockable!\n\nAll liquids can be stored inside to keep if you are producing excess beyond your needs. It can hold up to 1,000 units of any kind of liquid including oil or water.\n\nSimply connect a pipe from any liquid output into the Liquid Storage Tank input.\n\nNOTE: A tank locks to whichever liquid fills it first; keep oil, water, acid, and fuel on separate tanks.\n\nThe Oil Refinery unlocks once " + REFINERY_CRUDE.toLocaleString('en-US') + " units of crude have been pumped in total.",
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
          text: "Next step of the oil chain is available: Oil Refinery!\n\nOil Refinery converts crude oil into fuel oil.\n\nPipe your Pump Jack straight into the Refinery, or put a Liquid Storage Tank in between to stockpile crude for when the Refinery can't keep up.\n\nNOTE: Refining produces sludge waste. Once its waste buffer fills up, the Refinery stops producing until a truck hauls it away to an Oil Waste Processing Facility.",
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
          text: "You've refined enough oil into fuel to unlock your next power generator: Fuel Power Generator!\n\nSimply hook it up to your grid and connect your fuel output from your refinery to the input on the generator using pipes.\n\nIt outputs a strong 165 kW of power. Like the Coal Generator, it needs an external power source already wired into its network before it can start up; its own output can't bootstrap itself. The pipe from the refinery only carries fuel, not power, so a wire connection to your grid is still required separately.",
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
          text: "You can now unlock Waste Trucks!\n\nOnce a Coal Generator's Ash Waste hits 100%, it shuts down until it's cleared; a Waste Processing Facility will appear nearby once waste is high enough.\n\nAssign a truck to haul waste there, either by drawing a patrol route with the Path Tool or queueing destinations manually.",
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
          text: "The mayor has sent you a commission!\n\nCommissions are jobs from City Hall: connect customers, put up street lamps, bring a new kind of power online. Up to three can be open at once and a new one arrives every few minutes.\n\nThere is no deadline and nothing to hand in. The moment a commission's goals are met it pays out by itself: cash, +8 government approval, and a little lasting trust with the mayor.\n\nOpen the GOVERNMENT panel to see your open commissions and how far along each one is. The same panel lists the civic buildings the city is working toward, like a Town Hall. Those are built for you once your population and reliability are high enough, and then they need power.",
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
          text: "You can now unlock the Hauler!\n\nA Hauler is a cargo truck. It moves resources by road: ore, coal, fuel rods, crude, fuel oil, water and acid. It carries 200 units a trip, or 750 of a process gas in its tube trailer, one kind at a time, and never carries waste.\n\nTo use one, build a Storage Container, Liquid Storage Tank or Gas Holder where the material is needed, open it, and click REQUEST TRUCK SUPPLY to choose what it should be fed. Then place a Hauler. It runs by itself from there: it loads surplus from producers and from storage you have not flagged, delivers it, and refuels at Gas Stations.\n\nHaulers are slower and thirstier than Waste Trucks and need a road at both ends, so a belt or pipe is still cheaper where one will reach.",
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
          text: "A new civic building is being built in your city!\n\nThese aren't something you place yourself; the council puts them up as your population and grid reliability grow. A crew builds it first, faster if you run power to the site.\n\nOnce it's finished, it needs power just like City Hall. An unpowered civic building will hurt government approval, so keep it connected.",
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
          text: "A park has appeared in one of your residential zones!\n\nThese show up automatically as a reward once a zone grows large enough; no need to request or place them. They also do not require power.\n\nAs a thanks from the local government, these properties generate a bit of passive income for your company and help nearby houses recover satisfaction faster.",
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
          text: "You can now unlock Blueprints!\n\nDrag-select a group of placed buildings to save them as a blueprint, then stamp copies of that layout elsewhere; press R to rotate before placing.\n\nIt also unlocks Copy (Ctrl+C, or the Copy tile in the Function tab): drag over anything you've built to copy it, then click to paste it somewhere else. Ctrl+V pastes the last copy again.\n\nNOTE: Each stamp still costs full price per building. Trees, water, deposits, customers, Trucks, and Roads can't be captured.",
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
          text: "You can now unlock Uranium Scan and Sulfur Scan!\n\nJust like coal and oil, scanning reveals uranium and sulfur deposits. Mine both; the nuclear chain needs each.\n\nMine enough sulfur and you'll unlock the Chemical Plant.",
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
          text: "You can now unlock the Chemical Plant!\n\nThe Chemical Plant converts mined sulfur and piped-in water into sulfuric acid.\n\nThe Fuel Processing Plant then converts that acid together with mined uranium ore into fuel rods; the actual reactor fuel.\n\nProduce 800 fuel rods to unlock the Nuclear Reactor.",
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
          text: "You can now unlock the Nuclear Reactor!\n\nThe Nuclear Reactor burns fuel rods into steam and nuclear waste, but it does NOT feed your grid directly.\n\nThe reactor needs 20 u/s of cooled water at its COOL IN, or its steam output is cut to 40%. A Cooling Tower fed with water at its H₂O IN makes 15 u/s, so pipe two towers into each reactor. A Steam Turbine then converts that steam into 300 kW of real power.\n\n⚠ WARNING: A reactor without cooling heats up, and cutting its fuel rods won't stop it straight away. Let it reach critical and it melts down and EXPLODES, levelling everything around it. Keep its Cooling Tower powered and fed with water, and build it well away from your city.\n\nNOTE: Each reactor's steam budget only fully powers up to 3 turbines; build more reactors to run more.",
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
          text: "You can now unlock the Dam!\n\nBuild one across a river to form a reservoir, then place a Hydro Turbine partially submerged in it. The turbine makes mechanical rotation, not electricity.\n\nRun it for a while and you'll unlock the Drive Shaft and Hydroelectric Generator.",
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
          text: "You can now unlock the Drive Shaft and Hydroelectric Generator!\n\nDrive Shafts carry the turbine's rotation to a Hydroelectric Generator; the shaft chain must run unbroken, with no gaps, straight to the generator.\n\nThe generator's output scales with how fast the turbine is spinning, up to 235 kW. Once built, wire it into your grid like any other generator.",
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
          text: "A Nuclear Reactor is running hot enough to melt down!\n\nA reactor only stays safe while it's cooled and its steam has somewhere to go. Either failure starts the meltdown clock:\n\n• Heat: the water from its Cooling Tower stops (a burst pipe, a tower that lost power, an extractor running dry). Check the tower is powered and fed, and that its pipe still reaches the reactor's COOL IN.\n\n• Pressure: no Steam Turbine is drawing its steam (a broken steam pipe, no turbine left on the line). Pipe a working turbine to its STEAM OUT, or cut its fuel rods to vent the pressure.\n\nIf it goes, it doesn't just take itself out. It levels the neighbourhood around it.",
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
          text: "Six turbines at once. You've earned the MK4 Research Station!\n\nIt researches faster than the MK3 and opens the next era: reprocessing spent fuel, plutonium, and the Advanced Nuclear Reactor.\n\nPlacing it also gets the nation's attention. The National Government will set up in a new zone far out in the world, so be ready to run a long line out to it.",
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
          text: "Your reactors' spent fuel doesn't have to be waste.\n\nBelt it from a reactor's SPENT FUEL OUT into a Spent Fuel Pool to cool, then on to a Reprocessing Plant with a water pipe. Every unit becomes recovered uranium, plutonium and a little high-level waste.\n\nThe waste is trucked to the Nuclear Waste Processing Facility. Any full output stops the plant, so give the recovered uranium somewhere to go even if you only want the plutonium.",
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
          text: "You can now unlock Advanced Fuel Processing!\n\nIt blends plutonium back into uranium to make MOX fuel rods. Belt plutonium into one intake and uranium into the other. Recovered uranium and fresh ore both work, so a reprocessor that can't keep up can be topped up off an ore belt.\n\nMOX is what the Advanced Nuclear Reactor burns.",
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
          text: "You can now unlock the Cryogenic Cooling Tower!\n\nThe reactor that burns your MOX can't be cooled with ordinary cooled water. It needs Cryogenic Coolant, and this tower makes it.\n\nPipe cooled water from your Cooling Towers into its COOL IN. It needs 70 u/s, so five MK1 towers on one line, and nothing at all until it gets the full amount. Wire it up too: it draws 110 kW.\n\nOnce it's running on power and cooled water, the Advanced Nuclear Reactor unlocks.",
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
          text: "You can now unlock the Advanced Nuclear Reactor!\n\nIt burns MOX rods and raises enough steam for twelve Steam Turbines, four times a standard reactor on the same burn rate.\n\nIt needs Cryogenic Coolant, not ordinary cooled water. Pipe your Cryogenic Cooling Tower's CRYO OUT into the reactor's CRYO IN before you load any rods. One Cryogenic tower is enough for one reactor.",
          manual: true,
          highlight: T.ADVREACTOR,
        },
        {
          text: "☢ READ THIS BEFORE YOU BUILD ONE ☢\n\nA MOX core is far less forgiving than a uranium one. Lose its cooling and it goes critical in seconds, not minutes.\n\nWhatever you've seen a standard reactor do, this is worse. An Advanced Reactor meltdown has EXTREMELY CATASTROPHIC CONSEQUENCES, and there is no cleaning up after it.\n\nGive its Cryogenic Cooling Tower a reliable supply, keep that tower powered, and keep lightning away from all of it.",
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
          text: "You can now unlock the Drone Port!\n\nEach port is a 9×9 vertiport with ten autonomous drones. They fly straight lines with no roads and no fuel, at more than twice a truck's speed, but only inside the port's square of coverage (220 tiles across).\n\nPorts whose radii touch join into one network, and a drone can work anywhere in it, topping up at the ports it passes. A chain of ports covers a district. Long haul is still a truck job.\n\nDrone Ports can also be placed from the World Map: select the Drone Port and click a spot on the map, which makes a long chain easy to lay out.\n\nA port costs $300,000 and $60/s to run.",
          manual: true,
          highlight: T.DRONEPORT,
        },
        {
          text: "Drones pick their own work. In order, they:\n\nREPAIR anything damaged by lightning, fire or a blast. You still pay the normal repair cost. The drone stays on the building until it is fixed, and the repair runs 60% faster while it is there; it will fly to a repair you started yourself and speed that up too.\n\nSERVICE LINES running in the yellow, between 80% and 100% of their rating, which cuts the chance of a fault. A line over its rating still fails; only more capacity fixes that.\n\nSHAVE WASTE off a coal generator, refinery or reactor that is about to stop: they start at 85% full and stand off again under 70%. That buys time; it does not replace the waste trucks.\n\nFLY CARGO to storage. Open a Storage Container, Liquid Storage Tank or Gas Holder and click REQUEST DRONE SUPPLY to choose what it should be fed. Drones fetch it from producers and unflagged storage in the same network, so a bin beside a plant feeds that plant with no belt or pipe between them.",
          manual: true,
          highlight: T.DRONEPORT,
        },
        {
          text: "What holds the fleet back:\n\nPOWER. A port idles at 40 kW, but every drone recharging on its pad adds up to 30 kW, so a fleet landing empty pulls 340 kW, usually right after a big repair push. An unpowered port cannot launch.\n\nBATTERY. A drone carries 66 seconds of flight, enough to reach anything inside its port's coverage square in ordinary weather, and turns for a pad while it can still reach one.\n\nWEATHER. Storms, rainstorms and blizzards slow drones to half speed or less, so every job takes longer. They clean up after lightning; they can't stop it. Light rain is fine. A cold snap cuts their range by 30%, and a heat wave halves how fast they recharge.\n\nThe drone button beside the truck button opens the fleet roster: what each port is doing, and why one isn't flying.",
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
          text: "You've reached the final tier; the MK5 Research Station!\n\nThis unlocks a long chain of processing buildings: Electrolyzer, Lithium Mine, Atmosphere Collector, Haber-Bosch Complex, Isotopic Wash Tower, and Fusion Fuel Plant; each turning one resource into the next, ending in frozen fusion fuel pellets.\n\nIt starts with the Fusion Research Facility, which has just arrived in the National Government Zone. Keep it powered through its plasma shots: once it achieves fusion, the Electrolyzer unlocks.\n\nIt's a lot, but you've already mastered chains like this with oil and nuclear.",
          manual: true,
        },
        {
          text: 'Make D-T Fuel Pellets (bank them in Storage Containers) and you\'ll unlock the Helium Scan.\n\nThe Fusion Reactor\'s magnets need liquid helium, so its cooling comes first: scan for a helium gas field, put a Helium Well on it, and extract enough helium to unlock the Cryo Plant, banking it in Gas Holders. Once your Cryo Plant is producing liquid helium, the Fusion Reactor unlocks.',
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
          text: "You can now unlock the Fusion Reactor!\n\nThe Fusion Reactor burns D-T fuel pellets; deuterium plus tritium. Tritium barely exists in nature, so the reactor breeds its own: belt Lithium Compound into its Li COMPOUND IN and pipe TRITIUM OUT back to the Fuel Plant. Until it is running, a Tritium Breeding Facility piped to the Fuel Plant's TRITIUM IN starts the loop.\n\nIts magnets need liquid helium (LHe): pipe your Cryo Plant's LHe OUT into the reactor's LHe IN.\n\nOnce its magnets are cold it takes a 5 MW surge to ignite. Like the Nuclear Reactor it makes steam, not power; pipe it to Steam Turbines (twenty of them) for about 6 MW.\n\nLater, once helium-3 is flowing, the Fuel Plant also makes D-He3 pellets alongside the D-T ones, fuel for the Advanced Fusion Reactor.",
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
          text: "This is the Fusion Research Facility. It researches fusion one plasma shot at a time.\n\nEvery half hour from 09:00 to 18:00 it fires a shot that pulls 1 MW (it idles at 280–430 kW the rest of the time).\n\nA shot that stays powered the whole way through is a GOOD SHOT. One that browns out is ABORTED and counts for nothing.\n\n45 good shots achieve fusion and unlock the Electrolyzer. With a grid that can carry every spike, that's about two and a half days.",
          manual: true,
          highlightWorld: () => _fusionLab(),
          onEnter: () => _jumpTo(_fusionLab()),
        },
        {
          text: "Track the programme on the facility itself: the holographic ring round the tokamak fills with every good shot, and the control board keeps the count.\n\nClick the facility for the exact count.\n\nSize your supply for the 1 MW spikes, not the idle draw. Batteries and substations are a good way to cover them without building a whole new power plant.",
          manual: true,
          highlightWorld: () => _fusionLab(),
        },
      ],
    },
    {
      id: 'fusionabort',
      title: 'Shot Aborted',
      trigger: () => { const v = _fusionV(); return !!(v && v.researching && v.lastFailed && v.everPowered); },
      steps: [
        {
          text: "A plasma shot just browned out and was aborted.\n\nThe facility needs its full 1 MW for the whole shot. If the grid can't deliver it, the shot counts for nothing and the research doesn't move.\n\nAdd generation, or store power in batteries and substations to cover the spikes. Every aborted shot is half an hour of research lost.",
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
          text: "The fusion programme has hit its first milestone!\n\nMilestones land at 25%, 50% and 75%. Each one lights a beacon on the facility's progress ring.\n\nKeep the shots coming.",
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
          text: "The Fusion Research Facility is only a couple of good shots from ignition!\n\nThis is the most fragile part of the programme: if the facility loses power now, the experiment in progress is ruined and you lose 2 good shots of data.\n\nKeep it powered until it ignites. You'll know when it does.",
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
          text: "Fusion achieved! The Electrolyzer is ready to research at your MK5 Research Station.\n\nThe Fusion Research Facility isn't finished yet. It keeps firing shots, and every good one now cuts the remaining fusion-chain goals (hydrogen, lithium, nitrogen and the rest) by 1%, up to 20%.\n\nThe gold ring round the tokamak shows how far it has got. Keep it powered and the whole fusion chain gets quicker to climb.",
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
          text: "You're in the final stretch.\n\nOperation Hyperion is all that stands between your city and powering the nation, and it will need a lot of power: 10 MW commissioning surges, then 20 MW around the clock, then 30 MW for a full day with no coal or oil running.\n\nMore reactors will get you there, but there is a better way to grow.",
          manual: true,
        },
        {
          text: "Field Cores make the reactors you already have run harder. A core is a cartridge of superconducting magnet windings: up to three in a Fusion Reactor or Advanced Fusion Reactor add +50%, +30% and +20% output, for a little more fuel.\n\nThe chain opens a step at a time. Burn 100 D-He3 pellets in an Advanced Fusion Reactor to unlock the Rare Earth Scan; the Leach Plant follows at Hyperion Stage II, the Superconductor Mill at Stage III and the Core Works at Stage IV.\n\nStart mining rare earths early, so the ore is banked when each step opens.",
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
          text: "This is the Core Works. It winds HTS tape into Field Cores and charges them.\n\nBelt tape from your Superconductor Mills (or a Storage Container banking it) into TAPE IN on its bottom face.\n\nIt has four bays and charges one core at a time: 4 in-game hours at 800 kW (100 kW idle). A spent core is always recharged first, for 28 tape (56 if it quenched). Otherwise it winds a new core into an empty bay for 120 tape.\n\nClick it to set OFF-PEAK CHARGING, which charges only from 22:00 to 06:00, or turn WIND NEW CORES off so it only recharges.",
          manual: true,
          highlightWorld: () => { for (const e of EntityRegistry.getByType(T.COREWORKS)) return e; return null; },
          onEnter: () => { for (const e of EntityRegistry.getByType(T.COREWORKS)) { _jumpTo(e); break; } },
        },
        {
          text: "Cores never ride a belt. Drones and Haulers carry them out to your Fusion and Advanced Fusion Reactors, and bring the spent ones back.\n\nClick a reactor and choose how many cores it should run, up to 3: +50%, +30% and +20% output, for 0.7x that boost in extra fuel. A starved reactor loses the boost first, never its base output.\n\nA core lasts 24 in-game hours of running. Each one installed boils off 1.5 liquid helium a second, so give the reactor's cryo line headroom. A quench takes every core in the reactor down with it.\n\nRule of thumb: 3 Core Works keep 12 cores charged, enough for 4 reactors running 3 each.",
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
          text: "You can now unlock the Gas Holder!\n\nThe fusion chain's unlock goals are bigger than any producer's own buffer, and a full buffer stops production, so you have to bank the surplus.\n\nA Gas Holder stores 5,000 units of one gas. Pipe the producer into GAS IN and GAS OUT on to whatever uses it; plants fed straight off the producer come first and only the spare is banked.\n\nStorage Containers do the same for solids. Neither needs power.",
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
          text: "You can now unlock the Cryo Plant!\n\nThe Fusion Reactor holds its plasma with superconducting magnets, and they only work at about 4 K. The Cryo Plant liquefies helium to keep them there.\n\nPipe helium gas from your Helium Wells into HE IN. As soon as it produces liquid helium (LHe), the Fusion Reactor unlocks.\n\nThen pipe LHe OUT into the reactor's LHe IN. The reactor's HE ASH OUT can be recycled back in too.\n\nKeep it powered. An outage can trip its compressors, the magnets warm the whole time, and at 9 K they quench.",
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
          text: "You can now unlock the Advanced Fusion Reactor and the MHD Decelerator Ring, the top of the fusion chain!\n\nD-He3 fuel releases its energy as charged particles instead of neutrons, so the ring can turn it straight into electricity. No steam, no turbines: 4 MW from a single ring, and one Advanced Fusion Reactor feeds four.\n\nBelt the D-He3 pellets from your Fuel Plants' D-He3 OUT (and the ones you've banked) into the reactor's PELLETS IN, and pipe its ION OUT ports into the rings. It needs serious cooling: two or three Cryo Plants on its magnets, and two Cryogenic Cooling Towers on CRYO IN.",
          manual: true,
          highlight: T.MHDRING,
        },
        {
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
          text: "The National Government has arrived!\n\nThe National Government Center has founded a new government zone far out in the world. It needs power like any civic building, and leaving it dark hurts your approval. You'll have to run a line all the way out there; Power Towers make it much easier.",
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
          text: "Something is happening in the National Government Zone.\n\nThe Ministry of Energy has fenced off a site there and opened a sealed file on your company. Nobody will say what it is for, or even what it's called.\n\nThe ◈ CLASSIFIED button in the top bar is the file. Right now almost every line is blacked out.\n\nKeep climbing. The Ministry will be in touch once your fusion programme proves itself.",
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
          text: "Operation Hyperion is the end of the road: build Hyperion Station, tie the nation's grid to yours, and power the whole country from your city.\n\nIt runs in five stages, each harder than the last. The ◈ HYPERION button in the top bar opens the dossier with every requirement and your progress.\n\nGround breaks the day your first Fusion Reactor ignites.",
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
          text: "Your Fusion Reactor is burning, and Hyperion Station has broken ground!\n\nThe Ministry wants proof the burn holds: burn 500 pellets in Fusion Reactors while the station's site has power. The station's base and cranes go up as you do.\n\nRun power out to the site. It only needs 500 kW for now, but that won't last.",
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
          text: "Construction on Hyperion Station can resume!\n\nTo raise it you need to:\n• Commit $2.5M of funding (the button in the dossier)\n• Burn 1,000 D-He3 pellets in an Advanced Fusion Reactor\n\nThe station rises as you go: concrete, steel and the halls.",
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
          text: "The station stands. Now its converters have to be commissioned.\n\nEvery hour, day and night, Hyperion Station fires a 10 MW commissioning surge. A surge that stays powered the whole way counts; one that browns out is aborted.\n\n24 good surges bring it online.\n\nThat is a lot of power arriving all at once, and the line out to the station has to carry it. Batteries and substations near the station will help.",
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
          text: "The nation's grid is ready to tie in to yours, on your signal.\n\nOnce you press INITIATE STAGE IV in the Hyperion dossier, the station draws 20 MW around the clock: that is the country running on your power. While the line is up it pays 5× your city's net income, after every deduction (the final day's 30 MW pays 7.5×), so keep the city in profit: a city running at a loss earns nothing from it.\n\nThen hold it for two full days. Every time the station loses power, the national grid trips and you lose an hour of progress.\n\nNothing happens until you press INITIATE, so build first. The dossier's Ready check shows how much your grid has to spare at its tightest hour: you want 20 MW and a little over. Power Towers, not wires, for a load this size.",
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
          text: "The final day.\n\nThe nation wants 30 MW, and it wants it clean. For 24 hours:\n• Keep Hyperion Station powered at 30 MW\n• No Coal or Fuel Generators anywhere on the map\n• City Score of 70 or better\n• $5M of Wind Turbines, Solar Panels and Hydro (Dams, Hydro Turbines, Hydroelectric Generators) standing (what they cost to build)\n\nProgress only moves while all four hold.\n\nThe station stands by until you press INITIATE STAGE V in the Hyperion dossier. Its Ready check shows all four, so get them green first.\n\nThis is it. Finish the day and the country is yours.",
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
      if (_isSeqDone(seq) || seq === activeSeq || parked.some(p => p.seq === seq)) continue;
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
  function _stepText(step) {
    if (_padOn() && step.padText) return step.padText;
    if (_touchOn() && step.touchText) return step.touchText;
    const txt = typeof step.text === 'function' ? step.text() : (step.text || '');
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
      const chev = document.createElement('span');
      chev.className = 'tut-fold-chev';
      chev.textContent = '⌄';
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
      card.appendChild(text);
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
    if (skipped) return;

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

  // Options-menu toggle. Turning tutorials back on re-triggers eligibility
  // checks from scratch next tick — any not-yet-finished sequence (including
  // a partially-seen 'intro') resumes right after its furthest-shown step.
  function setEnabled(v) {
    skipped = !v;
    if (!skipped) { activeSeq = null; stepIdx = 0; parked = []; }
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
        notes.push({ index: i, text: _stepText(step) });
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

  function serialise() {
    return {
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
    };
  }

  function loadState(d) {
    if (!d) return;
    completed = new Set(d.completed || []);
    skipped   = !!d.skipped;
    furthestStep.clear();
    (d.furthestStep || []).forEach(([id, idx]) => furthestStep.set(id, idx));
    const seq = d.activeSeqId ? SEQUENCES.find(s => s.id === d.activeSeqId) : null;
    if (seq) {
      activeSeq = seq;
      stepIdx   = Math.min(Math.max(0, d.stepIdx || 0), seq.steps.length - 1);
      const st  = seq.steps[stepIdx];
      _dismissedStep = d.dismissed && st && st.dismissable ? st : null;
    } else {
      activeSeq = null;
      stepIdx   = 0;
      _dismissedStep = null;
    }
    parked = (d.parked || []).map(([id, i]) => ({ seq: SEQUENCES.find(s => s.id === id), stepIdx: i | 0 })).filter(p => p.seq);
    _render(); // reflect the resumed step immediately rather than waiting on the next check-passing tick
  }

  function reset() {
    completed = new Set();
    skipped   = false;
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
