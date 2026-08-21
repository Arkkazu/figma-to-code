[CmdletBinding()]
param()

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$designPath = Join-Path $PSScriptRoot 'r5-ordinal3-hyperv-capability-probe-design.md'
$schemaPath = Join-Path $PSScriptRoot 'r5-ordinal3-os-isolation-proof-schema.json'
$amendmentDraftPath = Join-Path $PSScriptRoot 'r5-ordinal3-nonattached-output-contract-amendment-draft.json'
$amendmentAcceptancePath = Join-Path $PSScriptRoot 'r5-ordinal3-nonattached-output-contract-amendment-owner-acceptance.json'
$typedValidatorPath = Join-Path $PSScriptRoot 'r5-ordinal3-nonattached-output-evidence-validator.mjs'
$typedValidatorE2EPath = Join-Path $PSScriptRoot 'r5-ordinal3-nonattached-output-evidence-validator.e2e.mjs'
$collectorResearchPath = Join-Path $PSScriptRoot 'r5-ordinal3-evidence-collector-alternatives-research.md'
$expectedSchemaSha256 = 'c17a30f3fd2b84c897635b0f0eb645e3633d3b19418d99c41a7cd8fb5d031403'
$expectedAmendmentDraftSha256 = 'b7960c5509ea50ed27d18ad636f0f12c5c712444a84de0765068f416b27b28a0'
$expectedAcceptanceSha256 = 'a35ccd16bd8a911879614f04807a6d17d745e3de0491a1ee71350cfba2077e8e'
$expectedNoAuthority = @(
    'reissue publication',
    'role delivery',
    'role launch',
    'implementation',
    'return check',
    'return apply',
    'site or lifecycle mutation',
    'browser or Figma measurement',
    'P-11 change'
)

function Get-ErrorSummary {
    param([System.Management.Automation.ErrorRecord]$ErrorRecord)
    return $ErrorRecord.Exception.Message
}

function Get-OptionalFeatureState {
    param([string]$Name)

    try {
        $feature = Get-WindowsOptionalFeature -Online -FeatureName $Name -ErrorAction Stop
        return [ordered]@{ status = 'read'; state = [string]$feature.State }
    }
    catch {
        return [ordered]@{ status = 'unavailable'; reason = Get-ErrorSummary $_ }
    }
}

function Get-ServiceState {
    param([string]$Name)

    try {
        $service = Get-Service -Name $Name -ErrorAction Stop
        return [ordered]@{ status = 'read'; state = [string]$service.Status; startType = [string]$service.StartType }
    }
    catch {
        return [ordered]@{ status = 'unavailable'; reason = Get-ErrorSummary $_ }
    }
}

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

function Get-WorkspaceFileEvidence {
    param([string]$Path)

    $candidate = Assert-WorkspaceRegularFile -Path $Path -AllowMissingLeaf
    if (-not (Test-Path -LiteralPath $Path -PathType Leaf)) {
        return [ordered]@{ status = 'not-present' }
    }
    $guarded = Assert-WorkspaceRegularFile $candidate
    return [ordered]@{
        status = 'present-not-executed-by-preflight'
        path = $guarded
        sha256 = (Get-FileHash -Algorithm SHA256 -LiteralPath $guarded).Hash.ToLowerInvariant()
    }
}

function Test-ExactPropertyNames {
    param(
        [object]$Object,
        [string[]]$Expected
    )

    if ($null -eq $Object) { return $false }
    $actual = @($Object.PSObject.Properties.Name | Sort-Object)
    $wanted = @($Expected | Sort-Object)
    if ($actual.Count -ne $wanted.Count) { return $false }
    for ($index = 0; $index -lt $wanted.Count; $index += 1) {
        if ($actual[$index] -cne $wanted[$index]) { return $false }
    }
    return $true
}

function Test-ExactStringSet {
    param(
        [object[]]$Actual,
        [string[]]$Expected
    )

    $actualValues = @($Actual | ForEach-Object { [string]$_ } | Sort-Object)
    $expectedValues = @($Expected | Sort-Object)
    if ($actualValues.Count -ne $expectedValues.Count) { return $false }
    for ($index = 0; $index -lt $expectedValues.Count; $index += 1) {
        if ($actualValues[$index] -cne $expectedValues[$index]) { return $false }
    }
    return $true
}

