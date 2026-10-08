<#
  Creates the two lists the Fit Gap dashboard writes to, next to the process catalogue list.
  NOT TESTED against a live tenant (written from the SharePoint/PnP documentation). Review before running.

  Needs: PnP.PowerShell module, and Site Owner (or list-creation) rights on the site.
  Usage:
    Install-Module PnP.PowerShell -Scope CurrentUser
    ./Provision-FitGapLists.ps1 -SiteUrl "https://<tenant>.sharepoint.com/sites/<site>"
#>
param(
  [Parameter(Mandatory = $true)][string]$SiteUrl,
  [string]$AssessmentsList = "Fit Gap Assessments",
  [string]$RecordsList = "Fit Gap Assessment Records"
)

Connect-PnPOnline -Url $SiteUrl -Interactive

# --- Assessments: one row per assessment (the container) -------------------------------------
if (-not (Get-PnPList -Identity $AssessmentsList -ErrorAction SilentlyContinue)) {
  New-PnPList -Title $AssessmentsList -Template GenericList -OnQuickLaunch | Out-Null
}
# Title = assessment name (built in)
Add-PnPField -List $AssessmentsList -DisplayName "AssessmentKey"   -InternalName "AssessmentKey"   -Type Text -AddToDefaultView -ErrorAction SilentlyContinue | Out-Null
Add-PnPField -List $AssessmentsList -DisplayName "TemplateId"      -InternalName "TemplateId"      -Type Text -AddToDefaultView -ErrorAction SilentlyContinue | Out-Null
Add-PnPField -List $AssessmentsList -DisplayName "TemplateVersion" -InternalName "TemplateVersion" -Type Text -AddToDefaultView -ErrorAction SilentlyContinue | Out-Null
# Unique key => the same assessment can never be created twice
Set-PnPField -List $AssessmentsList -Identity "AssessmentKey" -Values @{ Indexed = $true; EnforceUniqueValues = $true; Required = $true }

# --- Records: one row per saved assessment version (history is never overwritten) -------------
if (-not (Get-PnPList -Identity $RecordsList -ErrorAction SilentlyContinue)) {
  New-PnPList -Title $RecordsList -Template GenericList -OnQuickLaunch | Out-Null
}
# Title = "<AssessmentKey>|<ProcessID>|v<Version>"  (unique: two people cannot both save version N)
Set-PnPField -List $RecordsList -Identity "Title" -Values @{ Indexed = $true; EnforceUniqueValues = $true; Required = $true }
Add-PnPField -List $RecordsList -DisplayName "AssessmentKey" -InternalName "AssessmentKey" -Type Text -AddToDefaultView -ErrorAction SilentlyContinue | Out-Null
Add-PnPField -List $RecordsList -DisplayName "ProcessID"     -InternalName "ProcessID"     -Type Text -AddToDefaultView -ErrorAction SilentlyContinue | Out-Null
Add-PnPField -List $RecordsList -DisplayName "Rating"        -InternalName "Rating"        -Type Choice -Choices "Fit","Partial Fit","Not Fit","Not Applicable" -AddToDefaultView -ErrorAction SilentlyContinue | Out-Null
Add-PnPField -List $RecordsList -DisplayName "Comment"       -InternalName "Comment"       -Type Note -AddToDefaultView -ErrorAction SilentlyContinue | Out-Null
Add-PnPField -List $RecordsList -DisplayName "Version"       -InternalName "Version"       -Type Number -AddToDefaultView -ErrorAction SilentlyContinue | Out-Null
Add-PnPField -List $RecordsList -DisplayName "AssessedBy"      -InternalName "AssessedBy"      -Type Text -AddToDefaultView -ErrorAction SilentlyContinue | Out-Null
Add-PnPField -List $RecordsList -DisplayName "AssessedByEmail" -InternalName "AssessedByEmail" -Type Text -ErrorAction SilentlyContinue | Out-Null
Add-PnPField -List $RecordsList -DisplayName "AssessedAt"      -InternalName "AssessedAt"      -Type DateTime -AddToDefaultView -ErrorAction SilentlyContinue | Out-Null
Add-PnPField -List $RecordsList -DisplayName "EditedAt"        -InternalName "EditedAt"        -Type DateTime -ErrorAction SilentlyContinue | Out-Null
Add-PnPField -List $RecordsList -DisplayName "EditedBy"        -InternalName "EditedBy"        -Type Text -ErrorAction SilentlyContinue | Out-Null
# Indexes keep the list fast and queryable once it passes 5,000 rows
Set-PnPField -List $RecordsList -Identity "AssessmentKey" -Values @{ Indexed = $true }
Set-PnPField -List $RecordsList -Identity "ProcessID"     -Values @{ Indexed = $true }

Write-Host "Done. Lists ready: '$AssessmentsList' and '$RecordsList'."
