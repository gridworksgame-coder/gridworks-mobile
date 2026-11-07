/* ═══════════════════════════════════════════════════════════════════
   COMPENDIUM SYSTEM
   A browsable catalogue of every buildable, civic, property, plant,
   and creature type in the game. Entries only appear once the player
   has unlocked (buildables) or actually encountered (civic buildings,
   property types, fish) that thing — sticky discovery persisted here;
   buildable unlock state is read straight from Progression, which is
   already sticky/persisted on its own.
   ═══════════════════════════════════════════════════════════════════ */
const CompendiumSystem = (() => {
  const CIVIC_TYPES = [T.TOWNHALL, T.CIVICCENTER, T.COURTHOUSE, T.EMS, T.HOSPITAL, T.UNIVERSITY, T.TRANSPORTHUB, T.NATIONALGOV, T.FUSIONLAB, T.AIRPORT, T.MILITARYBASE, T.LAUNCHCOMPLEX, T.NATIONALGRID, T.COMPANYHQ];
  const PARK_TYPES  = [T.SMALLPARK, T.COMMUNITYGARDEN, T.TREEDSTREET, T.BASKETBALLCOURT, T.FARMERSMARKET, T.FOUNTAIN, T.SPLASHPAD, T.BASEBALLFIELD, T.PLAYGROUND, T.ALLOTMENTS, T.DOGPARK, T.COMMUNITYCENTER, T.GREENHOUSE, T.CORNERSTORE, T.FARM];

  const _civicDiscovered    = new Set();
  const _parkDiscovered     = new Set();
  const _tierDiscovered     = new Set();   // 'budget' | 'mid' | 'premium' | 'luxury'
  const _subtypeDiscovered  = new Set();   // `${bucket}:${subtype}` — bucket is 'house' | 'commercial' | 'industrial'

  function _scan() {
    for (const t of CIVIC_TYPES) if (!_civicDiscovered.has(t) && EntityRegistry.getByType(t).size > 0) _civicDiscovered.add(t);
    for (const t of PARK_TYPES)  if (!_parkDiscovered.has(t)  && EntityRegistry.getByType(t).size > 0) _parkDiscovered.add(t);
    for (const e of EntityRegistry.getByType(T.HOUSE)) {
      if (!e.fromRequest) continue;
      if (e.houseWealthTier) _tierDiscovered.add(e.houseWealthTier);
      if (e.commercialSubtype) _subtypeDiscovered.add(`house:${e.commercialSubtype}`);
    }
    for (const e of EntityRegistry.getByType(T.COMMERCIAL))  if (e.fromRequest && e.commercialSubtype) _subtypeDiscovered.add(`commercial:${e.commercialSubtype}`);
    for (const e of EntityRegistry.getByType(T.INDUSTRIAL))  if (e.fromRequest && e.commercialSubtype) _subtypeDiscovered.add(`industrial:${e.commercialSubtype}`);
  }

  // ── Flavor + usage text for every buildable/civic/park type ────────
  const DESCS = {
    // Generation
    [T.BIOFUELGEN]:  { desc: 'A small generator that burns locally sourced biofuel.', use: 'Your first power source; always available, no supply chain required.' },
    [T.SOLAR]:        { desc: 'A basic photovoltaic panel.', use: 'Generates power from sunlight; output scales with time of day and cloud cover. Panels to its south shade it: leave two empty rows between rows of panels (side by side is fine).' },
    [T.SOLAR2]:       { desc: 'An upgraded, high-efficiency solar panel.', use: 'Produces far more peak power than the MK1 panel, for a larger footprint. Panels to its south shade it: leave two empty rows between rows of panels (side by side is fine).' },
    [T.SOLAR3]:       { desc: 'A nuclear-era solar farm block: three sun-tracking panel rows, a molten-salt heat tank, and wash robots that ride rails between the rows.', use: 'Up to 180 kW in full sun. The trackers turn to face the low sun, so it climbs to full output far sooner after dawn and holds it later into dusk. While its tank is filling it sends a quarter of its output there, then uses that heat to keep itself up to 50 kW once the sun cannot: about three hours of power after sunset. Its trackers take no row-shading penalty, so arrays can be tiled edge to edge. The wash robots run on 4 kW of its own output and keep the panels from wearing. Needs the MK4 Research Station and 60 MK1/MK2 Solar Panels on the map.' },
    [T.WIND]:         { desc: 'A turbine that generates power from wind.', use: 'Output fluctuates with wind speed, but never drops to zero.' },
    [T.WIND2]:        { desc: 'A larger, more powerful wind turbine.', use: 'Higher base and peak output than the standard turbine.' },
    [T.WIND3]:        { desc: 'A utility-scale wind turbine with swept carbon blades and its own transformer yard.', use: 'The biggest wind generator: 28 kW in still air up to 49 kW in strong wind, on a 4×4 footprint. Needs Research MK3 and 2.5 MW of consumption.' },
    [T.GEOWELL]:      { desc: 'Sinks a borehole into a geothermal deposit and raises pressurised steam.', use: 'One well per deposit. Press R while placing to turn its steam output port, then build a Geothermal Turbine over that port.' },
    [T.GEOTURBINE]:   { desc: 'Expands geothermal steam through a turbine to generate steady power. Its rating depends on how geothermally active the world is: 25 kW on a dormant world, 45 kW on an intense one, and shifts with the ambient temperature, rising in a heat wave and falling in a cold snap.', use: 'Must cover the output port of exactly one Geothermal Well, and be wired into the grid. One turbine per well.' },
    [T.COALMINE]:     { desc: 'Extracts coal from a nearby coal deposit.', use: 'Feeds coal to a Coal Power Generator via truck or conveyor.' },
    [T.COALMINE2]:    { desc: 'An upgraded coal mine.', use: 'Same coal yield as the MK1 mine, at a higher build and running cost.' },
    [T.GOVERNOR]:     { desc: 'A control cabinet with a spinning flyball governor that bolts onto a generator.', use: 'Place it touching one or more Fuel or Coal Generators. In Overdrive it eases the throttle back toward Normal as heat or boiler pressure passes 80%, so the generator never goes critical and explodes; you keep part of the extra power for a little more fuel. Draws 4 kW from the generator\'s own network; without power it stops protecting.' },
    [T.CARBONCAPTURE]:{ desc: 'A direct-air-capture plant: a wall of big fans pulls air through sorbent beds, and the CO₂ they catch is compressed, banked in pressure cylinders and pumped down an injection well.', use: 'Wire it into the grid (120 kW). While powered it captures half the emissions of every polluting plant within 40 tiles, cutting the carbon tax and the approval drain, and pulls smog out of the air there. Build it right beside your dirtiest plants; overlapping plants stack, each taking half of what is left. Unlocks after you have paid $200,000 in carbon tax with a Research Station MK3 standing.' },
    [T.COALGENERATOR]:{ desc: 'Burns coal to generate substantial power.', use: 'Needs a steady coal and water supply; produces ash waste that must be trucked away. Set the throttle in its panel: Eco stretches your coal, Overdrive gives 50% more power but builds boiler pressure; held at 100% for too long the boiler bursts, destroying nearby buildings, pipes, wires and belts and setting off nearby generators (rebuilding costs 80–92% of their value). Protect it with a Throttle Governor.' },
    [T.WATEREXTRACTOR]:{ desc: 'Draws water from a lake or river.', use: 'Puts 25 units/s into the pipe network it feeds. A Coal Power Generator draws 10 units/s, so one extractor runs two of them; a third needs another extractor, which can be piped into the same run to pool supply.' },
    [T.PUMPJACK]:     { desc: 'Extracts crude oil from an oil deposit.', use: 'Feeds crude oil to a Refinery via pipe.' },
    [T.PUMPJACK2]:    { desc: 'A heavy-duty pump jack with a bigger beam and an electric drive.', use: 'Pumps 30% more crude than the MK1; enough to overfill a single Refinery. It drains its deposit 30% faster to match, so the same oil comes out sooner. Centres on the deposit.' },
    [T.SOLIDSTORAGE]: { desc: 'A covered bulk bin that stockpiles any belt-carried solid; coal, ore, lithium compound, fuel rods or fuel pellets. Holds 1,000 units of one kind at a time.', use: 'Belt a producer into its IN stub (left face) and belt its OUT stub (right face) on to whatever consumes that solid; press R while placing to swap the sides. Whatever eats directly off the producer is always fed first and only the surplus is banked, so a stockpile keeps a plant running when a mine can’t keep up, loses power, or its deposit runs dry. Empty it and it will take a different solid. Needs no power.' },
    [T.OILSTORAGE]:   { desc: 'A large tank for buffering any liquid; crude, water, acid or fuel oil. Holds 1,000 units of one kind at a time.', use: 'Pipe a producer into either stub and a consumer into the other: whichever side the producer is on becomes IN and the other becomes OUT. Press R to flip both stubs to the opposite face. Empty it and it will take a different liquid. Needs no power.' },
    [T.REFINERY]:     { desc: 'Refines crude oil into usable fuel oil. Distillation also splits off a little LPG; propane and butane, about 3–4% of the crude, which the flare stack burns off, as real refineries do with gas they have no outlet for.', use: 'Consumes crude oil and produces fuel oil for Fuel Generators, plus sludge waste for disposal.' },
    [T.FUELGEN]:      { desc: 'A big diesel engine that burns refined fuel oil. It cranks, warms up, and can backfire.', use: 'Needs fuel oil piped from a Refinery. Set the throttle in its panel: Eco saves fuel, Overdrive gives 50% more power but overheats; held at 100% heat for too long the engine explodes, destroying nearby buildings, pipes, wires and belts and setting off nearby generators (rebuilding costs 80–92% of their value). Protect it with a Throttle Governor.' },
    [T.HYDROGENERATOR]:{ desc: 'Generates power from flowing water.', use: 'Place near a river or reservoir for a large, steady power output.' },
    [T.URANIUMMINE]:  { desc: 'Extracts uranium ore from a uranium deposit.', use: 'Supplies uranium to the Fuel Processing Plant to manufacture fuel rods.' },
    [T.SULFURMINE]:   { desc: 'Extracts sulfur ore from a sulfur deposit.', use: 'Supplies sulfur to the Chemical Plant to manufacture sulfuric acid.' },
    [T.SULFURMINE2]:  { desc: 'A Sulfur Mine with two and a half times the extraction rate.', use: 'Build it on a sulfur deposit, or over a Sulfur Mine to replace it in place. Drains its deposit two and a half times as fast.' },
    [T.LITHIUMMINE]:  { desc: 'Extracts raw lithium ore from a lithium deposit.', use: 'Supplies ore to the Lithium Processing Plant.' },
    [T.RAREEARTHMINE]:{ desc: 'A dredge pit on a rare earth deposit: monazite sand, the heavy-mineral beach sand banded honey-red and black, run through a magnetic separator that pulls the rare earth grains out.', use: 'Belt its OUT stub (end of the rail, R flips the side) to a Leach Plant. Same rate as a Uranium Mine, 0.8 ore/s. The first link of the Field Core chain; the scan that finds its deposits opens after burning 100 D-He3 pellets in an Advanced Fusion Reactor.' },
    [T.SCMILL]:       { desc: 'Grows high-temperature superconductor tape: rare earth oxide is laid down on a metal substrate in a hydrogen atmosphere, and every metre is tested cold in liquid nitrogen, the temperature it superconducts at.', use: 'Belt oxide into OXIDE IN, pipe hydrogen into H₂ IN and nitrogen into N₂ IN (from an Electrolyzer and an Atmosphere Collector, or Gas Holders), and belt TAPE OUT to a Core Works or a Storage Container. 0.1 tape/s, about one Field Core\'s worth a day. Opens at Operation Hyperion Stage III.' },
    [T.COREWORKS]:    { desc: 'Winds superconductor tape into Field Cores and charges them: a superconducting magnet really is charged with current, and holds it, slowly losing it as it works.', use: 'Belt tape into TAPE IN. Four bays: it recharges a spent core first (28 tape, double if the core quenched), otherwise winds a new one into an empty bay (120 tape), then charges it for 4 in-game hours. 100 kW idle, 800 kW while charging; switch on Off-Peak to charge only between 22:00 and 06:00. Opens at Operation Hyperion Stage IV, completing the chain.' },
    [T.LEACHPLANT]:   { desc: 'Digests rare earth ore in hot sulfuric acid and dries what comes out into rare earth oxide; the way monazite is really processed.', use: 'Belt ore into ORE IN, pipe acid from a Chemical Plant into ACID IN (it takes 0.28 of a plant\'s 0.6/s, so one plant feeds two), and belt OXIDE OUT to a Storage Container. Monazite carries thorium, so the leach leaves mildly radioactive tailings: a full tailings store (100 units, about two in-game days) stops the plant, and trucks or drones have to haul them to the Nuclear Waste Processing Facility. Either full store stops it.' },
    [T.COKEOVEN]:     { desc: 'A battery of tall, narrow slot ovens, brick-lined and side by side, that bake coal for hours with no air until everything volatile has been driven off. A pusher ram shoves each glowing charge out into a quench car, which runs it under the quench tower for a cloud of steam; the gas collected off the top of the ovens is about half hydrogen.', use: 'Belt coal into COAL IN from a Coal Mine or a coal Storage Container: generators on the same line eat first, then ovens, then bins. 1.5 coal/s makes 1.1 coke/s, which leaves on COKE OUT; bank it in Storage Containers. Pipe GAS OUT to a Gas Holder, a Haber-Bosch Complex or a Superconductor Mill as hydrogen (24/s, no water needed); whatever it can\'t send is flared. A full coke store stops it. Unlocks with the MK4 Research Station, once an Advanced Nuclear Reactor has run and 250,000 total coal has been mined.' },
    [T.GRAPHITEFURNACE]: { desc: 'An Acheson furnace: a long trough of coke packed round carbon electrodes, under a cover of sand and coke breeze, and cooked white-hot by a current measured in tens of thousands of amps until its carbon reorders into graphite. Real ones run for days a batch and are some of the hungriest loads on any grid.', use: 'Belt coke into COKE IN from a Coke Oven Battery or a Storage Container banking coke, and belt GRAPHITE OUT to an Advanced Nuclear Reactor\'s GRAPHITE IN or a Storage Container. 0.6 coke/s makes 0.3 graphite/s, enough for three Advanced Reactors. Draws 120 kW the whole time it runs. A full graphite store stops it. Unlocks once the Coke Oven Battery is unlocked and 1,500 coke has been made.' },
    [T.CHEMICALPLANT]:{ desc: 'Processes sulfur and water into sulfuric acid.', use: 'Feeds acid to the Fuel Processing Plant for nuclear fuel rod production.' },
    [T.FUELPLANT]:    { desc: 'Manufactures nuclear fuel rods.', use: 'Consumes sulfuric acid and uranium to produce fuel rods for the Nuclear Reactor.' },
    [T.NUCLEARREACTOR]:{ desc: 'A large-scale reactor that produces thermal steam output.', use: 'Consumes fuel rods and feeds steam to connected Steam Turbines; produces nuclear waste. MUST be cooled: it needs 20 u/s of cooled water at its COOL IN (two Cooling Towers). Run it short of that and the core overheats within a minute, then goes critical, and after 30 more seconds it detonates, levelling everything within 72 tiles. Taking it off the grid (by cutting its fuel) slows the heating, but decay heat keeps climbing for a while, so leave it late and it goes up anyway. The blast leaves the ground contaminated for days: nothing can be built near ground zero for 2 days, then only lines for the next 10 days, and building costs +50% until it recovers after 17.' },
    [T.COOLINGTOWER]: { desc: 'Cools a nuclear reactor to keep it running at full output.', use: 'Pipe water from a Water Extractor (or a water Storage Tank) into its H₂O IN; it draws 15 u/s, then pipe its COOL OUT into a Nuclear Reactor\'s COOL IN to keep the core from overheating. Each tower puts out 15 u/s and a reactor needs 20, so it takes two towers per reactor. Needs power, and a sudden outage has a 40% chance of tripping its pumps, which then need 45s of steady power to restart while the reactor heats. Cuts caused by the weather (storm-tripped lines, geomagnetic storms) never trip them. Its basin holds 60s of water, so if the water supply is cut (a tripped line taking the Water Extractors down) it keeps cooling while you repair it. Keep the grid stable.' },
    [T.COOLINGTOWER2]: { desc: 'A refrigerated chiller train that turns cooled water into Cryogenic Coolant for a MOX core.', use: 'Pipe cooled water from Cooling Towers into COOL IN; it draws 70 u/s, and run CRYO OUT into an Advanced Nuclear Reactor\'s CRYO IN. It pours 48 u/s of Cryogenic Coolant (periwinkle in the pipes) against that reactor\'s 44, so ONE of these cools a MOX core. Ordinary cooled water will not. Where the MK1 is a concrete shell that cools by letting air fall through it, this one refrigerates, which is why it draws 110 kW rather than 15. Its variable-speed drives ride through a flicker better too: a 20% chance of tripping on an outage against the MK1\'s 40%, and 25s to restart rather than 45. Not immunity; an uncooled MOX core goes critical in 35 seconds, so 25s of restart can still lose you the reactor.' },
    [T.STEAMTURBINE2]: { desc: 'A high-pressure tandem turbine set: HP, IP and three LP casings on one shaft, moisture-separator reheaters and a water-cooled generator. 1.2 MW from 400 steam.', use: "Pipe a reactor's steam into STEAM IN (left face, on the shaft) and wire it to the grid. Same steam-to-power rate as the MK1, but one does the work of four for a little less money, upkeep and ground: five run a D-T Fusion Reactor, three an Advanced Nuclear Reactor. It needs its full 400 steam spare on a reactor to turn at all, so mix in MK1s to use up an odd remainder. Unlocks once four Steam Turbines run at once on Fusion Reactor steam." },
    [T.STEAMTURBINE]: { desc: 'Converts reactor steam into electrical power.', use: "Draws steam from a connected Nuclear Reactor's shared budget to generate power, or from a Fusion Reactor burning D-T fuel, whose breeding blanket raises enough steam for twenty." },
    [T.ELECTROLYZER]: { desc: 'Splits water into hydrogen gas via electrolysis.', use: 'Feeds hydrogen to the Haber-Bosch Complex for ammonia production.' },
    [T.LITHIUMPROCESSPLANT]:{ desc: 'Refines raw lithium ore into lithium compound.', use: 'Consumes ore from a Lithium Mine and 5 u/s of water from its pipe (one Water Extractor runs five); its compound is what tritium is bred from; first in a Tritium Breeding Facility, later in the Fusion Reactor\'s breeding blanket (Li COMPOUND IN).' },
    [T.SPENTFUELPOOL]:{ desc: 'A water-filled cooling pool that buffers spent reactor fuel on its way to reprocessing.', use: 'Belt it in from a reactor\'s SPENT FUEL OUT and belt it on to a Reprocessing Plant. It is a required step: the Reprocessing Plant only takes fuel that has cooled in a pool. It pulls about thirty times faster than one reactor produces, so reactors never back up to the level where they stop generating, and it keeps the plant fed through an outage. Fuel that arrives is far too hot to handle and must sit under water before it can be drawn; a gameplay-scaled stand-in for the years a real pool needs. Power runs the circulation: cut it and the stock is still safe, but nothing cools and nothing comes in. It is the only building that may bank spent fuel; a Storage Container cannot.' },
    [T.DRONECHARGER]: { desc: 'A 5×5 relay deck: a charging mast with five booms running out to five induction pads. No hangar, no tower and no drones of its own.', use: 'Adds a 122×122 tile square of coverage to any drone network it touches, for a quarter of what a Drone Port costs. Drones crossing the network set down on a free pad to recharge and carry on, so a chain of charging ports carries a fleet a long way from its home port. Five pads charge five drones at once; a sixth waits off the deck. Idles at 10 kW and adds up to 30 kW per drone charging. It needs at least one Drone Port in its network, and it needs power: a dark charging port charges nobody. Unlocks with 3 Drone Ports standing and the MK4 Research Station.' },
    [T.DRONEPORT]:    { desc: 'A 9×9 vertiport: ten marked touchdown pads, a charging gantry and a control tower for a fleet of ten autonomous service drones.', use: 'Ten drones fly out of every port. They travel in straight lines with no roads and no fuel stops, at more than twice a truck\'s patrol speed, but only inside the port\'s square of coverage. Ports whose squares touch join into one network, and any of its drones can work anywhere inside it, so a chain of ports covers a district rather than a block; still the answer to local work, not long haul. Each carries a limited battery and turns for home while it still has the range to get back, so distant jobs cost proportionally more airtime. The port draws a little power all the time and a lot more while drones recharge on their pads, so the big load lands right after a busy repair push, when the fleet comes home low. The fleet that repairs your grid is paid for by that grid. In a storm, rainstorm or blizzard the fleet keeps flying but slows to half speed or less, bucking the wind, so jobs take longer; they cannot save you from the lightning, only clean up after it.' },
    [T.MOXPLANT]:     { desc: 'A shielded fabrication line that blends plutonium back into uranium as reactor fuel.', use: 'Belt plutonium into one intake and uranium into the other, then belt MOX fuel rods out to an Advanced Nuclear Reactor. The uranium intake takes recovered uranium and mined ore interchangeably; both are the fertile matrix and neither needs enriching, so a reprocessor that cannot keep up is simply topped up off an ore belt. Recovered uranium is always drawn first, which is what stops the Reprocessing Plant stalling on a full recovered buffer. Each rod is about 10% plutonium, the top of the real MOX range. No water: fabrication is dry powder metallurgy, handled in sealed gloveboxes.' },
    [T.ADVREACTOR]:   { desc: 'A reactor built to burn MOX; plutonium recycled out of its own spent fuel.', use: 'Belt MOX rods into ROD IN, pipe Cryogenic Coolant from a Cryogenic Cooling Tower into CRYO IN and steam out to Steam Turbines. Ordinary cooled water from MK1 Cooling Towers will not cool it. Raises 1200 steam (twelve Steam Turbines) against the MK1\'s 300 on the same burn rate, and takes 9 in-game days to fill its cask store rather than 6; a sixth of the spent fuel per unit of energy, because burning plutonium consumes material the fission chain already made. ☢ It is far less forgiving: a MOX core has a smaller delayed-neutron fraction, so uncooled it reaches critical in about 35 seconds instead of 60, and its 44 u/s Cryogenic Coolant demand needs a working Cryogenic Cooling Tower or it will melt down. Belt graphite into GRAPHITE IN (bottom face) and its reflector raises 20% more steam off the same MOX, wearing through 0.1 graphite/s while it generates; optional, and the reactor runs without it.' },
    [T.REPROCESSOR]:  { desc: 'Dissolves spent reactor fuel and separates it into plutonium, recovered uranium and high-level waste.', use: 'Belt cooled spent fuel in from a Spent Fuel Pool\'s COOLED FUEL OUT and give it a water pipe. It only takes fuel that has cooled in a pool: a belt straight off a reactor feeds it nothing. Each unit yields 0.6 recovered uranium and 0.15 plutonium; the rest is fission products that are simply gone, so the loop never closes. The 0.1 units of high-level waste left behind still has to be trucked to the Nuclear Waste Processing Facility: reprocessing concentrates the waste problem, it does not delete it. Any full output buffer stops the plant, so belt the recovered uranium somewhere even if you only want the plutonium.' },
    [T.ATMOSCOLLECTOR]:{ desc: 'Extracts nitrogen gas from the atmosphere.', use: 'Supplies nitrogen to the Haber-Bosch Complex for ammonia production.' },
    [T.HABERBOSCH]:   { desc: 'Synthesizes ammonia from nitrogen and hydrogen gas.', use: 'Consumes output from the Atmosphere Collector and Electrolyzer.' },
    [T.WASHTOWER]:    { desc: 'Extracts deuterium gas through an isotopic water wash process.', use: 'Needs a water pipe and an Ammonia Gas line from a Haber-Bosch Complex (the ammonia is a catalyst; it isn\'t used up); supplies deuterium to the Fusion Fuel Plant.' },
    [T.TRITIUMBREEDER]: { desc: 'An accelerator-driven tritium breeder: a long linear accelerator fires protons into a heavy-metal target, and the spallation neutrons turn a surrounding lithium blanket into tritium; the scheme the US planned in the 1990s instead of building a new reactor.', use: 'Belt Lithium Compound into LITHIUM IN and pipe TRITIUM OUT to a Fusion Fuel Plant\'s TRITIUM IN. It is how you make your first D-T pellets, before you have a Fusion Reactor, but it is slow and hungry: 125 kW for enough tritium to run a Fuel Plant at about 6% speed. Once a reactor\'s breeding blanket is feeding the Fuel Plant, the facility\'s buffer backs up and it idles, handing the 125 kW back.' },
    [T.FUSIONFUELPLANT]:{ desc: 'Freezes fusion fuel into pellets for the reactors\' pellet injectors. It makes D-T pellets (deuterium + tritium) for the Fusion Reactor, and once the Helium-3 Separator is unlocked it splits its output: one D-He3 pellet (deuterium + helium-3) for every three D-T, for the Advanced Fusion Reactor.', use: 'Pipe deuterium into D₂ IN, and tritium from the reactor\'s TRITIUM OUT into TRITIUM IN (a Tritium Breeding Facility starts the loop before you have a reactor). D-T pellets leave by conveyor from D-T PELLETS OUT; bank the early ones in a Storage Container, since making them unlocks the Fusion Reactor. HE-3 IN and D-He3 OUT stay capped until the Helium-3 Separator unlocks; then pipe helium-3 into HE-3 IN and belt D-He3 OUT to Storage Containers, since banking 200 D-He3 pellets unlocks the Advanced Fusion Reactor. Either output filling up never stops the other.' },
    [T.HULKINGFUSIONREACTOR]:{ desc: 'A massive tokamak fed by frozen fuel pellets, its plasma held by superconducting magnets.', use: 'Its magnets need liquid helium (LHe) from a Cryo Plant piped into LHe IN: once they reach 4.5 K with a full charge, a 5 MW startup surge ignites it. On D-T fuel most of the energy leaves as neutrons, caught by a lithium breeding blanket (Li COMPOUND IN): the heat leaves as steam (the main outlet) for twenty Steam Turbines, and the lithium becomes tritium (TRITIUM OUT) for the Fuel Plant. On D-He3 fuel it sends an ion stream to an MHD Ring instead. If cooling fails the magnets warm, and at 9 K they QUENCH; the plasma dies, most of the helium is vented, and it has to cool down and pay the surge again.' },
    [T.ADVFUSIONREACTOR]: { desc: 'A five-period stellarator: fifty twisted superconducting coils hold a D-He3 plasma steady without the plasma current a tokamak needs, hot enough for aneutronic fusion.', use: 'Belt D-He3 pellets into PELLETS IN, pipe liquid helium (LHe) into LHe IN (its magnets boil off six times as much as the Fusion Reactor\'s: two or three Cryo Plants) and HE ASH OUT back to them, and Cryogenic Coolant from two Cryogenic Cooling Towers into CRYO IN for the converters\' waste heat. Its two ION OUT ports stream charged particles, through its own direct energy converters, to MHD Decelerator Rings; there is no blanket and no steam. It burns D-He3 only (D-T pellets on its belt are refused), takes a 12 MW surge to light, and streams enough ions for four MHD Rings; short of coolant its converters derate to 30%.' },
    [T.MHDRING]:      { desc: 'Direct energy conversion: decelerates a fusion ion stream to turn it straight into electricity.', use: 'Only works on D-He3 fuel, whose energy comes out as charged particles; pipe it from an Advanced Fusion Reactor\'s ION OUT (one reactor feeds four). D-T fuel\'s energy leaves as neutrons, so the Fusion Reactor\'s goes to Steam Turbines instead.' },
    [T.GASSTORAGE]:   { desc: 'A Horton sphere that stockpiles up to 5,000 units of one process gas; hydrogen, nitrogen, ammonia, deuterium, tritium, helium or helium-3.', use: "Pipe a producer into GAS IN and GAS OUT on to the consumer. The producer keeps about five seconds of its output and the rest is banked, so a plant drawing straight off the producer is always fed first. The stock carries a plant through a power cut or a slow producer. Empty it and it will take a different gas. Needs no power." },
    [T.HE3SEPARATOR]: { desc: 'Distils helium-3 out of helium gas by cryogenic distillation.', use: 'Pipe helium gas from Helium Wells into HE IN (fusion ash is pure helium-4, so it won\'t do) and HE-3 OUT into a Fusion Fuel Plant\'s HE-3 IN for D-He3 fuel. Rates are scaled for gameplay; real helium carries about 1 part per million helium-3.' },
    [T.HELIUMWELL]:   { desc: 'Draws helium-rich natural gas from a helium gas field and separates out the helium.', use: 'Placed on a helium gas field found by a Helium Scan. Pipe its HE OUT to a Cryo Plant.' },
    [T.HELIUMWELL2]:  { desc: 'A Helium Well with three times the separation capacity, for the Advanced Fusion Reactor\'s magnets.', use: 'Build it on a helium gas field, or over a Helium Well to replace it in place. Drains its field three times as fast.' },
    [T.CRYOPLANT]:    { desc: 'Liquefies helium gas down to 4 K for the Fusion Reactor\'s superconducting magnets.', use: 'Pipe helium gas into HE IN (from Helium Wells, and the reactor\'s HE ASH OUT to recycle fusion ash) and LHe OUT (liquid helium) into the reactor\'s LHe IN. It must stay powered: a sudden outage has a 40% chance of tripping its compressors for 45s, and the magnets warm the whole time; at 9 K they quench.' },
    // Grid
    [T.WIRE]:         { desc: 'Basic electrical conduit connecting power sources to consumers.', use: 'Links generators, poles, and buildings together; has a maximum throughput before overloading.' },
    [T.POLE]:         { desc: 'An anchor point that extends wire connection range.', use: 'Wires can stretch up to 4 tiles from a pole before needing another anchor.' },
    [T.POWERTOWER]:   { desc: 'A tall transmission tower for long-distance power routing.', use: 'Building one upgrades the whole grid to Wire MK2, letting wires stretch up to 8 tiles from any non-pole anchor (generators, buildings, towers). Poles still cap at 4 tiles.' },
    [T.PROTECTOR]:    { desc: 'Shields the grid from power surges.', use: 'Works passively without needing power. Adds 170 kW to the wire capacity of its entire connected network, every unit, with no limit: one lifts the base 85 kW to 255 kW, four to 765 kW. MK2 and MK3 do the same job with far more per unit.' },
    [T.PROTECTOR2]:   { desc: 'An upgraded surge protector.', use: 'Adds 2.1 MW to its whole network’s wire capacity, every unit, with no limit, and cuts storm fault chance toward 12%. Twelve MK1s’ worth of capacity on a 2×2 pad, for about a third of the price.' },
    [T.PROTECTOR3]:   { desc: 'A gas-insulated substation-class arrester bay.', use: 'The top surge tier: adds 9 MW to its network’s wire capacity, every unit, with no limit, and cuts storm fault chance toward 3%. Over four MK2s’ worth of capacity on one 3×3 pad, with far less upkeep. Draws 6 kW.' },
    [T.BATTERY]:      { desc: 'Stores excess power for later use.', use: 'Charges from surplus generation and discharges during shortfalls to smooth out supply. Warning: a lightning strike detonates a charged bank; keep it clear of buildings, or cover it with a Lightning Rod.' },
    [T.CONVEYOR]:     { desc: 'A belt that transports solid resources between facilities.', use: 'Moves coal, ore, and other bulk materials without needing a truck.' },
    [T.UNDERGNDCONVEYOR]: { desc: 'A conveyor belt that tunnels beneath the surface.', use: 'Place one at each end, up to 8 tiles apart on the same axis, to carry a belt under a crossing belt, a road or a building.' },
    [T.CONVEYORSPLITTER]: { desc: 'A diverter box that sits on a belt junction.', use: 'Decides how a short supply divides where a line branches: Even, Priority (one way filled first) or Ratio (one way gets a set share). Drop it on any plain belt tile; hover and press R to turn its favoured side, or set it in its panel.' },
    [T.PIPE]:         { desc: 'Transports liquid and gas resources between facilities.', use: 'Connects extractors, refineries, and processing plants above ground.' },
    [T.UNDERGNDPIPE]: { desc: 'An underground variant of the standard pipe.', use: 'Routes liquid and gas resources beneath buildings and roads.' },
    // Stations
    [T.RESEARCH]:     { desc: 'Generates research points toward new unlocks.', use: 'Must be powered to produce research points over time.' },
    [T.RESEARCH2]:    { desc: 'An upgraded research station.', use: 'Produces research points faster than the MK1 station.' },
    [T.RESEARCH3]:    { desc: 'A high-tier research station.', use: 'Produces research points significantly faster than earlier tiers.' },
    [T.MK4RESEARCH]:  { desc: 'A fusion-era laboratory, and the proving ground for the MK5.', use: 'Produces research points faster than the MK3, and is the prerequisite for the MK5 Research Station.' },
    [T.MK5RESEARCH]:  { desc: 'The most advanced research station available; a star in a bottle, ringed by its own accelerator.', use: 'Produces research points at the highest rate in the game, and gates every fusion-tech building from the Electrolyzer to the MHD Decelerator Ring.' },
    [T.BEACON]:       { desc: 'A long-range transmitter that puts your grid on the map. Other utilities start sending contract work once it is live.', use: 'Must be built and powered to open the contract board.' },
    [T.MONITOR2]:     { desc: 'A grid operations centre. Everything the Monitoring Station does, plus the Network Breakdown window, the storage readout in the GRID panel, and early warnings before a network fails.', use: 'Build one to open the Network Breakdown from the GRID panel or from any wire, pole or tower, and to see what your Substations and Battery Blocks are holding.' },
    [T.ENGOFFICE]:    { desc: 'A 10×8 campus round a glass-domed situation room where a model of your network turns on a holo table, with a drawing wing, a drone deck for its inspection drones and a radar mast. Its engineers audit the pipes and fuel chains you have built.', use: 'Build one (once 3 Nuclear Reactors have run at once) to buy Engineering Audits. Each audit costs a fee and reports what is holding a chain back, why it matters, and numbered steps to fix it, with tiles you can click to jump to. It is a snapshot: commission another once you have made changes.' },
    [T.MONITOR]:      { desc: 'A monitoring station that unlocks population and analytics panels.', use: 'Must be built and powered to view the city population breakdown.' },
    [T.SUBSTATION]:   { desc: 'Stores surplus power from your grid and releases it to cover shortfalls.', use: 'Charges automatically when generation exceeds demand, then discharges to keep the grid powered during a deficit. Still needs to be wired into the network like anything else. Warning: lightning detonates a charged substation, wrecking and igniting everything within several tiles; site it well away from your city or under a Lightning Rod.' },
    [T.SUBSTATION5]:  { desc: 'Helios: an 8×8 stellar vault holding its charge as a captive miniature star, turning inside an armillary of magnetic rings, fed plasma by eight crystal-headed monoliths.', use: 'Stores 8 MWh and discharges up to 8 MW: a fusion-age city through the night. Needs the MK5 Research Station and a Fusion Reactor that has put power on the grid.' },
    [T.SUBSTATION4]:  { desc: 'The Aegis: a 6×6 storage citadel. A superconducting ring round a plasma core that glows from cyan to white as it fills, a gyroscope ring turning inside it, and four Tesla capacitor spires that arc to each other while it charges.', use: 'Stores 3 MWh and discharges up to 3 MW: a big city through the night, or through a plant tripping. Needs the MK4 Research Station and 10 MW of generation.' },
    [T.SUBSTATION3]:  { desc: 'A 4×4 grid-scale storage yard built around a superconducting magnetic ring, flanked by four capacitor banks.', use: 'Stores 1.2 MWh and discharges up to 1.2 MW; enough to carry a city through the night. Needs Research MK3 and 3.5 MW of generation. Keep it well away from houses: a charged MK3 is a very large lightning target.' },
    [T.SUBSTATION2]:  { desc: 'An upgraded substation with greater storage capacity and discharge rate.', use: 'Charges and discharges the same way as the MK1 substation, just with a bigger buffer, and a correspondingly bigger blast radius if lightning finds it charged. The most dangerous building on the map to put next to your houses.' },
    [T.SURVEY]:       { desc: 'A mobile field survey crew: a survey truck with a telescoping dish mast, a vibroseis thumper that shakes the ground and a line of geophones listening for the echoes. Scans the surrounding terrain for hidden resource deposits.', use: 'One scan at a time, paid per scan; draws extra power while it runs. The last scans in the chain (lithium, helium, rare earth) need the MK2.' },
    [T.SURVEY2]:      { desc: 'A 6×6 geophysics observatory: twin dish towers on a shared control block, a core-drilling derrick and a field of geophones.', use: 'Runs two scans at once, one per dish, and every scan started here costs 25% less. The only station that can run the Lithium, Helium and Rare Earth scans. Each running dish draws its own scan power.' },
    // Amenities
    [T.LAMP]:         { desc: 'A street lamp that lights the surrounding area.', use: 'Boosts nearby resident satisfaction and speeds up recovery after outages.' },
    [T.CAMERA]:       { desc: 'A security camera that reduces blackout impact.', use: 'Boosts nearby satisfaction and reduces reliability decay during outages.' },
    [T.LIGHTNINGROD3]: { desc: 'A storm spire: twin capture toroids over a plasma column, with a capacitor bank at its base. The top Lightning Rod tier.', use: 'Intercepts 93% of strikes alone across 54 tiles, and returns 70 kW (up to 130 kW stacked) to the grid over 2 in-game hours. Stacks with MK1 and MK2 rods, and keeps storage banks in range from detonating. Unlocks on the MK4 Research Station at $4,000/s income.' },
    [T.LIGHTNINGROD2]: { desc: 'A resonant capture tower; the upgraded Lightning Rod.', use: 'Intercepts 82% of strikes alone across 26 tiles, and returns 24 kW (up to 42 kW stacked) to the grid over 1.5 in-game hours. Stacks with MK1 rods, and keeps storage banks in range from detonating.' },
    [T.LIGHTNINGROD]: { desc: 'A grounded steel mast that draws lightning away from nearby buildings.', use: 'Protects everything within 14 tiles during rainstorms. Overlap rods to stack the reduction. A covered storage bank is safe from detonating; including from a nearby blast or a fire reaching it. Wire one in and every strike it takes returns 10 kW to the grid, trickling to 0 over an in-game hour; a second strike mid-surge stacks it up to 18 kW.' },
    [T.EVCHARGER]:    { desc: 'A public electric vehicle charging station.', use: 'Unlocked once an EV Battery Factory is running, after which residential zones start requesting one; same zone-request path as Cell Towers and Fiber Hubs. Can only be built where a zone has asked for it. Boosts nearby satisfaction the most of any amenity and attracts wealthier customers.' },
    [T.CELLTOWER]:    { desc: 'Provides cellular connectivity to the surrounding area.', use: 'Generates steady income once built and powered, and gives a modest satisfaction boost to nearby customers.' },
    [T.CIRCUITSWITCH]: { desc: 'A manual feeder breaker. Buildings are assigned to its circuit from its panel, up to 500 kW of peak load.', use: 'Open the circuit during a shortfall to cut only those buildings; their draw leaves the network, so the rest of your grid stays lit. Draws no power itself, so it can still be thrown in a blackout. Shed buildings stop paying while they are dark.' },
    [T.CIRCUITSWITCH2]: { desc: 'A larger armoured switchgear compound with a bigger roster; up to 1.4 MW of peak load, nearly three MK1s in one footprint.', use: 'Same job as the MK1, sized for a bigger city: cover a whole district\'s worth of buildings on one breaker instead of running three. Open it during a shortfall to shed the whole roster at once, or leave Auto Shed on and it trips itself when its network would otherwise go dark, then closes again once there is spare generation.' },
    [T.FIBERHUB]:     { desc: 'Provides high-speed fiber connectivity to the surrounding area.', use: 'Generates steady income once built and powered.' },
    [T.FISHINGPOLE]:  { desc: 'A tool that lets you fish in nearby water.', use: 'Select near water to cast a line and try to catch fish for biofuel and cash.' },
    // Vehicles
    [T.TRUCK]:        { desc: 'A vehicle that hauls waste across the map.', use: 'Automatically collects waste from generators and delivers it to processing facilities.' },
    [T.HAULER]:       { desc: 'A cargo truck: bigger and slower than the Waste Truck, built to move resources instead of waste.', use: 'Open a Storage Container, Liquid Storage Tank or Gas Holder and click Request Truck Supply to choose a material. Haulers then run by themselves: they load surplus from producers and unflagged storage, deliver it to the flagged vessel, and refuel at Gas Stations. They carry 200 units a trip of ore, coal, rods, crude, fuel oil, water or acid, or 750 of a process gas such as helium or hydrogen in a tube trailer, one kind at a time, and leave a producer its 20% reserve. They need road access at both ends.' },
    [T.ROAD]:         { desc: 'A road tile that trucks travel along.', use: 'Connects facilities to processing plants so trucks can navigate between them.' },
    [T.BRIDGE]:       { desc: 'A steel truss span on concrete piers. Pieces join up as you lay them: straight runs, corners and T-junctions, with abutments where they meet the bank.', use: 'Drag across a lake or river so trucks can drive straight over. Costs the road price plus $100 for every water tile it spans. Unlocking it also lets you build any building over water, for a $250 fill charge per water tile. Neither works over a dam reservoir.' },
    // Civic buildings
    [T.TOWNHALL]:     { desc: 'The seat of local government.', use: 'Earned once your city hits population and reliability milestones; generates steady income.', icon: '🏛️' },
    [T.CIVICCENTER]:  { desc: 'A hub for community services.', use: 'Earned at a higher population and satisfaction threshold; generates income.', icon: '🏢' },
    [T.COURTHOUSE]:   { desc: "The city's judicial building.", use: 'Requires high reliability and an active Coal Generator; generates income.', icon: '⚖️' },
    [T.EMS]:          { desc: 'Emergency medical and fire services headquarters.', use: 'Requires a large population and an active Fuel Generator; generates income.', icon: '🚑' },
    [T.HOSPITAL]:     { desc: "The city's primary healthcare facility.", use: 'Requires a very high population, reliability, and an active Hydro Generator; generates income.', icon: '🏥' },
    [T.UNIVERSITY]:   { desc: 'A center of higher education.', use: 'Requires a large population and an active nuclear Steam Turbine; generates income.', icon: '🎓' },
    [T.NATIONALGOV]: { desc: 'The seat of national government: a domed capitol with colonnaded wings, a reflecting pool and a flag-lined plaza.', use: 'Founds the National Government Zone out in the world once your MK4 Research Station is built; run power out to it. 120 kW overnight, 260 kW through office hours.', icon: '🏛️' },
    [T.FUSIONLAB]: { desc: 'A national fusion research lab built around an experimental tokamak, with flywheel generators, a helium cryoplant and a shielded tritium lab.', use: 'Joins the National Government Zone once the MK5 Research Station is built, and starts researching fusion. Every half hour from 09:00 to 18:00 it fires a plasma shot that pulls 1 MW while it lasts (idling at 280–430 kW otherwise). A shot that stays powered the whole way counts; one that browns out is aborted. 45 good shots achieve fusion, which unlocks the Electrolyzer and the rest of the fusion chain, and once ignition is close, a power cut costs 2 shots of data. After fusion, every good shot trims the remaining fusion-chain goals by 1%, up to 20%.', icon: '⚛️' },
    [T.NATIONALGRID]: { desc: 'Hyperion Station: the national interconnector. Two converter halls, a switchyard of transformers and the Hyperion Spire, with the national lines marching off toward the rest of the country.', use: 'Operation Hyperion, the end of the game. The Ministry of Energy opens the file when the National Government Center arrives and briefs you once fusion is achieved. The station breaks ground the day your first Fusion Reactor ignites. Stage I: burn 500 pellets in Fusion Reactors with the site powered. Stage II (once the MHD Ring is unlocked): commit $2.5M and burn 1,000 D-He3 pellets in an Advanced Fusion Reactor. Stage III: 24 full-power 10 MW commissioning surges, one an hour. Stage IV: export 20 MW to the nation for two days (pays 5× your net income; each outage costs an hour). Stage V: export 30 MW for a day (pays 7.5× your net income) with no coal or oil generators, a City Score of 70+ and $5M of wind, solar and hydro standing on the map. Then: Grid Complete.', icon: '◈' },
    [T.LAUNCHCOMPLEX]: { desc: 'Starhaven, the national launch complex: an assembly building, a lattice launch tower, a heavy-lift rocket, a booster landing pad, mission control and a propellant tank farm. It flies a mission every week or so, and the rocket climbs out over the city.', use: 'Arrives in the National Government Zone after the Military Base, once your grid is generating 20 MW. Draws 450–900 kW day and night. A launch is announced a day ahead; the count draws up to 12.6 MW, and holding power through liftoff pays a bonus.', icon: '🚀' },
    [T.COMPANYHQ]: { desc: 'Your own headquarters: three glass towers on a shared podium, the tallest stepping back to a lattice crown and a spire with plasma rings turning round it, over a forecourt with a ring fountain and reflecting pools.', use: 'A gift from the city. It is built for you in the National Government Zone, under wraps, the moment an Advanced Fusion Reactor is running, and unveiled under fireworks. Run power out to it: 600 kW overnight, 1.4 MW through the working day, and while powered it pays $900/s, plus a $900/s government grant: $1,800/s in all.', icon: '🏢' },
    [T.MILITARYBASE]: { desc: 'A fenced air base in the National Government Zone: a runway and flight line of fighter jets, hardened shelters, helipads, an air-defence battery, barracks, a parade ground, a firing range and a motor pool.', use: 'Arrives in the National Government Zone once your grid is generating 15 MW. Runs day and night: 220 kW overnight, 300 kW through the working day, and pays well while powered.', icon: '🎖️' },
    [T.AIRPORT]: { desc: 'An international airport with a full runway, terminal, jet bridges and control tower, in the National Government Zone.', use: 'Joins the National Government Zone once your first Advanced Nuclear Reactor is running. It needs a line run out to the zone: 180 kW overnight, peaking at 480 kW for the evening departure bank, and pays the highest civic income in the game while powered.', icon: '✈️' },
    [T.TRANSPORTHUB]: { desc: "The city's transportation and transit headquarters.", use: 'The final civic milestone; the largest population requirement and the highest income of any civic building.', icon: '🚉' },
    // Parks & community
    [T.SMALLPARK]:        { desc: 'A small green space for residents to enjoy.', use: 'Pays a one-time completion bonus and generates ongoing income.', icon: '🌳' },
    [T.COMMUNITYGARDEN]:  { desc: 'A shared gardening space for the neighborhood.', use: 'Pays a one-time completion bonus and generates ongoing income.', icon: '🌻' },
    [T.TREEDSTREET]:      { desc: 'A tree-lined residential street.', use: 'Pays a one-time completion bonus and generates ongoing income.', icon: '🌲' },
    [T.BASKETBALLCOURT]:  { desc: 'A public basketball court.', use: 'Pays a one-time completion bonus and generates ongoing income.', icon: '🏀' },
    [T.FARMERSMARKET]:    { desc: 'A weekly farmers market space.', use: 'Pays a one-time completion bonus and generates ongoing income.', icon: '🥕' },
    [T.FOUNTAIN]:         { desc: 'A tiered stone fountain at the heart of a paved neighborhood plaza.', use: 'Pays a one-time completion bonus and generates ongoing income.', icon: '⛲' },
    [T.SPLASHPAD]:        { desc: 'A spray park where the neighborhood kids cool off.', use: 'Its pumps draw 10 kW from 10:00 to 19:00 and shut off in rain. Wire it in, while it should be running but has no power, it pays half its income. Requested once you have coal power.', icon: '💦' },
    [T.BASEBALLFIELD]:    { desc: 'A floodlit ball field with dugouts and a backstop.', use: 'Its floodlights draw 25 kW from 18:00 to 22:00. Wire it in; without power during night games it pays half its income. Requested in neighborhoods of 10+ homes once you have fuel power.', icon: '⚾' },
    [T.ALLOTMENTS]:       { desc: 'A big community garden of allotment plots, sheds, a greenhouse and beehives.', use: 'Pays a one-time completion bonus and ongoing income. Arrives in established neighbourhoods (12+ homes) once Research Station MK3 is built.', icon: '🥕' },
    [T.DOGPARK]:          { desc: 'A fenced off-leash park with an agility course and a small-dog run.', use: 'Pays a one-time completion bonus and ongoing income. Arrives in established neighbourhoods (12+ homes) once Research Station MK3 is built.', icon: '🐕' },
    [T.CORNERSTORE]:      { desc: 'The little shop on the corner, with the owner living upstairs: produce crates out front, a striped awning and a neon OPEN sign. Every store has its own name.', use: 'An older store that opened on its own as a neighbourhood amenity. Draws 2.5 kW while open 07:00–23:00 and 0.75 kW for the fridges overnight; pays $3/s, half while it has no power. New corner stores now ask to be connected instead.' },
    [T.COMMUNITYCENTER]:  { desc: 'A neighbourhood hall with classes, a mural, a plaza and a half-court.', use: 'Lights and heating draw 14 kW from 08:00 to 22:00. Wire it in; without power in those hours it pays half. Arrives in established neighbourhoods (12+ homes) once Research Station MK3 is built.', icon: '🏫' },
    [T.GREENHOUSE]:       { desc: 'A public glasshouse: a palm house under a glass dome with tropical and desert wings, a lily pond, a herb garden and a potting shed.', use: 'Grow lights, misting and fans draw 18 kW from 06:00 to 22:00, and heating keeps 5 kW on overnight. Wire it in; without power it pays half. Arrives in established neighbourhoods (12+ homes) once Research Station MK3 is built.', icon: '🌿' },
    [T.FARM]:             { desc: 'A working family farm: a farmhouse, red barn and silos, a windmill pump, wheat and corn fields worked by a tractor, and pastures of cows, sheep, pigs, horses and chickens.', use: 'Pays a one-time completion bonus and ongoing income. Needs room on the edge of a big neighbourhood (14+ homes) and arrives once a Hydroelectric Generator is built. Each field runs plow → sow → grow → harvest over a day and a half of game time (sped up for gameplay).', icon: '🚜' },
    [T.PLAYGROUND]:       { desc: 'A neighborhood playground with a slide, swings and a sandbox.', use: 'Pays a one-time completion bonus and generates ongoing income. Families stay put: each one slows how fast residents in its zone lose patience during blackouts, even past the usual two-park limit. Requested in neighborhoods of 8+ homes.', icon: '🛝' },
  };

  // upfront/fee are the [min,max] observed across that tier's FAMILY_POOL entries;
  // demandMult scales the base House demand curve (2 kW day / 3 kW night / 6 kW evening peak).
  const TIER_DEFS = {
    budget:  { label: 'Budget Housing',  icon: '🏠', desc: 'Modest single-family homes on a budget.',        use: 'Lowest connection fee and revenue of any residential tier.',
      demandMult: 0.78, upfront: [4550, 6650],  fee: [8, 15] },
    mid:     { label: 'Mid-Tier Housing',icon: '🏡', desc: 'Comfortable middle-class family homes.',         use: 'Standard connection fee and revenue; the most common residential tier.',
      demandMult: 1.11, upfront: [7000, 9450],  fee: [14, 21] },
    premium: { label: 'Premium Housing', icon: '🏘️', desc: 'Upscale family homes with higher demand.',        use: 'Higher connection fee and revenue than mid-tier housing.',
      demandMult: 1.56, upfront: [10150, 14000], fee: [20, 24] },
    luxury:  { label: 'Luxury Housing',  icon: '🏰', desc: 'High-end luxury residences.',                     use: 'Highest fee and revenue of any standard house; requires an active Coal Generator.',
      demandMult: 2.0,  upfront: [14350, 18200], fee: [25, 31] },
  };
  const RARE_RESIDENTIAL = {
    townhouse: { label: 'Riverside Townhouses', icon: '🏘️', desc: 'A row of riverside multi-family townhouses.', use: 'A rare residential subtype unlocked once a Coal Generator is active.', upfront: 14000, fee: 21, peakDraw: 16 },
    apartment: { label: 'Maple Court Apartments', icon: '🏢', desc: 'A mid-rise apartment complex.',              use: 'A rare residential subtype unlocked once your grid peaks above 750 kW of generation.', upfront: 24500, fee: 34, peakDraw: 20 },
    birchwood: { label: 'Birchwood Terrace', icon: '🏢', desc: 'A modern white-and-cedar block with glass balconies, solar panels and a roof garden.', use: 'Young professionals: out all day, home late; the load peaks late in the evening. One per neighbourhood; unlocked once your grid peaks above 750 kW of generation.', upfront: 25000, fee: 35, peakDraw: 21, peakLabel: 'the late evening' },
    foundry:   { label: 'The Foundry Lofts', icon: '🏭', desc: 'A converted red-brick foundry with arched steel windows, a rooftop water tower and a café in the old loading dock.', use: 'Plenty of residents work from home, so the daytime load stays up as well as the evening peak. One per neighbourhood; unlocked once your grid peaks above 750 kW of generation.', upfront: 24000, fee: 33, peakDraw: 20 },
    willowbank: { label: 'Willowbank Garden Flats', icon: '🌿', desc: 'Buff-brick family flats under a green mansard roof, with flower boxes, ivy and a courtyard garden.', use: 'Families: a busy morning before school, an early evening peak and lights out early. One per neighbourhood; unlocked once your grid peaks above 750 kW of generation.', upfront: 24500, fee: 34, peakDraw: 21, peakLabel: 'the early evening' },
    celestine: { label: 'Celestine Arch', icon: '🌉', desc: 'Two residential towers leaning together into a single glass arch over their own canal: a Sky Lounge at the keystone, a waterfall pouring from the hanging garden, glass lifts riding the legs, water taxis and a gondola underneath, and a ribbon of light, searchlights and fireworks at night.', use: 'About 90 kW overnight, rising to 190 kW in the evening. Arrives after Operation Hyperion once your grid has generated 40 MW.', upfront: 300000, fee: 190 },
    verdance:  { label: 'Verdance Sky Habitat', icon: '🌿', desc: 'Seven garden terraces stacked up a slender core, a waterfall stepping down them into a pool, and a halo ring of sky apartments turning round the crown.', use: 'Draws 80–160 kW, peaking in the evening. Houses 700 to 1,100 people. Only arrives after Operation Hyperion is complete.', upfront: 260000, fee: 170 },
    evergreen: { label: 'Evergreen Spires', icon: '🌳', desc: 'Twin vertical-forest towers: every balcony planted with trees and shrubs, joined high up by a glass sky bridge, with swifts circling by day.', use: 'A mixed crowd of households: around 32 kW by day and a 60 kW evening peak, before the neighbourhood multiplier. Unlocked once a Fusion Reactor is built.', upfront: 150000, fee: 100, peakDraw: 60 },
    prism:     { label: 'Prism Crest Residences', icon: '💎', desc: 'A faceted crystal tower swelling to a planted sky-lobby ring: a rainbow band slides across the glass by day and aurora ribbons ripple up it at night.', use: 'Mostly professionals: around 30 kW by day and a 64 kW evening peak, before the neighbourhood multiplier. Unlocked once a Fusion Reactor is built.', upfront: 160000, fee: 110, peakDraw: 64 },
    tidecrest: { label: 'Tidecrest Lagoon Towers', icon: '⛵', desc: 'Twin curved sail towers joined by a glass-bottomed sky pool, over a palm-lined lagoon beach where a little sailboat tacks back and forth.', use: 'The lagoon pumps keep the day busy: around 46 kW by day and a 58 kW evening peak, before the neighbourhood multiplier. Unlocked once a Fusion Reactor is built.', upfront: 140000, fee: 95, peakDraw: 58 },
    helix:     { label: 'Halcyon Helix', icon: '🌀', desc: 'A tower whose floors twist a third of a turn as it rises, a garden spiralling up its corners, a glass lift on an outside mast and a helical wind turbine on the crown.', use: 'Families and professionals: a busy morning, around 34 kW by day and a 66 kW evening peak, before the neighbourhood multiplier. Unlocked once a Fusion Reactor is built.', upfront: 155000, fee: 105, peakDraw: 66 },
    arcology:  { label: 'Nova Arcology', icon: '🏙️', desc: 'A city in one building: stepped tiers of homes with sky-garden terraces, a monorail station halfway up and a glass atrium dome crowned with wind turbines.', use: 'Hundreds of households on their own clocks: around 55 kW by day and a heavy evening peak near 90 kW, before the neighbourhood multiplier. Unlocked with Research Station MK4.', upfront: 180000, fee: 120, peakDraw: 90 },
    condo:     { label: 'The Harrington',         icon: '🏙️', desc: 'An upscale condominium building.',          use: 'A rare residential subtype unlocked once a Hydroelectric Generator is active.', upfront: 21000, fee: 28, peakDraw: 9 },
    lumiere:   { label: 'The Lumière', icon: '🏙️', desc: 'A slim glass condo tower with a rooftop infinity pool, a white crown fin and a doorman under a long canopy.', use: 'Pool pumps and late dinner parties: the peak lands late in the evening. One per neighbourhood; unlocked once a Hydroelectric Generator is active.', upfront: 22000, fee: 29, peakDraw: 10, peakLabel: 'the late evening' },
    ashford:   { label: 'Ashford Place', icon: '🏛️', desc: 'A pre-war limestone condo under a copper mansard, with bay windows, iron Juliet balconies and a green awning.', use: 'Mostly retired owners: home through the day, an early evening peak and early nights. One per neighbourhood; unlocked once a Hydroelectric Generator is active.', upfront: 20500, fee: 27, peakDraw: 9 },
    cedarpoint: { label: 'Cedar Point Residences', icon: '🌳', desc: 'A terraced condo that steps back floor by floor, each terrace planted, with a penthouse hot tub on top.', use: 'Terrace lighting and the hot tub keep the evening load up until late. One per neighbourhood; unlocked once a Hydroelectric Generator is active.', upfront: 21500, fee: 28, peakDraw: 9 },
    school:    { label: 'Fernhill Public School',  icon: '🏫', desc: 'A neighbourhood school: classroom wings, a gym hall and a bus bay.', use: 'Unlocked once a Geothermal Turbine is running. Heavy daytime load that peaks while housing demand is at its lowest. Limited to two per residential zone.', upfront: 26000, fee: 36, peakDraw: 18, peakLabel: 'the teaching-day plateau' },
    companytown: { label: 'Company Town',      icon: '🏭', desc: 'Rows of worker housing around a canteen and water tower.', use: 'Shift-work housing that peaks on the afternoon shift change. Unlocked with Research MK3 once a Nuclear Reactor is placed.', upfront: 36000, fee: 46, peakDraw: 34, peakLabel: 'the afternoon shift change' },
    skyscraper:  { label: 'Skyscraper Condos', icon: '🏙️', desc: 'A glass residential tower with an aviation beacon.', use: 'The heaviest residential load in the game, with a steep evening peak. Unlocked with Research MK3 once two Steam Turbines are placed.', upfront: 48000, fee: 60, peakDraw: 36 },
    coop:        { label: 'Mid-rise Co-op',    icon: '🏘️', desc: 'A shared five-storey block around a courtyard garden.', use: 'Stays busy all day with a high, flat load. Unlocked with Research MK3 and a Hydroelectric Generator.', upfront: 30000, fee: 40, peakDraw: 30 },
    suburb:      { label: 'Maple Grove Estates', icon: '🏡', desc: 'A master-planned suburb: one request, a block of five luxury homes.', use: 'Accepting it places five houses at once, each paying its own fee with luxury-level demand. Unlocked with Research MK3 once your grid has generated 2.5 MW.', upfront: 70000, fee: 30, peakDraw: 17, peakLabel: 'evening peak per home' },
    mansion:     { label: 'Whitmore Hall',       icon: '🏰', desc: 'A walled Palladian estate with a clock cupola, columned porte-cochère, fountain court, rose parterre and pool terrace.', use: 'A premium residential customer with a steep evening peak at 30 kW. Unlocked with Research MK3 once your grid has generated 5 MW.', upfront: 58000, fee: 55, peakDraw: 30 },
    victorian:   { label: 'Thornfield House',    icon: '🏛️', desc: 'A Gothic-Revival brick manor with a candle-snuffer turret, fretwork gables, a veranda, a glass conservatory, a croquet lawn and a lily pond.', use: 'A premium residential customer with an evening peak at 28 kW. Unlocked with Research MK3 once your grid has generated 5 MW.', upfront: 54000, fee: 52, peakDraw: 28 },
    pavilion:    { label: 'Glasswater Pavilion', icon: '🏊', desc: 'A modernist glass villa under a white cantilever, with an infinity pool, fire pit, green roof, carport and reflecting pond.', use: 'A premium residential customer with an evening peak at 34 kW. Unlocked with Research MK3 once your grid has generated 5 MW.', upfront: 62000, fee: 58, peakDraw: 34 },
    glasshouse:  { label: 'The Glass Gardens',   icon: '🌿', desc: 'A Victorian palm house: a curvilinear glass dome and wings full of tropical palms, a giant-lily pond, carpet bedding and a boiler house.', use: 'Modest by day, then grow lights run 36 kW from 22:00–06:00 after the mansions ease off. Unlocked with Research MK3 once your grid has generated 5 MW.', upfront: 56000, fee: 54, peakDraw: 36, peakLabel: 'overnight grow lights' },
    vineyard:    { label: 'Ashmere Vineyard',    icon: '🍇', desc: 'A hillside wine estate: contour vine rows, a stone winery with a bell tower, a crush pad, and a pergola tasting terrace under string lights.', use: 'Busy with pumps and cold storage 08:00–17:00 at 30 kW, then a smaller tasting-room bump to 19 kW until 21:00. Quiet overnight. Unlocked with Research MK3 once your grid has generated 5 MW.', upfront: 60000, fee: 56, peakDraw: 30, peakLabel: 'daytime cellar work' },
    duplex:      { label: 'Worker Duplexes',     icon: '🏠', desc: 'Pairs of coal-town homes under one roof.', use: 'Shift-work housing that peaks on the afternoon shift change. Unlocked with Research MK2 once a Coal Mine is placed.', upfront: 12000, fee: 18, peakDraw: 14, peakLabel: 'the afternoon shift change' },
    cornerstore: { label: 'Corner Store', icon: '🏪', desc: 'The little shop on the corner, with the owner living upstairs: produce crates out front, a striped awning and a neon OPEN sign. Every store has its own name.', use: 'Asks to be connected once a neighbourhood has 6 homes; up to two per residential zone. Open 07:00–23:00, with only the fridges running overnight.', upfront: 7000, fee: 9, peakDraw: 2.5, peakLabel: 'opening hours, 07:00–23:00' },
    sheriff:     { label: "County Sheriff's Office", icon: '⭐', desc: 'A brick station house with a gold-star portico, a radio mast, a sally-port garage and a lot of patrol cars that roll out on calls with lights flashing.', use: 'Staffed around the clock, peaking in the evening when the lot floodlights come on; no night trough. One per neighbourhood. Unlocked with Research MK2 once your refinery is producing fuel oil.' },
    pemberton:   { label: 'Pemberton Mansions', icon: '🏢', desc: 'An Edwardian red-brick mansion block banded in white stone, with a corner turret under a lead cupola, coal-fire chimneys and gas lamps at the porch.', use: 'Day-shift households: a pre-dawn morning, then the peak from mid-afternoon when the shift comes home, and early nights. One per neighbourhood; unlocked with Research MK2 once a Coal Mine is placed.', upfront: 26000, fee: 36, peakDraw: 20, peakLabel: 'mid-afternoon into the evening' },
    linden:      { label: 'Linden Court', icon: '🏢', desc: 'A 1950s block on pilotis: ribbon windows over pastel panels, a butterfly roof bristling with TV aerials, and washing out on the balconies.', use: 'Night-shift nurses and refinery crews: the peak comes in the late afternoon before they head out, and the load stays up through the small hours. One per neighbourhood; unlocked with Research MK2 once a Pump Jack is placed.', upfront: 25500, fee: 35, peakDraw: 20, peakLabel: 'the late afternoon' },
    rialto:      { label: 'The Rialto', icon: '🎭', desc: 'A cream Art Deco block with a curved corner, a stepped parapet, a neon blade sign and a marquee canopy of chasing bulbs.', use: 'Musicians and theatre people: quiet all morning, with the peak around midnight once the shows let out. One per neighbourhood; unlocked with Research MK2 once your refinery is producing fuel oil.', upfront: 27000, fee: 37, peakDraw: 20, peakLabel: 'around midnight' },
    retirement:  { label: 'Sunset Grove Retirement Village', icon: '🌅', desc: 'Pastel cottages around a bowling green, a koi pond and a gazebo.', use: 'Residents are home all day, with a gentle early-evening peak and early nights. Unlocked with Research MK2 once a Pump Jack is placed.', upfront: 16000, fee: 22, peakDraw: 16, peakLabel: 'the early-evening peak' },
  };
  const COMMERCIAL_DEFS = {
    cafe:        { label: 'Downtown Café',   icon: '☕', desc: 'A cozy downtown coffee shop.',            use: 'Draws power mainly during the day.', upfront: 10500, fee: 12 },
    office:      { label: 'Tech Office',     icon: '🏢', desc: 'A modern office building.',               use: 'Draws power only during business hours.', upfront: 16500, fee: 16 },
    clinic:      { label: 'City Clinic',     icon: '🏥', desc: 'A local medical clinic.',                  use: 'Needs a steady baseline supply; cannot tolerate outages.', upfront: 13500, fee: 15 },
    grocery:     { label: 'Grocery Store',   icon: '🛒', desc: 'A neighborhood grocery store.',            use: 'Light daytime draw with a sharp evening peak.', upfront: 11250, fee: 15 },
    coldstorage: { label: 'Cold Storage',    icon: '🧊', desc: 'A refrigerated commercial storage facility.', use: 'Cycles between a baseline and peak draw for refrigeration.', upfront: 18000, fee: 20 },
    datacenter:  { label: 'Data Center',     icon: '🖥️', desc: 'A commercial data hosting facility.',       use: 'Requires a steady baseline supply; zero tolerance for outages.', upfront: 24000, fee: 26 },
    hotel:       { label: 'Grand Hotel',     icon: '🏨', desc: 'A rare, upscale hotel.',                    use: 'Peaks at night; unlocked once your grid peaks above 750 kW of generation.', upfront: 24000, fee: 30 },
    movietheater: { label: 'The Picture House', icon: '🎬', desc: 'An art-deco picture palace with a marquee and a line-up of four films, different at every cinema.', use: 'Matinees from 11:00, a 26 kW evening peak while the main screenings run, dark from 01:00 until late morning. Unlocked once your grid peaks above 750 kW of generation.', upfront: 26000, fee: 32 },
    galleria:    { label: 'Aurora Galleria', icon: '🛍', desc: 'A long pill of glass on three floors: shops glowing through the curtain wall, escalators zig-zagging up the atrium, and LED ribbons that ripple like the aurora after dark.', use: 'Rare: 22–32 kW through the day and a 50 kW evening peak; open 10:00–23:00, with the façade lit all night. Unlocked once your grid peaks above 750 kW of generation.', upfront: 36000, fee: 42 },
    arcade:      { label: 'The Grand Arcade', icon: '🕰', desc: 'A Victorian arcade in red brick under a long glass roof, with a clock tower that keeps the time and a carousel turning on the cobbled square.', use: 'Rare: busiest through the afternoon at 34 kW; open 08:00–20:00, with only the lamps on the square after hours. Unlocked once your grid peaks above 750 kW of generation.', upfront: 28000, fee: 34 },
    mall:        { label: 'Shopping Mall',   icon: '🏬', desc: 'A rare, large shopping complex.',          use: 'Heavy evening peak draw; unlocked once your grid peaks above 750 kW of generation.', upfront: 32000, fee: 38 },
    venue:       { label: 'Concert Venue',   icon: '🎤', desc: 'A rare live entertainment venue.',         use: 'Sharp evening power spike; unlocked once a Hydroelectric Generator is active.', upfront: 28000, fee: 34 },
    restaurant:  { label: 'Bistro Restaurant', icon: '🍽️', desc: 'A sit-down restaurant.',                 use: 'Power draw spikes periodically during rush periods.', upfront: 7600, fee: 19 },
    fastfood:    { label: 'Zap Burger', icon: '🍔', desc: 'A drive-thru built as a giant hamburger under a lightning-bolt sign.', use: 'Power draw spikes sharply and often during rush periods.', upfront: 6400, fee: 16 },
    donutshop:   { label: 'Dynamo Donuts', icon: '🍩', desc: 'A drive-in doughnut stand with a giant frosted doughnut on its roof, spinning on its axle like a generator rotor.', use: 'Open 05:00–14:00: fryer batches spike the draw to 12 kW through the breakfast rush, about 3 kW between them.', upfront: 5800, fee: 14 },
    hotdog:      { label: 'Coil Dog', icon: '🌭', desc: 'A hot-dog stand under a giant hot dog, with a little Tesla coil at each end of the bun that arcs when the queue is long.', use: 'Open 11:00–03:00 for the late-night crowd: 3.5 kW base, spiking to 11 kW in a rush.', upfront: 5200, fee: 13 },
    pizzeria:    { label: 'Ohm Slice Pizza', icon: '🍕', desc: 'A pizzeria built as a giant slice, pepperoni domes on the roof and a wood-fired oven chimney glowing out the back; delivery scooters zip in and out.', use: 'Open 11:00–midnight: 6 kW base, 14 kW at the dinner rush, and the ovens hold 2 kW warm overnight.', upfront: 7000, fee: 17 },
    kakery:      { label: 'The Kakery',      icon: '🎂', desc: 'A cake shop under a giant three-tier birthday-cake roof.', use: 'Ovens run 11 kW from 05:00–09:00, then about 7 kW decorating and serving until closing at 19:00; display fridges hold 2 kW overnight.', upfront: 8200, fee: 14 },
    coworking:   { label: 'Co-working Space', icon: '💼', desc: 'A shared workspace for freelancers and small teams.', use: 'Power draw spikes periodically during busy hours.', upfront: 8400, fee: 21 },
    gym:         { label: 'Fitness Gym',     icon: '🏋️', desc: 'A neighborhood fitness gym.',              use: 'Power draw spikes sharply during rush hours.', upfront: 7200, fee: 18 },
    autorepair:  { label: 'Ace Auto Repair', icon: '🔧', desc: 'A two-bay roadside garage with a vehicle lift.', use: 'Light trade-hours base load that spikes hard mid-job; pays a premium connection fee.', upfront: 11500, fee: 17 },
    sciencemuseum: { label: 'Science Museum',     icon: '🔭', desc: 'A neoclassical science museum with a planetarium dome.', use: 'MK3-era customer drawing 76–97 kW while open 09:00–20:00. Unlocked once Research Station MK3 is researched.', upfront: 38000, fee: 44 },
    marina:        { label: 'Marina & Boat Club', icon: '⛵', desc: 'A lakeside marina with a clubhouse and moored boats.', use: 'MK3-era customer peaking at 35 kW in the evening. Unlocked with Research MK3 once a Dam has formed a reservoir.', upfront: 42000, fee: 48 },
    waterpark:     { label: 'Splash Kingdom Water Park', icon: '🌊', desc: 'A water park built round a slide volcano that erupts in a column of water: four slides, a wave pool breaking on a sand beach, a lazy river with rapids and a waterfall grotto, a surf simulator, hot tubs, a tiki bar and a kids\' cove with a giant tipping bucket.', use: 'The pumps are the load: 90 kW while open 10:00–19:00, far less once the gates shut. Rain empties it and the pumps back off. Unlocked with Research MK3 once a dam is built.', upfront: 52000, fee: 62 },
    thunderridge:  { label: 'Thunder Ridge Adventure Park', icon: '🎢', desc: 'A thrill park: a launched top-hat coaster, a giant pendulum swing, an observation tower and a rockwork mountain with a waterfall.', use: '151 kW by day and 234 kW from 18:00 to midnight, with a laser show at 22:00. Rain closes the rides. Unlocked with Research MK3 once your grid has generated 5 MW.', upfront: 85000, fee: 96 },
    amusementpark: { label: 'Amusement Park',     icon: '🎡', desc: 'A theme park with a Ferris wheel, roller coaster and carousel.', use: 'The heaviest commercial customer: 97 kW by day and a 166 kW evening light show, open 10:00–23:00. Rain shuts the rides and cuts its draw to about a third. Unlocked with Research MK3 and a Hydroelectric Generator.', upfront: 60000, fee: 72 },
    pharmalab:     { label: 'Pharma Lab',              icon: '💊', desc: 'A pharmaceutical lab with walk-in cold stores.', use: 'Runs 31–42 kW day and night and cannot go dark. Unlocked with Research MK3 after mining 1,000 sulfur.', upfront: 46000, fee: 56 },
    radiology:     { label: 'Radiology Hospital Wing', icon: '🩻', desc: 'A hospital imaging wing with an MRI suite and helipad.', use: 'Always on at 83 kW, with MRI scans spiking it to 151 kW. Unlocked with Research MK3 once your Fuel Processing Plant has made its first rod.', upfront: 58000, fee: 68 },
    stadium:       { label: 'Stadium',                 icon: '🏟️', desc: 'A floodlit 11×9 stadium bowl.', use: 'Idles at 20 kW, then every third day is an event night: floodlights at 18:00 and 248 kW from 19:00 to 22:00. Events rotate through a lineup; a sports match, a concert, and a pro wrestling event; each with its own look (pitch, stage, or ring) and its own marquee. You get a warning at noon on event day. Unlocked with Research MK3 once a Nuclear Reactor is placed.', upfront: 75000, fee: 85 },
    cardealer:     { label: 'Apex Motors Dealership', icon: '🚗', desc: 'A glass showroom with a floodlit forecourt of new cars.', use: 'Showroom draws 30 kW through trading hours; the lot floodlights push it to 55 kW after dark. Unlocked with Research MK3 once two Steam Turbines are placed.', upfront: 48000, fee: 58 },
    finedining:    { label: 'Le Grand Salon',   icon: '🥂', desc: 'A grand fine-dining restaurant with a chandelier hall and terrace.', use: 'Kitchen prep through the day, then a 76 kW dinner service 18:00–23:00. Unlocked with Research MK3 once your grid has generated 2.5 MW.', upfront: 52000, fee: 64 },
    supperclub:    { label: 'The Gold Room',    icon: '🍾', desc: 'A late-night supper club with a neon canopy and velvet dining room.', use: 'Quiet at 5.5 kW through the day, then a 66 kW supper service 21:00–02:00 after the mansions ease off. Unlocked with Research MK3 once your grid has generated 5 MW.', upfront: 48000, fee: 60 },
    aquarium:      { label: 'Tidewater Aquarium', icon: '🐠', desc: 'A public aquarium with a shark tunnel, jellyfish dome and touch pools.', use: 'Life support runs 48 kW around the clock, 68 kW while open 09:00–20:00. A blackout kills stock in the tanks: a one-off $15,000 fine. Unlocked with Research MK3 once you have a Dam and two Steam Turbines.', upfront: 56000, fee: 66 },
    convention:    { label: 'Grand Convention Centre', icon: '🏛️', desc: 'A vast exhibition hall with a sweeping roof and banner plaza.', use: 'Idles at 17 kW, then every fourth day is an expo: 83 kW for setup from 07:00, the full 208 kW from 09:00 to 18:00, then teardown until 20:00. You get a warning the evening before. Unlocked with Research MK3 once a Nuclear Reactor and two Steam Turbines are placed.', upfront: 68000, fee: 78 },
    holoarena:     { label: 'Nexus Holo-Arena', icon: '🌐', desc: 'A domed arena whose whole skin is an LED screen. The programme changes nightly through five shows; Ringworld, Leviathan, Phoenix Rising, Neon Live and the Grand Final; each with its own dome display and a hologram overhead, ending in fireworks.', use: '70 kW by day, 120 kW as the doors open at 17:00 and 280 kW for the 19:00–23:00 show. Unlocked once a Fusion Reactor is built.', upfront: 280000, fee: 180 },
    quantumx:      { label: 'Quantum Exchange', icon: '💹', desc: 'A black-glass trading house built around its quantum computers, their gold dilution refrigerators hanging in the atrium, with an LED ticker wrapped round the building.', use: '180–260 kW around the clock: the computers never stop, the trading floor adds the daytime peak. Unlocked with MK4 once an Advanced Nuclear Reactor is built.', upfront: 260000, fee: 170 },
    spaceelevator: { label: 'Hyperion Space Elevator', icon: '🚀', desc: 'The ground anchor of a space elevator: a tether rising off the top of the map, climbers riding it on power beamed up by laser, a cargo yard and a maglev spur.', use: '600 kW always, doubling to 1.2 MW for an hour every six hours as a climber launches. Only arrives after Operation Hyperion is complete.', upfront: 600000, fee: 370 },
    megatower:     { label: 'Hyperion Spire',   icon: '🗼', desc: 'A supertall skyscraper with an observation pod and needle spire.', use: 'The biggest commercial customer in the game: never below 120 kW, peaking at 320 kW when the observation deck and façade lights run at night. Unlocked with Research Station MK4.', upfront: 220000, fee: 145 },
    maglev:        { label: 'Skyline Maglev Terminal', icon: '🚄', desc: 'A shell-roofed glass terminal over an elevated guideway. Pods glide in, open their doors and accelerate away while a departures board flips through destinations in the concourse below.', use: '90 kW off-peak, surging to 340 kW through the 05:00–09:00 and 16:00–20:00 commuter rushes. Unlocked with MK4 once a Fusion Reactor is running.', upfront: 260000, fee: 170 },
    skycasino:     { label: 'Aurora Sky Casino', icon: '🎰', desc: 'Twin gold towers joined by a sky park with an infinity pool, under a colour-cycling crown. By night an aurora ripples overhead, searchlights cross and fireworks go up; the podium screen spins slot reels to a jackpot.', use: '160 kW by day, 430 kW on the night floor from 18:00 to 03:00. Only arrives after Operation Hyperion is complete.', upfront: 310000, fee: 200 },
    worldexpo:     { label: 'Hyperion World Expo', icon: '🌍', desc: 'The world fair that celebrates Hyperion: a giant steel globe ringed by orbit hoops, national pavilions, and a monorail looping the grounds. Every night the globe lights up for the show.', use: '140 kW overnight, 260 kW while open 09:00–20:00, then 520 kW for the 20:00–23:00 light show. Only arrives after Operation Hyperion is complete.', upfront: 420000, fee: 265 },
    planetarium:   { label: 'Zenith Observatory & Planetarium', icon: '🔭', desc: 'A copper-domed observatory whose slit opens at night as the telescope slews across the sky, beside a planetarium dome full of stars and a line for the next show.', use: '60 kW by day, 240 kW for the dome shows and the telescope from 19:00 to 02:00. Arrives after Operation Hyperion once your grid has generated 40 MW.', upfront: 240000, fee: 155 },
    verticalfarm:  { label: 'Skyharvest Vertical Farm', icon: '🥬', desc: 'Eleven hydroponic floors twisting as they rise, every rack under magenta grow light. Crates ride an outside lift and delivery drones fly produce off the roof.', use: '150–320 kW through the night while the grow lights run. Unlocked with Research Station MK4.', upfront: 190000, fee: 125 },
    geneworks:     { label: 'Helix Gene Foundry', icon: '🧬', desc: 'A biotech campus round a glass atrium tower where a towering double helix turns, between lab wings with a rooftop greenhouse and a live sequencing wall, beside liquid-nitrogen dewars and stainless bioreactors churning with green culture.', use: '250–380 kW around the clock; a blackout ruins the cultures. Unlocked with MK4 once an Advanced Nuclear Reactor is built.', upfront: 240000, fee: 155 },
    carbonrefinery: { label: 'Skyscrub Carbon Refinery', icon: '🌬️', desc: 'Walls of giant fans drinking in the air, the CO₂ stripped out in sorbent towers and turned into synthetic fuel in a glowing reactor hall, then pumped away to tank farms.', use: '500–900 kW around the clock as the fans and the fuel reactor run. Only arrives after Operation Hyperion is complete.', upfront: 450000, fee: 280 },
    massdriver:    { label: 'Skyline Mass Driver', icon: '☄️', desc: 'An electromagnetic launch track curving up across the map on lattice towers. Capacitor halls and flywheel generators charge, Tesla arcs jump at the muzzle, and a cargo pod is flung out in a white flash and a streak of plasma, bound for orbit.', use: '700 kW to 2.2 MW as the capacitor banks charge for each launch. Only arrives after Operation Hyperion is complete.', upfront: 800000, fee: 500 },
    antimatter:    { label: 'Penning Antimatter Works', icon: '🌀', desc: 'A hardened fusion-age lab built round the Penning Vault, a tower of superconducting coils holding a levitating violet orb of antimatter. A decelerator ring and production target feed it and four trap bunkers, and an annihilation test cell fires calibration pulses behind the blast walls.', use: '1.4 to 2 MW, day and night: the traps can never go dark. Arrives after Operation Hyperion once your grid has generated 40 MW.', upfront: 1100000, fee: 690 },
    collider:      { label: 'Hyperion Particle Collider', icon: '⚛️', desc: 'A vast synchrotron campus. A booster and linac fill the main ring, two beams counter-rotate and collide in four detector halls, throwing out sprays of particle tracks and jets during stable beams, and each fill ends in a flare at the beam dump.', use: '800 kW to 1.5 MW as the magnets ramp for each beam fill. Only arrives after Operation Hyperion is complete.', upfront: 700000, fee: 440 },
    nightclub:     { label: 'Club Voltage',     icon: '🪩', desc: 'A warehouse nightclub with an LED wall, rooftop lasers and a queue round the block.', use: 'Opens at 22:00 and peaks at 49 kW from midnight to 03:00, closing at 04:00; it fills the small hours after the evening peaks. About 4.2 kW by day. Unlocked once Research Station MK3 is researched.', upfront: 30000, fee: 36 },
    jazzbar:       { label: 'The Blue Note',    icon: '🎷', desc: 'A basement jazz bar in a narrow indigo townhouse: a trio in the arched window, a blue script sign and notes drifting out over the pavement.', use: 'A small late customer: 12 kW for the live sets from 20:00 to 02:00, about 1 kW by day. Unlocked with Research Station MK2.', upfront: 9000, fee: 13 },
    disco:         { label: 'The Mirrorball',   icon: '🪩', desc: 'A seventies discotheque in black tile and gold, with a mirror ball turning under a glass dome and a light-up dance floor behind three arched windows.', use: 'Opens at 21:00 and holds 38 kW until the 03:00 close; about 2.8 kW by day. Unlocked once Research Station MK3 is researched.', upfront: 25000, fee: 29 },
    superclub:     { label: 'Pulse',            icon: '💓', desc: 'A superclub wrapped in LED: a heartbeat running across the whole front, a crown of lasers, sky-trackers, and a pool on the roof terrace.', use: 'The biggest night out in town: builds from 22:00, draws 151 kW from midnight to 04:00 and closes at 05:00. About 12 kW by day. Unlocked with Research MK3 once your grid has generated 5 MW.', upfront: 80000, fee: 88 },
    motel:         { label: 'Starlite Motor Inn', icon: '🛏️', desc: 'A 1950s roadside motel with a googie pole sign, a neon VACANCY that flips to NO VACANCY late at night, and a little fenced pool.', use: 'An early hotel: 10 kW from the evening check-ins through the night, down to 3 kW at midday.' },
    boutiquehotel: { label: 'The Harbourside', icon: '🧳', desc: 'A boutique hotel in a converted brick warehouse, with a doorman under a black canopy and a rooftop bar under festoon lights.', use: 'Rare: 20 kW evening peak when the rooms fill and the rooftop bar opens, 8 kW through the day. Unlocked with the Grand Hotel.' },
    resorthotel:   { label: 'Azure Bay Resort', icon: '🌴', desc: 'A beachfront resort tower with a balcony on every room, a porte-cochère and a palm-lined infinity pool with a swim-up bar.', use: 'MK3-era: pool pumps keep it at 42–53 kW all day, rising to 76 kW in the evening; never drops below 25 kW.' },
    bank:          { label: 'First Trust Bank', icon: '🏦', desc: 'A domed neoclassical bank with an Ionic portico, a revolving bronze door and a vault door you can see turning through the window.', use: '18 kW through business hours (08:00–18:00), dark overnight. Cash vans call mornings and late afternoons.' },
    savingsloan:   { label: 'Cornerstone Savings & Loan', icon: '💵', desc: 'A 1960s brick savings bank with a bulb sign, a time-and-temperature pylon and a drive-thru where the tube carrier shoots over to the teller.', use: 'A light customer: 9 kW from 09:00–17:00, 1 kW for the ATM and sign after hours.' },
    reservebank:   { label: 'Sterling Reserve Bank', icon: '🏛️', desc: 'An art-deco reserve bank in white marble with gilt fins, a rate ticker and a great vault door that stands open on stacked gold.', use: 'MK3-era: 44 kW through business hours and 17 kW all night for vault security, so it never goes fully dark.' },
    lawoffice:     { label: 'Harbor & Whitlock Law Offices', icon: '⚖️', desc: 'A Georgian brick townhouse turned law firm, with a pedimented green door, a brass plate and law books in the windows.', use: '10 kW through office hours 08:00–19:00, with a lamp or two on late into the evening. Available from the start.', upfront: 12500, fee: 17 },
    callcentre:    { label: 'Beacon Call Centre', icon: '🎧', desc: 'A low office block full of headset agents at glowing screens, beside a comms tower whose beacon pod pulses its signal out over the city.', use: 'Staffed 24/7 on three shifts (06:00, 14:00, 22:00): 16–18 kW by day, 10 kW overnight. Unlocked with Research MK2.', upfront: 24000, fee: 29 },
    summit:        { label: 'Summit Tower', icon: '🏢', desc: 'A blue-glass corporate headquarters with a stepped crown that lights up at night, a helipad, and a plaza with a fountain.', use: 'Peaks at 66 kW through the working day; the servers, lobby and lit crown hold it at 19 kW overnight. Unlocked with Research MK3 once a Nuclear Reactor is built.', upfront: 62000, fee: 72 },
    clothing:      { label: 'Threadline Outfitters', icon: '👗', desc: 'A brick corner clothing store: a striped awning, mannequins in the windows that change outfit every day, a neon script sign and a tailoring studio upstairs.', use: 'Open 10:00–21:00: 25 kW through the day, peaking at 36 kW in the after-work rush from 17:00, 4.2 kW after hours. Unlocked with Research MK3 once the fuel plant has made its first fuel rods.', upfront: 34000, fee: 42 },
    library:       { label: 'Ashby Public Library', icon: '📚', desc: 'A pale-stone civic library with a columned portico, stone lions and a copper-domed lantern.', use: 'A steady 19 kW while open 09:00–20:00, easing to 17 kW in the evening and 4.2 kW after hours. Unlocked once Research Station MK3 is researched.', upfront: 24000, fee: 28 },
    newspaper:     { label: 'The Morning Ledger', icon: '📰', desc: 'A brick newspaper house under a clock tower, with a headline ticker over the door and web presses behind its arched windows.', use: 'A 5–10 kW newsroom by day, then a 26 kW press run from 22:00 to 04:00 while the vans load at the dispatch dock: a peak that lands when solar is making nothing. Available from the start.', upfront: 15000, fee: 20 },
    icerink:       { label: 'Frostline Ice Rink', icon: '⛸️', desc: 'A barrel-vaulted rink hall with a glazed front onto the ice and a chiller plant at its side.', use: 'Chillers hold the ice at 14 kW all night and the hall runs at 22 kW while open, 10:00–22:00. Both rise with the heat outside: about 13% on an ordinary afternoon, and up to 38 kW in a heatwave. Available from the start.', upfront: 19000, fee: 24 },
    radio:         { label: 'WGRD 98.7 FM', icon: '📻', desc: 'A streamline-moderne radio studio under a red-and-white lattice mast.', use: 'Only 3–5 kW, around the clock. But the whole town listens: while the station is blacked out, every home and business loses 6 points of satisfaction until it is back on the air. Available from the start.', upfront: 6000, fee: 12 },
    nursery:       { label: 'Glasswing Nursery', icon: '🪴', desc: 'A palm-house dome between two glasshouse wings, with plant tables out front.', use: 'Its grow lamps light whenever there is not enough daylight: 30 kW all night, about 4 kW on a clear day, and up to 22 kW under heavy cloud, so it draws most exactly when solar makes least. Unlocked once Research Station MK2 is researched.', upfront: 21000, fee: 26 },
    hotsprings:    { label: 'Emberstone Hot Springs', icon: '♨️', desc: 'A timber bathhouse under a sweeping tiled roof, with rock pools, a waterfall and stone lanterns.', use: 'Pumps hold 8 kW overnight, about 22 kW through the day and a 34 kW evening peak from 17:00 to 22:00; open 07:00–23:00. Unlocked with Research MK2 once a Geothermal Turbine is built.', upfront: 27000, fee: 32 },
    cannery:       { label: 'Saltwind Cannery', icon: '🥫', desc: 'A tin shed under a sawtooth roof, a brick stack and a water tower built as a giant can.', use: 'Every third day is a canning day: 65 kW from 06:00 to 18:00, with 30 kW of warm-up and clean-down either side. Between runs only the cold store draws, at 10 kW; the board on its wall counts down to the next run. Unlocked once Research Station MK2 is researched.', upfront: 26000, fee: 30 },
    bowling:       { label: 'Bowling Alley',    icon: '🎳', desc: 'A neon-lit bowling alley.', use: 'Afternoon leagues and a 24 kW evening peak, open 11:00–23:00. Unlocked once Research Station MK2 is researched.', upfront: 22000, fee: 26 },
    truckstop:     { label: 'Truck Stop Diner', icon: '🚛', desc: 'A chrome roadside diner with room for the rigs.', use: 'Open around the clock at 7 kW, with meal rushes spiking it to 14 kW. Unlocked with Research MK2 once a Gas Station is placed.', upfront: 18000, fee: 22 },
  };
  const INDUSTRIAL_DEFS = {
    steelfoundry: { label: 'Steel Foundry',        icon: '🏭', desc: 'A heavy industrial steel foundry.',            use: 'Draws power in heavy furnace cycles.', upfront: 25500, fee: 35 },
    coldstorage:  { label: 'Logistics Depot',      icon: '🧊', desc: 'A cross-dock distribution hub: chilled and dry halls, trucks backing into the docks, and a gantry working the container stacks.', use: 'Combines refrigeration with loading-dock activity; pays the largest connection fee of any mid-tier industrial customer.', upfront: 32250, fee: 27 },
    chemical:     { label: 'Solvent Works',        icon: '⚗️', desc: 'An industrial solvent and chemical processing plant.',      use: 'Draws power during the day and shuts down in the evening.', upfront: 29500, fee: 40 },
    datacenter:   { label: 'Data Farm',            icon: '🖥️', desc: 'A large-scale industrial data farm.',          use: 'Requires a steady baseline supply; zero tolerance for outages.', upfront: 33500, fee: 44 },
    factory:      { label: 'Manufacturing Co',     icon: '🏭', desc: 'A light-industrial sawtooth-roof workshop with loading docks and silos.', use: 'Runs a 30 kW day shift (07:00–19:00) and shuts down overnight.', upfront: 21000, fee: 22 },
    bottling:     { label: 'Bottling Plant',       icon: '🍾', desc: 'An industrial bottling and packaging plant.',  use: 'Draws its full 30 kW on the day shift (07:00–19:00) and 18 kW overnight while the line runs its slower off-shift cycle.', upfront: 18750, fee: 26 },
    coldchain:    { label: 'Cold Chain Warehouse', icon: '🧊', desc: 'A rare, large-scale cold storage warehouse.',  use: 'Unlocked once a Coal Generator is active.', upfront: 38000, fee: 48 },
    watertreat:   { label: 'Water Treatment Plant', icon: '🚰', desc: 'A rare municipal water treatment facility.',  use: 'Unlocked once a Hydroelectric Generator is active.', upfront: 35000, fee: 48 },
    evfactory:    { label: 'EV Battery Factory',   icon: '🔋', desc: 'A rare high-voltage EV battery manufacturing plant.', use: 'Unlocked once a Coal Generator is active.', upfront: 42000, fee: 50 },
    serverfarm:   { label: 'Server Farm',          icon: '🖥️', desc: 'A rare industrial server farm.',                use: 'Zero tolerance for outages; unlocked once a Coal Generator is active.', upfront: 50000, fee: 65 },
    textilemill:     { label: 'Textile Mill',      icon: '🧵', desc: 'An industrial spinning and weaving mill.',     use: 'Draws power only during the day; the lightest industrial load at 12 kW.', upfront: 16000, fee: 24 },
    recyclingplant:  { label: 'Recycling Plant',   icon: '♻️', desc: 'An industrial materials recycling and baling facility.', use: 'Power draw spikes during sorting bursts.', upfront: 23000, fee: 32 },
    aluminumsmelter: { label: 'Aluminum Smelter',  icon: '🔩', desc: 'A continuous-run aluminum electrolysis smelter.', use: 'Draws a tight, near-constant load; cannot tolerate cycling.', upfront: 34000, fee: 46 },
    fertilizer:      { label: 'Fertilizer Works',     icon: '🌾', desc: 'A chemical fertilizer plant with a prilling tower and storage domes.', use: 'Runs around the clock at 97–131 kW. Unlocked with Research MK3 after mining 1,000 sulfur.', upfront: 52000, fee: 62 },
    isotopelab:      { label: 'Isotope Research Lab', icon: '☢️', desc: 'A secure research lab built around a cyclotron.', use: 'Draws a near-constant 151–180 kW and cannot tolerate outages. Unlocked with Research MK3 once your Fuel Processing Plant has made its first rod.', upfront: 70000, fee: 88 },
    cryptomine:      { label: 'Crypto Mine',          icon: '🪙', desc: 'A container farm packed with mining rigs.', use: 'Soaks up spare generation: ramps between 55 kW and 221 kW to match what your grid has left over, and backs off as demand catches up. Unlocked with Research MK3 once your grid generates 1.5 MW.', upfront: 45000, fee: 58 },
    machineshop:     { label: 'Precision Machine Shop', icon: '⚙️', desc: 'A CNC machining workshop.', use: 'Draws 83 kW, spiking to 151 kW during machining runs. Unlocked once Research Station MK3 is researched.', upfront: 40000, fee: 50 },
    fishhatchery:    { label: 'Fish Hatchery',          icon: '🐟', desc: 'Circular rearing tanks beside a reservoir.', use: 'Pumps run around the clock at 22–28 kW. Built on a reservoir shoreline. Unlocked with Research MK3 once a Dam has formed a reservoir.', upfront: 44000, fee: 54 },
    desal:           { label: 'Seaspray Desalination Megaplant', icon: '💧', desc: 'A seawater reverse-osmosis plant: shore intake, clarifiers, high-pressure pumps, a hall of membrane racks, blue product tanks and a brine diffuser out to sea.', use: '400–600 kW around the clock; forcing seawater through the membranes takes a lot of pumping. Unlocked once an MHD Decelerator Ring is running.', upfront: 320000, fee: 205 },
    supercon:        { label: 'Cryon Superconductor Works', icon: '🧲', desc: 'Fusion-era magnet manufacturing: frosted liquid-helium dewars, a hall where giant coils are wound, and a maglev test track out front.', use: '300–450 kW around the clock for the cryogenics. Unlocked once a Fusion Reactor is built.', upfront: 300000, fee: 190 },
    aicompute:       { label: 'AI Computing Center',    icon: '🧠', desc: 'A vast AI training campus: data halls roofed with cooling fans, evaporative towers and its own substation.', use: 'The heaviest industrial customer: 420–700 kW around the clock. A blackout crashes the training run; a one-off $60,000 fine. Arrives as a rare request once Research Station MK4 is unlocked.', upfront: 240000, fee: 155 },
    semifab:         { label: 'Semiconductor Fab',      icon: '💾', desc: 'A clean-room chip fabrication plant.', use: 'The heaviest industrial customer at 193–234 kW. A blackout scraps the batch on the line: a one-off $20,000 fine. Unlocked with Research MK3 once two Steam Turbines are placed.', upfront: 90000, fee: 110 },
    spaceport:       { label: 'Starhaven Launch Complex', icon: '🚀', desc: 'A 24×16 spaceport: an assembly building, a lattice launch tower, a heavy-lift rocket, a booster landing pad, mission control and a propellant tank farm. It flies a mission every week or so, and the rocket climbs out over the city.', use: 'The heaviest industrial customer outside MK4: 450–900 kW day and night. A launch is announced a day ahead; the count draws up to 12.6 MW, and holding power through liftoff pays a bonus. No longer offered: Starhaven now arrives in the National Government Zone, and a city that already has this one keeps it.', upfront: 320000, fee: 340 },
    sawmill:         { label: 'Ridgeline Sawmill', icon: '🪵', desc: 'A timber mill: logs from the pond go through the head saw, dry in the kilns and stack up as lumber in the yard.', use: '22 kW through the day shift, 07:00–19:00; shut overnight. Available from the start.', upfront: 18000, fee: 24 },
    glassworks:      { label: 'Crystal Bay Glassworks', icon: '🍾', desc: 'A container-glass works: batch silos feed a glowing furnace, gobs drop into the forming machine and bottles ride through the annealing lehr.', use: '40–55 kW around the clock; a glass furnace is never allowed to go cold. Unlocked with Research MK2.', upfront: 34000, fee: 42 },
    papermill:       { label: 'Riverbend Paper Mill', icon: '📜', desc: 'A pulp and paper mill: a chip pile, a digester and bleach towers, a steaming paper machine hall, jumbo reels and a clarifier.', use: '97–138 kW around the clock. Unlocked with Research MK3 once a Hydroelectric Generator is running.', upfront: 58000, fee: 70 },
    wastefacility:   { label: 'Tri-County Waste Disposal', icon: '🗑️', desc: 'A municipal waste site: garbage trucks tip in a transfer hall, recyclables are baled, and the rest goes to a lined landfill cell whose methane is piped to a flare.', use: 'Draws 25–45 kW around the clock; compactors, leachate pumps and the flare blower never stop. Trucks run 06:00–18:00. Unlocked with Research MK2 once a Pump Jack is placed.', upfront: 28000, fee: 36 },
    brickworks:      { label: 'Brick Works',    icon: '🧱', desc: 'A coal-fired brick works built around a Hoffman ring kiln, its fire working slowly round the ring beneath a tall central chimney.', use: 'Kilns fire around the clock at 45–60 kW. Unlocked with Research MK2 once a Coal Generator is placed.', upfront: 30000, fee: 38 },
    plastics:        { label: 'Plastics Plant', icon: '🧴', desc: 'A polymer plant turning refinery feedstock into pellets.', use: 'Runs 55–75 kW. Unlocked with Research MK2 once your refinery has produced fuel oil.', upfront: 36000, fee: 45 },
  };

  // Every material that moves between buildings: what it is, how it travels,
  // what makes it and what takes it. `from` gates the entry — it appears once
  // any of those buildings is unlocked, like the buildables above. `store` is
  // only set where a storage building really banks it (SolidStorageSystem /
  // GasStorageSystem KINDS): coal and spent fuel deliberately can't be.
  const MATERIAL_DEFS = [
    // ── Belt solids ──
    { key: 'coal',       label: 'Coal',              icon: '⚫', by: 'Conveyor', from: () => [T.COALMINE, T.COALMINE2],
      desc: 'Dug out of coal deposits.', made: 'Coal Mine', used: 'Coal Power Generator, Coke Oven Battery' },
    { key: 'uranium',    label: 'Uranium Ore',       icon: '☢️', by: 'Conveyor', from: () => [T.URANIUMMINE], store: 'Storage Container',
      desc: 'Raw uranium from a uranium deposit.', made: 'Uranium Mine', used: 'Fuel Processing Plant (with acid), Advanced Fuel Processing' },
    { key: 'sulfur',     label: 'Sulfur',            icon: '🟡', by: 'Conveyor', from: () => [T.SULFURMINE, T.SULFURMINE2], store: 'Storage Container',
      desc: 'Yellow mineral from a sulfur deposit, the base of the acid that turns ore into fuel.', made: 'Sulfur Mine, Sulfur Mine MK2', used: 'Chemical Plant' },
    { key: 'lithium',    label: 'Lithium Ore',       icon: '🪨', by: 'Conveyor', from: () => [T.LITHIUMMINE], store: 'Storage Container',
      desc: 'Raw lithium-bearing rock from a lithium deposit.', made: 'Lithium Mine', used: 'Lithium Processing Plant' },
    { key: 'compound',   label: 'Lithium Compound',  icon: '🧂', by: 'Conveyor', from: () => [T.LITHIUMPROCESSPLANT], store: 'Storage Container',
      desc: 'Refined lithium. Hit with neutrons, it turns into tritium.', made: 'Lithium Processing Plant (ore + water)', used: 'Tritium Breeding Facility, Fusion Reactor breeding blanket' },
    { key: 'rods',       label: 'Fuel Rods',         icon: '🔋', by: 'Conveyor', from: () => [T.FUELPLANT], store: 'Storage Container',
      desc: 'Enriched uranium packed into rods, ready for a reactor core.', made: 'Fuel Processing Plant (uranium + acid)', used: 'Nuclear Reactor' },
    { key: 'spent',      label: 'Spent Fuel',        icon: '♨️', by: 'Conveyor or Waste Truck', from: () => [T.NUCLEARREACTOR, T.ADVREACTOR],
      desc: 'Used-up rods, still hot and radioactive. A reactor whose spent-fuel store fills up stops generating, so it has to be moved on. Storage Containers refuse it.',
      made: 'Nuclear Reactor, Advanced Nuclear Reactor', used: 'Spent Fuel Pool, Reprocessing Plant, Nuclear Waste Processing Facility' },
    { key: 'recovered',  label: 'Recovered Uranium', icon: '♻️', by: 'Conveyor', from: () => [T.REPROCESSOR], store: 'Storage Container',
      desc: 'Uranium pulled back out of spent fuel.', made: 'Reprocessing Plant', used: 'Advanced Fuel Processing (in place of mined ore)' },
    { key: 'plutonium',  label: 'Plutonium',         icon: '🟢', by: 'Conveyor', from: () => [T.REPROCESSOR], store: 'Storage Container',
      desc: 'Bred in reactor fuel and separated out by reprocessing. Valuable and dangerous to stockpile.', made: 'Reprocessing Plant', used: 'Advanced Fuel Processing' },
    { key: 'mox',        label: 'MOX Fuel Rods',     icon: '🔋', by: 'Conveyor', from: () => [T.MOXPLANT], store: 'Storage Container',
      desc: 'Mixed-oxide fuel: plutonium blended back into a uranium matrix.', made: 'Advanced Fuel Processing (plutonium + uranium)', used: 'Advanced Nuclear Reactor' },
    { key: 'pellets',    label: 'D-T Fuel Pellets',  icon: '🔵', by: 'Conveyor', from: () => [T.FUSIONFUELPLANT], store: 'Storage Container',
      desc: 'Frozen deuterium-tritium pellets, fired into the plasma to fuel it.', made: 'Fusion Fuel Plant (deuterium + tritium)', used: 'Fusion Reactor' },
    { key: 'he3pellets', label: 'D-He3 Fuel Pellets', icon: '🟠', by: 'Conveyor', from: () => [T.HE3SEPARATOR], store: 'Storage Container',
      desc: 'Deuterium-helium-3 pellets. They burn without neutrons, so the energy comes out as charged particles.', made: 'Fusion Fuel Plant (deuterium + helium-3)', used: 'Advanced Fusion Reactor' },
    { key: 'rareearth',  label: 'Rare Earth Ore',    icon: '🧲', by: 'Conveyor', from: () => [T.RAREEARTHMINE], store: 'Storage Container',
      desc: 'Monazite sand: the honey-red heavy-mineral grains that carry the rare earths, and a little thorium.', made: 'Rare Earth Mine', used: 'Leach Plant (with acid)' },
    { key: 'oxide',      label: 'Rare Earth Oxide',  icon: '🟪', by: 'Conveyor', from: () => [T.LEACHPLANT], store: 'Storage Container',
      desc: 'The leached concentrate, a pale lilac powder; the raw material of superconductor tape.', made: 'Leach Plant (ore + acid)', used: 'Superconductor Mill' },
    { key: 'tape',       label: 'HTS Tape',          icon: '🧵', by: 'Conveyor', from: () => [T.SCMILL], store: 'Storage Container',
      desc: 'High-temperature superconductor tape on its spool; what a Field Core is wound from.', made: 'Superconductor Mill (oxide + hydrogen + nitrogen)', used: 'Core Works' },
    { key: 'coke',       label: 'Coke',              icon: '🪨', by: 'Conveyor', from: () => [T.COKEOVEN], store: 'Storage Container',
      desc: 'Coal baked without air until only the carbon is left: knobbly, silver-grey, light and full of pores, and it burns far hotter than the coal it came from.', made: 'Coke Oven Battery (from coal)', used: 'Graphitization Furnace' },
    { key: 'graphite',   label: 'Graphite',          icon: '⬛', by: 'Conveyor', from: () => [T.GRAPHITEFURNACE], store: 'Storage Container',
      desc: 'Coke cooked electrically until its carbon lines up into sheets: dark, slick, metallic, and machined into hexagonal reflector blocks. Round a reactor core it bounces escaping neutrons back in, so the same fuel raises more steam.', made: 'Graphitization Furnace (from coke)', used: 'Advanced Nuclear Reactor (GRAPHITE IN: +20% steam while stocked)' },
    { key: 'fieldcore',  label: 'Field Core',        icon: '🧲', by: 'Drone or Hauler', from: () => [T.COREWORKS],
      desc: 'A charged superconducting magnet cartridge. In a fusion reactor its stronger field means tighter confinement: the 1st, 2nd and 3rd core add +50%, +30% and +20% to everything the reactor feeds, for 0.35× that in extra fuel and 1.5 liquid helium a second each. A charge lasts 24 in-game hours of running; at 25% drones and Haulers swap it, and a reactor quench takes its cores down with it. Set how many cores a reactor runs in its panel. Storage Containers can\'t bank them.',
      made: 'Core Works (wound from tape, then charged)', used: 'Fusion Reactor, Advanced Fusion Reactor' },
    { key: 'biofuel',    label: 'Biofuel',           icon: '🌱', by: 'Collected by hand', from: () => [T.BIOFUELGEN],
      desc: 'Gathered by chopping trees and bushes, and from fish you catch.', made: 'Trees, bushes, fishing', used: 'Biofuel Generator' },

    // ── Pipe liquids ──
    { key: 'water',      label: 'Water',             icon: '💧', by: 'Pipe', from: () => [T.WATEREXTRACTOR],
      desc: 'Pumped up from the ground. Almost every plant in the game needs some.', made: 'Water Extractor', used: 'Most processing plants, Electrolyzer, Cooling Tower' },
    { key: 'cool',       label: 'Cooling Water',     icon: '🌊', by: 'Pipe', from: () => [T.COOLINGTOWER],
      desc: 'Water chilled by a cooling tower. Without enough of it a reactor overheats.', made: 'Cooling Tower', used: 'Nuclear Reactor, Cryogenic Cooling Tower' },
    { key: 'cryocool',   label: 'Cryogenic Coolant', icon: '🧊', by: 'Pipe', from: () => [T.COOLINGTOWER2],
      desc: 'Cooling water taken much colder, for the hottest-running cores.', made: 'Cryogenic Cooling Tower (from cooling water)', used: 'Advanced Nuclear Reactor, Advanced Fusion Reactor' },
    { key: 'steam',      label: 'Steam',             icon: '♨️', by: 'Pipe', from: () => [T.NUCLEARREACTOR, T.GEOWELL],
      desc: 'What actually spins the turbines: reactors and wells only make heat.', made: 'Nuclear and fusion reactors, Geothermal Well', used: 'Steam Turbine, Geothermal Turbine' },
    { key: 'oil',        label: 'Crude Oil',         icon: '🛢️', by: 'Pipe', from: () => [T.PUMPJACK, T.PUMPJACK2],
      desc: 'Pumped out of an oil field. Has to be refined before anything can burn it.', made: 'Pump Jack', used: 'Oil Refinery' },
    { key: 'fueloil',    label: 'Fuel Oil',          icon: '⛽', by: 'Pipe', from: () => [T.REFINERY],
      desc: 'Refined oil, ready to burn.', made: 'Oil Refinery', used: 'Fuel Power Generator' },
    { key: 'lpg',        label: 'LPG',               icon: '🔥', by: 'Pipe', from: () => [T.REFINERY],
      desc: 'Light gas given off while refining. Nothing uses it yet, so refineries flare it off.', made: 'Oil Refinery', used: 'Nothing yet' },
    { key: 'acid',       label: 'Acid',              icon: '🧪', by: 'Pipe', from: () => [T.CHEMICALPLANT],
      desc: 'Sulfuric acid, used to leach uranium out of its ore.', made: 'Chemical Plant (sulfur + water)', used: 'Fuel Processing Plant, Leach Plant' },
    { key: 'liquidhe',   label: 'Liquid Helium (LHe)', icon: '❄️', by: 'Pipe', from: () => [T.CRYOPLANT],
      desc: 'Helium at 4 K. It keeps a fusion reactor\'s superconducting magnets cold; lose it and they quench.', made: 'Cryo Plant (from helium gas)', used: 'Fusion reactor magnets' },
    { key: 'highbeta',   label: 'High-Beta Plasma',  icon: '⚡', by: 'Pipe', from: () => [T.ADVFUSIONREACTOR],
      desc: 'The charged-particle stream from D-He3 fusion. Converted straight to electricity, no turbine needed.', made: 'Advanced Fusion Reactor', used: 'MHD Decelerator Ring' },

    // ── Pipe gases ──
    { key: 'hydrogen',   label: 'Hydrogen Gas',      icon: '🎈', by: 'Pipe', from: () => [T.ELECTROLYZER, T.COKEOVEN], store: 'Gas Holder',
      desc: 'Split out of water with electricity, or drawn off a coke oven as oven gas.', made: 'Electrolyzer (from water), Coke Oven Battery (oven gas)', used: 'Haber-Bosch Complex, Superconductor Mill' },
    { key: 'nitrogen',   label: 'Nitrogen Gas',      icon: '🌫️', by: 'Pipe', from: () => [T.ATMOSCOLLECTOR], store: 'Gas Holder',
      desc: 'Drawn straight out of the air; all it takes is power.', made: 'Atmosphere Collector', used: 'Haber-Bosch Complex, Superconductor Mill' },
    { key: 'ammonia',    label: 'Ammonia Gas',       icon: '💨', by: 'Pipe', from: () => [T.HABERBOSCH], store: 'Gas Holder',
      desc: 'Made from hydrogen and nitrogen. A catalyst: the wash tower needs it present but doesn\'t use it up.', made: 'Haber-Bosch Complex', used: 'Isotopic Wash Tower' },
    { key: 'deuterium',  label: 'Deuterium Gas',     icon: '🩷', by: 'Pipe', from: () => [T.WASHTOWER], store: 'Gas Holder',
      desc: 'Heavy hydrogen washed out of ordinary water. Half of every fusion pellet.', made: 'Isotopic Wash Tower (water + ammonia)', used: 'Fusion Fuel Plant' },
    { key: 'tritium',    label: 'Tritium',           icon: '🟩', by: 'Pipe', from: () => [T.TRITIUMBREEDER, T.HULKINGFUSIONREACTOR], store: 'Gas Holder',
      desc: 'Radioactive heavy hydrogen, bred from lithium. A fed reactor blanket makes a little more than the reactor burns.', made: 'Tritium Breeding Facility, Fusion Reactor blanket', used: 'Fusion Fuel Plant (D-T pellets)' },
    { key: 'helium',     label: 'Helium Gas',        icon: '🟣', by: 'Pipe', from: () => [T.HELIUMWELL, T.HELIUMWELL2], store: 'Gas Holder',
      desc: 'Comes up from helium-rich gas fields found by scanning.', made: 'Helium Well (fusion reactors also give off helium ash)', used: 'Cryo Plant, Helium-3 Separator' },
    { key: 'helium3',    label: 'Helium-3',          icon: '✨', by: 'Pipe', from: () => [T.HE3SEPARATOR], store: 'Gas Holder',
      desc: 'A rare light isotope distilled out of helium gas.', made: 'Helium-3 Separator', used: 'Fusion Fuel Plant (D-He3 pellets)' },

    // ── Waste (hauled by truck) ──
    { key: 'ash',        label: 'Coal Ash',          icon: '🪣', by: 'Waste Truck', from: () => [T.COALGENERATOR],
      desc: 'Left behind by burning coal; trucks haul it away to be processed.', made: 'Coal Power Generator', used: 'Coal Waste Processing Facility' },
    { key: 'sludge',     label: 'Oil Sludge',        icon: '🟤', by: 'Waste Truck', from: () => [T.REFINERY],
      desc: 'The heavy residue from refining.', made: 'Oil Refinery', used: 'Oil Waste Processing Facility' },
    { key: 'hlw',        label: 'High-Level Waste',  icon: '☣️', by: 'Waste Truck', from: () => [T.REPROCESSOR],
      desc: 'What\'s left after reprocessing: less of it than spent fuel, but hotter.', made: 'Reprocessing Plant', used: 'Nuclear Waste Processing Facility' },
    { key: 'tailings',   label: 'Thorium Tailings',  icon: '☢️', by: 'Waste Truck or drone', from: () => [T.LEACHPLANT],
      desc: 'The residue left when monazite is leached. Only mildly radioactive, but it still goes where the reactors\' waste goes, and Storage Containers refuse it.', made: 'Leach Plant', used: 'Nuclear Waste Processing Facility' },
  ];

  function _materialsSection() {
    return {
      label: 'Materials',
      items: MATERIAL_DEFS.map(m => {
        const stats = [['Carried by', m.by], ['Made by', m.made], ['Used by', m.used]];
        if (m.store) stats.push(['Stored in', m.store]);
        return {
          key: 'mat:' + m.key, label: m.label, desc: m.desc, use: '', stats,
          iconKind: 'emoji', icon: m.icon,
          unlocked: m.from().some(t => t && Progression.isUnlocked(t)),
        };
      }),
    };
  }

  function _fmtMoney(n) { return '$' + Math.round(n).toLocaleString(); }

  function _statsFor(def, type) {
    const stats = [];
    // The geothermal chain is the one generator whose rating is set by the
    // world rather than the def — show this world's actual figure.
    const _geoW = (type === T.GEOTURBINE || type === T.GEOWELL)
      ? GeothermalSystem.getBaseOutputPerTurbine() : 0;
    if (def.cost)              stats.push(['Cost', _fmtMoney(def.cost)]);
    if (def.upkeep > 0)        stats.push(['Upkeep', _fmtMoney(def.upkeep) + '/s']);
    else if (def.upkeep < 0 || def.income > 0) stats.push(['Income', _fmtMoney(def.income || -def.upkeep) + '/s']);
    if (def.peakOutput)        stats.push(['Peak Output', formatPower(def.peakOutput) + ' (solar noon)']);
    else if (def.baseOutput)   stats.push(['Output', `${def.baseOutput}–${formatPower(def.maxOutput || def.baseOutput)} (wind-dependent)`]);
    else if (type === T.GEOTURBINE) stats.push(['Power Output', `${formatPower(_geoW)} (${GeothermalSystem.getActivityLabel().text} activity)`]);
    else if (def.powerOutput)  stats.push(['Power Output', formatPower(def.powerOutput)]);
    if (type === T.GEOWELL)    stats.push(['Steam Output', `${_geoW} units/s (${GeothermalSystem.getActivityLabel().text} activity)`]);
    if (def.powerInput)        stats.push(['Power Draw', def.minDraw != null ? `${def.minDraw}–${formatPower(def.powerInput)} (daily curve)` : formatPower(def.powerInput)]);
    stats.push(['Size', `${def.width || 1}×${def.height || 1}`]);
    if (def.throughput)        stats.push(['Wire Capacity', formatPower(def.throughput)]);
    if (def.maxOutput && !def.baseOutput) stats.push(['Max Discharge Rate', formatPower(def.maxOutput)]);
    if (def.researchRate)      stats.push(['Research Rate', def.researchRate + '/s']);
    if (def.amenityRange)      stats.push(['Range', def.amenityRange + ' tiles']);
    if (def.satisfBoost)       stats.push(['Satisfaction Boost', '+' + def.satisfBoost]);
    return stats;
  }

  function _buildableSections() {
    return HOTBAR_CATEGORIES.filter(cat => cat.id !== 'delete').map(cat => ({
      label: cat.label,
      items: cat.tools.filter(t => EntityDefs[t]).map(t => {
        const def = EntityDefs[t];
        const d = DESCS[t] || {};
        return {
          key: 'tool:' + t, type: t, label: def.label,
          desc: d.desc || '', use: d.use || '', stats: _statsFor(def, t),
          iconKind: 'tool', unlocked: Progression.isUnlocked(t),
        };
      }),
    })).filter(sec => sec.items.length);
  }

  function _typeSection(label, types, discoveredSet) {
    return {
      label,
      items: types.filter(t => EntityDefs[t]).map(t => {
        const def = EntityDefs[t];
        const d = DESCS[t] || {};
        return {
          key: label + ':' + t, type: t, label: def.label,
          desc: d.desc || '', use: d.use || '', stats: _statsFor(def, t),
          iconKind: 'emoji', icon: d.icon || '❓', unlocked: discoveredSet.has(t),
        };
      }),
    };
  }

  function _propertySection(label, defsMap, bucket) {
    return {
      label,
      items: Object.keys(defsMap).map(subtype => {
        const d = defsMap[subtype];
        return {
          key: bucket + ':' + subtype, label: d.label, desc: d.desc, use: d.use,
          stats: [['Upfront Fee', _fmtMoney(d.upfront)], ['Revenue', _fmtMoney(d.fee) + '/s']],
          iconKind: 'emoji', icon: d.icon,
          unlocked: _subtypeDiscovered.has(`${bucket}:${subtype}`),
        };
      }),
    };
  }

  function _residentialSection() {
    const tierItems = Object.keys(TIER_DEFS).map(tier => {
      const d = TIER_DEFS[tier];
      const peakDraw = (6 * d.demandMult).toFixed(1);
      return {
        key: 'tier:' + tier, label: d.label, desc: d.desc, use: d.use,
        stats: [
          ['Upfront Fee', `${_fmtMoney(d.upfront[0])}–${_fmtMoney(d.upfront[1])}`],
          ['Revenue', `${_fmtMoney(d.fee[0])}–${_fmtMoney(d.fee[1])}/s`],
          ['Power Draw', `~${formatPower(peakDraw)} at evening peak (scales up as your city grows)`],
        ],
        iconKind: 'emoji', icon: d.icon, unlocked: _tierDiscovered.has(tier),
      };
    });
    const rareItems = Object.keys(RARE_RESIDENTIAL).map(subtype => {
      const d = RARE_RESIDENTIAL[subtype];
      return {
        key: 'house:' + subtype, label: d.label, desc: d.desc, use: d.use,
        stats: [
          ['Upfront Fee', _fmtMoney(d.upfront)],
          ['Revenue', _fmtMoney(d.fee) + '/s'],
          ['Power Draw', `~${formatPower(d.peakDraw)} at ${d.peakLabel || 'evening peak'} (scales up as your city grows)`],
        ],
        iconKind: 'emoji', icon: d.icon, unlocked: _subtypeDiscovered.has(`house:${subtype}`),
      };
    });
    return { label: 'Residential Properties', items: [...tierItems, ...rareItems] };
  }

  function _vegetationSection() {
    return {
      label: 'Trees & Vegetation',
      items: [
        { key: 'veg:tree', label: 'Tree', desc: 'A tree scattered naturally across the map.', use: 'Can be chopped for a small amount of biofuel.', stats: [], iconKind: 'emoji', icon: '🌳', unlocked: true },
        { key: 'veg:bush', label: 'Bush', desc: 'A bush scattered naturally across the map.', use: 'Can be chopped for a small amount of biofuel.', stats: [], iconKind: 'emoji', icon: '🌿', unlocked: true },
      ],
    };
  }

  function _fishSection() {
    if (typeof FishingSystem === 'undefined') return { label: 'Fish & Catches', items: [] };
    const table = FishingSystem.getFishTable();
    // Uncaught fish still show, as a silhouette with only the where/when
    // hint, so there's something to go looking for — once you've landed a first fish.
    return {
      label: 'Fish & Catches',
      showLocked: FishingSystem.hasCaughtAny(),
      items: table.map(f => {
        const stars = '★'.repeat(f.difficulty) + '☆'.repeat(5 - f.difficulty);
        const niceName = f.name.replace(/^(a|an|something)\s+/i, '').replace(/^\w/, c => c.toUpperCase());
        const hint = FishingSystem.habitatHint(f.icon);
        const caught = FishingSystem.hasCaughtIcon(f.icon);
        const use = f.isJunk
          ? `Junk catch: no biofuel, but still worth ${_fmtMoney(f.money[0])}–${_fmtMoney(f.money[1])}. ${hint}`
          : `Yields ${BiofuelSystem.yieldRange(f.fuel[0], f.fuel[1])} biofuel and ${_fmtMoney(f.money[0])}–${_fmtMoney(f.money[1])} in cash when caught. ${hint}`;
        return caught
          ? { key: 'fish:' + f.icon, label: niceName, desc: `Difficulty: ${stars}`, use,
              stats: [], iconKind: 'fish', fishKey: f.icon, unlocked: true }
          : { key: 'fish:' + f.icon, label: '???', desc: `Difficulty: ${stars}`, use: hint,
              stats: [], iconKind: 'fish', fishKey: f.icon, silhouette: true, unlocked: false };
      }),
    };
  }

  // One section per tutorial sequence — each sequence already corresponds
  // to a distinct part of the game (Getting Started, Powering a
  // Neighborhood, Scaling Up, ...), so that's the sub-categorization.
  // Only steps the player has actually reached (TutorialSystem tracks this
  // independently of whether popup cards are currently enabled) show up —
  // notes keep accumulating even with cards turned off.
  function _tutorialNotesSections() {
    if (typeof TutorialSystem === 'undefined') return [];
    return TutorialSystem.getNotesData().map(seq => ({
      label: seq.title,
      group: 'Tutorial Notes',
      items: seq.notes.map(n => ({
        key: `tutnote:${seq.id}:${n.index}`,
        label: `Step ${n.index + 1}`,
        desc: n.text, use: '', stats: [],
        iconKind: 'note', unlocked: true,
        seqId: seq.id, stepIndex: n.index,
      })),
    }));
  }

  function _buildSections() {
    return [
      ..._buildableSections(),
      _materialsSection(),
      _typeSection('Civic Buildings', CIVIC_TYPES, _civicDiscovered),
      _typeSection('Parks & Community', PARK_TYPES, _parkDiscovered),
      _residentialSection(),
      _propertySection('Commercial Properties', COMMERCIAL_DEFS, 'commercial'),
      _propertySection('Industrial Properties', INDUSTRIAL_DEFS, 'industrial'),
      _vegetationSection(),
      _fishSection(),
      ..._tutorialNotesSections(),
    ];
  }

  // Tutorial note text can embed the player-chosen city/company name, so
  // (unlike every other card, which is built from static developer-authored
  // strings) it must never go through innerHTML — build it with textContent
  // only to keep arbitrary player input from being interpreted as markup.
  function _buildNoteCard(it) {
    const card = document.createElement('div');
    card.className = 'cmp-card cmp-note-card';
    card.title = 'Click to pop this tutorial card back up';
    card.addEventListener('click', () => {
      if (typeof TutorialSystem !== 'undefined') TutorialSystem.forceShow(it.seqId, it.stepIndex);
    });

    const iconWrap = document.createElement('div');
    iconWrap.className = 'cmp-card-icon';
    iconWrap.textContent = '📖';
    iconWrap.style.fontSize = '27px';
    card.appendChild(iconWrap);

    const info = document.createElement('div');
    info.className = 'cmp-card-info';
    const title = document.createElement('div');
    title.className = 'cmp-card-title';
    title.textContent = it.label;
    info.appendChild(title);
    const desc = document.createElement('div');
    desc.className = 'cmp-note-text';
    desc.textContent = it.desc;
    info.appendChild(desc);
    card.appendChild(info);
    return card;
  }

  function _buildCard(it) {
    if (it.iconKind === 'note') return _buildNoteCard(it);
    const card = document.createElement('div');
    card.className = 'cmp-card';

    const iconWrap = document.createElement('div');
    iconWrap.className = 'cmp-card-icon';
    if (it.iconKind === 'tool') {
      const c = document.createElement('canvas');
      c.width = 48; c.height = 48;
      try { RenderSystem.renderIcon(c, it.type); } catch (e) {}
      iconWrap.appendChild(c);
    } else if (it.iconKind === 'fish') {
      const c = document.createElement('canvas');
      c.width = 64; c.height = 64;
      c.style.cssText = 'width:48px;height:48px;';
      try {
        const fctx = c.getContext('2d');
        if (it.silhouette) { fctx.filter = 'brightness(0)'; fctx.globalAlpha = 0.45; }
        FishingSystem.drawCatchArt(fctx, it.fishKey);
      } catch (e) {}
      iconWrap.appendChild(c);
    } else {
      iconWrap.textContent = it.icon || '❓';
      iconWrap.style.fontSize = '27px';
    }
    card.appendChild(iconWrap);

    const info = document.createElement('div');
    info.className = 'cmp-card-info';
    info.innerHTML = `
      <div class="cmp-card-title">${it.label}</div>
      ${it.desc ? `<div class="cmp-card-desc">${it.desc}</div>` : ''}
      ${it.use  ? `<div class="cmp-card-use">${it.use}</div>` : ''}
      ${it.stats.length ? `<div class="cmp-card-stats">${it.stats.map(([k, v]) => `<span><b>${k}:</b> ${v}</span>`).join('')}</div>` : ''}
    `;
    card.appendChild(info);
    return card;
  }

  let _lastQuery = '';
  const _expanded = new Set();   // section labels the player has opened — all closed by default

  function _matchesQuery(it, q) {
    if (!q) return true;
    const hay = `${it.label} ${it.desc || ''} ${it.use || ''}`.toLowerCase();
    return hay.includes(q);
  }

  function renderPanel(query) {
    if (query !== undefined) _lastQuery = query;
    const q = (_lastQuery || '').trim().toLowerCase();
    const body = document.getElementById('compendium-body');
    if (!body) return;
    body.innerHTML = '';
    const sections = _buildSections();
    let totalUnlocked = 0, totalItems = 0, shown = 0;
    let lastGroup = null;
    // How many sections of each group have something to show, for the
    // group header's count.
    const groupCounts = {};
    sections.forEach(sec => {
      if (sec.group && sec.items.some(it => it.unlocked && _matchesQuery(it, q)))
        groupCounts[sec.group] = (groupCounts[sec.group] || 0) + 1;
    });
    sections.forEach(sec => {
      const unlocked = sec.items.filter(it => it.unlocked);
      const visible  = (sec.showLocked ? sec.items : unlocked).filter(it => _matchesQuery(it, q));
      totalUnlocked += unlocked.length;
      totalItems    += sec.items.length;
      if (!visible.length) return;
      shown += visible.length;
      // A `group` (currently just "Tutorial Notes") gets one bold parent
      // header the first time one of its sections appears; the sections
      // themselves render as indented sub-headers underneath it. The group
      // header collapses and expands all of them at once (closed by default,
      // forced open while searching, like the sections).
      const groupCollapsed = sec.group && !q && !_expanded.has('group:' + sec.group);
      if (sec.group && sec.group !== lastGroup) {
        const g = document.createElement('div');
        g.className = 'cmp-group-header' + (groupCollapsed ? ' collapsed' : '');
        g.innerHTML = `<span class="cmp-section-arrow">${groupCollapsed ? '▸' : '▾'}</span>`;
        g.appendChild(document.createTextNode(`${sec.group} (${groupCounts[sec.group]})`));
        const key = 'group:' + sec.group;
        g.addEventListener('click', () => {
          if (_expanded.has(key)) _expanded.delete(key);
          else _expanded.add(key);
          renderPanel();
        });
        body.appendChild(g);
      }
      lastGroup = sec.group || null;
      if (groupCollapsed) return;
      // While searching, force sections with matches open so results are visible.
      const isCollapsed = !q && !_expanded.has(sec.label);
      const h = document.createElement('div');
      h.className = 'cmp-section-header' + (isCollapsed ? ' collapsed' : '') + (sec.group ? ' cmp-subsection-header' : '');
      h.innerHTML = `<span class="cmp-section-arrow">${isCollapsed ? '▸' : '▾'}</span>` +
        (q ? `${sec.label} (${visible.length})` : `${sec.label} (${unlocked.length}/${sec.items.length})`);
      h.addEventListener('click', () => {
        if (_expanded.has(sec.label)) _expanded.delete(sec.label);
        else _expanded.add(sec.label);
        renderPanel();
      });
      body.appendChild(h);
      if (!isCollapsed) visible.forEach(it => body.appendChild(_buildCard(it)));
    });
    const countEl = document.getElementById('cmp-count');
    if (countEl) countEl.textContent = `${totalUnlocked} / ${totalItems}`;
    if (!totalUnlocked) {
      const empty = document.createElement('div');
      empty.className = 'cmp-no-results';
      empty.textContent = 'Nothing discovered yet: build, unlock, or encounter something new to add it here.';
      body.appendChild(empty);
    } else if (!shown) {
      const empty = document.createElement('div');
      empty.className = 'cmp-no-results';
      empty.textContent = `No discovered entries match "${_lastQuery.trim()}".`;
      body.appendChild(empty);
    }
  }

  return {
    tick() { _scan(); },
    renderPanel,
    serialise() {
      return {
        civic:    [..._civicDiscovered],
        parks:    [..._parkDiscovered],
        tiers:    [..._tierDiscovered],
        subtypes: [..._subtypeDiscovered],
      };
    },
    loadState(data) {
      if (!data) return;
      _civicDiscovered.clear();   (data.civic    || []).forEach(t => _civicDiscovered.add(t));
      _parkDiscovered.clear();    (data.parks    || []).forEach(t => _parkDiscovered.add(t));
      _tierDiscovered.clear();    (data.tiers    || []).forEach(t => _tierDiscovered.add(t));
      _subtypeDiscovered.clear(); (data.subtypes || []).forEach(t => _subtypeDiscovered.add(t));
    },
  };
})();