$null = Assert-WorkspaceRegularFile $PSCommandPath
$designPath = Assert-WorkspaceRegularFile $designPath
$schemaPath = Assert-WorkspaceRegularFile $schemaPath

$identity = [Security.Principal.WindowsIdentity]::GetCurrent()
$principal = [Security.Principal.WindowsPrincipal]::new($identity)
$isElevatedAdministrator = $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)

try {
    Get-VMHost -ErrorAction Stop | Out-Null
    $vmApi = [ordered]@{ status = 'read' }
}
catch {
    $vmApi = [ordered]@{ status = 'unavailable'; reason = Get-ErrorSummary $_ }
}

$managementAccessBlocker = if ($vmApi.status -eq 'read') {
    'Effective local Hyper-V management access was readable; this preflight still does not authorize a VM operation.'
}
else {
    'The current caller lacks effective local Hyper-V management access; a minimally delegated Hyper-V management identity or an elevated administrator is required before any P-3-free VM can be created.'
}

$schemaText = Get-Content -Raw -LiteralPath $schemaPath
$schemaHash = (Get-FileHash -Algorithm SHA256 -LiteralPath $schemaPath).Hash.ToLowerInvariant()
$schemaHashMatchesPinned = $schemaHash -eq $expectedSchemaSha256
$legacyActualOutputRequirementsPresent =
    $schemaText.Contains('implementationIdentityOutputDenialProbeSha256') -and
    $schemaText.Contains('outputHashBeforeSha256')

$amendmentDraft = [ordered]@{ status = 'not-present' }
if (Test-Path -LiteralPath $amendmentDraftPath -PathType Leaf) {
    $amendmentDraftPath = Assert-WorkspaceRegularFile $amendmentDraftPath
    $amendment = Get-Content -Raw -LiteralPath $amendmentDraftPath | ConvertFrom-Json -ErrorAction Stop
    $amendmentHash = (Get-FileHash -Algorithm SHA256 -LiteralPath $amendmentDraftPath).Hash.ToLowerInvariant()
    $amendmentDraft = [ordered]@{
        status = [string]$amendment.status
        effective = [bool]$amendment.effective
        path = $amendmentDraftPath
        sha256 = $amendmentHash
        hashMatchesPinned = $amendmentHash -eq $expectedAmendmentDraftSha256
    }
}

$amendmentAcceptance = [ordered]@{ status = 'not-present'; accepted = $false }
if (Test-Path -LiteralPath $amendmentAcceptancePath -PathType Leaf) {
    $amendmentAcceptancePath = Assert-WorkspaceRegularFile $amendmentAcceptancePath
    $acceptance = Get-Content -Raw -LiteralPath $amendmentAcceptancePath | ConvertFrom-Json -ErrorAction Stop
    $acceptanceHash = (Get-FileHash -Algorithm SHA256 -LiteralPath $amendmentAcceptancePath).Hash.ToLowerInvariant()
    $acceptedDraftMatches =
        $amendmentDraft.status -ne 'not-present' -and
        [string]$acceptance.acceptedDraft.sha256 -eq [string]$amendmentDraft.sha256 -and
        [string]$acceptance.acceptedDraft.sha256 -eq $expectedAmendmentDraftSha256
    $acceptanceShapeMatches =
        (Test-ExactPropertyNames $acceptance @('version', 'kind', 'recordState', 'ownerApproved', 'approvedAt', 'approvalSource', 'acceptedDraft', 'acceptedScope', 'doesNotAuthorize', 'p11Authorization')) -and
        (Test-ExactPropertyNames $acceptance.approvalSource @('kind', 'contentHash', 'machineVerified')) -and
        (Test-ExactPropertyNames $acceptance.acceptedDraft @('path', 'sha256')) -and
        (Test-ExactPropertyNames $acceptance.acceptedScope @('nonattachedPersistentOutputEvidenceSemantics', 'p3FreeHyperVCapabilityProbePreparation', 'schemaReplacementAuthorized', 'typedValidatorStillRequiredForPass', 'separateRuntimeAndNonceStillRequired'))
    $scopeRemainsNarrow =
        [string]$acceptance.p11Authorization -eq 'NOT_AUTHORIZED' -and
        (Test-ExactStringSet $acceptance.doesNotAuthorize $expectedNoAuthority) -and
        [bool]$acceptance.acceptedScope.nonattachedPersistentOutputEvidenceSemantics -and
        [bool]$acceptance.acceptedScope.p3FreeHyperVCapabilityProbePreparation -and
        -not [bool]$acceptance.acceptedScope.schemaReplacementAuthorized -and
        [bool]$acceptance.acceptedScope.typedValidatorStillRequiredForPass -and
        [bool]$acceptance.acceptedScope.separateRuntimeAndNonceStillRequired
    $accepted =
        [string]$acceptance.recordState -eq 'finalized' -and
        [bool]$acceptance.ownerApproved -and
        $acceptedDraftMatches -and
        $acceptanceShapeMatches -and
        $scopeRemainsNarrow -and
        $schemaHashMatchesPinned -and
        $acceptanceHash -eq $expectedAcceptanceSha256
    $amendmentAcceptance = [ordered]@{
        status = if ($accepted) { 'accepted-for-p3-free-probe-only' } else { 'present-but-invalid-or-out-of-scope' }
        accepted = $accepted
        path = $amendmentAcceptancePath
        sha256 = $acceptanceHash
        hashMatchesPinned = $acceptanceHash -eq $expectedAcceptanceSha256
        acceptedDraftMatches = $acceptedDraftMatches
        acceptanceShapeMatches = $acceptanceShapeMatches
        scopeRemainsNarrow = $scopeRemainsNarrow
    }
}

