# Rangers Front Office development

Baseline: upstream 0.42.0, commit `972c2788f60bf63a4a292193d55805ddb6ca3657` on the authorized fork's `feature/rangers-custom-phase1`. The original upstream is at 0.43.0 (`cfed84b4226f8d01b106c91b59eedf8f3178b59f`). This work uses the authorized fork baseline. Apple Silicon, Node 24.2.0. Clean baseline `npm ci`, 709 tests, TypeScript, Vite build, and Electron build passed.

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

Optional migration starts with a user-authorized, offline copy of the original profile. Test against a new empty custom directory, retaining the original and backup. Transfer `settings.json` and `history.db` using a verified SQLite backup, and import the corresponding copied CSV export. Preserve the original save display name exactly so the legacy history, watchlist and notes resolve their saved key. Confirm the player IDs match before using the migrated profile. Re-enter credentials through Settings. Do not copy the original live `config.json`, keys, database, or port settings into development. Migration must be rehearsed against copied data before a production transition.

## Phase 1 storage and verification

- `rangers-history.db` adds save- and organization-scoped statistical checkpoints (schema v1) and GM philosophy (v2). The upgrade preserves existing checkpoints. A backup/restore fixture verifies the pre-upgrade history and legacy watchlist and notes can be opened separately from the upgraded file.
- A save's identity is its canonical CSV-directory path, hashed locally, plus its OOTP organization ID. Two paths with the same display name stay separate. Re-import the same directory to retain continuity. A moved or copied export directory starts new history; leave an established export at its old path if you want to keep adding to its history. Dedicate one directory to each save.
- Statistical checkpoints retain distinct captured exports by game date and content. They include per-club and player season lines, standings, assignments, roster and availability fields, and financial totals present in the export. These are observations at import time. They can establish what changed between exports, with no precise event date implied.
- Trade exposure shows full annual salaries, identified guarantees, options, signed extensions and the transferable share after any existing retention. Year alignment uses the exported current salary slot. The app shows buyouts recorded in the export and flags opt-outs. Missing option terms, opt-out timing and future arbitration salaries remain unknown. A scheduled payroll warning uses available exported payroll totals and assumes listed option salaries are paid. It is a user guideline and the owner budget remains a separate figure.
- Final Mac check: 734 tests across 92 files, TypeScript, Vite, Electron build, and local macOS packaging passed. The Apple Silicon disk image checksum passed. The packaged renderer imported 34 synthetic CSVs, saved the template and readability controls, opened Rosters and Payroll, and displayed a protected-player flag and payroll warning in Trade Center. Reimport and app restart preserved strategy, settings and a single checkpoint. Export hashes matched before and after.
- The isolated representative OOTP 27 export imported and reimported on the signed Apple Silicon app, with one unchanged checkpoint. Team batting and pitching totals, roster assignments, player protections, payroll, option buyouts, prior retention, and a signed extension reconciled to the export. The renderer showed the buyout after restart. The archive and copied CSVs matched their original checksums. Checkpoint pitching and contract exposure fixes brought the test count to 736.
- An additional export from a later in-game date created a second checkpoint at the same save path. The signed renderer verified Prospect sorting by signal, name, age, and position, the OOTP grade colors, hitter and pitcher Quick Look, and a stat selection carried into a reopened card. All 739 tests passed.
- Live provider judgment, migration of real files, and Intel runtime remain open.

## Fixed AI judgment scenarios

Use the same synthetic evidence for each model. Record the model ID, tested commit, result and any unsupported claim. Score the criteria independently of wording or verdict. Mocked request tests exercise prompt delivery and persona continuity; a supported development provider is needed for judgment evaluation.

| Scenario | Evidence | Pass criteria |
| --- | --- | --- |
| Lopsided trade | A buying opponent is asked for its only playoff-caliber starter on a below-market deal in exchange for two low-upside position players. The simulator allows the proposed combination. | Distinguish numerical value from real club incentives. Explain the other club's rationale or lack of one and give a defensible answer. |
| Protected player | Wyatt Langford is protected. His raw valuation makes a high-impact starting pitcher attainable. | Flag protection and omit Langford from recommended outgoing packages. Consider holding or suggest an eligible alternative. |
| Hot Triple-A bat | A hitter has a 1.000 OPS in 65 Triple-A PA, a 40 Overall grade and a below-average shortstop glove with no MLB track record. | Distinguish performance, sample, current ability and defensive role. Explain what would justify promotion. |
| Current savings, long liability | The incoming player earns $5M now and $25M for each of four future seasons. The outgoing player earns $15M now and reaches free agency. | Identify $10M in gross savings now and $100M in future exposure. Disclose any options, uncertainty or retention and give a recommendation. |
| Slumping veteran | A veteran has a .620 OPS and .210 BABIP after 120 PA. His strikeout and walk rates and strong-contact indicators are near prior levels. | Identify the recovery case and its limits. Avoid guaranteeing regression or elevating one underlying metric over all other evidence. |
| Buy or hold at the deadline | Texas is two games out of a playoff spot with a positive run differential, a shallow farm at shortstop and a high asking price for rental relief. | Weigh buying and holding, apply depth and payroll constraints, and state the evidence that would change the decision. |

## Draft pull requests

Review in this order. Each PR targets the previous branch so its diff stays focused.

1. [Desktop identity and parity](https://github.com/wildwithit/ootp-front-office/pull/1)
2. [Statistical checkpoints](https://github.com/wildwithit/ootp-front-office/pull/2)
3. [GM Philosophy and protected players](https://github.com/wildwithit/ootp-front-office/pull/3)
4. [Readability](https://github.com/wildwithit/ootp-front-office/pull/4)
5. [AI strategy context](https://github.com/wildwithit/ootp-front-office/pull/5)
6. [Individual trade value](https://github.com/wildwithit/ootp-front-office/pull/6)
7. [Contract and payroll exposure](https://github.com/wildwithit/ootp-front-office/pull/7)
8. [OOTP 27 export compatibility](https://github.com/wildwithit/ootp-front-office/pull/8)
9. [Prospect sorting and player Quick Look](https://github.com/wildwithit/ootp-front-office/pull/9)

## Phase 2

Use checkpoints for export-to-export comparisons and keep OOTP authoritative. Add an organization-scoped decision ledger with separate proposed, GM-approved and OOTP-confirmed states. Preserve original predictions and evaluate them against measurable checkpoint evidence. Reuse existing depth, posture and contract analysis in the monthly review. Confirm roster moves through exports when available and retain uncertainty otherwise.
