# Changelog

This site uses semantic versioning. Public shorthand can use `vMAJOR.MINOR`, so
`1.0.0` is the `v1.0` release shared with the group.

## [1.2.0] - 2026-05-16

This is the consolidated `v1.2` changelog, capturing all changes since the
public `v1.0` release.

### Changed

- Updated completed-season ranking and season champion logic to use points,
  then bracelets, then finishing rank in the season's last event.
- Changed the recorded season champions affected by that fix: 2009-2010 from
  Coach to Moe, 2010-2011 from Masta Pussy to Siri, and 2011-2012 from Moe to
  Screech.
- Made the All Time standings table sortable by tapping any column header.
- Restored Points to the All Time standings table and removed the fixed goat
  marker from Siri's name.
- Added the weighted all-time `⚖️` column and explainer:
  non-major bracelets + 2x major bracelets + 2x season championships.
- Kept the default All Time standings order as descending total bracelets.
- Centered the All Time table headers and numeric cells.
- Reworked the all-time weighted-stat label away from `🐐 stat` to `⚖️`.
- Updated Matrix probabilities: added `IN` as 100%, changed `PROBABLE` to 75%,
  and updated the Rules page to match.
- Changed the Matrix table count from probables only to `# (PROBABLE + IN)`,
  including both `PROBABLE` and `IN` responses.
- Darkened the Matrix `IN` cell color so it is more distinct from `PROBABLE`.
- Made Record require an explicit host selection instead of preselecting a host.
- Tightened the front-page quote so it remains quoted and less likely to wrap.
- Updated the hosting drought table to show five people and exclude Norman,
  Princess Peach, and Stinky Pete.

### Added

- Added an authenticated Admin text editor for loading the current v2 history,
  editing it as CSV text, validating it, and saving it as the next data version.
- Added Host Win Rate to the All Time hosting summary.
- Added the Stinky Pete quote under the front-page logo.
- Added an explainer under the All Time standings table for `👑`, `⭕`, `🎉`,
  and `⚖️`.

### Notes

- Existing Matrix responses are preserved; stored `PROBABLE` responses now
  recalculate at 75%, while new `IN` responses count as 100%.

## [1.1.1] - 2026-05-16

This is the consolidated `v1.1` changelog, including the `1.1.0` release and
the `1.1.1` patch.

### Changed

- Re-ranked the All Time standings table by the weighted all-time stat:
  non-major bracelets + 2x major bracelets + 2x season championships.
- Removed all-time points from the first All Time standings table.
- Added the rightmost `🐐 stat` column to show that weighted ranking formula.
- Updated completed-season ranking and season champion logic to use points,
  then bracelets, then finishing rank in the season's last event.
- Updated Matrix probabilities: added `IN` as 100%, changed `PROBABLE` to 75%,
  and updated the Rules page to match.
- Made Record require an explicit host selection instead of preselecting a host.

### Added

- Added an authenticated Admin text editor for loading the current v2 history,
  editing it as CSV text, validating it, and saving it as the next data version.
- Added Host Win Rate to the All Time hosting summary.
- Added the Stinky Pete quote under the front-page logo.

### Notes

- Existing Matrix responses are preserved; stored `PROBABLE` responses now
  recalculate at 75%, while new `IN` responses count as 100%.
- The season-ranking fix changed the recorded season champions for 2009-2010
  from Coach to Moe, for 2010-2011 from Masta Pussy to Siri, and for
  2011-2012 from Moe to Screech.

## [1.1.0] - 2026-05-16

### Changed

- Re-ranked the All Time standings table by the weighted all-time stat:
  non-major bracelets + 2x major bracelets + 2x season championships.
- Updated completed-season ranking and season champion logic to use points,
  then bracelets, then finishing rank in the season's last event.
- Updated Matrix probabilities: added `IN` as 100%, changed `PROBABLE` to 75%,
  and updated the Rules page to match.
- Made Record require an explicit host selection instead of preselecting a host.

### Added

- Added an authenticated Admin text editor for loading the current v2 history,
  editing it as CSV text, validating it, and saving it as the next data version.
- Added Host Win Rate to the All Time hosting summary.
- Added the Stinky Pete quote under the front-page logo.

### Notes

- Existing Matrix responses are preserved; stored `PROBABLE` responses now
  recalculate at 75%, while new `IN` responses count as 100%.
- The season-ranking fix changed the recorded season champions for 2009-2010
  from Coach to Moe, for 2010-2011 from Masta Pussy to Siri, and for
  2011-2012 from Moe to Screech.

## [1.0.0] - 2026-05-16

### Added

- Established the public `v1.0` baseline release.
- Captured the current standings, record-entry, admin, Matrix, rules, and data-viewing site as the first versioned release.

### Notes

- Shared with the GOPT group as `v1.0`.
- Reception: they loved it.
