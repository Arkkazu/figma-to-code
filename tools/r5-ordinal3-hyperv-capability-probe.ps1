[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)]
    [ValidateSet('PlanOnly', 'Apply')]
    [string]$Mode,

    [switch]$SyntheticFixtureAcknowledged,

    [string]$OwnerAuthorizationId
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$preflightPath = Join-Path $PSScriptRoot 'r5-ordinal3-hyperv-capability-preflight.ps1'

function Assert-WorkspaceRegularFile {
    param(
        [string]$Path,
        [switch]$AllowMissingLeaf
    )

    $workspace = [IO.Path]::GetFullPath((Split-Path -Parent $PSScriptRoot)).TrimEnd([char[]]@([IO.Path]::DirectorySeparatorChar, [IO.Path]::AltDirectorySeparatorChar))
    $resolved = [IO.Path]::GetFullPath($Path)
    $relativePath = [IO.Path]::GetRelativePath($workspace, $resolved)
    if ([IO.Path]::IsPathRooted($relativePath) -or $relativePath -eq '..' -or $relativePath.StartsWith("..$([IO.Path]::DirectorySeparatorChar)", [StringComparison]::Ordinal) -or $relativePath.StartsWith("..$([IO.Path]::AltDirectorySeparatorChar)", [StringComparison]::Ordinal)) {
        throw "Workspace path guard rejected: $Path"
    }

    $workspaceItem = Get-Item -LiteralPath $workspace -Force -ErrorAction Stop
    if (-not $workspaceItem.PSIsContainer -or (($workspaceItem.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0)) {
        throw "Workspace root guard rejected: $workspace"
    }

    $cursor = $workspace
    $parts = @($relativePath -split '[\\/]' | Where-Object { $_.Length -gt 0 })
    if ($parts.Count -eq 0) {
        throw "Regular-file guard rejected workspace root: $Path"
    }
    for ($index = 0; $index -lt $parts.Count; $index += 1) {
        $cursor = Join-Path $cursor $parts[$index]
        try {
            $item = Get-Item -LiteralPath $cursor -Force -ErrorAction Stop
        }
        catch {
            if ($index -eq ($parts.Count - 1) -and $AllowMissingLeaf -and $_.CategoryInfo.Category -eq [System.Management.Automation.ErrorCategory]::ObjectNotFound) {
                return $resolved
            }
            throw
        }
        if (($item.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0) {
            throw "Workspace path contains a reparse-point component: $Path"
        }
        if ($index -lt ($parts.Count - 1) -and -not $item.PSIsContainer) {
            throw "Workspace path contains a non-directory parent component: $Path"
        }
        if ($index -eq ($parts.Count - 1) -and $item.PSIsContainer) {
            throw "Regular-file guard rejected: $Path"
        }
        if ($index -eq ($parts.Count - 1) -and $item.PSObject.Properties['ModeWithoutHardLink'] -and [string]$item.Mode -cne [string]$item.ModeWithoutHardLink) {
            throw "Workspace path contains a hard-link file: $Path"
        }
    }
    return $resolved
}

function Stop-Blocked {
    param(
        [Parameter(Mandatory = $true)]
        [string]$Code,
        [Parameter(Mandatory = $true)]
        [string]$Reason
    )

    [ordered]@{
        schema = 'p3-r5-ordinal3-hyperv-capability-probe/v1'
        mode = $Mode
        status = 'blocked-not-authorized'
        reasonCode = $Code
        reason = $Reason
        externalWritesPerformed = $false
        actualP3InputsOrRecordsRead = $false
        p3DesignOrSchemaRead = $true
        p3DeliveryOrLaunchPerformed = $false
        p11Changed = $false
    } | ConvertTo-Json -Depth 8
    exit 2
}

$null = Assert-WorkspaceRegularFile $PSCommandPath
$preflightPath = Assert-WorkspaceRegularFile $preflightPath

try {
    $preflightOutput = @(& $preflightPath)
    $preflightSucceeded = $?
    if (-not $preflightSucceeded) {
        throw 'Preflight did not complete successfully.'
    }
    $preflight = $preflightOutput | ConvertFrom-Json -ErrorAction Stop
}
catch {
    Stop-Blocked -Code 'PREFLIGHT_UNAVAILABLE' -Reason $_.Exception.Message
}

if ($Mode -eq 'PlanOnly') {
    [ordered]@{
        schema = 'p3-r5-ordinal3-hyperv-capability-probe/v1'
        mode = 'PlanOnly'
        status = 'planned-no-write'
        preflight = $preflight
        externalWritesPerformed = $false
        actualP3InputsOrRecordsRead = $false
        p3DesignOrSchemaRead = $true
        p3DeliveryOrLaunchPerformed = $false
        p11Changed = $false
        applyBoundary = [ordered]@{
            syntheticFixtureAcknowledgedRequired = $true
            ownerAuthorizationIdRequired = $true
            collectorAndEvidencePackageRequired = $true
            ownerApprovedOutputContractAmendmentRequired = $true
            hyperVManagementAccessRequired = $true
        }
    } | ConvertTo-Json -Depth 16
    exit 0
}

if (-not $SyntheticFixtureAcknowledged) {
    Stop-Blocked -Code 'SYNTHETIC_FIXTURE_ACKNOWLEDGEMENT_REQUIRED' -Reason 'Apply accepts only a future synthetic fixture and requires an explicit acknowledgement.'
}

if ([string]::IsNullOrWhiteSpace($OwnerAuthorizationId)) {
    Stop-Blocked -Code 'OWNER_AUTHORIZATION_ID_REQUIRED' -Reason 'Apply requires an opaque owner authorization identifier, but never reads P-3 records to validate it.'
}

if ($preflight.host.hyperVVmApi.status -ne 'read') {
    Stop-Blocked -Code 'HYPERV_MANAGEMENT_ACCESS_DENIED' -Reason 'A local identity with effective Hyper-V management access is required before any synthetic VM operation.'
}

if ($preflight.host.optionalFeatures.hyperV.status -ne 'read' -or $preflight.host.optionalFeatures.hyperV.state -ne 'Enabled') {
    Stop-Blocked -Code 'HYPERV_FEATURE_STATE_UNVERIFIED' -Reason 'The Hyper-V feature state is not independently readable and enabled for this run.'
}

if (-not $preflight.inputs.nonattachedOutputAmendmentAcceptance.accepted) {
    Stop-Blocked -Code 'OUTPUT_CONTRACT_AMENDMENT_REQUIRED' -Reason 'No finalized owner acceptance is available for the exact non-attached-output amendment draft and P-3-free probe scope.'
}

Stop-Blocked -Code 'COLLECTOR_NOT_APPROVED' -Reason 'No byte-pinned host-only collector, exporter, evidence validator, or synthetic fixture package is approved. Apply performs no VM or filesystem mutation.'
