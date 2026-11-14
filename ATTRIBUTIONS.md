# Attributions, Licenses & Citations

Every external resource this project uses must be listed here **before** it is used.
That includes data, code, libraries, tools, AI assistants, images and media, and
information sources. Each entry records what it is, where we got it, what license
or permission lets us use it, and how to cite it.

## Rules

1. **Check the license or terms first.** Don't use a resource whose license is
   missing, unclear, or doesn't allow our use. Mark it ⚠️ and ask the team.
2. **Use primary sources.** Link to the official license or terms page, not a
   summary of it.
3. **Record the access date** for data and web sources, since they can change.
4. **Follow the license's requirements.** Examples: keep copyright notices, add
   NOTICE files, and cite datasets the way their provider asks.
5. **Disclose AI use.** Space Apps requires it. Record the tool and what it was
   used for, and note any AI-generated assets in the project submission.

### Status key

- ✅ Verified: license or terms checked and they allow our use
- ⚠️ Pending: not yet verified, or a question is open. Don't ship until resolved.
- ❌ Rejected: we can't use it. Kept here for the record.

### Entry template

```markdown
### <Resource name>
- **Type:** Data | Code/Library | Tool | AI | Media | Information
- **Used for:** <what we use it for and where in the repo>
- **Source:** <URL>
- **Accessed:** YYYY-MM-DD
- **License / permission:** <license name + link to official text or terms>
- **Requirements:** <attribution wording, notices to keep, restrictions>
- **Status:** ✅ / ⚠️ / ❌ (checked by <who>, YYYY-MM-DD)
- **Citation:** <formatted citation, using the provider's preferred format if given>
```

---

## Data

_None yet._

