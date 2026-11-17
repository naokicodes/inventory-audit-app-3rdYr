# Reviews

Read-only reviews of the app by an outside model. Each report's first line is the commit it
reviewed. Reports are kept as written: how each finding was sorted (fix step, ADR, rejected, or a
note on a settled decision) is in `docs/session-status.md`, in the block of the architect chat that
sorted it. Prices, costs and staff names are never in a report.

Severity in the reports: P0 = data loss or a security hole; P1 = a wrong number or wrong access;
P2 = fragile or confusing; P3 = polish.

## 2026-11-17 - Fable, five runs, all on `2cb16ee`

| Report | The question | Findings |
|---|---|---|
| `fable-2026-11-17-1-permissions.md` | Who can read and write what, per role and site | PERM-01 to PERM-18 (1 P0, 6 P1, 7 P2, 4 P3); N-1 |
| `fable-2026-11-17-2-integrity.md` | Can any path make a count, a stock figure or a cost wrong unnoticed? | I-01 to I-15 (9 P1, 5 P2, 1 P3) |
| `fable-2026-11-17-3-consistency.md` | The ADRs against the docs; what we still need to find out | C-01 to C-25 (4 P1, 16 P2, 5 P3); Part B, a 69-item checklist |
| `fable-2026-11-17-4-scale.md` | What breaks first as the business grows | F1 to F10 (1 P0, 1 P1, 8 P2) |
| `fable-2026-11-17-5-pages-updates.md` | The pages on a phone; the update path | U-01 to U-23 (6 P1, 12 P2, 5 P3); B1 to B3 |

The runs overlap (for example I-01, F2 and U-01 are one bug): the sorting merges them.
