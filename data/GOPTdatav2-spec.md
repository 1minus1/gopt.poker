# GOPT Data v2

`GOPTdatav2.csv` is a well-formed CSV export derived from `files/GOPThistory.txt` and enriched with host dates/hosts from `files/hosts.csv`.

## Rules

- Rows are chronological, oldest first.
- Each row represents one tournament row from the current history file.
- Multiple tournaments from the same poker night share the same `date`, `season`, `is_major`, `major_name`, and `host`.
- Dates use `MM/DD/YYYY`.
- Dates come from `files/hosts.csv`, which is treated as the canonical date source after chronological matching to history nights.
- Finishers are stored in ordered columns: `finisher_1`, `finisher_2`, etc.
- `is_ordered` is `NO` when the original source only identified the winner and the remaining listed players should be treated as attendance only.
- For `is_ordered=NO` rows, `finisher_1` is the winner; later `finisher_*` values are attendees with unknown finish order.
- Unordered standard-night winners receive 40 points. Unordered major winners receive 80 points. Other attendees on unordered rows receive 0 points.
- Ordered rows keep the standard points formula and finish-order behavior.
- `history_version` preserves the first-line version value from `files/GOPThistory.txt`.

## Columns

- `history_version`: source history version number.
- `league`: league value from the original history row.
- `season`: season value from the original history row.
- `date`: canonical host-file date in `MM/DD/YYYY`.
- `is_major`: `YES` or `NO` from the original history row.
- `major_name`: original major name, blank for standard nights.
- `host`: host value from `files/hosts.csv`.
- `points_at_stake`: points-at-stake value from the original history row.
- `tournament_number`: 1-based tournament number within a poker night.
- `is_ordered`: whether the finisher list should be treated as complete ordered finishes.
- `finisher_1` through `finisher_20`: ordered finisher list for ordered rows; winner plus attendance for unordered rows; blank cells reserved for future larger games.

## Current Reviewed Date Conflicts

The export was generated after accepting these remaining host/history date offsets:

- Event 98: history `06/16/2017`, host `6/23/17`, winner `Andre`.
- Event 157: history `11/17/2022`, host `11/10/22`, winner `Waxcuses`.
- Event 159: history `01/19/2023`, host `1/29/23`, winner `Masta Pussy`.
- Event 173: history `03/08/2024`, host `3/28/24`, winner `Masta Pussy`.
- Event 184: history `02/20/2025`, host `2/24/2025`, winner `Masta Pussy`.
