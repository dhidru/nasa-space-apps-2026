# Space Apps project submission text

The text on our [Space Apps project page](https://www.spaceappschallenge.org/2026/find-a-team/no-shade-with-a-side-of-ice/?tab=project),
kept here so we can review it and restore it. Rewritten on 2026-11-15 against the
judging criteria (Impact, Creativity, Validity, Relevance, Presentation) and the
form's own instructions for each field.

The form says the "Space Agency Partner & Other Data" field must list **every**
external resource, including code, text and images, and the "Confirm All Work is
Original" checkbox confirms that it does. So the libraries, fonts and tools stay
listed there, even though the Project Details text only names the main ones.

## Project Name

Polar Horizon: Finding Lunar South Pole Landing Sites with Sun and Earth in View

## Summary

Our answer to the 2026 Space Apps challenge "Lunar Landing Site Navigator". When an Artemis launch slips, mission planners must quickly find a new landing site or date at the Moon's south pole. There, the Sun and Earth skim the horizon, so a single ridge can cut solar power or direct-to-Earth radio for days. Existing tools check one point at a time.

We built a free web app that checks a whole candidate region at once. Pick one of NASA's 9 Artemis candidate regions and a landing time. In seconds, every 100 m landing site in the region (6,400 to 10,000 of them) is scored on one question: do the Sun and Earth stay above the terrain for the whole 7-day surface stay? A heatmap, a top-10 list, a 3D terrain view and a sky plot of each site's horizon show the answer and the reason. A year-long search finds each site's best landing windows.

It is built on NASA data: horizons ray-traced from LRO LOLA elevation maps, and Sun and Earth positions from NASA/JPL SPICE, checked against SPICE's own routines. It runs in any browser, with nothing to install.

## Project Demonstration

https://www.youtube.com/watch?v=kCesRBWED-E

## Project

https://github.com/dhidru/nasa-space-apps-2026/

## Project Details

Live app: https://dhidru.github.io/nasa-space-apps-2026/ (any browser, nothing to install)
Code, data pipeline, tests and full credits: https://github.com/dhidru/nasa-space-apps-2026/
Challenge: Lunar Landing Site Navigator, https://www.spaceappschallenge.org/2026/challenges/lunar-landing-site-navigator/

THE NEXT FRONTIER
This year's theme is The Next Frontier, and humanity's next frontier is Mars. NASA's Artemis program is the path there: in NASA's words, it explores the Moon to "build on our foundation for the first crewed missions to Mars" (https://www.nasa.gov/humans-in-space/artemis/). Crews landing at the lunar south pole will rehearse what Mars demands: choosing safe landing sites from orbital data, keeping power and communications through a long surface stay, and re-planning fast when schedules slip. Our tool helps with that first step on the Moon, and the same method (terrain horizons plus Sun and Earth geometry) carries over to any world with an elevation map.

THE CHALLENGE
The Lunar Landing Site Navigator challenge asks for an intuitive tool that lets mission planners, educators and the public quickly compare landing sites and dates at the lunar south pole, showing where the Sun and Earth sit relative to the local horizon for power and direct-to-Earth communication. Picture the case the challenge describes: the launch slips by two weeks. Is the chosen site still lit and in radio contact for the whole stay? If not, which nearby site is, or which date works instead? Near the pole the Sun and Earth stay within a few degrees of the horizon, so the answer depends on every ridge and crater rim around the site, and it changes from site to site and from day to day.

WHAT WE BUILT
A dashboard that answers one question for any site and time: if we land here, do the Sun (power) and Earth (radio) stay above the terrain for the whole 7-day surface stay?
1) Pick a Landing Region. A map of the south pole shows NASA's 9 Artemis candidate regions. Eight have full site data; Mons Mouton Plateau is too large for a static site and is marked "coming soon".
2) Pick a Landing Time between 14 Nov 2026 and 14 Nov 2027. The calendar marks the days when no site in the region keeps both the Sun and Earth in view all week. Every Landing Site (a 100 m circle on a 200 m grid, 6,400 to 10,000 per region) is scored in seconds and shown as a heatmap with a top-10 list, kept at least 2 km apart.
3) Inspect a site. A 3D terrain view, a sky plot of the site's 360-degree horizon with the Sun's and Earth's paths over the stay, and hour-by-hour charts of how far each body sits above the terrain. A verdict says whether the site has Full Coverage for the week, next to its landing slope, walkable ground for EVAs and Timing Robustness (how much of the year it has Full Coverage).
4) Find Landing Windows. For one site, every landing time in the year is tested and the best runs of dates with Full Coverage are listed.

