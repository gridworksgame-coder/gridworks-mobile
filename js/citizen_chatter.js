/* ═══════════════════════════════════════════════════════════════════
   CITIZEN CHATTER
   Now and then a speech bubble rises from a home, a shop, a works or a
   civic building on screen: what the people in it are saying about their
   power, their zone, the weather and the season. A feel for the city's
   mood, never a warning on its own (the real warnings stay where they are).

   Sparing by design: only zoomed in close enough to see the buildings
   (CHAT_ZOOM), at most MAX_ON_SCREEN at once, one every GAP_MIN..GAP_MAX
   real seconds, only at normal speed (not paused, not fast-forwarding), and a building that just spoke
   waits a while before it speaks again. Options → Citizen Chatter turns it
   off (localStorage, per player).

   What a building says comes from its own state first (no power, a long
   outage, about to leave, smog on the doorstep, delighted with its
   service), then the day's weather, the season, the hour, the Hyperion
   project, or just life in that kind of zone.

   Now and then two people out in the zone talk to each other instead: a
   short exchange of two or three lines, taking turns (DIALOGUES).
   ═══════════════════════════════════════════════════════════════════ */
const CitizenChatter = (() => {
  const KEY = 'gw_citizen_chatter';
  const CHAT_ZOOM = 0.6;          // 60% zoom: further out, none are shown or started
  const CHAT_ZOOM_FULL = 0.65;    // fully shown from here (a short fade in between)
  const MAX_ON_SCREEN = 2;
  const GAP_MIN = 12, GAP_MAX = 26; // real seconds between bubbles
  const LIFE = 5.2;               // seconds a bubble stays
  const QUIET_FOR = 90;           // seconds before the same building speaks again
  const RECENT_LINES = 150;       // lines not repeated until this many others have been said

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
        icing: ["Ice on every cable out there.", "Careful, the path's like glass."],
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

  // More of everything, so that over a long session a line comes round
  // again only rarely. Merged into LINES at start-up, like WEATHER_MORE.
  const LINES_MORE = {
    residential: {
      outage: [
        "Microwave clock's blinking 00:00 again.", "Told the kids it's 'camping night'.", "Ice cream's melting in the freezer!",
        "The whole street's dark.", "Can't even boil the kettle.", "Board games by torchlight, I suppose.",
        "Did we forget to pay the bill?", "Dog's barking at the dark.", "Heating's off. Coats on.",
        "Neighbour's got candles, going round.", "Laptop died mid-email.", "Shower's gone cold!",
        "Baby monitor's off. Panic.", "Is it just us, or the whole road?", "Torch batteries are flat too, brilliant.",
      ],
      longOutage: [
        "Throwing out the whole freezer.", "Kids are doing homework by candlelight.", "Charging phones in the car.",
        "Day two in the dark.", "Our street's been forgotten.", "Gran's staying with us, her place is dark too.",
        "Everything in the fridge is off.", "Thinking of buying a generator.", "We've had more blackouts than hot dinners.",
      ],
      leaving: [
        "Estate agent's coming round Tuesday.", "Mum says move back home.", "We've stopped unpacking, honestly.",
        "Rent's not worth it with these blackouts.", "Even the cat wants to move.",
      ],
      smog: [
        "Coughing all night.", "Asthma's playing up.", "Clouds don't look like that normally.",
        "Car's covered in black dust.", "Kids drew a grey sun at school.", "Air smells of chemicals.",
      ],
      happy: [
        "Not a single blackout this year.", "Electric bill was lower than I thought!", "Proud of this little town.",
        "Charged the car overnight, no problem.", "Power's so reliable I forgot where the torch is.",
        "Love the street lamps at night.", "Kids can do homework any time now.", "Best decision, moving here.",
        "Can't remember the last outage.", "Neighbours are lovely, power's steady.", "Heat pump runs like a dream.",
      ],
      season: {
        Spring: ["Lambs in the fields again.", "Daffodils everywhere!", "Hay fever's back, ugh.", "Lighter mornings, finally.", "Planting the veg patch.", "Easter egg hunt in the garden!", "Window open for the first time this year."],
        Summer: ["Barbecue smoke over every fence.", "Kids are bored already. Six weeks to go.", "Sunburnt nose, again.", "Wasps at the picnic.", "Sprinklers going all evening.", "Off to the coast this weekend.", "Too hot for the dog to walk."],
        Autumn: ["Conkers! The kids are obsessed.", "Clocks go back this weekend.", "Fireworks from next door all week.", "Raking leaves into a pile, kids jumping in it.", "Soup season, at last.", "Heating's on for the first time."],
        Winter: ["Snow forecast! Kids are hopeful.", "Advent calendar's half empty already.", "Carol singers at the door!", "Cosy blanket, cup of tea.", "Ice on the windscreen again.", "New Year's resolutions: none.", "Dark at four o'clock."],
      },
      morning: ["Burnt the toast. Again.", "Bus is late.", "Can't find my keys!", "Dog walk before work.", "Packed lunches, done.", "Who's using all the hot water?", "Morning jog, the neighbours are watching.", "Paper boy's early today.", "Sunrise was gorgeous.", "Five more minutes…"],
      evening: ["Takeaway night!", "Homework first, then telly.", "Sunset over the rooftops.", "Walking the dog before dark.", "Family dinner, phones away.", "Bath, story, bed.", "Neighbours are having a barbecue.", "Washing up, again."],
      night: ["Owl's hooting outside.", "Teenager's still up gaming.", "Stargazing in the garden.", "Midnight snack time.", "Fox in the bins again.", "Quiet as anything tonight.", "Can hear the trains in the distance.", "Lights out, early start."],
      hyperion: ["Saw the station on telly!", "Kids think we live next to a spaceship.", "Tourists asking for directions to Hyperion.", "My nan cried at the ceremony."],
      flavour: [
        "Who keeps stealing our parcel?", "Learning to knit. Badly.", "The kids want a puppy.", "Car boot sale this Sunday.",
        "The neighbour's peacocking his new car.", "Book's due back at the library.", "Fundraiser cake sale at the school.",
        "Found a twenty in my coat!", "Kids are selling lemonade.", "New bike for the birthday.", "Painting the fence blue.",
        "Pub quiz tonight. We'll lose.", "The cat brought in a mouse.", "Wi-Fi's slow. Someone's streaming.", "Grandad's telling the war story again.",
        "Garden gnome's gone missing.", "Our street won 'best kept'!", "Bake-off in the kitchen tonight.", "Netflix password, anyone?",
        "Kids built a den in the lounge.", "Parking wars on the cul-de-sac.", "Who left the gate open?", "First tooth came out tonight!",
        "Started a vegetable patch.", "Getting the chimney swept.", "Neighbours' kid is learning trumpet.", "Ordered too much pizza.",
        "Dad's attempting DIY. Pray.", "Gardening club meets Thursdays.", "Sleepover tonight. Chaos.", "Shed's a mess.",
        "New curtains, finally.", "Bird feeder's a hit.", "Is that a hedgehog?!", "Kids' football match at ten.",
        "Christmas lights still up from last year.", "Borrowed the neighbour's ladder. Three years ago.", "Cat's sleeping in the washing basket.",
        "Wedding invite on the fridge.", "Home-made jam, anyone?", "Can't get the barbecue lit.",
      ],
    },
    commercial: {
      outage: ["Lights out, mid-sale!", "Card readers frozen.", "Fridges defrosting!", "Customers using phone torches.", "Coffee machine's dead.", "Security shutters won't open!", "Lift's stuck. Somebody's in it."],
      longOutage: ["Binned a week of stock.", "Staff sent home again.", "Customers are going elsewhere.", "Writing a strongly worded letter.", "We can't open without power, can we?"],
      leaving: ["The landlord wants to know if we're staying.", "Thinking of going online only.", "Moving to the retail park outside town."],
      smog: ["Takings are down, nobody's out.", "Customers are in and out fast today."],
      happy: ["Queue out the door today!", "Five-star reviews all week.", "Staff bonus this month!", "Fully booked tonight.", "Regulars keep coming back.", "Tills ringing all day.", "Best location in town.", "Expanding into next door!", "Rent's fair, power's solid, customers happy."],
      season: {
        Spring: ["Easter rush is on!", "Fresh flowers selling out.", "New season stock just arrived.", "Patio furniture's flying off."],
        Summer: ["Ice lolly freezer's empty.", "Tourists everywhere!", "Beach gear's selling fast.", "Outdoor seating's full."],
        Autumn: ["Pumpkin spice everything.", "Fireworks counter's busy.", "Umbrellas back on the shelf.", "Black Friday prep starts now."],
        Winter: ["Wrapping paper's sold out.", "Christmas jumpers, half price!", "January sale starts tomorrow!", "Late opening for the holidays."],
      },
      morning: ["Bread's just out of the oven.", "First coffee of the day served.", "Early birds queuing at the door.", "Unloading the morning delivery.", "Counting the float.", "Breakfast rush!"],
      evening: ["Evening rush!", "Dinner reservations full.", "Cashing up the tills.", "Staff meal before close.", "Late shoppers coming in.", "Lights down, music up."],
      night: ["Late-night munchies crowd.", "Takeaway's busiest after ten.", "Locking up for the night.", "Night shift stacking shelves.", "Neon's buzzing outside."],
      hyperion: ["Sold out of Hyperion postcards.", "Out-of-towners all week since Hyperion.", "Named a sandwich after the station."],
      flavour: [
        "Fixing the shop sign. Again.", "Someone left a dog tied outside.", "Mystery shopper today, look sharp!", "Two-for-one, today only!",
        "Restocking aisle seven.", "Barcode won't scan.", "Lost property box is overflowing.", "Coffee's on the house today.",
        "New menu launching Monday.", "The till roll's run out.", "Window cleaner's late.", "Customer wants to speak to the manager.",
        "Staff training day.", "Who ate the display cake?", "The bell on the door is broken.", "Card only, sorry!",
        "Mannequin's lost an arm.", "New hire's doing great.", "Gift cards make great presents!", "Parking's a nightmare out front.",
        "Shoplifter caught on camera!", "Pop-up stall in the car park.", "Loyalty card's nearly full!", "Sample Saturday, come try!",
        "Tasting menu tonight.", "The jukebox only plays one song.", "Hairdresser's booked solid.", "Florist's window is beautiful.",
        "Bakery smells amazing.", "New shoes for the shop window.",
      ],
    },
    industrial: {
      outage: ["Emergency stop! Grid's down!", "Conveyors frozen.", "Kilns cooling, this is bad.", "Pumps stopped!", "Robots just went limp.", "Night shift's in the dark."],
      longOutage: ["Penalty clauses kicking in.", "Customers are cancelling orders.", "Union's asking questions.", "Thinking of our own power plant."],
      leaving: ["HQ is reviewing this site.", "Board's visiting other towns.", "Can't stay if the lights won't."],
      smog: ["Our stacks aren't helping, to be fair.", "Even the yard dog's coughing."],
      happy: ["Order book's full!", "Zero downtime this month!", "New contract signed!", "Efficiency's never been better.", "Running three shifts now.", "Power's the cheapest it's been.", "Safety award this year!", "Exports doubled!"],
      season: {
        Spring: ["Spring maintenance week.", "Apprentices start Monday.", "Yard's drying out, finally."],
        Summer: ["Holiday cover's a nightmare.", "Hot one on the shop floor.", "Summer orders slowing."],
        Autumn: ["Peak season starts now.", "Overtime available, sign up.", "Stocking up before winter."],
        Winter: ["Christmas party's Friday!", "Cold start for the machines.", "Last orders before the shutdown."],
      },
      morning: ["Kettle's on in the break room.", "Clocking in, cold hands.", "Forklift's warming up.", "Morning safety check, done.", "Delivery trucks queuing at the gate."],
      evening: ["Handover to the night crew.", "Last truck out the gate.", "Wiping down the line.", "Locking the tool store."],
      night: ["Graveyard shift, here we go.", "Only the hum of the machines.", "Security's doing rounds.", "Night shift pizza's here."],
      hyperion: ["Our steel's in that station.", "Proud we built part of Hyperion.", "Hyperion contract paid for the new wing."],
      flavour: [
        "Who left a spanner in the machine?", "Pallet jack's broken again.", "Health and safety inspector today.", "New hi-vis jackets arrived!",
        "Break room microwave's disgusting.", "Shift swap, anyone?", "Toolbox talk at ten.", "Loading bay's chaos.",
        "Training the new starter.", "Smoko's over, back to it.", "Order's shipped on time!", "Overtime's paying for my holiday.",
        "Gaffer's in a good mood today.", "Machine three's making a noise.", "Inventory's off by six crates.", "Five-a-side after work?",
        "Lost my ear defenders.", "Fire extinguisher check.", "Fork's charging, take the other one.", "Steel toecaps, every time.",
        "Quality control's happy, for once.", "Coffee machine's broken. Riot.", "Delivery's three pallets short.", "Big order for the Hyperion site!",
        "Apprentice did well today.", "Who keeps parking in the fire lane?", "Shift bonus if we hit target.", "Robot arm's got a name now: Kevin.",
      ],
    },
    government: {
      outage: ["Council computers are down.", "Hospital's on backup power!", "Traffic lights out at the crossroads.", "Emergency line's on battery."],
      longOutage: ["Council's issuing a formal statement.", "Opposition's having a field day.", "Emergency committee meets tonight."],
      leaving: ["Residents are signing petitions.", "Council's losing the next election at this rate."],
      smog: ["Clean air zone, anyone?", "Health board's raising concerns."],
      happy: ["Budget surplus this year!", "Town's winning awards!", "Crime's down, approval's up.", "Grid report: excellent.", "Visitors' centre is busy!", "Mayor's beaming."],
      season: {
        Spring: ["Spring clean of the parks.", "Tree planting day.", "Election season's starting."],
        Summer: ["Summer fete committee meets.", "Park concerts approved.", "Hosepipe advice issued."],
        Autumn: ["Remembrance parade plans.", "Leaf clearing schedule's out.", "Fireworks display approved."],
        Winter: ["Gritting schedule published.", "Christmas lights switch-on tonight!", "Winter shelter funding approved."],
      },
      morning: ["Coffee before the committee.", "Inbox: 400 emails.", "Mayor's arriving at ten.", "Press office is buzzing."],
      evening: ["Late council session again.", "Paperwork for tomorrow.", "Last bus for the clerks."],
      night: ["Security guard's on his rounds.", "Night shift at the hospital.", "Lights on in the mayor's office."],
      hyperion: ["Hyperion's in the history books now.", "Royal visit for Hyperion?", "Statue of the founder by the station?"],
      flavour: [
        "Recycling scheme's working!", "Bin collection complaints.", "Town twinning visit next month.", "Library opening hours extended.",
        "New bus route approved.", "Council tax letters going out.", "Planning committee at two.", "Lost a stapler. Inquiry pending.",
        "Mayor's chain needs polishing.", "Ribbon for the new bridge.", "Public consultation tonight!", "Minutes from the last meeting… minutes.",
        "Parking permits, reissued.", "Speed bumps, approved.", "Blue plaque for the old bakery.", "Free parking on Sundays!",
        "School inspection went well.", "Pothole fund is empty.", "Census forms due soon.", "Statue cleaning day.",
      ],
    },
  };
  for (const zone of Object.keys(LINES_MORE)) {
    const into = LINES[zone], from = LINES_MORE[zone];
    for (const k of Object.keys(from)) {
      if (Array.isArray(from[k])) into[k] = [...(into[k] || []), ...from[k]];
      else for (const kk of Object.keys(from[k])) (into[k] || (into[k] = {}))[kk] = [...((into[k] || {})[kk] || []), ...from[k][kk]];
    }
  }

  // The funny ones, spread through the same situations.
  const LINES_FUNNY = {
    residential: {
      outage: [
        "Great, now I have to talk to my family.", "Turns out the kids can't read without a screen.", "Power's out. Husband thinks it's the end times.",
        "I'll just stare at the dark telly, then.", "We've reverted to the stone age. Cave's draughty.", "The dog thinks we're playing hide and seek.",
        "Grandma says 'in my day…' Not now, Grandma.", "Lit a candle. Smoke alarm went off. Somehow.", "Opened the fridge for light. Ate the cheese.",
      ],
      longOutage: [
        "We've started naming the candles.", "I've read more books this week than in ten years.", "Kids have forgotten what Wi-Fi is. Bliss, honestly.",
        "Neighbour's selling 'power-out survival kits'. It's a torch.", "My phone's been on 1% for two days. Respect.",
      ],
      leaving: ["Our house has a 'For Sale' sign and a 'Help' sign.", "Even the mice have moved out."],
      smog: ["Coughed so hard the cat moved out.", "I can chew the air today.", "The sky's in 'grey mode'."],
      happy: [
        "Power's so steady I've stopped trusting it.", "Haven't reset the oven clock in months. Living the dream.",
        "Lights on, kettle on, life sorted.", "I'd write a thank-you card, but who to? The pylons?",
      ],
      weather: {
        heatwave: ["Fried an egg on the patio. The neighbours were not impressed.", "The cat's lying flat like a rug.", "My ice lolly melted before I opened it."],
        coldsnap: ["So cold the dog asked for a jumper.", "My breath froze into a little cloud. Tried to wear it."],
        snowfall: ["Dad's snowman looks worryingly like the boss.", "The car's a snow sculpture now."],
        rainstorm: ["Saw a duck rowing a boat down our street.", "Garden's a swimming pool. Kids are thrilled."],
        storm: ["Wind took the washing. Somewhere, someone's wearing my socks.", "Trampoline's on its way to the next town."],
        rainfall: ["It's not raining, it's 'refreshing', says my optimist husband.", "The slugs are having a party."],
        fog: ["Waved at a neighbour. It was a bin.", "Walked into my own hedge."],
      },
      morning: ["Alarm went off. I went back to sleep. Alarm lost.", "Coffee first. Humanity later.", "Wore odd socks. Embracing it."],
      evening: ["Dinner is 'surprise pasta' again.", "We're watching the same film for the ninth time."],
      night: ["Something's in the bins. Probably a raccoon. Possibly my teenager.", "Snoring's measurable on the Richter scale."],
      flavour: [
        "Next door's cat thinks it lives here now. It might be right.", "I've named the pigeon on our roof. He's called Gary.",
        "My husband's 'quick' DIY job is entering year three.", "The kids found the 'off' button on the smoke alarm. Hammer.",
        "Neighbour's gnome collection has grown to 47.", "Bought a treadmill. It's a clothes horse now.",
        "Somebody's lawnmower at 7am on a Sunday. War.", "Is it rude to ask the neighbours to sing quieter in the shower?",
        "Kids asked where electricity comes from. I said 'the wall'.", "Found a sock behind the dryer. Not ours.",
        "Our dog has eaten three remotes this year.", "Bins go out tonight. The race is on.",
        "Started a podcast. Mum listens.", "The house plant I swore I'd keep alive: deceased.",
        "My smart fridge judges what I eat.", "Joined a gym. Visited once. Proud of it.",
      ],
    },
    commercial: {
      outage: ["Customer asked if the dark is part of the 'experience'.", "Selling candles. By candlelight. At full price.", "The tills are down but the gossip's flowing."],
      longOutage: ["We're now a 'heritage shop'. No electricity, very authentic.", "Our shop's closed. Our rival's shop's closed. Fair, at least."],
      happy: ["Business so good I'm learning to spell 'profit'.", "The till rings more than my phone."],
      weather: {
        heatwave: ["Customer came in just to stand by the freezer. Charged rent.", "Our chocolate fountain is now a chocolate puddle."],
        rainstorm: ["Sold an umbrella to a man already holding one.", "Customers are 'browsing'. They mean 'hiding from rain'."],
        snowfall: ["Someone tried to pay with a snowball."],
      },
      flavour: [
        "Customer asked if the display cake was free. It's plastic.", "Somebody tried to haggle on a 99p item.", "A man returned a ladder. Said it 'went too high'.",
        "Yes, we're open. The sign saying 'open' was the clue.", "Customer asked for the manager. I am the manager. And the cleaner.",
        "Our 'back in five' sign has been up since Tuesday.", "Someone bought one grape. One.", "The shop cat has more fans than me.",
        "Mystery shopper rated us 'mysterious'.", "Sold a 'genuine antique'. It's from last year.",
        "Lady asked if the free samples were free.", "Our competitor's sign says 'best in town'. Ours says 'better than them'.",
      ],
    },
    industrial: {
      outage: ["Machine's off. First time it's been quiet since 1998.", "Power's out. The foreman's yelling at a light switch."],
      longOutage: ["We're running the factory on hopes and coffee.", "Started pedalling the conveyor. Doesn't work."],
      happy: ["Machines are running so smooth, we're suspicious.", "Production's so high, we're running out of 'record' stickers."],
      weather: {
        heatwave: ["Forklift's sweating. So am I.", "Cooked a pasty on the exhaust manifold."],
        storm: ["The roof's making noises it shouldn't."],
      },
      flavour: [
        "Kevin the robot arm waved at me. I think.", "Safety sign says 'think'. Most of us don't.", "Someone labelled the vending machine 'Most important machine'.",
        "Bob's hard hat has stickers on it. Bob's 50.", "Lost my wrench. Found it in a sandwich.", "The forklift's called 'Lightning'. It isn't.",
        "Days without an accident: 3. Previous record: 4.", "The new guy asked where the 'left-handed spanners' are. Ha.",
        "Ear defenders on, wife's voice off. Bonus.", "Boss says 'teamwork'. We all heard 'overtime'.",
      ],
    },
    government: {
      outage: ["Council meeting by candlelight. Feels medieval.", "The mayor's speech was cut short. Nobody complained."],
      longOutage: ["Formed a committee to look into forming a committee on outages."],
      happy: ["Approval's so high the mayor's taking a selfie with the stats.", "No complaints this week. Nobody knows what to do."],
      flavour: [
        "Approved: new roundabout. Reason: we like roundabouts.", "Form 27B requires Form 27A first.", "The mayor's dog is chairing the meeting today.",
        "Public consultation: two people and a pigeon.", "Spent the budget on a statue of the budget.", "Somebody's complaint is just the word 'bins', underlined.",
        "The council's new motto: 'We'll look into it.'", "Opened a pothole. By accident. Ribbon cut anyway.",
      ],
    },
  };
  for (const zone of Object.keys(LINES_FUNNY)) {
    const into = LINES[zone], from = LINES_FUNNY[zone];
    for (const k of Object.keys(from)) {
      if (Array.isArray(from[k])) into[k] = [...(into[k] || []), ...from[k]];
      else for (const kk of Object.keys(from[k])) (into[k] || (into[k] = {}))[kk] = [...((into[k] || {})[kk] || []), ...from[k][kk]];
    }
  }

  // The National Government Zone: ministers, scientists, travellers,
  // soldiers, launch crews and Hyperion's engineers. Shared situations as
  // for the other zones, plus 'places': what the people of each landmark
  // say, keyed by its type.
  LINES.national = {
    outage: [
      "The Ministry's gone dark. In the middle of a briefing.", "Backup generators, now, please.", "Who cut the power to the capital?!",
      "Cabinet's meeting by torchlight.", "This will be in tomorrow's papers.", "Secure line's down. Use a carrier pigeon.",
      "The national grid's own capital, in the dark. Embarrassing.", "Somebody call {co}. Urgently.",
    ],
    longOutage: [
      "The Prime Minister wants answers on the outages.", "Questions being asked in Parliament.", "National embarrassment, frankly.",
      "Foreign delegation saw the blackout. Lovely.", "Emergency COBRA meeting about the power.", "{co} is summoned to the Ministry.",
    ],
    smog: ["The Environment Minister is NOT happy.", "Smog over the capital. On the news, obviously.", "Air quality report for the PM's desk."],
    happy: [
      "Grid's never been more reliable. Minister's thrilled.", "Ratings are up for the government.", "The capital runs like clockwork.",
      "Best-powered capital in the world, apparently.", "Foreign visitors are impressed by our grid.", "Budget's balanced, lights are on.",
    ],
    weather: {
      heatwave: ["Suits in a heatwave. Torture.", "Ties are optional today, says the Minister.", "Fans in every office of the Ministry."],
      coldsnap: ["The ceremonial guard is frozen solid.", "Heating the whole capital is costing a fortune."],
      snowfall: ["Snowball fight on the Ministry lawn!", "Snow on the flags along the promenade."],
      blizzard: ["The capital's snowed in.", "State of emergency declared."],
      rainstorm: ["The press pack is soaked.", "Rain's hammering the Ministry roof."],
      storm: ["Storm briefing for the PM.", "Flags are straining on their poles."],
      rainfall: ["Umbrellas at the press conference.", "Grey day in the capital."],
      fog: ["Can't see the end of the promenade.", "Fog over the capital, very moody."],
      smog: ["Masks for the honour guard."],
      geomag: ["Satellites are glitching, the aurora's out.", "Comms are a mess with this solar storm."],
      icing: ["Steps of the Ministry are like glass."],
    },
    season: {
      Spring: ["Budget season. The Treasury is sweating.", "State visit in the spring sunshine."],
      Summer: ["Parliament's off for the summer. Bliss.", "Summer garden party at the Ministry."],
      Autumn: ["Party conference season.", "The new session opens next week."],
      Winter: ["Holiday reception at the Ministry.", "Year-end figures for the PM."],
    },
    morning: ["Morning briefing in ten minutes.", "Early start for the capital."],
    evening: ["Late sitting in the chamber tonight.", "Long day in the capital."],
    night: ["Lights on in the Ministry all night.", "The capital's quiet tonight."],
    hyperion: [
      "Hyperion is the pride of the nation.", "The whole country's watching our station.", "World leaders keep asking about Hyperion.",
      "History's being made, right here.", "We're on every front page because of Hyperion.",
    ],
    flavour: [
      "Leaked memo. Again.", "Off the record? Everything's off the record.", "The spin doctors are spinning.",
      "Photo op at two, smile please.", "Who's briefing the press today?", "Another inquiry. Into the last inquiry.",
      "The Minister's lost his speech notes.", "Diplomatic incident at the canapés.", "Security's doubled for the summit.",
    ],
    places: {
      nationalgov: [
        "Cabinet meeting's overrunning again.", "The Minister wants the grid figures by noon.", "Press conference in five. Where's the Minister?",
        "Another reshuffle rumour.", "Treaty signing at three!", "The PM's motorcade is here.", "Red tape, as far as the eye can see.",
        "Opposition's calling for a vote.", "Our approval rating is printed on the wall. Ominous.", "The tea trolley is the real power here.",
        "Briefing paper's 400 pages. Summary, please.", "Foreign secretary's jet-lagged again.",
      ],
      fusionlab: [
        "Plasma held for 4.2 seconds! Champagne!", "Who put a sandwich in the cryo fridge?", "Magnets are humming nicely today.",
        "The tokamak's warming up.", "Peer review is brutal this week.", "Grant funding renewed! Phew.",
        "Someone wrote 'E=mc²' on the coffee machine.", "Stable plasma! For once!", "Night shift at the lab, more data.",
        "Lab coats, safety glasses, more coffee.", "The deuterium delivery is late.", "Breakthrough? Maybe. Check the numbers again.",
      ],
      airport: [
        "Gate change. Of course.", "Flight's delayed, grab a coffee.", "Last call for the 18:40 to the coast.",
        "Lost luggage desk is busy.", "Duty free, here I come!", "Window seat, finally.", "Security queue's a mile long.",
        "Welcome to {city}! Enjoy your stay.", "Planespotters are out on the fence.", "Boarding pass? It was right here…",
        "Tower, we are cleared for take-off.", "Jet lag's real.",
      ],
      militarybase: [
        "Drill at 0600. Again.", "Base is on backup power, that's not ideal.", "Boots polished, sir!", "Inspection's tomorrow, scrub everything.",
        "Mess hall's serving mystery stew.", "Radar's clear, all quiet.", "Leave starts Friday!", "The sergeant's in a mood.",
        "Hangar doors stuck again.", "Jets on the flight line.", "Parade rehearsal at noon.",
      ],
      launchcomplex: [
        "T-minus whenever the coffee's ready.", "Countdown paused: grid wobble.", "Fuelling the rocket now.", "Go for launch!",
        "Weather's green, range is clear.", "Payload's secured.", "Mission control's buzzing.", "Scrub. Again. Tomorrow, then.",
        "Watch the sky at six!", "Engines tested, all nominal.", "Astronauts are suiting up.", "That rocket's taller than the Ministry.",
      ],
      nationalgrid: [
        "Surge three held! Did you see that?!", "Whole country's watching us now.", "Switchyard's singing tonight.", "Interconnector is live!",
        "Load's climbing, hold steady…", "Hyperion's running hot. Good hot.", "Export meter's spinning!", "Every home in the country, through here.",
        "Pylons all the way to the horizon.", "Engineers on every shift now.", "The spire's glowing again.", "Hold the frequency, team!",
      ],
    },
    // The same landmarks by weather and by hour (only theirs say these).
    placeWeather: {
      airport: {
        heatwave: ["The runway's shimmering.", "Tarmac's too hot to stand on."], snowfall: ["Runway's being cleared of snow.", "De-icing queue's an hour long."],
        blizzard: ["Every flight's cancelled.", "Passengers sleeping in the terminal."], storm: ["All flights holding till the storm passes.", "Bumpy landing, that one."],
        fog: ["Fog's grounded every flight.", "Can't see the tower from the gate."], icing: ["De-icing every plane on the apron."], rainstorm: ["Planes are taxiing through puddles."],
        geomag: ["Pilots are reporting the aurora."],
      },
      launchcomplex: {
        storm: ["Launch scrubbed: weather.", "Lightning near the pad. Hold, hold."], fog: ["Can't see the launch tower in this."], icing: ["Ice on the gantry, launch delayed."],
        rainstorm: ["Range is red, rain's too heavy."], geomag: ["Solar storm! Satellites are glitching.", "Telemetry's full of noise, it's the aurora."],
        heatwave: ["Keep the fuel cool, it's baking."], blizzard: ["Rocket's wrapped up like a present."],
      },
      militarybase: {
        rainstorm: ["Puddles on the parade ground.", "Drill in the rain. Character building, apparently."], snowfall: ["Clearing the runway with shovels. All of us."],
        heatwave: ["Drill in full kit, in this heat?!"], storm: ["Jets in the hangars till it blows over."], fog: ["Radar's fine, eyes aren't."],
      },
      fusionlab: { heatwave: ["Cooling loop's working overtime."], coldsnap: ["The cryo plant loves this weather."], geomag: ["Solar storm's messing with our sensors."] },
      nationalgrid: { storm: ["Lightning near the switchyard, hold tight!"], icing: ["Ice on the national lines, watch the sag."], heatwave: ["Lines are running warm today."] },
      nationalgov: { rainstorm: ["The Minister's umbrella blew inside out on camera."], heatwave: ["Air conditioning in the chamber has failed. Of course."] },
    },
    placeTime: {
      airport: { morning: ["First flight's boarding.", "Early check-in queue's out the door."], evening: ["Last flight of the day."], night: ["Night flights only, quiet now."] },
      militarybase: { morning: ["Reveille on the base.", "Morning run, all of you!"], evening: ["Lights out at the barracks soon."], night: ["Night watch at the base."] },
      launchcomplex: { morning: ["Range opens at dawn."], night: ["Night launch tonight, look up!"] },
      fusionlab: { night: ["Night shift at the lab, more data."], morning: ["Overnight results are in!"] },
      nationalgov: { morning: ["Today's papers are on the Minister's desk.", "Red boxes on the desk at dawn."] },
      nationalgrid: { night: ["The spire lights the whole valley at night."] },
    },
  };

  // More for each kind of weather, added to the lists above so a long
  // stretch of one weather doesn't run through them all in a few minutes.
  const WEATHER_MORE = {
    residential: {
      heatwave: ["The dog's lying in the bath.", "Paddling pool's full of adults.", "Sleeping with the freezer door open.", "Can't touch the car door handle!", "Hosepipe ban, I bet.", "Everyone's fanning themselves at the bus stop.", "Melted crayons all over the back seat.", "Sun cream, hats, water. Go."],
      coldsnap: ["Frost on the inside of the windows!", "The cat won't leave the radiator.", "Car won't start. Of course.", "Heating bill's going to be scary.", "Soup for lunch, soup for dinner.", "Scraping the windscreen at 7am.", "Grandad's wearing his hat indoors.", "Thermals on. All of them."],
      snowfall: ["Snowball ambush on the school run!", "Postman's leaving footprints everywhere.", "Shed roof's sagging with snow.", "Hot chocolate and a window seat.", "The whole street's gone quiet and white.", "Kids made a snowman of the neighbour.", "Gritters went by at dawn."],
      blizzard: ["Snow's up to the letterbox!", "Bread and milk, everyone panic-buying.", "Can't even open the front door.", "Hunkered down with blankets and candles.", "Hope the lines hold in this wind.", "Wind's rattling every window."],
      rainstorm: ["Bucket under the leak in the hall.", "The drains can't keep up.", "Soaked just running to the car.", "Thunder's shaking the windows.", "Garden's a pond now.", "Basement's taking on water!"],
      storm: ["Trampoline's in next door's garden.", "Hope the power holds through this.", "Lightning lit up the whole street.", "Wind took the fence panel. Again.", "Kids are hiding under the duvet.", "Branches all over the road."],
      rainfall: ["Drizzle all day, lovely.", "Washing's still wet on the line.", "Snails everywhere after the rain.", "Board games and a cup of tea.", "Wellies by the door.", "Rain on the roof is so relaxing.", "Grass will need cutting after this."],
      fog: ["Couldn't see the end of the garden.", "Fog lights on for the school run.", "Foghorn somewhere? Or a cow?", "Everything's damp and grey.", "Lost the dog in the fog for a minute."],
      smog: ["Inhaler's getting a workout.", "Grey sky, grey cars, grey everything.", "Kept the windows shut all day.", "Washing smells of smoke."],
      calm: ["Smoke from the chimneys going straight up.", "Wind chimes have gone silent.", "Perfect day for the garden."],
      dust: ["Grit in my teeth.", "Wiped the windows twice already.", "Dust storm! Bring the washing in!", "Eyes are stinging out there."],
      smoke: ["Wildfire smoke, they reckon.", "Sun's gone red through the smoke.", "Kids aren't playing out today.", "Smells like a bonfire everywhere."],
      icing: ["Slid all the way down the drive.", "Icicles on the gutters!", "Power lines are sagging with ice.", "Salt the steps, everyone."],
      geomag: ["Stayed up to watch the lights.", "Kids think the sky is magic.", "The aurora this far south?!", "Radio's crackling like mad."],
    },
    commercial: {
      heatwave: ["Fridges working overtime.", "Customers are just here for the AC.", "Cold drinks, sold out by noon.", "Chocolate's melting on the shelf."],
      coldsnap: ["Soup of the day: all of them.", "Door's letting the cold in every time.", "Gloves and hats, flying off the rack.", "Heaters on full in the shop."],
      snowfall: ["Wet footprints all over the floor.", "Snow boots, nearly sold out.", "Shovelled the front, it's snowing again."],
      blizzard: ["Delivery truck's stuck in a drift.", "Shut early, staff can't get home.", "Shelves empty, nobody can restock."],
      rainstorm: ["Puddle at the door, mind the step.", "Wet umbrellas everywhere.", "Awning's sagging with water.", "Customers are shopping just to stay dry."],
      storm: ["Sign's swinging like crazy.", "Lights flickered! Back on, phew.", "Shutting the shutters till it passes."],
      rainfall: ["Mopping the entrance every hour.", "Brollies by the till, £5.", "Rainy day, busy cafe."],
      fog: ["Lit the neon early, for the fog.", "Customers popping in out of the murk.", "Foggy day, cosy cafe.", "Can't see across the street to the competition."],
      smog: ["Masks at the till, please.", "Air purifiers are flying off the shelf."],
      calm: ["Lovely day. Busy street."],
      dust: ["Dusting the shop window, again.", "Grit in the card machine."],
      smoke: ["Sold out of face masks.", "The smoke's keeping folk indoors."],
      icing: ["Salted the steps out front.", "Careful at the door, it's like glass."],
      geomag: ["Everyone's on the roof watching the sky.", "GPS on the delivery van's gone weird."],
    },
    industrial: {
      heatwave: ["Fans on every station.", "Shift's starting at 5 to dodge the heat.", "Too hot to wear the overalls.", "Ice in the water cooler, please."],
      coldsnap: ["Machines are slow to warm up.", "Frozen padlock on the gate.", "Coffee's going cold in a minute.", "Heaters on in the cab."],
      snowfall: ["Gritting the yard.", "Snow on the conveyors.", "Clear the roof before it caves."],
      blizzard: ["Skeleton crew today.", "Yard's buried. Nothing's moving.", "Hope the power holds, we can't stop now."],
      rainstorm: ["Puddles in the loading bay.", "Tarps over the stock, quick!", "Pumps are on in the pit."],
      storm: ["Crane's tied down till it passes.", "Lightning rod earned its keep today.", "Wind's rattling the sheds."],
      rainfall: ["Rain's dripping through the skylight.", "Mud on every forklift tyre.", "Hi-vis and waterproofs today.", "Slippery out on the yard, careful.", "Drizzle all shift."],
      fog: ["Forklifts crawling in this fog.", "Hazard lights on in the yard.", "Trucks are late, fog on the roads.", "Lost the far gate in the fog."],
      smog: ["Masks on in the yard today.", "Even the smoke's struggling to rise."],
      calm: ["Stacks going straight up today."],
      dust: ["Dust masks on.", "Clean the intakes, it's gritty."],
      smoke: ["Air's thick, take a break inside."],
      icing: ["Gritting the walkways.", "Ice on the ladders, take care."],
      geomag: ["Radios are full of static.", "Sky's green over the stacks."],
    },
    government: {
      heatwave: ["Free water at the town hall.", "Check on elderly neighbours, please."],
      coldsnap: ["Winter fuel help, applications open.", "Gritting routes published."],
      snowfall: ["Schools closed, says the council.", "Ploughs out on the main roads.", "Grit bins refilled across {city}.", "Snow day for the council staff? No chance."],
      blizzard: ["Only travel if you must.", "Emergency shelters are open."],
      rainstorm: ["Sandbags available at the depot.", "Flood warning for low streets.", "Drains team on call tonight.", "River levels are being watched."],
      storm: ["Tree surgeons on standby.", "Report fallen lines, don't touch them.", "Storm briefing in the chamber.", "Emergency crews ready across {city}."],
      rainfall: ["Drains being cleared this week.", "Wet weather plan in place.", "Umbrellas at the reception desk.", "Rain's dripping on the council steps.", "Pothole complaints rise with the rain."],
      fog: ["Drive carefully, says the council.", "Fog's delayed the council meeting.", "Can't see the town hall clock."],
      dust: ["Air quality advice issued."],
      smoke: ["Stay indoors if you can, residents."],
      icing: ["Ice warning for the whole of {city}."],
      geomag: ["No, the aurora isn't dangerous, residents."],
      calm: ["Calm day. Calm council. For once."],
    },
  };
  for (const zone of Object.keys(WEATHER_MORE)) {
    const w = LINES[zone].weather || (LINES[zone].weather = {});
    for (const type of Object.keys(WEATHER_MORE[zone])) w[type] = [...(w[type] || []), ...WEATHER_MORE[zone][type]];
  }

  // ── Talk about what's going up nearby ──────────────────────────────
  // A building placed during play is news to the people around it while it
  // goes up and for NEW_FOR game days after it opens. By what it is, then
  // 'building' (scaffolding up) or 'done' (open). {name} is its own name.
  // 'res' lines are for homes, 'work' for shops, works and civic buildings,
  // 'any' for everyone.
  const NEW_RADIUS = 28;          // tiles from the new building to a speaker
  const NEW_FOR = 1.5;            // game days it stays news after it opens
  const NEW_LINES = {
    clean: {
      building: { any: ["Is that a new {name} going up?", "They're putting up a {name}!", "Clean power on the way, apparently."],
                  res: ["Solar? Wind? Either way, better than smoke.", "Good. No more chimneys, please."] },
      done:     { any: ["The new {name} is running!", "Clean power, right on our doorstep.", "That {name} looks great out there."],
                  res: ["Kids love watching the new {name}.", "Feels good knowing our power's clean.", "Quieter than I expected, that {name}."],
                  work: ["Green power. Good for the brochure!", "Customers like that new {name}."] },
    },
    dirty: {
      building: { res: ["Please tell me that's not a {name}…", "A {name}? Right next to us?", "There goes the fresh air.", "Who approved a {name} here?!"],
                  work: ["More power for the line, at least.", "A {name}'s going up. Cheap power, I hope."] },
      done:     { res: ["The new {name} smells already.", "Smoke from that {name} all day.", "Can't open the windows since the {name}.", "Petition against the {name} tonight."],
                  work: ["Power's cheap since the {name} opened.", "That {name} runs day and night.", "Plenty of power, plenty of smoke."] },
    },
    nuclear: {
      building: { res: ["A {name}? Is that… safe?", "Nuclear, round here? Hmm.", "They say it's perfectly safe. They always say that."],
                  work: ["Nuclear! Serious power coming.", "That {name} will run the whole district."] },
      done:     { res: ["The {name} hums all night. Is that normal?", "Got iodine tablets, just in case.", "Honestly, the {name}'s been fine so far."],
                  work: ["Power's rock-solid since the {name}.", "That {name} never stops. Impressive."] },
    },
    fusion: {
      building: { any: ["Fusion? Like the sun? Here?", "They're building a {name}! Science!"] },
      done:     { any: ["We have a {name}. Unbelievable.", "The future's arrived, and it's in our town.", "My kid wants to be a fusion scientist now."] },
    },
    power: {
      building: { any: ["Another power plant going up?", "New {name} on the way."] },
      done:     { any: ["The new {name} is up and running.", "More power for {city}!"] },
    },
    grid: {
      building: { any: ["What's that they're wiring up?", "More grid work going on.", "Crews out on the lines again."] },
      done:     { any: ["New {name} should help the outages.", "Lights seem steadier since that {name}.", "{co} is upgrading the grid, nice."] },
    },
    research: {
      building: { any: ["A research lab, here?", "Scientists moving in!"] },
      done:     { any: ["The {name}'s lights are on all night.", "Boffins at the {name}. Wonder what they're up to.", "That {name} is very hush-hush."] },
    },
    // 'done' is only for the people it actually serves (see _chooseLine):
    // 'asked' from the property whose request it answered, 'any' from those
    // close enough to use it.
    amenity: {
      building: { any: ["Ooh, a new {name}?", "Something new for the street."] },
      done:     { any: ["New {name}! The street feels better already.", "Love the new {name}."],
                  asked: ["Finally, the {name} we asked for!", "Someone listened: a new {name}!", "They put in the {name} we asked for!"] },
    },
    park: {
      building: { any: ["Is that a park going in?", "A {name}? Finally, somewhere to go!"] },
      done:     { res: ["The kids won't leave the new {name}.", "Walked the dog at the new {name}.", "Picnic at the {name} this weekend!", "That {name} is lovely."],
                  work: ["The {name} brings people past the door.", "Lunch break at the new {name}."] },
    },
    home: {
      building: { res: ["New houses going up next door.", "Builders start at 7am. Every. Day.", "More neighbours on the way!"],
                  work: ["More homes means more customers.", "Town's growing!"] },
      done:     { res: ["New neighbours moved in!", "Welcome to the street, new folks!", "Housewarming party next door tonight."],
                  work: ["New homes, new customers.", "More people in town every week."] },
    },
    shop: {
      building: { any: ["A new shop's going up!", "What's opening over there?"] },
      done:     { res: ["New shop opened round the corner!", "Popped into the new place. Not bad."],
                  work: ["Competition opened up the road.", "New shop next door. Fancy."] },
    },
    works: {
      building: { res: ["Is that a factory going up?", "Industrial, right there? Lovely."],
                  work: ["New factory going up!", "More jobs on the way!"] },
      done:     { res: ["New factory's hiring, apparently.", "Lorries all day since the factory opened."],
                  work: ["Neighbours on the industrial estate!", "New works are hiring. Good for the town."] },
    },
    civic: {
      building: { any: ["A new {name}? Fancy.", "The council's building something big."] },
      done:     { any: ["The new {name} is open!", "Proud of the new {name}.", "{city} has a {name} now!"] },
    },
    logistics: {
      building: { any: ["What's that depot for?", "More trucks on the way, I bet."] },
      done:     { res: ["Trucks rumbling past since the {name}.", "That {name} is busy all day."],
                  work: ["Deliveries are quicker since the {name}.", "The {name} keeps everything moving."] },
    },
    landmark: {
      building: { any: ["What on earth are they building?!", "That's going to be HUGE.", "The whole town's watching that site."] },
      done:     { any: ["The {name}! Have you seen it?!", "Tourists are coming to see the {name}.", "The {name} is the talk of the town."] },
    },
  };
  // The speaker's own news: a home or business that has just opened.
  const OPENED = {
    residential: ["Just moved in!", "Still unpacking boxes.", "New house, new start.", "Where do the bins go here?", "Love our new place!"],
    commercial: ["Grand opening today!", "First customers through the door!", "We're open! Come on in!"],
    industrial: ["First shift at the new works!", "Machines are in, let's go!"],
    government: ["Doors open to the public today!"],
    national: ["Official opening! Ribbon, scissors, cameras.", "The Minister cut the ribbon. Badly.", "First day at the new site!"],
  };

  // What a placed building is, for the lines above; null when it is not news
  // (wires, pipes, belts, roads, trees, vehicles, tools).
  let _catOf = null;
  function _kindOf(e) {
    const t = e.type;
    if (t === T.HOUSE || t === T.CABIN) return 'home';
    if (t === T.COMMERCIAL) return 'shop';
    if (t === T.INDUSTRIAL || e.isIndustrial) return 'works';
    for (const n of ['NATIONALGRID', 'FUSIONLAB', 'AIRPORT', 'LAUNCHCOMPLEX', 'COMPANYHQ', 'MILITARYBASE']) if (T[n] !== undefined && t === T[n]) return 'landmark';
    for (const n of GOV_TYPES) if (T[n] !== undefined && t === T[n]) return 'civic';
    if (typeof PARK_TYPES !== 'undefined' && PARK_TYPES.includes(t)) return 'park';
    if (!_catOf) {
      _catOf = new Map();
      if (typeof HOTBAR_CATEGORIES !== 'undefined') for (const c of HOTBAR_CATEGORIES) for (const x of c.tools || []) if (typeof x === 'string') _catOf.set(x, c.id);
    }
    const cat = _catOf.get(t), id = String(t);
    const skip = ['WIRE', 'POLE', 'POWERTOWER', 'PROTECTOR', 'TRUCK', 'HAULER', 'ROAD', 'BRIDGE', 'PATHTOOL', 'FISHINGPOLE', 'DRONECHARGER'];
    if (skip.some(n => T[n] !== undefined && t === T[n])) return null;
    if (cat === 'generation') {
      if (/fusion|tokamak/.test(id)) return 'fusion';
      if (/nuclear|reactor|uranium|mox/.test(id)) return 'nuclear';
      if (/coal|oil|gas|diesel|biofuel|coke|refin|pumpjack/.test(id)) return 'dirty';
      if (/solar|wind|geo|hydro|tidal|wave/.test(id)) return 'clean';
      return 'power';
    }
    if (cat === 'grid') return 'grid';
    if (cat === 'stations') return /research/.test(id) ? 'research' : 'grid';
    if (cat === 'amenities') return 'amenity';
    if (cat === 'waste') return 'logistics';
    return null;
  }

  // Everything placed since this session's first look: { e, kind, doneAt }.
  // doneAt is the game time it opened (null while it is still going up).
  const _known = new WeakSet();
  const _news = [];
  let _primed = false, _scanAt = 0;
  const _gameDay = () => (typeof DayNight !== 'undefined' && DayNight.secondsPerGameHour) ? DayNight.secondsPerGameHour() * 24 : 1440;
  const _gameNow = () => (typeof DayNight !== 'undefined' ? DayNight.getElapsed() : 0);

  // Every few seconds: anything not seen before is news; on the first look
  // only the building sites are (a save loads with its city already there).
  function _scan() {
    const t = now();
    if (t < _scanAt) return;
    _scanAt = t + 2.5;
    let set; try { set = EntityRegistry.active(); } catch (_e) { return; }
    if (!set) return;
    const gnow = _gameNow();
    const inc = [];
    for (const e of set) {
      const k = (e._lightningDamaged || e._irreparable || e._detonated) ? _incidentOf(e) : null;
      if (k) inc.push({ e, kind: k });
    }
    _incidents = inc;
    for (const e of set) {
      if (_known.has(e)) continue;
      _known.add(e);
      if (_primed ? false : !e._constructing) continue;
      const kind = _kindOf(e);
      if (kind) _news.push({ e, kind, doneAt: e._constructing ? null : gnow });
    }
    _primed = true;
    const keepFor = NEW_FOR * _gameDay();
    for (let i = _news.length - 1; i >= 0; i--) {
      const n = _news[i];
      if (!set.has(n.e)) { _news.splice(i, 1); continue; }
      if (n.doneAt === null && !n.e._constructing) n.doneAt = gnow;
      if (n.doneAt !== null && gnow - n.doneAt > keepFor) _news.splice(i, 1);
    }
  }

  // A street lamp within a few tiles of a speaker's footprint.
  const LAMP_NEAR = 4;
  function _lampNear(e) {
    if (typeof T === 'undefined' || T.LAMP === undefined) return false;
    const c0 = e.col - LAMP_NEAR, c1 = e.col + (e.width || 1) - 1 + LAMP_NEAR;
    const r0 = e.row - LAMP_NEAR, r1 = e.row + (e.height || 1) - 1 + LAMP_NEAR;
    for (const l of EntityRegistry.getByType(T.LAMP)) if (l.col >= c0 && l.col <= c1 && l.row >= r0 && l.row <= r1) return true;
    return false;
  }

  // The nearest piece of news to a speaker, or null.
  function _newsNear(e) {
    const cx = e.col + (e.width || 1) / 2, cy = e.row + (e.height || 1) / 2;
    let best = null, bd = NEW_RADIUS * NEW_RADIUS;
    for (const n of _news) {
      if (n.e === e) continue;
      const dx = n.e.col + (n.e.width || 1) / 2 - cx, dy = n.e.row + (n.e.height || 1) / 2 - cy;
      const d = dx * dx + dy * dy;
      if (d < bd) { bd = d; best = n; }
    }
    return best;
  }

  // ── Incidents: lightning strikes, fires, blasts ────────────────────
  // A building struck by lightning, still burning, or wrecked by a blast
  // (a reactor going up, the ruins it leaves) changes how everyone near it
  // talks: the cheerful lines stand down and they talk about what
  // happened. {name} is the building's own name.
  const INCIDENT_RADIUS = 24;
  const INCIDENT_LINES = {
    strike: {
      res: ["Lightning hit the {name}! Did you hear it?!", "That bang was the {name} getting struck.", "Kids are scared after that strike.",
            "Never seen lightning hit that close.", "My hair's still standing up after that.", "The whole street lit up white.",
            "Hope nobody was in the {name}.", "Smell of burning since the strike."],
      work: ["Lightning took out the {name}!", "Strike on the {name}, crews are on the way.", "That {name} needs a lightning rod.",
             "Everyone's at the window staring at the {name}.", "Insurance is going to love this."],
    },
    fire: {
      res: ["The {name}'s on fire!", "Call the fire brigade!", "Smoke's pouring out of the {name}.", "Kids, come away from the window.",
            "Can feel the heat from here.", "Firefighters are still at it.", "Ash coming down in the garden."],
      work: ["The {name} is burning!", "Evacuate! Fire at the {name}!", "Fire crews blocking the road.", "Smoke everywhere, close the doors!"],
    },
    blast: {
      res: ["The whole block's gone…", "I felt the blast from here.", "Is everyone okay over there?", "The windows came in. All of them.",
            "We're packing the car. We're leaving.", "I can't stop shaking.", "Where the {name} was, there's nothing.",
            "My neighbour worked at the {name}.", "Nobody's sleeping tonight.", "Sirens, all night.", "How could this happen here?",
            "Is the air even safe now?", "Kids keep asking what happened."],
      work: ["Half the district's flattened.", "We're shutting until it's safe.", "Staff are being sent home.", "That blast… I don't have words.",
             "Insurance won't cover a reactor blast.", "Who signed off on that reactor?!", "Crews are searching the ruins."],
      national: ["National emergency declared.", "The Prime Minister is on her way.", "Inquiry into the blast starts tomorrow.",
                 "The whole country's watching this.", "Every crew in the nation is heading here."],
    },
  };
  // What's happened to a building, or null: 'blast' for a wreck from a
  // reactor going up (its ruins, the wrecked, the set alight), 'fire' while
  // a struck building still burns, 'strike' once it's out but not mended.
  function _incidentOf(e) {
    if (e._irreparable || e._detonated || (e._lightningDamaged && e._fireCause === 'blast')) return 'blast';
    if (e._lightningDamaged) return e._fireOut ? 'strike' : 'fire';
    return null;
  }
  let _incidents = [];   // [{ e, kind }], rebuilt every scan

  // A building's name as the neighbours would say it after "the": a family
  // home is "Vermas' house" ("The Vermas" -> "the Vermas' house"), a business
  // its own name, anything else what it is.
  function _nameOf(e) {
    const bn = e.businessName ? String(e.businessName) : '';
    if ((e.type === T.HOUSE || e.type === T.CABIN) && bn) {
      const fam = bn.replace(/^the\s+/i, '');
      return fam.endsWith('s') ? fam + "' house" : fam + "'s house";
    }
    if (bn) return bn;
    return (typeof EntityDefs !== 'undefined' && EntityDefs[e.type]?.label) || 'building';
  }

  // ── Short dialogues ────────────────────────────────────────────────
  // Now and then two people out in the zone talk to each other: a group
  // standing chatting (or a works crew on their break) takes turns, or two
  // people passing close by. Each exchange is two or three lines, said one
  // after the other, alternating speakers. By zone, then situation (the same
  // ones the single lines use); {city}, {co} and {name} as there.
  const DIALOGUE_CHANCE = 0.35;      // of what's said, when there's a pair to say it
  const DIALOGUE_PAIR = 3 * TILE;    // two walkers this close (world px) can talk
  const DIALOGUES = {
    residential: {
      flavour: [
        ["Morning! Off anywhere nice?", "Just the shops. Living the dream."],
        ["How's the new baby?", "Loud. Very, very loud."],
        ["Your hedge looks sharp.", "Took me all Sunday!"],
        ["Heard about number twelve?", "No, what?", "New car. Electric, of course."],
        ["Your dog was in my garden again.", "He likes you!", "He likes my roses."],
        ["Bin day tomorrow?", "Thursday. It's always Thursday."],
        ["Barbecue Saturday?", "Only if you're cooking."],
        ["Kids behaving?", "Define behaving."],
        ["You're up early.", "Never went to bed. Teething."],
        ["Seen my cat?", "Ginger one? On your roof."],
        ["Lovely day for it.", "For what?", "Anything, really."],
        ["Book club Thursday?", "Did anyone read it?", "Not a soul."],
        ["New bike?", "Birthday present. To myself."],
        ["Borrow your ladder?", "You've still got my drill."],
      ],
      outage: [
        ["Your lights out too?", "Whole street, I think.", "Brilliant."],
        ["Got any candles spare?", "Only birthday ones.", "They'll do."],
        ["Power's off again.", "Called {co}?", "On hold. Forty minutes."],
        ["Freezer's defrosting.", "Ice cream party, then?"],
        ["Wi-Fi's down.", "So we talk to each other now?", "Apparently."],
      ],
      smog: [
        ["Can you smell that?", "The plant again.", "Every single day."],
        ["Washing's grey again.", "Bring it in. Mine's ruined too."],
        ["Kids playing out today?", "Not in this air."],
      ],
      happy: [
        ["Lights never flicker anymore.", "Touch wood!"],
        ["Bills went down this month.", "Mine too! Who do we thank?", "{co}, apparently."],
        ["Love this street.", "Best in {city}. Don't tell anyone."],
      ],
      night: [
        ["Bit late for a walk?", "Couldn't sleep.", "Me neither."],
        ["Look at the stars tonight.", "Is that a planet?", "Or a plane."],
      ],
      weather: {
        rain:  [["Forgot your umbrella?", "Didn't think I'd need it."], ["Wet enough for you?", "The ducks are loving it."]],
        heat:  [["Hot enough for you?", "I'm actually melting."], ["Paddling pool's out.", "Room for one more?"]],
        cold:  [["Freezing, isn't it?", "Pipes'll go if this keeps up."], ["Three coats?", "And I'm still cold."]],
        snow:  [["Snowball fight later?", "You're on."], ["Shovelled your drive?", "Did yours too. By mistake."]],
        storm: [["Hear that thunder?", "Shook the windows!"], ["Bins are blowing away!", "Grab yours, I'll grab mine!"]],
        fog:   [["Can't see a thing.", "Hello? Who's there?", "It's me. Next door."]],
      },
      hyperion: [
        ["Seen Hyperion on the news?", "The kids won't stop talking about it."],
        ["Proud of that station.", "We all are."],
      ],
    },
    commercial: {
      flavour: [
        ["Busy today?", "Run off our feet!"],
        ["Got this a size up?", "Let me check the back."],
        ["Card or cash?", "Card. Who has cash?"],
        ["Coffee?", "Large. Rough morning."],
        ["Is this on sale?", "Everything's on sale today!"],
        ["Lunch?", "That new place on the corner?", "Go on, then."],
        ["Window display looks great.", "Took me all night!"],
        ["Want the receipt emailed?", "Paper, please.", "Old school. I like it."],
        ["Got a minute for a survey?", "Not really.", "Fair enough."],
        ["Just browsing.", "Take your time!"],
      ],
      outage: [
        ["Till's dead.", "Card machine too.", "Cash only, then!"],
        ["Freezers are off!", "Sell the ice cream. Quick."],
        ["Lights are out!", "Candlelit shopping. Very fancy."],
      ],
      smog: [["Customers are coughing.", "Close the doors, then."]],
      happy: [["Record week!", "Drinks are on me."]],
      night: [["Closing up?", "Five more minutes.", "You said that an hour ago."]],
      weather: {
        rain:  [["Umbrellas are flying off the shelves.", "Put the price up!"]],
        heat:  [["Out of ice cream!", "Already? It's ten a.m."]],
        cold:  [["Hot chocolate, two please.", "Make it three, I'm frozen."]],
        snow:  [["Nobody's out shopping.", "Except us. Lucky us."]],
        storm: [["Our sign just blew down the street.", "I'll chase it."]],
        fog:   [["Anyone out there?", "Just me. Are you open?"]],
      },
      hyperion: [["Selling Hyperion mugs now.", "Do they sell?", "Like hot cakes."]],
    },
    industrial: {
      flavour: [
        ["Tea break?", "Thought you'd never ask."],
        ["Who's on nights?", "You are.", "Brilliant."],
        ["Pass the spanner.", "Which one?", "The big one."],
        ["Forklift's beeping again.", "It's always beeping."],
        ["Boss is coming!", "Look busy!"],
        ["Shift's over in ten.", "Longest ten minutes of my life."],
        ["Hard hat.", "Right, yeah. Cheers."],
        ["Order's due Friday.", "Friday?! We'll never make it.", "We always say that."],
      ],
      outage: [
        ["Line's stopped.", "Power again?", "Power again."],
        ["Machines are dead.", "Paid to stand around, then."],
      ],
      smog: [["Can't see the far gate.", "That's ours, that smoke."]],
      happy: [["Not one stoppage all month.", "Steady power. Who knew?"]],
      night: [["Night shift again?", "Third this week."]],
      weather: {
        rain:  [["Soaked through.", "Same. Tea?"]],
        heat:  [["Like an oven in here.", "It IS an oven in here."]],
        cold:  [["Gloves on, everyone.", "Can't feel my fingers anyway."]],
        snow:  [["Trucks are stuck at the gate.", "Grab the grit."]],
        storm: [["Crane's down for the storm.", "Good. I'm not going up there."]],
        fog:   [["Watch the forklifts!", "Can't SEE the forklifts!"]],
      },
      hyperion: [["Our steel's in Hyperion.", "Tell the grandkids."]],
    },
    government: {
      flavour: [
        ["Signed the forms?", "In triplicate."],
        ["Meeting at two?", "Moved to three.", "Of course it was."],
        ["Seen the Mayor?", "In a meeting about meetings."],
        ["Budget's due.", "Which one?", "All of them."],
        ["Coffee machine's broken.", "This is a crisis."],
        ["Lecture's cancelled!", "Best news all week."],
        ["Got a pen?", "Council property. Sign for it."],
      ],
      outage: [
        ["Servers are down.", "So's the power.", "So's my mood."],
        ["Generator on?", "Trying!"],
      ],
      smog: [["More complaints about the air.", "Put them on the pile."]],
      happy: [["Not one complaint about the power.", "Must be a first."]],
      night: [["Working late?", "Council minutes. Again."]],
      weather: {
        rain:  [["Umbrella stand's full.", "Use the bin."]],
        heat:  [["Is the AC on?", "It's on. It's losing."]],
        cold:  [["Heating's broken.", "Coats on for the meeting, then."]],
        snow:  [["Who's gritting the steps?", "That's your department."]],
        storm: [["Close the windows!", "The minutes just blew away!"]],
        fog:   [["Where's the town hall gone?", "Still there. Probably."]],
      },
      hyperion: [["Hyperion's put {city} on the map.", "Visitors are up threefold."]],
    },
    national: {
      flavour: [
        ["Minister wants a word.", "Which minister?", "All of them."],
        ["Off the record?", "Always."],
        ["Press are outside.", "Back door, then."],
        ["Did the memo leak?", "Front page."],
        ["Summit still on?", "Depends who you ask."],
      ],
      outage: [["The capital's dark!", "Get {co} on the phone. Now."]],
      smog: [["The air's on the news.", "Minister's not pleased."]],
      happy: [["Polls are up.", "Thank the grid."]],
      night: [["Another all-nighter?", "Crisis meeting. Again."]],
      weather: {
        rain:  [["Press conference outside?", "In this rain? Inside."]],
        heat:  [["Ties off?", "Minister says yes!"]],
        cold:  [["The honour guard's frozen.", "Get them a flask."]],
        snow:  [["Snowball fight?", "Not in front of the press."]],
        storm: [["Flights grounded.", "Again."]],
        fog:   [["Can't see the runway.", "Flights are holding."]],
      },
      hyperion: [["Hyperion's on every front page.", "Ours, finally."], ["Launch on schedule?", "To the second."]],
    },
  };
  // After a strike, a fire or a blast nearby: res for homes, work for
  // everywhere else (the national zone too).
  const DIALOGUE_INCIDENT = {
    strike: {
      res:  [["Did lightning hit the {name}?", "Lit up the whole street!"], ["Hear that bang?", "That was the {name}. Struck."]],
      work: [["Lightning got the {name}.", "Glad it wasn't us."], ["Was that the {name}?", "Struck. Crews are on the way."]],
    },
    fire: {
      res:  [["Is that smoke from the {name}?", "Call the fire brigade!", "They're on their way."], ["Everyone out of the {name}?", "I think so. I hope so."]],
      work: [["Fire at the {name}!", "Get everyone out the back!"], ["Is the {name} on fire?!", "Crews are on it."]],
    },
    blast: {
      res:  [["Are you okay?", "I don't know.", "Me neither."], ["Heard from anyone at the {name}?", "Not yet. Nobody has."], ["Should we leave?", "Where would we even go?"]],
      work: [["Is everyone safe?", "We're still counting."], ["Shut it all down.", "Already done."], ["Shut the shop?", "For today?", "For good, maybe."]],
    },
  };
  // The weather events, as the dialogues group them.
  const DIALOGUE_WX = { heatwave: 'heat', coldsnap: 'cold', icing: 'cold', snowfall: 'snow', blizzard: 'snow',
                        rainstorm: 'rain', rainfall: 'rain', storm: 'storm', fog: 'fog' };

  // ── Who can speak ──────────────────────────────────────────────────
  const GOV_TYPES = ['TOWNHALL', 'CIVICCENTER', 'COURTHOUSE', 'EMS', 'HOSPITAL', 'UNIVERSITY', 'TRANSPORTHUB'];
  // The National Government Zone's landmarks: their own voice (LINES.national).
  const NATIONAL_TYPES = ['NATIONALGOV', 'FUSIONLAB', 'AIRPORT', 'MILITARYBASE', 'LAUNCHCOMPLEX', 'NATIONALGRID'];
  function zoneOf(e) {
    if (!e) return null;
    if (e.isIndustrial || e.type === T.INDUSTRIAL) return 'industrial';
    if (e.type === T.COMMERCIAL) return 'commercial';
    if (e.type === T.HOUSE || e.type === T.CABIN) return 'residential';
    for (const n of GOV_TYPES) if (T[n] !== undefined && e.type === T[n]) return 'government';
    for (const n of NATIONAL_TYPES) if (T[n] !== undefined && e.type === T[n]) return 'national';
    return null;
  }
  const SPEAKER_TYPES = () => ['HOUSE', 'CABIN', 'COMMERCIAL', 'INDUSTRIAL', ...GOV_TYPES, ...NATIONAL_TYPES].map(n => T[n]).filter(v => v !== undefined);

  // ── State ──────────────────────────────────────────────────────────
  const bubbles = [];             // { e, text, born }
  const spokeAt = new WeakMap();  // entity → real time it last spoke
  const recent = [];              // lines said lately
  let nextAt = 0;

  const now = () => performance.now() / 1000;
  const pick = a => a[Math.floor(Math.random() * a.length)];

  function _fill(s, vars) {
    let city = 'town', co = 'the power company';
    try { if (typeof CityInfo !== 'undefined') { city = CityInfo.getCityName() || city; co = CityInfo.getCompanyName?.() || co; } } catch (_e) {}
    const name = (vars && vars.name) || 'place';
    return s.replace(/\{city\}/g, city).replace(/\{co\}/g, co)
      .replace(/\b([Tt])he \{name\}/g, (m, t) => /^the\s/i.test(name) ? t + name.slice(1) : t + 'he ' + name)
      .replace(/\{name\}/g, name);
  }

  // The worst incident within INCIDENT_RADIUS of e (then the nearest of
  // those), or null.
  function _nearIncident(e) {
    let near = null, nd = INCIDENT_RADIUS * INCIDENT_RADIUS;
    if (!_incidents.length) return null;
    const cx = e.col + (e.width || 1) / 2, cy = e.row + (e.height || 1) / 2;
    const rank = { blast: 3, fire: 2, strike: 1 };
    for (const n of _incidents) {
      if (n.e === e) continue;
      const dx = n.e.col + (n.e.width || 1) / 2 - cx, dy = n.e.row + (n.e.height || 1) / 2 - cy, d = dx * dx + dy * dy;
      if (d < INCIDENT_RADIUS * INCIDENT_RADIUS && (!near || rank[n.kind] > rank[near.kind] || (rank[n.kind] === rank[near.kind] && d < nd))) { near = n; nd = d; }
    }
    return near;
  }

  // The situations a building could speak to right now, with weights. Its own
  // trouble outweighs everything else, so a dark street talks about the dark.
  function _situations(e, zone, asPerson) {
    const L = LINES[zone], out = [];
    const add = (w, list, vars) => { if (list && list.length) out.push([w, list, vars]); };
    // Something terrible happened here or nearby: that's what they talk about.
    const own = null;   // a damaged or destroyed building never speaks itself (see _candidates)
    const near = _nearIncident(e);
    if (near) {
      const set = INCIDENT_LINES[near.kind];
      const pool = zone === 'residential' ? set.res : zone === 'national' ? (set.national || set.work) : set.work;
      add(near.kind === 'blast' ? 16 : 10, pool, { name: _nameOf(near.e) });
    }
    const sombre = !!(own || near), sombreNow = sombre;
    // Something going up, or just opened, nearby: big news locally.
    const news = _newsNear(e);
    if (news) {
      const set = NEW_LINES[news.kind] && NEW_LINES[news.kind][news.doneAt === null ? 'building' : 'done'];
      if (set) {
        let pool = [...(set.any || []), ...((zone === 'residential' ? set.res : set.work) || [])];
        // A finished amenity serves only the properties right beside it, so
        // only they talk about it, and only the one that asked thanks it.
        // Anyone within NEW_RADIUS used to: a lamp put in for one house had
        // the house down the road with none saying "the lamp we asked for".
        if (set.asked) {
          const a = news.e, got = e._amenityGot;
          const asked = !!got && got.type === a.type && got.col === a.col && got.row === a.row;
          const reach = (typeof AmenityRequestSystem !== 'undefined' && AmenityRequestSystem.FULFIL_RADIUS) || 1;
          const gapC = Math.max(a.col - (e.col + (e.width || 1)), e.col - (a.col + (a.width || 1)), -1) + 1;
          const gapR = Math.max(a.row - (e.row + (e.height || 1)), e.row - (a.row + (a.height || 1)), -1) + 1;
          const serves = asked || Math.max(gapC, gapR) <= reach;
          pool = !serves ? [] : asked ? [...pool, ...set.asked] : pool;
        }
        const label = (typeof EntityDefs !== 'undefined' && EntityDefs[news.e.type]?.label) || 'building';
        if (pool.length) add(6, pool, { name: label });
      }
    }
    // A national landmark's own people (or, for a walker, the nearest one's):
    // their own lines, and their own take on the weather and the hour.
    if (zone === 'national' && L.places) {
      const id = String(e.type), own = L.places[id];
      if (own) add(asPerson ? 3 : 5, own);
      let ev2 = null;
      try { ev2 = typeof WeatherEventSystem !== 'undefined' ? WeatherEventSystem.getActiveEvent() : null; } catch (_e) {}
      const pw = L.placeWeather && L.placeWeather[id];
      if (ev2 && pw && pw[ev2.type]) add(3.5, pw[ev2.type]);
      const pt = L.placeTime && L.placeTime[id];
      if (pt) {
        const hh = typeof DayNight !== 'undefined' ? DayNight.hour() : 12;
        const slot = hh >= 6 && hh < 9.5 ? 'morning' : hh >= 17.5 && hh < 21 ? 'evening' : (hh >= 22 || hh < 5) ? 'night' : null;
        if (slot && pt[slot]) add(1.5, pt[slot]);
      }
    }
    // Its own opening.
    const mine = _news.find(n => n.e === e && n.doneAt !== null);
    if (mine && !asPerson) add(5, OPENED[zone]);   // a passer-by didn't just move in
    const dark = typeof OutageWatch !== 'undefined' && OutageWatch.isFlagged && OutageWatch.isFlagged(e);
    if (dark) add(10, L.longOutage);
    else if (!e.powered) add(8, L.outage);
    if (e._churnWarned) add(6, L.leaving);
    let smog = 0;
    try { if (typeof PollutionSystem !== 'undefined') smog = PollutionSystem.exposureFor(e) || 0; } catch (_e) {}
    if (smog > 25) add(4 + Math.min(4, smog / 25), L.smog);
    // "Love the street lamps" only where there is one to love.
    if (!sombre && e.powered && !dark && (e.satisfaction ?? 0) >= 85) add(2, _lampNear(e) ? L.happy : L.happy.filter(s => !/street lamp/i.test(s)));
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
        if (v && (v.complete || v.final || v.exporting) && !sombreNow) add(1.5, L.hyperion);
      }
    } catch (_e) {}
    add(sombre ? 0.3 : 2, L.flavour);   // small talk mostly stops after something like that
    return out;
  }

  function _chooseLine(e, zone, asPerson) {
    const sits = _situations(e, zone, asPerson);
    let total = 0; for (const [w] of sits) total += w;
    let r = Math.random() * total, list = sits[sits.length - 1][1], vars = sits[sits.length - 1][2];
    for (const [w, l, v] of sits) { if ((r -= w) <= 0) { list = l; vars = v; break; } }
    // Not one said lately. When the situation picked has nothing fresh left
    // (a long rainy spell), say something about another one instead of
    // repeating itself.
    let fresh = list.filter(s => !recent.includes(s));
    if (!fresh.length) {
      for (const [, l, v] of sits) {
        const f = l.filter(s => !recent.includes(s));
        if (f.length) { fresh = f; vars = v; break; }
      }
    }
    const line = pick(fresh.length ? fresh : list);
    recent.push(line); if (recent.length > RECENT_LINES) recent.shift();
    return _fill(line, vars);
  }

  // An exchange for two people on e's street, weighted like the single
  // lines: trouble nearby first, then the weather, the hour, small talk.
  function _chooseDialogue(e, zone) {
    const D = DIALOGUES[zone];
    if (!D) return null;
    const sits = [];
    const add = (w, list, vars) => { if (list && list.length) sits.push([w, list, vars]); };
    const near = _nearIncident(e);
    if (near) {
      const set = DIALOGUE_INCIDENT[near.kind];
      add(near.kind === 'blast' ? 16 : 10, zone === 'residential' ? set.res : set.work, { name: _nameOf(near.e) });
    }
    const dark = typeof OutageWatch !== 'undefined' && OutageWatch.isFlagged && OutageWatch.isFlagged(e);
    if (dark || !e.powered) add(8, D.outage);
    let smog = 0;
    try { if (typeof PollutionSystem !== 'undefined') smog = PollutionSystem.exposureFor(e) || 0; } catch (_e) {}
    if (smog > 25) add(4, D.smog);
    if (!near && e.powered && !dark && (e.satisfaction ?? 0) >= 85) add(2, D.happy);
    let ev = null;
    try { ev = typeof WeatherEventSystem !== 'undefined' ? WeatherEventSystem.getActiveEvent() : null; } catch (_e) {}
    if (ev && D.weather && DIALOGUE_WX[ev.type]) add(3.5, D.weather[DIALOGUE_WX[ev.type]]);
    const h = typeof DayNight !== 'undefined' ? DayNight.hour() : 12;
    if (h >= 22 || h < 5) add(1.4, D.night);
    try {
      if (!near && typeof NationalProject !== 'undefined') {
        const v = NationalProject.visual();
        if (v && (v.complete || v.final || v.exporting)) add(1.5, D.hyperion);
      }
    } catch (_e) {}
    add(near ? 0.3 : 3, D.flavour);
    let total = 0; for (const [w] of sits) total += w;
    let r = Math.random() * total, list = sits[sits.length - 1][1], vars = sits[sits.length - 1][2];
    for (const [w, l, v] of sits) { if ((r -= w) <= 0) { list = l; vars = v; break; } }
    // Not one heard lately (known by its opening line).
    let fresh = list.filter(x => !recent.includes(x[0]));
    if (!fresh.length) {
      for (const [, l, v] of sits) {
        const f = l.filter(x => !recent.includes(x[0]));
        if (f.length) { fresh = f; vars = v; break; }
      }
    }
    if (!fresh.length) return null;   // all heard lately: a single line instead
    const ex = pick(fresh);
    recent.push(ex[0]); if (recent.length > RECENT_LINES) recent.shift();
    return ex.map(s => _fill(s, vars));
  }

  // Two people on screen who could talk to each other, [a, b], or null: a
  // group standing chatting (a = b: its members take turns), or two people
  // of the same zone walking close by each other.
  function _dialoguePair(folk) {
    const pairs = [];
    for (const p of folk) if (p.standing && (p.group === 'chat' || p.group === 'huddle')) pairs.push([p, p]);
    const walkers = folk.filter(p => !p.standing);
    for (let i = 0; i < walkers.length; i++) {
      for (let j = i + 1; j < walkers.length; j++) {
        const a = walkers[i], b = walkers[j];
        if (a.zone === b.zone && Math.abs(a.x - b.x) < DIALOGUE_PAIR && Math.abs(a.y - b.y) < DIALOGUE_PAIR) pairs.push([a, b]);
      }
    }
    return pairs.length ? pick(pairs) : null;
  }

  // Says an exchange between a and b: each line rises as the one before it
  // fades, held long enough to read. False when there's nothing fresh to say.
  function _startDialogue(a, b) {
    const pz = _personZone(a);
    const lines = _chooseDialogue(_proxyFor({ ...a, zone: pz }), pz);
    if (!lines) return false;
    let t = now();
    lines.forEach((text, i) => {
      const who = i % 2 ? b : a;
      const read = Math.max(2.4, Math.min(3.6, 1.6 + text.length * 0.045));
      const last = i === lines.length - 1;
      const bub = { pid: who.id, zone: pz, x: who.x, y: who.y, standing: who.standing, text, born: t,
                    life: last ? Math.max(3.2, read + 0.8) : read + 0.35 };
      // A group: the bubble's tail on one member, then the other (ZoneLife
      // stands a pair 3.6 px either side of the middle, along the route).
      if (a === b) {
        const off = (i % 2 ? 1 : -1) * 3.6;
        if (who.horiz === false) bub.dy = off * 0.7; else bub.dx = off;
      }
      bubbles.push(bub);
      t += read;
    });
    return true;
  }

  // The part of the world on screen, well inside its edges, in world px.
  function _view() {
    const z = Camera.zoom, W = window.innerWidth, H = window.innerHeight;
    return { x0: Camera.x + 60 / z, y0: Camera.y + 90 / z, x1: Camera.x + (W - 60) / z, y1: Camera.y + (H - 60) / z };
  }

  // Buildings that can speak and are on screen.
  function _candidates() {
    const v = _view(), t = now(), out = [];
    for (const type of SPEAKER_TYPES()) {
      let set; try { set = EntityRegistry.getByType(type); } catch (_e) { continue; }
      if (!set) continue;
      for (const e of set) {
        // Not a building site, and not a damaged or destroyed one: the people
        // around it do the talking.
        if (e._constructing || e._irreparable || e._detonated || e._lightningDamaged || e._ghost) continue;
        const wx = (e.col + (e.width || 1) / 2) * TILE, wy = e.row * TILE;
        if (wx < v.x0 || wx > v.x1 || wy < v.y0 || wy > v.y1) continue;
        if (t - (spokeAt.get(e) || -1e9) < QUIET_FOR) continue;
        if (bubbles.some(b => b.e === e)) continue;
        out.push(e);
      }
    }
    return out;
  }

  // People out in the zones on screen (ZoneLife draws them; this is who it
  // drew last frame), not already speaking.
  function _peopleOnScreen() {
    if (typeof ZoneLife === 'undefined' || !ZoneLife.people) return [];
    const v = _view();
    return ZoneLife.people().filter(p => LINES[p.zone] && p.x >= v.x0 && p.x <= v.x1 && p.y >= v.y0 && p.y <= v.y1
      && !bubbles.some(b => b.pid === p.id));
  }

  // ZoneLife counts the national zone as government; its people are national.
  function _personZone(p) {
    if (p.zone !== 'government' || typeof ZoneSystem === 'undefined') return p.zone;
    try {
      const z = ZoneSystem.getZoneAt(Math.floor(p.x / TILE), Math.floor(p.y / TILE));
      if (z && z.zone && z.zone.label === ZoneSystem.NATIONAL_ZONE_LABEL) return 'national';
    } catch (_e) {}
    return p.zone;
  }

  // A person speaks about the street they're on: the nearest building of
  // their zone stands in for it (no power there, it's dark for them too).
  // Out of reach of one, they still talk about the weather, news, life.
  function _proxyFor(p) {
    let best = null, bd = 10 * 10;
    const pc = p.x / TILE, pr = p.y / TILE;
    for (const type of SPEAKER_TYPES()) {
      let set; try { set = EntityRegistry.getByType(type); } catch (_e) { continue; }
      for (const e of set || []) {
        if (zoneOf(e) !== p.zone || e._constructing || e._irreparable || e._detonated) continue;
        const dx = e.col + (e.width || 1) / 2 - pc, dy = e.row + (e.height || 1) / 2 - pr;
        const d = dx * dx + dy * dy;
        if (d < bd) { bd = d; best = e; }
      }
    }
    return best || { col: Math.floor(pc), row: Math.floor(pr), width: 1, height: 1, powered: true, satisfaction: 70 };
  }

  function _spawn() {
    const list = _candidates(), folk = _peopleOnScreen();
    if (!list.length && !folk.length) return;
    // Sometimes two of them talk to each other (only with the screen clear:
    // an exchange takes both places).
    if (!bubbles.length && folk.length && Math.random() < DIALOGUE_CHANCE) {
      const pair = _dialoguePair(folk);
      if (pair && _startDialogue(pair[0], pair[1])) return;
    }
    // About half of what's said comes from people out and about, when there
    // are any on screen.
    if (folk.length && (!list.length || Math.random() < 0.5)) {
      const p = folk[Math.floor(Math.random() * folk.length)];
      const pz = _personZone(p);
      bubbles.push({ pid: p.id, zone: pz, x: p.x, y: p.y, standing: p.standing,
                     text: _chooseLine(_proxyFor({ ...p, zone: pz }), pz, true), born: now() });
      return;
    }
    // Buildings with something on their minds are likelier to be the ones heard.
    const weightOf = e => (!e.powered ? 4 : 1) * (e._churnWarned ? 2 : 1) * (_news.length && _newsNear(e) ? 3 : 1)
      * (_incidents.length && _incidents.some(n => Math.abs(n.e.col - e.col) < INCIDENT_RADIUS && Math.abs(n.e.row - e.row) < INCIDENT_RADIUS) ? 3 : 1);
    let total = 0; for (const e of list) total += weightOf(e);
    let r = Math.random() * total, e = list[0];
    for (const c of list) { if ((r -= weightOf(c)) <= 0) { e = c; break; } }
    const zone = zoneOf(e);
    if (!zone) return;
    bubbles.push({ e, zone, text: _chooseLine(e, zone), born: now() });
    spokeAt.set(e, now());
  }

  // A cutscene is playing: the intro, Hyperion's stage scenes and finale,
  // the fusion breakthrough, the headquarters' unveiling, a research
  // milestone, the end-of-run sequence, or trailer capture.
  function _inCutscene() {
    try {
      return (typeof NationalProject !== 'undefined' && NationalProject.isActive && NationalProject.isActive())
        || document.body.classList.contains('np-draw')
        || (typeof IntroCinematic !== 'undefined' && IntroCinematic.isActive())
        || (typeof CompanyHQ !== 'undefined' && CompanyHQ.isActive())
        || (typeof FusionResearch !== 'undefined' && FusionResearch.isActive && FusionResearch.isActive())
        || (typeof ResearchMilestone !== 'undefined' && ResearchMilestone.isActive())
        || (typeof ApocalypseSystem !== 'undefined' && (ApocalypseSystem.isActive() || (ApocalypseSystem.hasEnded() && !ApocalypseSystem.isHeld())))
        || (typeof TrailerMode !== 'undefined' && TrailerMode.isActive && TrailerMode.isActive());
    } catch (_e) { return false; }
  }

  // Only at normal speed: paused or fast-forwarding, the city is not
  // chatting (the bubbles would freeze, or flash past unread).
  function _offSpeed() {
    try { return typeof DevMode !== 'undefined' && DevMode.timeScale !== 1; } catch (_e) { return false; }
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
    // A building speaks from the middle of its top edge, a person from just
    // above their head (they are drawn about 9 px tall at zoom 1).
    const ax = e ? (e.col + (e.width || 1) / 2) * TILE : b.x + (b.dx || 0);
    const ay = e ? e.row * TILE : b.y - 9 + (b.dy || 0);
    const sx = (ax - Camera.x) * z;
    const age = now() - b.born;
    const rise = Math.min(1, age / 0.5);
    const sy = (ay - Camera.y) * z - (e ? 8 : 4) - 6 * (1 - (1 - rise) * (1 - rise));
    ctx.save();
    // Sizes 15% under the first cut (12 px text, 190 px wide).
    ctx.font = '600 10.2px Inter, Arial, sans-serif';
    // Every text setting stated here, before measuring: whatever drew last
    // (a banner, a label) may have left the alignment centred or spacing on,
    // which drew the text off to one side of the bubble it was measured for.
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.direction = 'ltr';
    if ('letterSpacing' in ctx) ctx.letterSpacing = '0px';
    if ('wordSpacing' in ctx) ctx.wordSpacing = '0px';
    const lines = _wrap(ctx, b.text, 162);
    const lh = 12.75, padX = 8.5, padY = 6;
    let tw = 0; for (const l of lines) tw = Math.max(tw, ctx.measureText(l).width);
    const bw = Math.ceil(tw) + padX * 2, bh = lines.length * lh + padY * 2;
    const bx = Math.round(sx - bw / 2), by = Math.round(sy - bh - 7);
    ctx.globalAlpha = alpha;
    // A little see-through, so the street shows faintly behind it; a lighter
    // shadow, as it now shows through the fill too.
    ctx.shadowColor = 'rgba(0,0,0,0.17)'; ctx.shadowBlur = 8; ctx.shadowOffsetY = 2;
    ctx.fillStyle = 'rgba(252,253,255,0.68)';   // the bubble only; the text stays solid
    ctx.beginPath();
    ctx.roundRect(bx, by, bw, bh, 7.5);
    // Tail toward whoever is speaking.
    ctx.moveTo(sx - 5, by + bh - 0.5); ctx.lineTo(sx, by + bh + 7); ctx.lineTo(sx + 5, by + bh - 0.5);
    ctx.fill();
    ctx.shadowColor = 'transparent';
    ctx.strokeStyle = 'rgba(30,50,70,0.35)'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.roundRect(bx + 0.5, by + 0.5, bw - 1, bh - 1, 7.5); ctx.stroke();
    ctx.fillStyle = '#1c2a38';
    ctx.textBaseline = 'middle';
    lines.forEach((l, i) => ctx.fillText(l, bx + padX, by + padY + lh * i + lh / 2 + 0.5));
    ctx.restore();
  }

  // Called once a frame by the renderer, after Camera.resetTransform(ctx).
  function render(ctx) {
    if (!enabled) { bubbles.length = 0; return; }
    if (typeof Camera === 'undefined' || typeof EntityRegistry === 'undefined') return;
    _scan();
    const t = now();
    const folk = typeof ZoneLife !== 'undefined' && ZoneLife.people ? ZoneLife.people() : [];
    for (let i = bubbles.length - 1; i >= 0; i--) {
      const b = bubbles[i];
      if (b.e) {
        if (t - b.born > LIFE || !EntityRegistry.getByType(b.e.type)?.has(b.e)) bubbles.splice(i, 1);
        continue;
      }
      // A person: follow them along the sidewalk. Once they're gone (turned
      // the corner, gone indoors) the bubble fades where they were.
      const p = folk.find(q => q.id === b.pid);
      if (p) { b.x = p.x; b.y = p.y; }
      else if (!b.lostAt) b.lostAt = t;
      if (t - b.born > (b.life || LIFE) || (b.lostAt && t - b.lostAt > 0.4)) bubbles.splice(i, 1);
    }
    const z = Camera.zoom;
    const zk = Math.max(0, Math.min(1, (z - CHAT_ZOOM) / (CHAT_ZOOM_FULL - CHAT_ZOOM)));
    if (zk <= 0) return;   // zoomed out: none shown, none started
    // Paused or fast-forwarding: none shown, and the next one waits a beat
    // after normal speed comes back.
    if (_offSpeed() || _inCutscene()) { bubbles.length = 0; nextAt = t + 2 + Math.random() * 3; return; }
    // The apocalypse: from the countdown song through the blast and after,
    // no one speaks (and after it there's no one left to).
    if (typeof ApocalypseSystem !== 'undefined' && (ApocalypseSystem.hasEnded() || ApocalypseSystem.isDramatic())) { bubbles.length = 0; return; }
    if (!nextAt) nextAt = t + 3 + Math.random() * 4;
    if (t >= nextAt) {
      if (bubbles.length < MAX_ON_SCREEN) _spawn();
      nextAt = t + GAP_MIN + Math.random() * (GAP_MAX - GAP_MIN);
    }
    // (A dialogue's later lines wait their turn: born ahead, not drawn yet.)
    for (const b of bubbles) {
      const age = t - b.born;
      const fade = Math.min(1, age / 0.35, ((b.life || LIFE) - age) / 0.6, b.lostAt ? 1 - (t - b.lostAt) / 0.4 : 1);
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
    current: () => bubbles.map(b => ({ text: b.text, zone: b.zone, who: b.e ? 'building' : 'person', in: +(b.born - now()).toFixed(1) })),
    // Dev / tests: start an exchange between two people on screen now.
    devDialogue: () => { const pr = _dialoguePair(_peopleOnScreen()); if (!pr) return null; bubbles.length = 0; return _startDialogue(pr[0], pr[1]); },
    news: () => _news.map(n => ({ kind: n.kind, type: n.e.type, building: n.doneAt === null })),
    // Dev / tests: what this building might say, and which news it would talk about.
    sample: (e, times = 1) => { const z = zoneOf(e); const out = []; for (let i = 0; i < times && z; i++) out.push(_chooseLine(e, z)); return { zone: z, news: _newsNear(e) ? _newsNear(e).kind : null, lines: out }; } };
})();
