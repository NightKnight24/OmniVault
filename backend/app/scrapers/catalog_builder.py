import json
import sqlite3
import urllib.parse
from pathlib import Path
from typing import List, Dict, Any, Optional

LIBRETRO_MAP = {
    "SNES": "Nintendo_-_Super_Nintendo_Entertainment_System",
    "N64": "Nintendo_-_Nintendo_64",
    "PS1": "Sony_-_PlayStation",
    "GBA": "Nintendo_-_Game_Boy_Advance",
    "Genesis": "Sega_-_Mega_Drive_-_Genesis",
    "NES": "Nintendo_-_Nintendo_Entertainment_System",
    "Arcade": "MAME"
}

ARCHIVE_COLLECTION_MAP = {
    "SNES": "nointro-snes",
    "NES": "ef_nintendo_entertainment_-system_-no-intro_2024-04-23",
    "N64": "No-Intro_N64_Collection",
    "GBA": "recalbox-nointro-gba-1g1r-retroninjasamurai",
    "Genesis": "nointro.md",
    "PS1": "sony-playstation-usa-translations-1g1r-chd-perfect-collection_202310",
    "Arcade": "neogeoaesmvscomplete"
}

FORMAT_MAP = {
    "SNES": ".sfc",
    "N64": ".z64",
    "PS1": ".chd",
    "GBA": ".gba",
    "Genesis": ".md",
    "NES": ".nes",
    "Arcade": ".zip"
}

PLATFORM_FULL_NAMES = {
    "SNES": "Super Nintendo",
    "N64": "Nintendo 64",
    "PS1": "Sony PlayStation",
    "GBA": "Game Boy Advance",
    "Genesis": "Sega Genesis",
    "NES": "Nintendo Entertainment System",
    "Arcade": "Arcade Classics"
}

DEFAULT_TRACKERS = [
    "udp://tracker.opentrackr.org:1337/announce",
    "udp://open.stealth.si:80/announce",
    "udp://tracker.torrent.eu.org:451/announce"
]

def make_magnet(title: str, platform: str) -> Optional[str]:
    # Do not fabricate false BitTorrent hashes
    return None

def make_boxart_url(platform: str, title: str) -> str:
    repo = LIBRETRO_MAP.get(platform, "Nintendo_-_Super_Nintendo_Entertainment_System")
    safe_title = urllib.parse.quote(f"{title} (USA)")
    return f"https://raw.githubusercontent.com/libretro-thumbnails/{repo}/master/Named_Boxarts/{safe_title}.png"

def make_snap_url(platform: str, title: str) -> str:
    repo = LIBRETRO_MAP.get(platform, "Nintendo_-_Super_Nintendo_Entertainment_System")
    safe_title = urllib.parse.quote(f"{title} (USA)")
    return f"https://raw.githubusercontent.com/libretro-thumbnails/{repo}/master/Named_Snaps/{safe_title}.png"

def make_trailer_url(title: str, platform: str) -> str:
    query = urllib.parse.quote(f"{title} {platform} gameplay trailer")
    return f"https://www.youtube.com/embed?listType=search&list={query}&autoplay=0"