BUILT ON NASA DATA
• Terrain: NASA LRO LOLA polar elevation models, 20 m near each site and 80 m out to about 150 km, plus the NASA SVS CGI Moon Kit elevation map for distant terrain in the 3D view.
• Sun and Earth positions: NASA/JPL NAIF SPICE (DE440 ephemeris and the Moon's measured orientation) every 10 minutes, including libration, light time and Earth parallax.
• Regions and landing criteria: the 9 candidate regions from NASA's October 2024 announcement (USGS outlines), and NASA's published landing-site size, slope limit and surface-stay length.

HOW IT WORKS, AND HOW WE CHECKED IT
• An offline Python pipeline ray-traces the horizon of every site in 1,440 directions (0.25-degree steps). It takes the worst case over the center and four edge points of the 100 m landing circle, 2 m above the ground, so the verdict holds wherever in the circle the lander touches down.
• The ranking is transparent: sites with Full Coverage (Sun and Earth never blocked) come first, ranked by the lowest clearance of either body above the terrain, in degrees. There is no hidden combined score, so every rank can be explained.
• Validation: our Sun and Earth azimuth and elevation match SPICE's own azlcpo routine and known lunar orbit facts from the NASA Moon Fact Sheet. Our landing slopes are checked against LOLA's own slope map. The in-browser TypeScript code is tested against the Python results.
• The browser runs the clearance, ranking and landing-window code in Web Workers, so a whole region updates in seconds with no server.

IMPACT
• For mission planners: when a date or site changes, a whole region can be re-checked in seconds, with the terrain and sky geometry that explain each result, instead of querying one point at a time.
• For the road to Mars: safe, well-powered, well-connected landings at the lunar south pole are the proving ground for longer missions further out.
• For educators and the public: anyone can see why the lunar south pole is so hard, why a few hundred meters can decide between power and darkness, and why the landing date matters.
• Open and reusable: the code, data pipeline and processed data are open source (Apache 2.0), and the method works for any site with LOLA terrain.

WHAT'S NEW
Existing tools answer "what does the sky look like from this point?". We turn the question around: "which sites in this region work for the whole stay?". We combine a full-stay test, the worst case over the landing circle and a year-wide landing-window search, and pack the precomputed horizons small enough for a static website, so the science runs in any browser.

LIMITS AND NEXT STEPS
Today, line of sight is judged at the center of the Sun's and Earth's disks, LOLA terrain can't show boulders or craters smaller than its 20 m grid, and Mons Mouton Plateau is still too large for a static site. Next we want to add:
• Lunar eclipses: when Earth passes between the Sun and the Moon, sunlight is cut even at a site with clear terrain. The app doesn't model this yet.
• Live, newer Moon mapping data, so results update as new elevation maps are released.
• A user-set equipment height: solar arrays and antennas sit at different heights on different spacecraft, and a higher mast sees over more terrain. Today every site uses 2 m.
• Landing ellipses: when a spacecraft's trajectory is known, check the whole landing ellipse it could touch down in, instead of a fixed 100 m circle.
• The visible fraction of the Sun's disk, distance to permanently shadowed regions (likely ice), and hazard checks with meter-scale data.

TOOLS
Python (NumPy, SpiceyPy, Numba) for the data pipeline; TypeScript and three.js for the web app; GitHub Pages for hosting. Every dataset, library and tool is listed with its license in ATTRIBUTIONS.md and in the resource lists below.

USE OF AI
Built with Anthropic's Claude: Claude Code wrote the code, tests and documents at the team's direction, and a Claude design chat produced the first version of the web UI. The processed data was computed by this AI-written code from NASA data; no values were made up by AI. AI use is disclosed in the README, in AI-DISCLOSURE.txt files with the data and in the project metadata, and every contribution is logged in ATTRIBUTIONS.md. No NASA logos or branding were used.

## NASA Data (changes)

- Merged the two LOLA elevation entries into one, and gave the slope map its own entry:
  - "NASA LRO LOLA polar elevation models, 20 m and 80 m (LDEM_80S_20M, LDEM_80S_80M), PDS Geosciences Node" → https://pds-geosciences.wustl.edu/missions/lro/lola.htm
  - "NASA LRO LOLA polar slope map (LDSM_85S_40M), used to check our landing slopes" → https://pds-geosciences.wustl.edu/lro/lro-l-lola-3-rdr-v1/lrolol_1xxx/data/lola_gdr/polar/img/

- Added after the Moon Fact Sheet: "NASA, Moon to Mars: NASA's Artemis Program (Artemis as the path to crewed missions to Mars)" → https://www.nasa.gov/humans-in-space/artemis/

## Space Agency Partner & Other Data (changes)

- Added at the end: "NASA Space Apps Challenge 2026: "Lunar Landing Site Navigator" challenge statement (the problem we solved)" →
  https://www.spaceappschallenge.org/2026/challenges/lunar-landing-site-navigator/
- Added "Git (version control)" → https://git-scm.com/
- The form allows at most 25 entries in this list, so to fit the rest:
  - "Vite (build tool)" and "Vitest (tests)" became one entry, "Vite and Vitest (build tool and tests)" → https://vite.dev
  - The freed row is now "Apache License 2.0 text (our LICENSE file)" → https://www.apache.org/licenses/LICENSE-2.0
  - The GitHub entry now also covers the GitHub CLI: "GitHub, GitHub CLI, GitHub Actions and GitHub Pages (repo, hosting, CI and the live demo)" → https://github.com

- "Claude Code (Anthropic), AI coding assistant; every use is logged in ATTRIBUTIONS.md" →
  "Claude Code and Claude (Anthropic), AI assistants for code, text and UI design; every use is logged in ATTRIBUTIONS.md"

---

## Before the 2026-11-15 rewrite

### Summary

We built a web dashboard for planning crewed landings at the Moon's south pole. It answers one question fast: if we land here at this time, do the Sun (power) and Earth (direct-to-Earth radio) stay above the terrain for the whole 7-day surface stay?

Pick one of NASA's 9 candidate Artemis landing regions and a landing time between Nov 2026 and Nov 2027. Every landing site in the region (6,400 to 10,000 per region, each a 100 m circle) is scored in seconds and shown as a heatmap with a top-10 list. A 3D terrain view, a sky plot of the site's horizon with the Sun's and Earth's paths, and hour-by-hour clearance charts explain each verdict. A year-long search finds the best landing windows for any site.

Horizons are ray-traced from NASA LRO LOLA elevation data, and Sun/Earth positions come from NASA/JPL SPICE (DE440). Near the pole the Sun and Earth stay within a few degrees of the horizon, so one ridge can cut power or communications for days. When a launch slips, planners need new sites and dates fast. Our tool compares a whole region at once, explains why, and runs in any browser with nothing to install.

### Project Details

Live app: https://dhidru.github.io/nasa-space-apps-2026/ (runs in any browser, nothing to install)
Code, data pipeline and full credits: https://github.com/dhidru/nasa-space-apps-2026/

WHAT IT DOES
A dashboard for planners of crewed Artemis landings at the lunar south pole. It answers: if we land here at this time, do the Sun (power) and Earth (direct-to-Earth radio) stay above the terrain for the whole 7-day surface stay?
1. Pick a Landing Region. A map of the south pole shows NASA's 9 candidate regions. Eight have full site data; Mons Mouton Plateau is too large for a static site and is marked "coming soon".
2. Pick a Landing Time. A calendar covers 2026-11-14 to 2027-11-14 and marks the days when no site keeps both the Sun and Earth in view all week. Every landing site in the region (a 100 m circle on a 200 m grid, about 6,400 to 10,000 per region) is scored in seconds and shown as a heatmap with a top-10 list, kept at least 2 km apart.
3. Inspect a site. A 3D terrain view with an orientation map, a sky plot of the site's 360-degree horizon with the Sun's and Earth's paths over the stay, and hour-by-hour charts of how far each body sits above the terrain. A verdict says whether the site has Full Coverage for the week, with its landing slope, walkable ground for EVAs and Timing Robustness.
4. Find Landing Windows. For one site, every landing time in the year is tested and the best runs of dates with Full Coverage are listed.

HOW IT WORKS
- Horizons: an offline Python pipeline ray-traces the horizon of every site in 1,440 directions (0.25-degree steps) from NASA LRO LOLA elevation data, 20 m near the site and 80 m out to about 150 km. It takes the worst case over the center and four edge points of the 100 m landing circle, 2 m above the ground.
- Sun and Earth positions come from NASA/JPL SPICE (DE440 ephemeris and the Moon's measured orientation) every 10 minutes, including libration, light time and Earth parallax.
- Ranking: sites with Full Coverage (Sun and Earth never blocked) come first, ranked by the lowest clearance of either body above the terrain; partial sites follow. There is no hidden combined score, so every rank can be explained.
- Each site also gets its landing slope (checked against NASA's limit of under 10 degrees and against LOLA's own slope map), the share of ground within 2 km under 20 degrees for walking, and Timing Robustness: how much of the year it has Full Coverage.
- In the browser, the clearance, ranking and landing-window code is a TypeScript port running in Web Workers. Tests check it against the Python results, and the Python is checked against SPICE's own azimuth/elevation routine.

BENEFITS AND IMPACT
Near the pole the Sun and Earth stay within a few degrees of the horizon, so one ridge can cut power or communications for days. When a launch slips, planners need new sites and dates fast. Tools like JPL Horizons and LROC QuickMap answer this one point at a time; our tool compares every site in a region at once and shows the terrain and sky geometry behind each result. It is also useful for educators and the public to see why polar landing sites are chosen.

TOOLS AND LANGUAGES
Python (NumPy, SpiceyPy, Numba, pyshp, pytest) for the data pipeline; TypeScript and JavaScript with Vite, Vitest, three.js and Astronomy Engine for the static web app; GitHub Actions and GitHub Pages for testing and hosting. All licenses are checked and credited in ATTRIBUTIONS.md; the project is Apache 2.0.

CREATIVITY AND FACTORS WE CONSIDERED
Instead of checking one point, we score every 100 m site in a region and use the worst case over the whole landing circle, matching landing accuracy. We kept the ranking transparent (clearance in degrees, not an opaque score), used NASA's published landing criteria (site size, slope limits, stay length), and made it a static site so it loads fast and needs no server.

USE OF AI
We used Claude Code (Anthropic) as an AI coding assistant for coding, research, data checks, writing and UI design. Every AI contribution is logged in the AI usage log in ATTRIBUTIONS.md in our repository. No NASA logos or branding were generated.

### NASA Data (first two entries)

- "LRO LOLA Gridded DEMs, south polar (LDEM_80S_20M, LDEM_80S_80M), NASA PDS Geosciences Node" → https://pds-geosciences.wustl.edu/missions/lro/lola.htm
- "LRO LOLA polar DEM and slope map files (LDEM_80S_20M, LDEM_80S_80M, LDSM_85S_40M)" → https://pds-geosciences.wustl.edu/lro/lro-l-lola-3-rdr-v1/lrolol_1xxx/data/lola_gdr/polar/img/

### Space Agency Partner & Other Data (last entry)

- "Claude Code (Anthropic), AI coding assistant; every use is logged in ATTRIBUTIONS.md" → https://claude.com/claude-code
