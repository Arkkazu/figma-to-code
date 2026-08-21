[CmdletBinding()]
param()

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$workspace = [IO.Path]::GetFullPath((Split-Path -Parent $PSScriptRoot)).TrimEnd([char[]]@([IO.Path]::DirectorySeparatorChar, [IO.Path]::AltDirectorySeparatorChar))
$targets = [ordered]@{
    preflight = Join-Path $PSScriptRoot 'r5-ordinal3-hyperv-capability-preflight.ps1'
    probe = Join-Path $PSScriptRoot 'r5-ordinal3-hyperv-capability-probe.ps1'
}
$expectedTargetBytes = [ordered]@{
    preflight = [ordered]@{
        sha256 = 'f379daf025cb79e093660cf85aed6429f2f2eaf6d8d62c571165de6c47b2cde7'
        astFingerprint = '85273a3b2ede9559bb409aebc0ec96d89eadfdfede79d51909b701c0bb0475ed'
    }
    probe = [ordered]@{
        sha256 = 'f00994ddde29e98bf58ace99cd2e4d333660e1a7eafb2012fee6ca501015fa98'
        astFingerprint = '6a93f9739db9672ce66f265a9799189ee1995309ec3abb6018d81de5fe85d854'
    }
}
$allowedCommands = [ordered]@{
    preflight = @(
        'Assert-WorkspaceRegularFile',
        'ConvertFrom-Json',
        'ConvertTo-Json',
        'ForEach-Object',
        'Get-Content',
        'Get-ErrorSummary',
        'Get-FileHash',
        'Get-Item',
        'Get-OptionalFeatureState',
        'Get-Service',
        'Get-ServiceState',
        'Get-VMHost',
        'Get-WindowsOptionalFeature',
        'Get-WorkspaceFileEvidence',
        'Join-Path',
        'Out-Null',
        'Set-StrictMode',
        'Sort-Object',
        'Split-Path',
        'Test-ExactPropertyNames',
        'Test-ExactStringSet',
        'Test-Path',
        'Where-Object'
    )
    probe = @(
        'Assert-WorkspaceRegularFile',
        'ConvertFrom-Json',
        'ConvertTo-Json',
        'Get-Item',
        'Join-Path',
        'Set-StrictMode',
        'Split-Path',
        'Stop-Blocked',
        'Where-Object'
    )
}
$allowedDynamicCommandText = [ordered]@{
    preflight = @()
    probe = @('& $preflightPath')
}
$allowedMemberMethods = [ordered]@{
    preflight = @(
        'Contains',
        'GetCurrent',
        'GetFullPath',
        'GetRelativePath',
        'IsInRole',
        'IsPathRooted',
        'new',
        'StartsWith',
        'ToLowerInvariant',
        'TrimEnd'
    )
    probe = @(
        'GetFullPath',
        'GetRelativePath',
        'IsNullOrWhiteSpace',
        'IsPathRooted',
        'StartsWith',
        'TrimEnd'
    )
}
$requiredFragments = [ordered]@{
    preflight = @(
        'function Assert-WorkspaceRegularFile',
        'GetRelativePath',
        'Workspace path contains a reparse-point component',
        'ModeWithoutHardLink',
        '$null = Assert-WorkspaceRegularFile $PSCommandPath',
        '$designPath = Assert-WorkspaceRegularFile $designPath',
        '$schemaPath = Assert-WorkspaceRegularFile $schemaPath',
        "status = 'blocked-not-authorized'"
    )
    probe = @(
        'function Assert-WorkspaceRegularFile',
        'GetRelativePath',
        'Workspace path contains a reparse-point component',
        'ModeWithoutHardLink',
        '$null = Assert-WorkspaceRegularFile $PSCommandPath',
        '$preflightPath = Assert-WorkspaceRegularFile $preflightPath',
        "Stop-Blocked -Code 'COLLECTOR_NOT_APPROVED'"
    )
}

