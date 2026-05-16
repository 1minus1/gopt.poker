# Changelog

This site uses semantic versioning. Public shorthand can use `vMAJOR.MINOR`, so
`1.0.0` is the `v1.0` release shared with the group.

## [1.1.0] - 2026-05-16

### Changed

- Re-ranked the All Time standings table by the new weighted formula:
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

## [1.0.0] - 2026-05-16

### Added

- Established the public `v1.0` baseline release.
- Captured the current standings, record-entry, admin, Matrix, rules, and data-viewing site as the first versioned release.

### Notes

- Shared with the GOPT group as `v1.0`.
- Reception: they loved it.