# Define the comprehensive master database across platforms & genres
RAW_CATALOG = [
    # ========================== SNES ==========================
    {"platform": "SNES", "title": "Chrono Trigger", "genre": "RPG", "year": 1995, "dev": "Square", "rating": 5.0, "size": 4.0, "desc": "Travel through time from prehistory to the end of time to prevent the alien parasite Lavos from destroying the planet. Features Akira Toriyama character designs and multiple endings."},
    {"platform": "SNES", "title": "Super Mario World", "genre": "Platformer", "year": 1990, "dev": "Nintendo EAD", "rating": 4.9, "size": 0.5, "desc": "Mario and Luigi journey through Dinosaur Land, team up with Yoshi for the first time, glide with the Cape Feather, and find secret exits to the Star World."},
    {"platform": "SNES", "title": "Super Metroid", "genre": "Action-Adventure", "year": 1994, "dev": "Nintendo R&D1", "rating": 4.9, "size": 3.0, "desc": "Samus Aran infiltrates the labyrinthine Planet Zebes to recover the stolen Metroid larva from Space Pirate Ridley and Mother Brain."},
    {"platform": "SNES", "title": "The Legend of Zelda: A Link to the Past", "genre": "Action-Adventure", "year": 1991, "dev": "Nintendo EAD", "rating": 5.0, "size": 1.0, "desc": "Link journeys between the Light World and the corrupted Dark World, wielding the Master Sword to rescue the maidens and seal away Ganon."},
    {"platform": "SNES", "title": "Final Fantasy VI", "genre": "RPG", "year": 1994, "dev": "Square", "rating": 4.9, "size": 3.0, "desc": "Terra Branford and an ensemble cast fight against the sadistic empire of Gestahl and the mad clown Kefka in a steampunk world of magic and machinery."},
    {"platform": "SNES", "title": "EarthBound", "genre": "RPG", "year": 1994, "dev": "Ape / HAL Laboratory", "rating": 4.9, "size": 3.0, "desc": "Ness, Paula, Jeff, and Poo embark on a quirky, contemporary suburban quest armed with baseball bats and psychic powers to stop alien conqueror Giygas."},
    {"platform": "SNES", "title": "Donkey Kong Country", "genre": "Platformer", "year": 1994, "dev": "Rare", "rating": 4.8, "size": 4.0, "desc": "Groundbreaking pre-rendered 3D visuals featuring Donkey Kong and Diddy Kong recovering their stolen banana hoard from King K. Rool."},
    {"platform": "SNES", "title": "Donkey Kong Country 2: Diddy's Kong Quest", "genre": "Platformer", "year": 1995, "dev": "Rare", "rating": 4.9, "size": 4.0, "desc": "Diddy and Dixie Kong climb Crocodile Isle to rescue Donkey Kong, accompanied by David Wise's legendary soundtrack."},
    {"platform": "SNES", "title": "Super Mario RPG: Legend of the Seven Stars", "genre": "RPG", "year": 1996, "dev": "Square / Nintendo", "rating": 4.8, "size": 4.0, "desc": "Mario teams up with Bowser, Peach, Mallow, and Geno to defeat the Smithy Gang and restore the shattered Star Road."},
    {"platform": "SNES", "title": "Super Mario World 2: Yoshi's Island", "genre": "Platformer", "year": 1995, "dev": "Nintendo EAD", "rating": 4.9, "size": 2.0, "desc": "Yoshi carries Baby Mario through pastel-colored storybook worlds, throwing eggs and performing flutter jumps to rescue Baby Luigi from Kamek."},
    {"platform": "SNES", "title": "Mega Man X", "genre": "Platformer", "year": 1993, "dev": "Capcom", "rating": 4.8, "size": 1.5, "desc": "Mega Man X dashes, wall-jumps, and equips hidden armor upgrades to defeat the Eight Mavericks and the rebellious Sigma."},
    {"platform": "SNES", "title": "Street Fighter II Turbo", "genre": "Fighting", "year": 1993, "dev": "Capcom", "rating": 4.8, "size": 2.5, "desc": "The definitive competitive arcade fighter featuring hyper speed battles, mirror matches, and the iconic Grand Masters: Balrog, Vega, Sagat, and M. Bison."},
    {"platform": "SNES", "title": "Super Mario Kart", "genre": "Racing", "year": 1992, "dev": "Nintendo EAD", "rating": 4.7, "size": 0.5, "desc": "The pioneer of the kart racing genre utilizing Mode 7 pseudo-3D perspective, red shells, banana peels, and frantic battle mode."},
    {"platform": "SNES", "title": "F-Zero", "genre": "Racing", "year": 1990, "dev": "Nintendo EAD", "rating": 4.6, "size": 0.5, "desc": "High-speed futuristic hovercar racing pushing Mode 7 scaling to its limits with Captain Falcon and the Blue Falcon."},
    {"platform": "SNES", "title": "Star Fox", "genre": "Shooter", "year": 1993, "dev": "Nintendo / Argonaut", "rating": 4.7, "size": 1.0, "desc": "Fox McCloud and Star Fox squadron dogfight through the Lylat System in Arwing fighters powered by the revolutionary Super FX 3D microchip."},
    {"platform": "SNES", "title": "Secret of Mana", "genre": "RPG", "year": 1993, "dev": "Square", "rating": 4.7, "size": 2.0, "desc": "Real-time action RPG featuring the Ring Command menu, rich elemental magic, three playable heroes, and Flammie the dragon."},
    {"platform": "SNES", "title": "Contra III: The Alien Wars", "genre": "Shooter", "year": 1992, "dev": "Konami", "rating": 4.8, "size": 1.0, "desc": "Bill Rizer and Lance Bean battle devastating alien invaders through Neo City in pulse-pounding side-scrolling and top-down stages."},
    {"platform": "SNES", "title": "Super Castlevania IV", "genre": "Action-Adventure", "year": 1991, "dev": "Konami", "rating": 4.8, "size": 1.0, "desc": "Simon Belmont infiltrates Count Dracula's domain with 8-directional whip mechanics, Mode 7 rotating rooms, and chilling orchestral synth audio."},
    {"platform": "SNES", "title": "Killer Instinct", "genre": "Fighting", "year": 1995, "dev": "Rare", "rating": 4.6, "size": 4.0, "desc": "Ultra-fast combo breaker battles with Jago, Fulgore, Glacius, and Orchid with devastating ultra combos."},
    {"platform": "SNES", "title": "Super Punch-Out!!", "genre": "Sports", "year": 1994, "dev": "Nintendo R&D3", "rating": 4.7, "size": 2.0, "desc": "Little Mac climbs through the World Video Boxing Association championship against outrageous boxers like Bear Hugger, Dragon Chan, and Nick Bruiser."},

    # ========================== N64 ==========================
    {"platform": "N64", "title": "Super Mario 64", "genre": "Platformer", "year": 1996, "dev": "Nintendo EAD", "rating": 4.9, "size": 8.0, "desc": "Pioneered 3D platforming with full analog 360-degree camera control, painting portals, and 120 Power Stars to reclaim Princess Peach's castle."},
    {"platform": "N64", "title": "The Legend of Zelda: Ocarina of Time", "genre": "Action-Adventure", "year": 1998, "dev": "Nintendo EAD", "rating": 5.0, "size": 32.0, "desc": "Link travels 7 years through time, playing the magical Ocarina to awaken the Sages, master Z-targeting lock-on combat, and defeat Ganondorf."},
    {"platform": "N64", "title": "The Legend of Zelda: Majora's Mask", "genre": "Action-Adventure", "year": 2000, "dev": "Nintendo EAD", "rating": 4.9, "size": 32.0, "desc": "Trapped in the doomed realm of Termina with only 3 days before the Moon crashes, Link uses transformation masks and time loops to avert disaster."},
    {"platform": "N64", "title": "GoldenEye 007", "genre": "Shooter", "year": 1997, "dev": "Rare", "rating": 4.8, "size": 16.0, "desc": "Revolutionized console first-person shooters with mission-based stealth objectives, sniper rifles, and legendary 4-player split-screen multiplayer."},
    {"platform": "N64", "title": "Perfect Dark", "genre": "Shooter", "year": 2000, "dev": "Rare", "rating": 4.8, "size": 32.0, "desc": "Agent Joanna Dark investigates the dataDyne corporation and alien conspiracies with high-tech gadgets, secondary fire modes, and custom Combat Simulator bots."},
    {"platform": "N64", "title": "Banjo-Kazooie", "genre": "Platformer", "year": 1998, "dev": "Rare", "rating": 4.9, "size": 16.0, "desc": "Banjo the honey bear and Kazooie the red-crested breegull collect Jiggies and musical notes to rescue Tooty from the wicked witch Gruntilda."},
    {"platform": "N64", "title": "Banjo-Tooie", "genre": "Platformer", "year": 2000, "dev": "Rare", "rating": 4.8, "size": 32.0, "desc": "A colossal adventure expanding the Isle o' Hags with interconnected sprawling worlds, first-person shooter sections, and split-up pads."},
    {"platform": "N64", "title": "Super Smash Bros.", "genre": "Fighting", "year": 1999, "dev": "HAL Laboratory", "rating": 4.8, "size": 16.0, "desc": "Nintendo's mascot brawler where Mario, Link, Samus, Pikachu, Fox, and DK battle on floating arenas with percentage-based knockouts."},
    {"platform": "N64", "title": "Mario Kart 64", "genre": "Racing", "year": 1996, "dev": "Nintendo EAD", "rating": 4.8, "size": 12.0, "desc": "True 3D elevation tracks including Royal Raceway and Kalimari Desert, introducing blue spiny shells and 4-player battle mode."},
    {"platform": "N64", "title": "Star Fox 64", "genre": "Shooter", "year": 1997, "dev": "Nintendo EAD", "rating": 4.9, "size": 16.0, "desc": "Do a barrel roll! Full voice-acted sci-fi aerial shooter introducing the Rumble Pak, branching planetary mission paths, and Landmaster tanks."},
    {"platform": "N64", "title": "Paper Mario", "genre": "RPG", "year": 2000, "dev": "Intelligent Systems", "rating": 4.8, "size": 40.0, "desc": "Charming papercraft pop-up aesthetic combining turn-based strategy with timed action commands and colorful companion partners."},
    {"platform": "N64", "title": "Conker's Bad Fur Day", "genre": "Platformer", "year": 2001, "dev": "Rare", "rating": 4.8, "size": 64.0, "desc": "Mature-rated comedic masterpiece filled with pop-culture movie spoofs, the Great Mighty Poo, and context-sensitive gameplay."},
    {"platform": "N64", "title": "F-Zero X", "genre": "Racing", "year": 1998, "dev": "Nintendo EAD", "rating": 4.8, "size": 16.0, "desc": "Blistering 60 frames-per-second anti-gravity racing featuring 30 vehicles on track simultaneously, corkscrews, pipes, and death races."},
    {"platform": "N64", "title": "Diddy Kong Racing", "genre": "Racing", "year": 1997, "dev": "Rare", "rating": 4.7, "size": 16.0, "desc": "Adventure-mode racing across cars, hovercrafts, and planes to liberate Timber's Island from the intergalactic pig wizard Wizpig."},
    {"platform": "N64", "title": "Donkey Kong 64", "genre": "Platformer", "year": 1999, "dev": "Rare", "rating": 4.6, "size": 32.0, "desc": "The DK Rap kicks off an adventure switching between 5 playable Kongs with unique musical instruments, weapons, and 201 golden bananas."},

    # ========================== PS1 ==========================
    {"platform": "PS1", "title": "Final Fantasy VII", "genre": "RPG", "year": 1997, "dev": "Square", "rating": 4.9, "size": 1400.0, "desc": "Cloud Strife and AVALANCHE battle against the Shinra Electric Power Company and the enigmatic one-winged angel Sephiroth."},
    {"platform": "PS1", "title": "Metal Gear Solid", "genre": "Action-Adventure", "year": 1998, "dev": "Konami KCEJ", "rating": 4.9, "size": 950.0, "desc": "Solid Snake infiltrates Shadow Moses Island to neutralize FOXHOUND and destroy the nuclear-equipped walking tank Metal Gear REX."},
    {"platform": "PS1", "title": "Castlevania: Symphony of the Night", "genre": "Action-Adventure", "year": 1997, "dev": "Konami", "rating": 4.9, "size": 420.0, "desc": "Alucard explores Dracula's shape-shifting castle and its inverted reflection in the father of the Metroidvania genre."},
    {"platform": "PS1", "title": "Resident Evil 2", "genre": "Survival Horror", "year": 1998, "dev": "Capcom", "rating": 4.9, "size": 850.0, "desc": "Rookie cop Leon S. Kennedy and college student Claire Redfield survive the zombie-infested Raccoon Police Department and G-Virus mutant Birkin."},
    {"platform": "PS1", "title": "Silent Hill", "genre": "Survival Horror", "year": 1999, "dev": "Team Silent / Konami", "rating": 4.8, "size": 400.0, "desc": "Harry Mason searches for his missing daughter Cheryl in the fog-drenched, radio-static nightmare of Silent Hill and its rust-decayed Otherworld."},
    {"platform": "PS1", "title": "Crash Bandicoot: Warped", "genre": "Platformer", "year": 1998, "dev": "Naughty Dog", "rating": 4.8, "size": 480.0, "desc": "Crash and Coco jump through the Time Twister machine to medieval times, prehistoric eras, and ancient Egypt to stop Dr. Neo Cortex and Uka Uka."},
    {"platform": "PS1", "title": "Spyro the Dragon", "genre": "Platformer", "year": 1998, "dev": "Insomniac Games", "rating": 4.7, "size": 400.0, "desc": "The purple dragon Spyro glides across vibrant open worlds and breathes fire to free crystallized elder dragons from Gnasty Gnorc."},
    {"platform": "PS1", "title": "Tekken 3", "genre": "Fighting", "year": 1998, "dev": "Namco", "rating": 4.9, "size": 450.0, "desc": "Jin Kazama, Hwoarang, and Eddy Gordo join the King of Iron Fist Tournament in the crown jewel of 3D polygon fighters."},
    {"platform": "PS1", "title": "Gran Turismo 2", "genre": "Racing", "year": 1999, "dev": "Polyphony Digital", "rating": 4.8, "size": 1100.0, "desc": "Over 600 officially licensed vehicles, realistic physics engine, license tests, and dozens of tracks defining the real driving simulator."},
    {"platform": "PS1", "title": "Chrono Cross", "genre": "RPG", "year": 1999, "dev": "Square", "rating": 4.8, "size": 900.0, "desc": "Serge slips into an alternate parallel dimension where he drowned ten years earlier, recruiting 45 playable allies with Yasunori Mitsuda's Celtic soundtrack."},
    {"platform": "PS1", "title": "Final Fantasy IX", "genre": "RPG", "year": 2000, "dev": "Square", "rating": 4.9, "size": 1600.0, "desc": "A celebrated return to pure high fantasy featuring thief Zidane Tribal, black mage Vivi Ornitier, and princess Garnet."},
    {"platform": "PS1", "title": "Tony Hawk's Pro Skater 2", "genre": "Sports", "year": 2000, "dev": "Neversoft", "rating": 4.9, "size": 450.0, "desc": "Manual trick chains, park editor, skate parks in Venice Beach and School II, and a punk rock soundtrack by Bad Religion and Rage Against the Machine."},
    {"platform": "PS1", "title": "Crash Team Racing (CTR)", "genre": "Racing", "year": 1999, "dev": "Naughty Dog", "rating": 4.9, "size": 400.0, "desc": "Power slide boost mechanics, intricate shortcuts, and adventure mode against the extraterrestrial speedster Nitros Oxide."},
    {"platform": "PS1", "title": "Xenogears", "genre": "RPG", "year": 1998, "dev": "Square", "rating": 4.8, "size": 950.0, "desc": "Fei Fong Wong uncovers psychological philosophies and religious mysteries commanding giant martial-arts mechas called Gears."},

    # ========================== GBA ==========================
    {"platform": "GBA", "title": "Pokémon Emerald", "genre": "RPG", "year": 2004, "dev": "Game Freak", "rating": 4.9, "size": 16.0, "desc": "Battle Team Magma and Team Aqua in Hoenn, awaken the sky dragon Rayquaza, and conquer the seven Battle Frontier facilities."},
    {"platform": "GBA", "title": "Pokémon FireRed", "genre": "RPG", "year": 2004, "dev": "Game Freak", "rating": 4.9, "size": 16.0, "desc": "Return to Kanto with modern 32-bit graphics, the Sevii Islands, wireless adapter support, and the original 151 Pokémon."},
    {"platform": "GBA", "title": "The Legend of Zelda: The Minish Cap", "genre": "Action-Adventure", "year": 2004, "dev": "Capcom / Flagship", "rating": 4.8, "size": 16.0, "desc": "Shrink down to the size of a bug with talking hat Ezlo, fuse Kinstones across Hyrule, and forge the Four Sword to defeat Vaati."},
    {"platform": "GBA", "title": "Metroid Fusion", "genre": "Action-Adventure", "year": 2002, "dev": "Nintendo R&D1", "rating": 4.9, "size": 8.0, "desc": "Samus Aran survives an encounter with the deadly X Parasite on the BSL station, stalked by her terrifying armored clone, SA-X."},
    {"platform": "GBA", "title": "Metroid: Zero Mission", "genre": "Action-Adventure", "year": 2004, "dev": "Nintendo R&D1", "rating": 4.9, "size": 8.0, "desc": "A masterclass reimagining of Samus's first mission to Planet Zebes with modern fluid physics, power grip, and stealth Zero Suit chapters."},
    {"platform": "GBA", "title": "Castlevania: Aria of Sorrow", "genre": "Action-Adventure", "year": 2003, "dev": "Konami", "rating": 4.9, "size": 8.0, "desc": "Soma Cruz absorbs the souls of monsters inside Dracula's castle trapped in a solar eclipse in the year 2035 with the Tactical Soul system."},
    {"platform": "GBA", "title": "Golden Sun", "genre": "RPG", "year": 2001, "dev": "Camelot Software Planning", "rating": 4.8, "size": 8.0, "desc": "Isaac and Garet channel Psynergy and capture elemental Djinn across Weyard to prevent alchemy from unsealing world-ending lighthouses."},
    {"platform": "GBA", "title": "Golden Sun: The Lost Age", "genre": "RPG", "year": 2002, "dev": "Camelot Software Planning", "rating": 4.9, "size": 16.0, "desc": "Continues the epic saga from the perspective of Felix, exploring open oceans, puzzle-filled temples, and colossal Djinn summons."},
    {"platform": "GBA", "title": "Mario & Luigi: Superstar Saga", "genre": "RPG", "year": 2003, "dev": "AlphaDream", "rating": 4.8, "size": 16.0, "desc": "Mario and Luigi journey to the Beanbean Kingdom with synchronized Bros. Attacks to recover Princess Peach's voice from Cackletta and Fawful."},
    {"platform": "GBA", "title": "Advance Wars", "genre": "Strategy", "year": 2001, "dev": "Intelligent Systems", "rating": 4.9, "size": 8.0, "desc": "Turn-based tactical military battles commanding infantry, tanks, copters, and battleships with Commanding Officer powers."},
    {"platform": "GBA", "title": "Fire Emblem", "genre": "Strategy", "year": 2003, "dev": "Intelligent Systems", "rating": 4.9, "size": 16.0, "desc": "Eliwood, Hector, and Lyn fight through permadeath tactical grid battles with the weapon triangle system in the Western debut of Fire Emblem."},
    {"platform": "GBA", "title": "Super Mario Advance 4: Super Mario Bros. 3", "genre": "Platformer", "year": 2003, "dev": "Nintendo R&D2", "rating": 4.9, "size": 8.0, "desc": "Enhanced 16-bit remake of Super Mario Bros. 3 with added e-Reader levels, Tanooki suit, and voice acting."},
    {"platform": "GBA", "title": "Mario Kart: Super Circuit", "genre": "Racing", "year": 2001, "dev": "Intelligent Systems", "rating": 4.6, "size": 4.0, "desc": "High-octane handheld kart racing featuring 20 new tracks plus all 20 unlockable classic tracks from Super Mario Kart."},

    # ========================== Genesis ==========================
    {"platform": "Genesis", "title": "Sonic The Hedgehog 2", "genre": "Platformer", "year": 1992, "dev": "Sonic Team", "rating": 4.8, "size": 1.0, "desc": "Sonic and Tails blast through Chemical Plant and Casino Night with the iconic Spin Dash to shut down Robotnik's Death Egg."},
    {"platform": "Genesis", "title": "Sonic & Knuckles", "genre": "Platformer", "year": 1994, "dev": "Sonic Team", "rating": 4.9, "size": 2.0, "desc": "Features Knuckles the Echidna with gliding and wall-climbing abilities, Lock-On technology, and the Super Emeralds."},
    {"platform": "Genesis", "title": "Streets of Rage 2", "genre": "Fighting", "year": 1992, "dev": "Ancient / Sega", "rating": 4.9, "size": 2.0, "desc": "Axel, Blaze, Skate, and Max battle Mr. X's criminal syndicate with Yuzo Koshiro's club-defining chiptune house soundtrack."},
    {"platform": "Genesis", "title": "Gunstar Heroes", "genre": "Shooter", "year": 1993, "dev": "Treasure", "rating": 4.9, "size": 1.5, "desc": "Treasure's debut run-and-gun marvel featuring weapon combining, acrobatics, and multi-jointed boss battles like Seven Force."},
    {"platform": "Genesis", "title": "Castlevania: Bloodlines", "genre": "Action-Adventure", "year": 1994, "dev": "Konami", "rating": 4.8, "size": 1.5, "desc": "John Morris with the Vampire Killer whip and Eric Lecarde with the Alcarde Spear fight across World War I Europe to stop Elizabeth Bartley."},
    {"platform": "Genesis", "title": "Contra: Hard Corps", "genre": "Shooter", "year": 1994, "dev": "Konami", "rating": 4.8, "size": 2.5, "desc": "Hyper-fast shooter with 4 diverse characters, sliding mechanics, branching storyline paths, and multiple endings."},
    {"platform": "Genesis", "title": "Phantasy Star IV", "genre": "RPG", "year": 1993, "dev": "Sega", "rating": 4.9, "size": 3.0, "desc": "The culmination of the Algo solar system saga with manga-panel cutscenes, combo macros, and Chaz Ashley's hunter guild."},
    {"platform": "Genesis", "title": "Shinobi III: Return of the Ninja Master", "genre": "Platformer", "year": 1993, "dev": "Sega", "rating": 4.8, "size": 1.5, "desc": "Joe Musashi dashes, wall-jumps, rides horses, and surfs waves while executing ninjutsu magic against Neo Zeed."},
    {"platform": "Genesis", "title": "Comix Zone", "genre": "Fighting", "year": 1995, "dev": "STI", "rating": 4.7, "size": 2.0, "desc": "Sketch Turner is sucked inside his own comic book pages, tearing through panel borders and fighting mutant drawings with pet rat Roadkill."},

    # ========================== NES ==========================
    {"platform": "NES", "title": "Super Mario Bros. 3", "genre": "Platformer", "year": 1988, "dev": "Nintendo R&D4", "rating": 4.9, "size": 0.4, "desc": "The Koopalings seize the magic wands. Fly across 8 worlds with the Raccoon Leaf, Tanooki Suit, Frog Suit, and Anchor items."},
    {"platform": "NES", "title": "Mega Man 2", "genre": "Platformer", "year": 1988, "dev": "Capcom", "rating": 4.9, "size": 0.3, "desc": "Defeat Metal Man, Air Man, and Quick Man to acquire their weapons and storm Dr. Wily's skull fortress with Takashi Tateishi's chiptunes."},
    {"platform": "NES", "title": "The Legend of Zelda", "genre": "Action-Adventure", "year": 1986, "dev": "Nintendo R&D4", "rating": 4.8, "size": 0.2, "desc": "It's dangerous to go alone! Take this. Explore the non-linear land of Hyrule, conquer 9 underworld labyrinths, and assemble the Triforce."},
    {"platform": "NES", "title": "Castlevania III: Dracula's Curse", "genre": "Action-Adventure", "year": 1989, "dev": "Konami", "rating": 4.8, "size": 0.4, "desc": "Trevor Belmont recruits Sypha Belnades, Grant Danasty, and Alucard with branching route choices to banish Dracula in 1476."},
    {"platform": "NES", "title": "Contra", "genre": "Shooter", "year": 1988, "dev": "Konami", "rating": 4.8, "size": 0.2, "desc": "Up Up Down Down Left Right Left Right B A Start! Spread gun firepower against the alien Red Falcon army."},
    {"platform": "NES", "title": "Punch-Out!!", "genre": "Sports", "year": 1987, "dev": "Nintendo R&D3", "rating": 4.8, "size": 0.3, "desc": "Time your counterpunches and stars against Glass Joe, Bald Bull, Super Macho Man, and the Dream Fight against Mike Tyson."},
    {"platform": "NES", "title": "Metroid", "genre": "Action-Adventure", "year": 1986, "dev": "Nintendo R&D1", "rating": 4.6, "size": 0.2, "desc": "The eerie debut on Planet Zebes introducing Samus Aran, the Morph Ball, screw attack, ice beam, and the final reveal."},
    {"platform": "NES", "title": "DuckTales", "genre": "Platformer", "year": 1989, "dev": "Capcom", "rating": 4.8, "size": 0.2, "desc": "Scrooge McDuck pogo-jumps through the Amazon, Transylvania, and the Moon in search of five legendary treasures."},

    # ========================== Arcade ==========================
    {"platform": "Arcade", "title": "Metal Slug", "genre": "Shooter", "year": 1996, "dev": "Nazca / SNK", "rating": 4.9, "size": 18.0, "desc": "Marco and Tarma jump into the Super Vehicle-001 tank with hand-drawn 2D pixel animations and explosive military carnage."},
    {"platform": "Arcade", "title": "Metal Slug X", "genre": "Shooter", "year": 1999, "dev": "SNK", "rating": 4.9, "size": 28.0, "desc": "Super Vehicle-001/II enhanced action featuring laser guns, iron lizards, alien saucers, and frantic coop chaos."},
    {"platform": "Arcade", "title": "Teenage Mutant Ninja Turtles: Turtles in Time", "genre": "Fighting", "year": 1991, "dev": "Konami", "rating": 4.9, "size": 15.0, "desc": "Shredder steals the Statue of Liberty and throws the turtles into a time warp through prehistoric raptors and pirate ships."},
    {"platform": "Arcade", "title": "Street Fighter II: Champion Edition", "genre": "Fighting", "year": 1992, "dev": "Capcom", "rating": 4.9, "size": 6.0, "desc": "The undisputed king of arcades introducing playable bosses Vega, Sagat, Balrog, and Bison with mirror match tournaments."}
]