$result = [ordered]@{
    schema = 'p3-r5-ordinal3-hyperv-capability-preflight/v1'
    mode = 'read-only-preflight'
    externalWritesPerformed = $false
    actualP3InputsOrRecordsRead = $false
    p3DesignOrSchemaRead = $true
    p3DeliveryOrLaunchPerformed = $false
    p11Changed = $false
    inputs = [ordered]@{
        design = [ordered]@{
            path = $designPath
            sha256 = (Get-FileHash -Algorithm SHA256 -LiteralPath $designPath).Hash.ToLowerInvariant()
        }
        isolationProofSchema = [ordered]@{
            path = $schemaPath
            sha256 = $schemaHash
            hashMatchesPinned = $schemaHashMatchesPinned
        }
        preflightScript = [ordered]@{
            path = $PSCommandPath
            sha256 = (Get-FileHash -Algorithm SHA256 -LiteralPath $PSCommandPath).Hash.ToLowerInvariant()
        }
        nonattachedOutputAmendmentDraft = $amendmentDraft
        nonattachedOutputAmendmentAcceptance = $amendmentAcceptance
        typedEvidenceValidator = Get-WorkspaceFileEvidence $typedValidatorPath
        typedEvidenceValidatorE2E = Get-WorkspaceFileEvidence $typedValidatorE2EPath
        collectorAlternativesResearch = Get-WorkspaceFileEvidence $collectorResearchPath
    }
    host = [ordered]@{
        elevatedAdministrator = $isElevatedAdministrator
        hyperVVmApi = $vmApi
        services = [ordered]@{
            vmms = Get-ServiceState 'vmms'
            vmcompute = Get-ServiceState 'vmcompute'
        }
        optionalFeatures = [ordered]@{
            hyperV = Get-OptionalFeatureState 'Microsoft-Hyper-V-All'
            windowsSandbox = Get-OptionalFeatureState 'Containers-DisposableClientVM'
        }
    }
    contract = [ordered]@{
        legacyActualOutputRequirementsPresent = $legacyActualOutputRequirementsPresent
        semanticContractReviewPerformed = $false
        currentRevisionStatus = if ($legacyActualOutputRequirementsPresent) { 'legacy-key-names-detected-owner-review-required' } else { 'manual-contract-review-required' }
    }
    result = [ordered]@{
        status = 'blocked-not-authorized'
        blockers = @(
            $managementAccessBlocker,
            'This preflight detects legacy actual-output key names but does not perform semantic contract validation; acceptance is limited to a P-3-free probe and does not replace the existing schema.',
            'A present typed structural validator is not a signed evidence collector and does not make a capability probe pass. Fixed exporter, host-only evidence collector, exact model-endpoint-only egress, source-authenticity binding, and a synthetic fixture package remain unapproved.',
            'This is an initial host preflight only. It never creates a VM, changes a feature, or reads actual P-3 inputs or records.'
        )
    }
}

$result | ConvertTo-Json -Depth 12
