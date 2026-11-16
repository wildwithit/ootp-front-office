# Rangers Front Office development

Baseline: upstream 0.42.0, commit `972c2788f60bf63a4a292193d55805ddb6ca3657` on the authorized fork's `feature/rangers-custom-phase1`. Apple Silicon, Node 24.2.0. Clean upstream `npm ci`, 709 tests, TypeScript, Vite build, and Electron build passed.

| Existing surfaces | Implementation and preservation checks |
| --- | --- |
| Dashboard, schedule, standings, playoff race, transactions and league recap | Existing routes and competitive-posture calculations. Fixture tests exercise game dates, split rules, standings and the buy/hold/sell model. |
| Rosters, player dossiers, depth, lineup, pitching, injuries, 40-man and staff | Keep existing navigation, roster membership, derived statistics, sortable tables, and OOTP staff identities. |
| Prospects, draft, development, franchise and org comparisons | Reuse exports, team/player IDs, level-aware scouting and readiness. Existing rating and contract history remain in `history.db`. |
| Payroll, contracts, free agents, trade fits and trade desk | Reuse valuation, service-time and payroll logic. Parity checks pin representative values and read the original API shapes. |
| Chat, group discussions, GM briefing, newspaper and AI settings | Keep existing providers, tools, voices, credentials, and storage. Upstream automatic updater is disabled in the custom desktop edition. |
| Notes, watchlists, saved conversations, themes, settings and static export | Keep existing storage formats and screens. Fixture tests do not represent a live install or every export schema. |

## Local build and verification

From the isolated checkout, use Node 24 and run:

```sh
export OOTP_FO_DATA_DIR="$HOME/Library/Application Support/Rangers Front Office Development"
npm ci
npm test
npx --no-install tsc --noEmit
npm run desktop:build
npm run dist:mac
"release/mac-arm64/Rangers Front Office.app/Contents/MacOS/Rangers Front Office"
```

The packaging command produces local ad hoc-signed artifacts with publishing and upstream updates disabled. Use only synthetic or explicitly copied CSV directories in development. The packaged default data location is `~/Library/Application Support/Rangers Front Office`. Use a distinct development directory for manual tests. After the Electron ABI rebuild, restore Node compatibility with `npm run abi:node` before running server tests if the native addon reports an ABI mismatch.

## Backup and rollback

Keep the original installation and its profile in place. Export a backup of any custom profile by quitting the custom app and copying its entire data directory, including SQLite sidecars if present. Date backups and preserve the latest profile before testing any rollback. Launch the previous app or build against its own profile or a separate restored copy. Never roll a newer data directory back in place.

Optional migration starts with a user-authorized, offline copy of the original profile. Test against a new empty custom directory, retaining the original and backup. Transfer `settings.json` and `history.db` using a verified SQLite backup, and import the corresponding copied CSV export. Existing watchlists and player notes use export player IDs and must only be associated with the matching save. Re-enter credentials through Settings. Do not copy the original live `config.json`, keys, database, or port settings into development. Migration must be rehearsed against copied data before a production transition.
