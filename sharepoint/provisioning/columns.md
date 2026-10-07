# Columns the dashboard expects

Column names are matched ignoring spaces, case and underscores, so **"Assessment Key"**, **AssessmentKey** and
**Assessment_x0020_Key** (what SharePoint calls it after an Excel import) all work.

## List 1 – Fit Gap Process Catalogue (already created from Excel)
Read only. Needs: Process ID (or Title), L1 Process, L2 Process, L3 Process, and optionally L4, L5, L6, Reference Fit/Gap, Active.

## List 2 – Fit Gap Assessments (one row per assessment)
| Column | Type | Notes |
|---|---|---|
| Title | Single line (built in) | The assessment name |
| AssessmentKey | Single line of text | **Enforce unique values = Yes**, Required, Indexed |
| TemplateId | Single line of text | |
| TemplateVersion | Single line of text | |

## List 3 – Fit Gap Assessment Records (one row per saved version; history is never overwritten)
| Column | Type | Notes |
|---|---|---|
| Title | Single line (built in) | `AssessmentKey\|ProcessID\|vN` – **Enforce unique values = Yes** (this is what stops two people saving the same version) |
| AssessmentKey | Single line of text | Indexed |
| ProcessID | Single line of text | Indexed. Matches Process ID in the catalogue (BPML-0001 …) |
| Rating | Choice: Fit, Partial Fit, Not Fit | (a plain text column also works) |
| Comment | Multiple lines of text – **plain text** | |
| Version | Number (0 decimals) | (a plain text column also works) |
| AssessedBy | Single line of text | Display name from the Microsoft login |
| AssessedByEmail | Single line of text | |
| AssessedAt | Date and time | (a plain text column also works) |
| EditedAt | Date and time | Set only when a record is corrected in place |
| EditedBy | Single line of text | |

Permissions: people who assess need **Contribute** on lists 2 and 3 (they add rows, and may edit/delete their own
when correcting or deleting an assessment) and **Read** on list 1.
