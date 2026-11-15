# Landing criteria: sources for our decisions, and criteria we don't cover yet

Checked on 2026-11-14 against the original documents (slide images and PDF
pages, not summaries). Full citations and license notes are in
[ATTRIBUTIONS.md](../ATTRIBUTIONS.md) under "Information Sources". Quotes are
kept short. Everything else is our paraphrase.

## Sources

| Key | Source | What it is |
|---|---|---|
| **R22** | [NASA release 22-089](https://www.nasa.gov/news-release/nasa-identifies-candidate-regions-for-landing-next-americans-on-moon/) (2022-08-19) | NASA's announcement of the original 13 candidate regions |
| **R24** | [NASA release 24-136](https://www.nasa.gov/news-release/nasa-provides-update-on-artemis-iii-moon-landing-regions/) (2024-10-28) | NASA's update to the current 9 regions |
| **HLS25** | [Artemis Human Landing System Overview](https://ntrs.nasa.gov/citations/20250009323), NASA presentation for Space Apps 2025 (NTRS 20250009323) | Slide 21 lists the "Key Artemis III Landing Requirements"; slides 19–28 explain them |
| **G26** | [George, Rubio, Lawrence & Curell, LPSC 2026 abstract 1901](https://www.hou.usra.edu/meetings/lpsc2026/pdf/1901.pdf) | NASA authors explain how the 13 regions were cut to 9 |
| **GL24** | [Gracy & Lee, LPSC 2024 abstract 1695](https://www.hou.usra.edu/meetings/lpsc2024/pdf/1695.pdf) | SETI Institute / NASA Ames authors propose sites in two regions. A research paper, not a NASA requirement |

Weight them in that order. R22, R24, HLS25 and G26 are from NASA. GL24 is
supporting evidence only.

## 1. How the sources back our decisions

| Our decision ([design.md](design.md)) | What the sources say | Verdict |
|---|---|---|
| Artemis crewed south-polar landings in the **9 NASA Landing Regions** (§3) | R24 and G26 list the same 9 regions. G26: each region holds several landing sites. HLS25 slide 21: land within 6° latitude of the South Pole | Backed |
| A Landing Site is a **100 m-radius circle** (§4) | R22: a site has an "approximate 328-foot (100-meter) radius". HLS25 slides 21 and 28: land within 100 m of a target (100 m × 100 m accuracy) | Backed |
| Site centers on a **200 m grid** (§4) | Follows from the 100 m radius: circles touch but don't overlap | Our choice, derived from R22 |
| **Surface Stay of 7 days** (§2) | R22: a 6.5-day surface mission. G26: the stay is about 5.75–6.25 days, depending on the mission epoch and low-lunar-orbit timing | Backed; 7 days is a conservative cover of all three figures |
| Require the **Sun in Line of Sight** for the whole stay (Full Coverage, §6) | HLS25 slide 26: the surface must be lit for the whole surface stay. G26: illumination "remains a critical requirement for the entire crewed surface stay". R22 and R24 name lighting as a selection criterion | Backed |
| Require **Earth in Line of Sight** for direct-to-Earth comms (§1, §6) | HLS25 slide 21: direct-with-Earth comms, assume no relay. Slide 25: Earth must be visible for comms. G26: with direct-to-Earth comms, regions with more Earth visibility are preferred. R22 and R24 name communication with Earth as a criterion | Backed |
| Rank on **Clearance**, not raw elevation; draw the sky plot as a **panorama** (§5, §7) | HLS25 slide 19: the Sun and Earth rise only about 2–7° above the horizon; long shadows; the lighting changes all the time | Backed: with bodies this low, terrain decides visibility |
| Score sites **for a chosen Landing Time** and offer **Landing Windows** (§2, §6) | R22: specific sites are "tightly coupled to the timing of the launch window". HLS25 slide 27 and G26: lighting is seasonal and peaks shift about 2–3 weeks each year. G26: on its own, a region usually offers few viable opportunities once every constraint is applied | Backed: this is the replanning problem the tool solves |
| Top 10 kept **at least 2 km apart** (§6) | HLS25 slide 21: the EVA slope limit applies over 2 km. GL24: the crew explore on foot within about 2 km of the lander | Our inference: sites 2 km apart have separate EVA areas. Neither source sets a separation rule |
| **Observer Height of 2 m** (§4) | None of the sources gives a height | Not backed. Our own assumption |
| Line of Sight judged at each body's **center** (§5) | None of the sources says how much of the disk counts | Not backed. Our own simplification |

### Correction: "flat within about 2 km"

The earlier wording in design.md §12 said that sites should be "flat within
about 2 km". The sources don't say that. HLS25 slide 21 sets two different slope
limits:

- **Landing:** slope under 10° at the 100 m scale. Slide 23 also shows 8°
  contours.
- **EVA:** slope under 20° within 2 km. Slide 24: no EVA is possible on steeper
  ground.

So the 2 km area must be walkable, not flat.

## 2. Criteria we don't cover yet

Ordered by how directly they come from NASA and how cheap they are for us.

| # | Criterion | Source | What we could do |
|---|---|---|---|
| 1 | **Landing slope under 10°** across the 100 m site | HLS25 slides 21, 23 | A slope column and filter from the LOLA slope product or from our 20 m DEM. Mark sites over 10° (and over 8°) as not landable. This is the clearest gap |
| 2 | **EVA slope under 20° within 2 km** | HLS25 slides 21, 24 | Per site: the share of ground within 2 km that's under 20°. GL24 shows a stricter version: slope ≤5° over at least 25% of a 2 km zone |
| 3 | **Check the whole 100 m circle**, not just the center | HLS25 slide 28 (100 m landing accuracy), R22 | The lander can touch down anywhere in the circle, so take the worst slope and the worst Clearance over it. This is already a stretch goal; the sources now back it |
| 4 | **Slope variability and surface hazards** (craters, block fields, rough terrain) | G26 | A roughness column (LOLA roughness). Our 20 m DEM can't see boulders, so say so in the UI |
| 5 | **Robustness to timing** | G26 favors regions that stay robust across mission epochs and are less sensitive to seasons and timing uncertainty | Per site: the share of Landing Times in the Supported Span that give Full Coverage. We already compute this for Landing Windows, so it's cheap to add as a column |
| 6 | **Landing opportunities are discrete** | HLS25 slide 20: from the NRHO, a lander can descend only once every 6.5 days (about 55 chances a year), and only about 28 NRHO departures a year are possible | We treat every 10-minute Landing Time as possible. At minimum, say in the UI that real landing chances are much rarer. Modeling them needs trajectory data we don't have |
| 7 | **Variable Surface Stay length** | G26 (5.75–6.25 days), R22 (6.5 days) | Make the Surface Stay length a setting (default 7 days) |
| 8 | **Approach lighting** | HLS25 slide 27: light along the approach path helps, and the approach differs for each landing chance | Not modeled. It needs the approach trajectory, so it's out of scope; we can list it as a limitation |
| 9 | **Long-term visibility thresholds** | HLS25 slides 25–26 mask out ground with under 25% Earth visibility or under 5% Sun visibility. GL24 uses Sun ≥33% and direct-to-Earth ≥50% of the time | We already require 100% over the actual stay, which is stricter. These could be optional context columns, but the PGDA long-term maps have no stated license (ATTRIBUTIONS.md), so we'd compute them ourselves |
| 10 | **Science value** (access to permanently shadowed regions with water ice, South Pole–Aitken material) | R24 (science potential), GL24 | The distance-to-PSR stretch goal already covers part of this |
