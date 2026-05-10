# GOPT Data v2

`GOPTdatav2.csv` is the canonical GOPT data file used by the site, Record page, and Admin upload/versioning tools.

## Rules

- Rows are chronological, oldest first.
- Each row represents one tournament row from the current history file.
- Multiple tournaments from the same poker night share the same `date`, `season`, `is_major`, `major_name`, and `host`.
- Dates use `MM/DD/YYYY`.
- Finishers are stored in ordered columns: `finisher_1`, `finisher_2`, etc.
- `is_ordered` is `NO` when the original source only identified the winner and the remaining listed players should be treated as attendance only.
- For `is_ordered=NO` rows, `finisher_1` is the winner; later `finisher_*` values are attendees with unknown finish order.
- Unordered standard-night winners receive 40 points. Unordered major winners receive 80 points. Other attendees on unordered rows receive 0 points.
- Ordered rows keep the standard points formula and finish-order behavior.
- `history_version` is the whole-file data version. Every row in one file uses the same value.

## Columns

- `history_version`: whole-file data version number.
- `league`: league value.
- `season`: season value.
- `date`: event date in `MM/DD/YYYY`.
- `is_major`: `YES` or `NO`.
- `major_name`: normalized major name, blank for standard nights.
- `host`: host value, blank when unknown.
- `points_at_stake`: points-at-stake value.
- `tournament_number`: 1-based tournament number within a poker night.
- `is_ordered`: whether the finisher list should be treated as complete ordered finishes.
- `finisher_1` through `finisher_20`: ordered finisher list for ordered rows; winner plus attendance for unordered rows; blank cells reserved for future larger games.

## Current Reviewed Date Notes

The current canonical file intentionally uses these reviewed event dates:

- Event 98: `6/23/17`, winner `Andre`.
- Event 157: `11/10/22`, winner `Waxcuses`.
- Event 159: `1/29/23`, winner `Masta Pussy`.
- Event 173: `3/28/24`, winner `Masta Pussy`.
- Event 184: `2/24/2025`, winner `Masta Pussy`.
