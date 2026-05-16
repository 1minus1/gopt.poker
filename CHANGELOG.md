# Changelog

This site uses semantic versioning. Public shorthand can use `vMAJOR.MINOR`, so
`1.0.0` is the `v1.0` release shared with the group.

## [1.1.1] - 2026-05-16

This is the consolidated `v1.1` changelog, including the `1.1.0` release and
the `1.1.1` patch.

### Changed

- Tentatively re-ranked the All Time standings table by the proposed GOAT stat:
  non-major bracelets + 2x major bracelets + 2x season championships.
- Removed all-time points from the first All Time standings table.
- Added the rightmost `🐐 stat` column to show that proposed weighted ranking
  formula while the GroupMe poll is still pending.
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
- The `🐐 stat` ranking is tentative until the GroupMe poll closes; the All
  Time ranking can still be revised based on that result.

## [1.1.0] - 2026-05-16

### Changed

- Tentatively re-ranked the All Time standings table by the proposed GOAT stat:
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
- The `🐐 stat` ranking is tentative until the GroupMe poll closes; the All
  Time ranking can still be revised based on that result.

## [1.0.0] - 2026-05-16

### Added

- Established the public `v1.0` baseline release.
- Captured the current standings, record-entry, admin, Matrix, rules, and data-viewing site as the first versioned release.

### Notes

- Shared with the GOPT group as `v1.0`.
- Reception: they loved it.