> NASA data is generally free to use, but check each dataset's own page. Some
> NASA-hosted data comes from partners (ESA, JAXA, commercial providers) under
> different terms. See [NASA Images and Media Usage Guidelines](https://www.nasa.gov/nasa-brand-center/images-and-media/)
> and the [Space Apps data & resources page](https://www.spaceappschallenge.org/).
> NASA logos and insignia are **not** free to use.

## Code & Libraries

_None yet._

## Tools

### Git
- **Type:** Tool
- **Used for:** Version control. Not distributed with the project.
- **Source:** https://git-scm.com/ (source: https://github.com/git/git)
- **Accessed:** 2026-11-14
- **License / permission:** GPL-2.0-only ([COPYING](https://github.com/git/git/blob/master/COPYING))
- **Requirements:** None for our use. We only run it and don't redistribute it.
- **Status:** ✅ (checked by Claude Code, 2026-11-14)
- **Citation:** Git project. *Git* [Software]. https://git-scm.com/

### GitHub CLI (`gh`)
- **Type:** Tool
- **Used for:** Creating the GitHub repo, managing collaborators, and fetching
  license templates. Not distributed with the project.
- **Source:** https://github.com/cli/cli
- **Accessed:** 2026-11-14
- **License / permission:** MIT ([LICENSE](https://github.com/cli/cli/blob/trunk/LICENSE))
- **Requirements:** None for our use. We only run it and don't redistribute it.
- **Status:** ✅ (checked by Claude Code, 2026-11-14)
- **Citation:** GitHub, Inc. *GitHub CLI* [Software]. https://github.com/cli/cli

### GitHub (hosting)
- **Type:** Tool
- **Used for:** Hosting this repository
- **Source:** https://github.com
- **Accessed:** 2026-11-14
- **License / permission:** [GitHub Terms of Service](https://docs.github.com/en/site-policy/github-terms/github-terms-of-service)
- **Requirements:** None for the project's content. We keep ownership of our code.
- **Status:** ✅ (checked by Claude Code, 2026-11-14)
- **Citation:** GitHub, Inc. https://github.com

### Matt Pocock's agent skills (`mattpocock-skills`)
- **Type:** Tool (Claude Code agent skills: Markdown instructions plus a few shell templates)
- **Used for:** Development workflow skills for Claude Code (grilling, spec and
  ticket flows, TDD, code review, domain modelling and more). We copied the 27
  skills listed in the upstream `.claude-plugin/plugin.json` into
  `.claude/skills/`, unmodified. We left out the upstream `in-progress/` and
  `misc/` skills. Developer tooling only, not part of the submitted app.
- **Source:** https://github.com/mattpocock/skills (commit `5863806dd4e15c63174bee4e7515a4256792ecfa`, 2026-11-12)
- **Accessed:** 2026-11-14
- **License / permission:** MIT ([LICENSE](https://github.com/mattpocock/skills/blob/main/LICENSE)), Copyright (c) 2026 Matt Pocock. MIT is compatible with our Apache 2.0 license. No other licenses were found in the copied files.
- **Requirements:** Keep the copyright and permission notice. A copy is at
  `.claude/skills/LICENSE-mattpocock-skills`.
- **Status:** ✅ (checked by Claude Code, 2026-11-14)
- **Citation:** Pocock, M. (2026). *mattpocock/skills: Agent skills for real engineering* [Software, MIT License]. https://github.com/mattpocock/skills

## AI Tools

### Claude Code (Anthropic)
- **Type:** AI
- **Used for:** Scaffolding the repository (README, .gitignore, folder layout),
  setting up GitHub, and writing this attributions file. Later uses are logged
  in the AI usage log below.
- **Source:** https://claude.com/claude-code
- **Accessed:** 2026-11-14
- **License / permission:** [Anthropic Terms](https://www.anthropic.com/legal). The team must confirm which terms apply to their account.
- **Requirements:** Disclose AI use in the Space Apps submission. Commits made
  with Claude carry a `Co-Authored-By: Claude` trailer.
- **Status:** ⚠️ The team should confirm the applicable Anthropic terms for their account.
- **Citation:** Anthropic. *Claude Code* [AI coding assistant], model Claude Opus 5.5. https://claude.com/claude-code

#### AI usage log

| Date | Tool | What it did | Files affected |
| ---- | ---- | ----------- | -------------- |
| 2026-11-14 | Claude Code | Created the repo scaffold, README template, .gitignore and folder layout | `README.md`, `.gitignore`, folders |
| 2026-11-14 | Claude Code | Switched the license to Apache 2.0 and created this attributions file | `LICENSE`, `ATTRIBUTIONS.md`, `CLAUDE.md` |
| 2026-11-14 | Claude Code | Added the "ask before pushing" rule to the project rules | `CLAUDE.md` |
| 2026-11-14 | Claude Code | Wrote the README challenge summary (paraphrased from the challenge page) and listed candidate resources | `README.md`, `ATTRIBUTIONS.md` |
| 2026-11-14 | Claude Code | Verified the license of Matt Pocock's skills (MIT), copied 27 of them into the repo and recorded the attribution | `.claude/skills/`, `ATTRIBUTIONS.md` |
| 2026-11-14 | Claude Code | Ran a design interview with the team, researched candidate data sources (not yet used), and wrote the glossary, the design doc and the "don't look at other teams' projects" rule | `GLOSSARY.md`, `docs/design.md`, `CLAUDE.md` |

## Media (images, icons, fonts, video, audio)

_None yet._

## Information Sources (articles, papers, docs, websites)

### Space Apps 2026 challenge: "Lunar Landing Site Navigator"
- **Type:** Information
- **Used for:** The problem statement. The README challenge summary is our own
  paraphrase, not copied text.
- **Source:** https://www.spaceappschallenge.org/2026/challenges/lunar-landing-site-navigator/
  (the team provided the URL and page text; the site blocked an automated link check)
- **Accessed:** 2026-11-14
- **License / permission:** Challenge material provided to participants by NASA Space Apps
- **Requirements:** Paraphrase rather than copy, and link the original.
- **Status:** ✅ (paraphrased and linked; checked by Claude Code, 2026-11-14)
- **Citation:** NASA International Space Apps Challenge. "Lunar Landing Site Navigator." 2026 Challenges. https://www.spaceappschallenge.org/2026/challenges/lunar-landing-site-navigator/

## Candidate Resources (not yet used, licenses not yet verified)

These are the resources the challenge suggests. Before any of them is used,
check its license or terms and move it to the right section above.

| Resource | Provider | What we might use it for | URL | Status |
| -------- | -------- | ------------------------ | --- | ------ |
| JPL Horizons System | NASA/JPL (Caltech) | Sun and Earth positions (azimuth and elevation) from lunar surface sites | https://ssd.jpl.nasa.gov/horizons/ | ⚠️ Not verified |
| LROC QuickMap | Arizona State University / LRO | Exploring terrain at south-pole sites | https://quickmap.lroc.asu.edu/ | ⚠️ Not verified |
| Moon Trek | NASA/JPL (Solar System Treks) | 3D terrain context and topography | https://trek.nasa.gov/moon/ | ⚠️ Not verified |
| LOLA topography (DEMs) | NASA GSFC / LRO, via PDS | Horizon profiles that include terrain | https://pds-geosciences.wustl.edu/missions/lro/lola.htm | ⚠️ Not verified |
| CSA Moon Exploration | Canadian Space Agency | Background and educational content | https://www.asc-csa.gc.ca/eng/astronomy/moon-exploration/ | ⚠️ Not verified (Government of Canada content, which has its own terms) |

## Project License Text

### Apache License 2.0 text
- **Type:** Information
- **Used for:** `LICENSE` file
- **Source:** Apache Software Foundation, https://www.apache.org/licenses/LICENSE-2.0
  (retrieved through the GitHub Licenses API, `GET /licenses/apache-2.0`)
- **Accessed:** 2026-11-14
- **License / permission:** Anyone may copy and distribute the license text verbatim.
- **Requirements:** Don't modify the license text.
- **Status:** ✅ (checked by Claude Code, 2026-11-14)
- **Citation:** Apache Software Foundation. *Apache License, Version 2.0*, January 2004. https://www.apache.org/licenses/LICENSE-2.0