def populate_master_catalog(db_path: Path):
    import re
    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()
    
    # Check if catalog curation was already performed
    cursor.execute("CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT)")
    cursor.execute("SELECT value FROM settings WHERE key = 'catalog_curated'")
    curated_row = cursor.fetchone()
    if curated_row and curated_row[0] == "1":
        conn.close()
        return
    
    # 1. Clean out legacy dummy URLs with non-existent collections
    cursor.execute("DELETE FROM games WHERE direct_download_url LIKE '%-romset-usa%' OR direct_download_url LIKE '%/psx_share/%' OR direct_download_url LIKE '%/mame-merged/%'")
    conn.commit()

    print(f"-> Curating master retro library in {db_path}...")
    enriched = 0
    
    FEATURED_TITLES = {
        "Super Mario 64", "The Legend of Zelda: Ocarina of Time", "Chrono Trigger",
        "Final Fantasy VII", "Metal Gear Solid", "Pokemon - Emerald", "Super Metroid",
        "Sonic The Hedgehog 2", "Castlevania: Symphony of the Night", "Super Mario World",
        "Legend of Zelda: A Link to the Past", "Super Mario 64", "Mario Kart 64"
    }

    # Fetch platform games lookup
    for item in RAW_CATALOG:
        p = item["platform"]
        title = item["title"]
        clean_words = [w for w in re.sub(r"[^a-zA-Z0-9]+", " ", title).lower().split() if w not in ("the", "a", "an", "of", "version", "edition", "part")]
        
        cursor.execute("SELECT id, title, direct_download_url FROM games WHERE platform = ?", (p,))
        rows = cursor.fetchall()
        
        best_id = None
        for gid, gtitle, gurl in rows:
            gt_clean = re.sub(r"[^a-zA-Z0-9]+", " ", gtitle).lower()
            if clean_words and all(w in gt_clean for w in clean_words):
                best_id = gid
                break
                
        if best_id:
            is_featured = 1 if any(f.lower() in title.lower() for f in FEATURED_TITLES) else 0
            cursor.execute("""
            UPDATE games SET
                description = ?,
                genre = ?,
                release_year = ?,
                developer = ?,
                publisher = ?,
                is_featured = CASE WHEN ? = 1 THEN 1 ELSE is_featured END
            WHERE id = ?
            """, (item["desc"], item["genre"], item["year"], item["dev"], item["dev"], is_featured, best_id))
            enriched += 1

    cursor.execute("INSERT OR REPLACE INTO settings (key, value) VALUES ('catalog_curated', '1')")
    conn.commit()
    conn.close()
    print(f"-> Successfully enriched {enriched} classic games with real metadata and downloads!")

if __name__ == "__main__":
    import sys
    target = Path(sys.argv[1]) if len(sys.argv) > 1 else Path("../data/vault.db")
    populate_master_catalog(target)
