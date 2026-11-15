# Lunar Landing Site Navigator

A planning tool that helps Artemis mission planners pick south-polar landing sites and landing times where the Sun and Earth stay in view for the whole surface stay.

## Language

### Places

**Landing Region**:
One of the nine candidate areas near the lunar south pole that NASA named for crewed Artemis landings.
_Avoid_: Artemis site, landing area, zone

**Demo Region**:
Mons Mouton, the Landing Region we compute first and use for the demo.
_Avoid_: Test region, pilot region

**Landing Site**:
A candidate touchdown spot inside a Landing Region: a circle of 100 m radius that the tool scores and ranks.
_Avoid_: Location, point, spot, cell

### Time

**Landing Time**:
The UTC instant the mission planner chooses for touchdown.
_Avoid_: Mission date, start date

**Surface Stay**:
The 7-day period that starts at the Landing Time, over which a Landing Site is evaluated.
_Avoid_: Mission window, duration, period

**Landing Window**:
A stretch of Landing Times for one Landing Site in which every Surface Stay has Full Coverage.
_Avoid_: Best time, launch window

**Supported Span**:
The range of Landing Times the tool covers: 2026-11-14 to 2027-11-14. The date picker and the Landing Window search both use it.
_Avoid_: Time range, data range, next 12 months

### Geometry

**Observer Height**:
The height above the surface from which the Horizon is seen at a Landing Site.
_Avoid_: Mast height, antenna height

**Sun Elevation** / **Earth Elevation**:
The angle of the body's center above the flat local horizontal plane (the plane perpendicular to the line from the Moon's center through the Landing Site), ignoring terrain.
_Avoid_: Altitude, height, "elevation" on its own

**Horizon**:
The terrain skyline seen from a Landing Site; its **Horizon Elevation** is the skyline's angle above the flat local horizontal plane in a given azimuth.
_Avoid_: Skyline, terrain mask

**Clearance**:
A body's elevation minus the Horizon Elevation at that body's azimuth.
_Avoid_: Margin, excess elevation

**Line of Sight**:
The state of a body having positive Clearance, judged at the body's center.
_Avoid_: Visibility, illumination, in view

### Results

**Full Coverage**:
A Landing Site whose Sun and Earth both stay in Line of Sight for the entire Surface Stay.
_Avoid_: Qualifying, passing

**Partial Coverage**:
A Landing Site where the Sun or Earth loses Line of Sight at some point during the Surface Stay, described by the percentage of the stay each body is in view.
_Avoid_: Failing, degraded

**Timing Robustness**:
The share of Landing Times in the Supported Span for which a Landing Site has Full Coverage over the Surface Stay. It says how well a site holds up if the Landing Time slips, and it doesn't depend on the chosen Landing Time.
_Avoid_: Reliability, availability, uptime

**Landing Slope**:
The steepest ground slope anywhere in a Landing Site's 100 m circle, each slope measured over a 100 m patch (NASA's 100 m scale). NASA's landing limit is under 10°. It doesn't depend on the Landing Time.
_Avoid_: Site slope, gradient, steepness