function Assert-WorkspaceRegularFile {
    param([string]$Path)

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
        $item = Get-Item -LiteralPath $cursor -Force -ErrorAction Stop
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

function Get-ParsedFileEvidence {
    param(
        [string]$Name,
        [string]$Path
    )

    $guardedPath = Assert-WorkspaceRegularFile $Path
    $actualSha256 = (Get-FileHash -Algorithm SHA256 -LiteralPath $guardedPath).Hash.ToLowerInvariant()
    if ($actualSha256 -cne $expectedTargetBytes[$Name].sha256) {
        throw "$Name bytes differ from the reviewed static-regression pin."
    }
    $tokens = $null
    $errors = $null
    $ast = [System.Management.Automation.Language.Parser]::ParseFile($guardedPath, [ref]$tokens, [ref]$errors)
    if ($errors.Count -ne 0) {
        throw "$Name has PowerShell parse errors."
    }

    $commandAsts = @($ast.FindAll({ param($node) $node -is [System.Management.Automation.Language.CommandAst] }, $true))
    foreach ($commandAst in $commandAsts) {
        $commandName = $commandAst.GetCommandName()
        if ([string]::IsNullOrWhiteSpace($commandName)) {
            $dynamicText = $commandAst.Extent.Text.Trim()
            if ($allowedDynamicCommandText[$Name] -cnotcontains $dynamicText) {
                throw "$Name contains an unapproved dynamic command invocation: $dynamicText"
            }
            continue
        }
        if ($allowedCommands[$Name] -cnotcontains $commandName) {
            throw "$Name contains an unapproved command invocation: $commandName"
        }
    }

    $memberInvocationAsts = @($ast.FindAll({ param($node) $node -is [System.Management.Automation.Language.InvokeMemberExpressionAst] }, $true))
    foreach ($memberInvocationAst in $memberInvocationAsts) {
        $memberName = $memberInvocationAst.Member.Extent.Text
        if ($allowedMemberMethods[$Name] -cnotcontains $memberName) {
            throw "$Name contains an unapproved .NET member invocation: $memberName"
        }
    }

    $redirections = @($ast.FindAll({ param($node) $node -is [System.Management.Automation.Language.RedirectionAst] }, $true))
    if ($redirections.Count -ne 0) {
        throw "$Name contains redirection syntax."
    }

    $astFingerprintPayload = [ordered]@{
        commands = @($commandAsts | ForEach-Object { $_.Extent.Text.Trim() })
        memberInvocations = @($memberInvocationAsts | ForEach-Object { $_.Extent.Text.Trim() })
        redirectionCount = $redirections.Count
    }
    $astFingerprintJson = $astFingerprintPayload | ConvertTo-Json -Compress -Depth 8
    $astFingerprintBytes = [Text.Encoding]::UTF8.GetBytes($astFingerprintJson)
    $astFingerprint = -join ([Security.Cryptography.SHA256]::HashData($astFingerprintBytes) | ForEach-Object { $_.ToString('x2') })
    if ($astFingerprint -cne $expectedTargetBytes[$Name].astFingerprint) {
        throw "$Name command/member AST differs from the reviewed static-regression pin."
    }

    $text = [IO.File]::ReadAllText($guardedPath, [Text.UTF8Encoding]::new($false, $true))
    foreach ($fragment in $requiredFragments[$Name]) {
        if (-not $text.Contains($fragment, [StringComparison]::Ordinal)) {
            throw "$Name is missing required fail-closed fragment: $fragment"
        }
    }
    if ($Name -eq 'probe') {
        $terminalIndex = $text.LastIndexOf("Stop-Blocked -Code 'COLLECTOR_NOT_APPROVED'", [StringComparison]::Ordinal)
        if ($terminalIndex -lt 0) {
            throw "$Name is missing the collector terminal block."
        }
        $trailingText = $text.Substring($terminalIndex)
        if ($trailingText -match "(?ms)^\s*Stop-Blocked -Code 'COLLECTOR_NOT_APPROVED'.*?\r?\n\s*[^\s#]") {
            throw "$Name has executable text after the collector terminal block."
        }
    }

    return [ordered]@{
        path = $guardedPath
        sha256 = $actualSha256
        astFingerprint = $astFingerprint
        parsed = $true
        commandsMatchAllowlist = $true
        memberInvocationsMatchAllowlist = $true
        redirections = 0
        workspaceBoundaryGuardRequired = $true
        commandMemberAndRedirectionSurfaceMatchesReviewedPin = $true
        collectorTerminalRequired = ($Name -eq 'probe')
    }
}

try {
    $result = [ordered]@{
        schema = 'p3-r5-ordinal3-hyperv-capability-static-regression/v1'
        mode = 'workspace-only-static-regression'
        status = 'passed-no-hyperv-or-p3-execution'
        files = [ordered]@{
            preflight = Get-ParsedFileEvidence -Name 'preflight' -Path $targets.preflight
            probe = Get-ParsedFileEvidence -Name 'probe' -Path $targets.probe
        }
        externalWritesPerformed = $false
        actualP3InputsOrRecordsRead = $false
        hyperVOrVmOperationPerformed = $false
        p3DeliveryOrLaunchPerformed = $false
        p11Changed = $false
        limitations = @(
            'This is a workspace-local reviewed-source check, not an independent trust anchor.',
            'It does not bind a later PowerShell process to these bytes or prove cmdlet provenance, runtime policy, or TOCTOU resistance.'
        )
    }
    $result | ConvertTo-Json -Depth 12
}
catch {
    [ordered]@{
        schema = 'p3-r5-ordinal3-hyperv-capability-static-regression/v1'
        mode = 'workspace-only-static-regression'
        status = 'failed-before-hyperv-or-p3-execution'
        reason = $_.Exception.Message
        externalWritesPerformed = $false
        actualP3InputsOrRecordsRead = $false
        hyperVOrVmOperationPerformed = $false
        p3DeliveryOrLaunchPerformed = $false
        p11Changed = $false
    } | ConvertTo-Json -Depth 8
    exit 1
}
