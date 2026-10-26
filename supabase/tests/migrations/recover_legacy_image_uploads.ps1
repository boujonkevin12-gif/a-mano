if ($PSVersionTable.PSVersion.Major -lt 7) {
  $pwshCandidates = [System.Collections.Generic.List[string]]::new()
  $pathPwsh = Get-Command pwsh.exe -ErrorAction SilentlyContinue
  if ($pathPwsh) { $pwshCandidates.Add($pathPwsh.Source) }
  if ($env:ProgramFiles) { $pwshCandidates.Add((Join-Path $env:ProgramFiles 'PowerShell\7\pwsh.exe')) }
  if ($env:LOCALAPPDATA) { $pwshCandidates.Add((Join-Path $env:LOCALAPPDATA 'Programs\PowerShell\7\pwsh.exe')) }
  if ($env:USERPROFILE) {
    $pwshCandidates.Add((Join-Path $env:USERPROFILE '.cache\codex-runtimes\codex-primary-runtime\dependencies\native\powershell\pwsh.exe'))
  }

  $compatiblePwsh = $null
  foreach ($candidate in @($pwshCandidates | Select-Object -Unique)) {
    if (-not (Test-Path -LiteralPath $candidate -PathType Leaf)) { continue }
    $versionText = (& $candidate -NoLogo -NoProfile -Command '$PSVersionTable.PSVersion.Major' 2>$null | Out-String).Trim()
    if ($LASTEXITCODE -eq 0 -and $versionText -match '^\d+$' -and [int]$versionText -ge 7) {
      $compatiblePwsh = $candidate
      break
    }
  }

  if (-not $compatiblePwsh) {
    throw 'Este runner requiere PowerShell 7 o superior. No se encontró un pwsh compatible; no se accedió a Docker.'
  }

  $ErrorActionPreference = 'Continue'
  & $compatiblePwsh -NoLogo -NoProfile -File $PSCommandPath
  $childExitCode = $LASTEXITCODE
  if ($null -eq $childExitCode) { $childExitCode = 1 }
  exit $childExitCode
}

$ErrorActionPreference = 'Stop'

$repoRoot = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..\..\..'))
$dockerPath = $null
$runId = [guid]::NewGuid().ToString('N')
$containerName = "a-mano-recovery-$runId"
$containerLabelKey = 'org.a-mano.migration-test.run-id'
$containerPurposeKey = 'org.a-mano.migration-test.purpose'
$containerPurpose = 'recover-legacy-image-uploads'
$containerLabelFilter = "label=$containerLabelKey=$runId"
$containerId = $null
$imageId = $null
$containerStartAttempted = $false
$containerOwnershipVerified = $false
$containerConfigVerified = $false
$cleanupConfirmed = $false
$tempParent = [System.IO.Path]::GetFullPath([System.IO.Path]::GetTempPath()).TrimEnd([System.IO.Path]::DirectorySeparatorChar) + [System.IO.Path]::DirectorySeparatorChar
$testRoot = Join-Path $tempParent "a-mano-recovery-$runId"
$diagnosticPath = Join-Path $PSScriptRoot "failure-$runId.json"
$migrationPath = Join-Path $repoRoot 'supabase\migrations\202610250002_recover_legacy_image_uploads.sql'
$history = [System.Collections.Generic.List[object]]::new()
$phase = 'preflight'
$failurePhase = $null
$failure = $null
$cleanupStatus = 'not-started'
$sqlPassed = $false

function Protect-DiagnosticText {
  param([AllowNull()][string] $Text)

  if ([string]::IsNullOrEmpty($Text)) { return '' }
  $safe = $Text
  $safe = [regex]::Replace($safe, '(?i)\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\b', '[REDACTED-JWT]')
  $safe = [regex]::Replace($safe, '(?i)\bsb_(?:secret|publishable)_[A-Za-z0-9_-]+\b', '[REDACTED-SUPABASE-KEY]')
  $safe = [regex]::Replace($safe, '(?i)(?:postgres(?:ql)?):\/\/[^\s"''<>]+', '[REDACTED-DB-URL]')
  $safe = [regex]::Replace($safe, '(?im)^.*(?:service.?role|anon|publishable|secret|password|token|jwt|api.?key).*$','[REDACTED-CREDENTIAL-LINE]')
  $safe = [regex]::Replace($safe, '(?<![A-Za-z0-9])[A-Za-z0-9_+/=-]{40,}(?![A-Za-z0-9])', '[REDACTED-OPAQUE-VALUE]')
  return $safe
}

function Invoke-CapturedProcess {
  param(
    [Parameter(Mandatory = $true)][string] $FileName,
    [Parameter(Mandatory = $true)][string[]] $Arguments,
    [Parameter(Mandatory = $true)][string] $WorkingDirectory,
    [AllowNull()][string] $StandardInputText
  )

  $hasStandardInput = $PSBoundParameters.ContainsKey('StandardInputText')
  $startInfo = [System.Diagnostics.ProcessStartInfo]::new()
  $startInfo.FileName = $FileName
  $startInfo.WorkingDirectory = $WorkingDirectory
  $startInfo.UseShellExecute = $false
  $startInfo.CreateNoWindow = $true
  $startInfo.RedirectStandardOutput = $true
  $startInfo.RedirectStandardError = $true
  $startInfo.RedirectStandardInput = $hasStandardInput
  foreach ($argument in $Arguments) { [void]$startInfo.ArgumentList.Add([string]$argument) }

  $process = [System.Diagnostics.Process]::new()
  $process.StartInfo = $startInfo
  if (-not $process.Start()) { throw "No se pudo iniciar el proceso: $FileName" }
  $stdoutTask = $process.StandardOutput.ReadToEndAsync()
  $stderrTask = $process.StandardError.ReadToEndAsync()
  if ($hasStandardInput) {
    $process.StandardInput.Write($StandardInputText)
    $process.StandardInput.Close()
  }
  $process.WaitForExit()

  [pscustomobject]@{
    ExitCode = $process.ExitCode
    Stdout = $stdoutTask.GetAwaiter().GetResult()
    Stderr = $stderrTask.GetAwaiter().GetResult()
  }
}

function Invoke-RecordedProcess {
  param(
    [Parameter(Mandatory = $true)][string] $Name,
    [Parameter(Mandatory = $true)][string] $FileName,
    [Parameter(Mandatory = $true)][string[]] $Arguments,
    [Parameter(Mandatory = $true)][string] $WorkingDirectory,
    [AllowNull()][string] $StandardInputText
  )

  $processArgs = @{
    FileName = $FileName
    Arguments = $Arguments
    WorkingDirectory = $WorkingDirectory
  }
  if ($PSBoundParameters.ContainsKey('StandardInputText')) {
    $processArgs.StandardInputText = $StandardInputText
  }
  $result = Invoke-CapturedProcess @processArgs
  $history.Add([pscustomobject]@{
    Phase = $script:phase
    Name = $Name
    Arguments = @($Arguments)
    ExitCode = $result.ExitCode
    Stdout = Protect-DiagnosticText $result.Stdout
    Stderr = Protect-DiagnosticText $result.Stderr
  })
  return $result
}

function Invoke-Docker {
  param(
    [Parameter(Mandatory = $true)][string[]] $DockerArgs,
    [AllowNull()][string] $StandardInputText
  )

  $processArgs = @{
    Name = 'docker'
    FileName = $script:dockerPath
    Arguments = $DockerArgs
    WorkingDirectory = $script:repoRoot
  }
  if ($PSBoundParameters.ContainsKey('StandardInputText')) {
    $processArgs.StandardInputText = $StandardInputText
  }
  Invoke-RecordedProcess @processArgs
}

function Get-RunContainerIds {
  $result = Invoke-Docker -DockerArgs @('ps', '-aq', '--no-trunc', '--filter', $script:containerLabelFilter)
  if ($result.ExitCode -ne 0) { throw 'No se pudieron consultar los contenedores con la etiqueta exacta del test.' }
  return @($result.Stdout -split '\r?\n' | Where-Object { $_ })
}

function Get-ContainerIdentity {
  param([Parameter(Mandatory = $true)][string] $Id)

  $format = '{{.Id}}~{{.Name}}~{{.Config.Image}}~{{.Image}}~{{.State.Status}}~{{index .Config.Labels "org.a-mano.migration-test.run-id"}}~{{index .Config.Labels "org.a-mano.migration-test.purpose"}}~{{.HostConfig.NetworkMode}}~{{json .HostConfig.PortBindings}}~{{json .HostConfig.Tmpfs}}~{{json .HostConfig.Binds}}~{{json .Mounts}}'
  $result = Invoke-Docker -DockerArgs @('inspect', '--type', 'container', '--format', $format, $Id)
  if ($result.ExitCode -ne 0) {
    return [pscustomobject]@{ OwnershipVerified = $false; ConfigVerified = $false; ExitCode = $result.ExitCode }
  }

  $fields = @($result.Stdout.Trim() -split '~', 12)
  if ($fields.Count -ne 12) {
    return [pscustomobject]@{ OwnershipVerified = $false; ConfigVerified = $false; ExitCode = 0 }
  }
  $ownershipVerified =
    ($fields[0] -ceq $Id) -and
    ($fields[1] -ceq "/$script:containerName") -and
    ($fields[5] -ceq $script:runId) -and
    ($fields[6] -ceq $script:containerPurpose)

  $configVerified = $false
  try {
    $tmpfs = $fields[9] | ConvertFrom-Json -ErrorAction Stop
    $tmpfsEntries = @($tmpfs.PSObject.Properties | Where-Object { $_.Name -ceq '/var/lib/postgresql/data' })
    $mounts = @($fields[11] | ConvertFrom-Json -ErrorAction Stop)
    $noPublishedPorts = $fields[8] -in @('null', '{}')
    $noBindMounts = $fields[10] -in @('null', '[]')
    $oneTmpfsMount = $mounts.Count -eq 1 -and
      $mounts[0].Type -ceq 'tmpfs' -and
      $mounts[0].Destination -ceq '/var/lib/postgresql/data'
    # Some Docker Engines (including the engine that produced the failure
    # diagnostic) expose tmpfs in HostConfig.Tmpfs but omit it from .Mounts.
    # Accept that representation only when there are no other reported mounts;
    # the caller separately verifies the effective mount from /proc/mounts.
    $mountsAreSafe = $mounts.Count -eq 0 -or $oneTmpfsMount
    $tmpfsOptionsValid = $tmpfsEntries.Count -eq 1 -and
      [string]$tmpfsEntries[0].Value -ceq 'rw,noexec,nosuid,size=512m'
    $configVerified =
      $ownershipVerified -and
      $fields[2] -ceq 'postgres:17' -and
      $fields[3] -ceq $script:imageId -and
      $fields[4] -ceq 'running' -and
      $fields[7] -ceq 'none' -and
      $noPublishedPorts -and
      $noBindMounts -and
      $mountsAreSafe -and
      $tmpfsOptionsValid
  } catch { $configVerified = $false }

  [pscustomobject]@{
    OwnershipVerified = $ownershipVerified
    ConfigVerified = $configVerified
    ExitCode = 0
  }
}

function Write-FailureDiagnostic {
  $record = [pscustomobject]@{
    TimestampUtc = [DateTime]::UtcNow.ToString('o')
    Failure = Protect-DiagnosticText ([string]$script:failure.Message)
    FailureType = [string]$script:failure.Type
    Phase = $script:failurePhase
    TemporaryDirectory = $script:testRoot
    MigrationFile = $script:migrationPath
    RunId = $script:runId
    ContainerName = $script:containerName
    ContainerId = $script:containerId
    RunLabel = "$script:containerLabelKey=$script:runId"
    Image = 'postgres:17'
    ImageId = $script:imageId
    ContainerStartAttempted = $script:containerStartAttempted
    ContainerOwnershipVerified = $script:containerOwnershipVerified
    ContainerConfigVerified = $script:containerConfigVerified
    SqlPassed = $script:sqlPassed
    CleanupStatus = $script:cleanupStatus
    Processes = @($script:history)
  }
  $json = $record | ConvertTo-Json -Depth 7
  [System.IO.File]::WriteAllText($script:diagnosticPath, $json, [System.Text.UTF8Encoding]::new($false))
}

$setupSql = @'
begin;
create schema private;
create table public.professionals (
  id uuid primary key
);
insert into public.professionals (id) values
  ('77000000-0000-4000-8000-000000000001'),
  ('77000000-0000-4000-8000-000000000002'),
  ('77000000-0000-4000-8000-000000000003');

-- This is the relevant pre-backfill schema: the private image table from
-- 202610240005 plus upload_path introduced by 202610250001.
create table private.professional_images (
  id uuid primary key,
  professional_id uuid not null references public.professionals(id) on delete restrict,
  object_path text not null unique,
  upload_path text unique,
  image_kind text not null check (image_kind in ('profile', 'portfolio')),
  mime_type text not null check (mime_type in ('image/jpeg', 'image/png', 'image/webp')),
  extension text not null check (extension in ('jpg', 'png', 'webp')),
  size_bytes integer not null check (size_bytes between 1 and 5242880),
  width integer not null check (width between 1 and 10000),
  height integer not null check (height between 1 and 10000),
  state text not null default 'uploading' check (state in ('uploading', 'ready', 'deleting', 'cleanup_pending')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (width::bigint * height::bigint <= 20000000),
  check (
    (mime_type = 'image/jpeg' and extension = 'jpg') or
    (mime_type = 'image/png' and extension = 'png') or
    (mime_type = 'image/webp' and extension = 'webp')
  )
);
create unique index professional_images_one_profile_idx
  on private.professional_images(professional_id) where image_kind = 'profile';

insert into private.professional_images (
  id, professional_id, object_path, upload_path, image_kind, mime_type,
  extension, size_bytes, width, height, state, created_at, updated_at
) values
  (
    '78000000-0000-4000-8000-000000000001',
    '77000000-0000-4000-8000-000000000001',
    'professionals/77000000-0000-4000-8000-000000000001/78000000-0000-4000-8000-000000000001.jpg',
    null, 'profile', 'image/jpeg', 'jpg', 1234, 100, 100, 'uploading',
    '2000-01-01 00:00:00+00', '2000-01-01 00:00:00+00'
  ),
  (
    '78000000-0000-4000-8000-000000000002',
    '77000000-0000-4000-8000-000000000002',
    'professionals/77000000-0000-4000-8000-000000000002/78000000-0000-4000-8000-000000000002.jpg',
    'uploading/77000000-0000-4000-8000-000000000002.jpg',
    'profile', 'image/jpeg', 'jpg', 1234, 100, 100, 'uploading',
    '2000-01-01 00:00:00+00', '2000-01-01 00:00:00+00'
  ),
  (
    '78000000-0000-4000-8000-000000000003',
    '77000000-0000-4000-8000-000000000003',
    'professionals/77000000-0000-4000-8000-000000000003/78000000-0000-4000-8000-000000000003.jpg',
    null, 'profile', 'image/jpeg', 'jpg', 1234, 100, 100, 'ready',
    '2000-01-01 00:00:00+00', '2000-01-01 00:00:00+00'
  );
commit;
'@

$assertionSql = @'
do $$
begin
  if (select count(*) from private.professional_images) <> 3 then
    raise exception 'fixture row count changed';
  end if;

  if not exists (
    select 1 from private.professional_images
    where id = '78000000-0000-4000-8000-000000000001'
      and state = 'uploading'
      and upload_path = object_path
      and updated_at > '2000-01-01 00:00:00+00'::timestamptz
  ) then
    raise exception 'legacy uploading row was not recovered from object_path';
  end if;

  if not exists (
    select 1 from private.professional_images
    where id = '78000000-0000-4000-8000-000000000002'
      and state = 'uploading'
      and upload_path = 'uploading/77000000-0000-4000-8000-000000000002.jpg'
      and updated_at = '2000-01-01 00:00:00+00'::timestamptz
  ) then
    raise exception 'existing upload_path was overwritten or its row was modified';
  end if;

  if not exists (
    select 1 from private.professional_images
    where id = '78000000-0000-4000-8000-000000000003'
      and state = 'ready'
      and upload_path is null
      and updated_at = '2000-01-01 00:00:00+00'::timestamptz
  ) then
    raise exception 'non-uploading row was modified';
  end if;
end;
$$;
select 'RECOVERY_MIGRATION_ASSERTIONS_OK';
'@

try {
  if ($PSVersionTable.PSVersion.Major -lt 7) { throw 'El relanzamiento a PowerShell 7 no se completó.' }
  $phase = 'preflight'
  $dockerPath = (Get-Command docker.exe -ErrorAction Stop).Source
  if (-not (Test-Path -LiteralPath $migrationPath -PathType Leaf)) {
    throw 'No se encontró la migración real 202610250002_recover_legacy_image_uploads.sql.'
  }
  if (Test-Path -LiteralPath $testRoot) {
    throw 'El directorio temporal único ya existe; no se sobrescribirá.'
  }

  $imageResult = Invoke-Docker -DockerArgs @('image', 'inspect', '--format', '{{.Id}}', 'postgres:17')
  if ($imageResult.ExitCode -ne 0 -or $imageResult.Stdout.Trim() -notmatch '^sha256:[0-9a-f]{64}$') {
    throw 'La imagen local postgres:17 no está disponible; no se descargó ninguna imagen.'
  }
  $imageId = $imageResult.Stdout.Trim()

  $phase = 'preflight-run-label'
  $existingRunIds = @(Get-RunContainerIds)
  if ($existingRunIds.Count -ne 0) {
    throw 'Ya existe un contenedor con la etiqueta aleatoria de esta ejecución; no se reutilizará.'
  }

  $migrationSql = [System.IO.File]::ReadAllText($migrationPath)
  $fullTestSql = $setupSql + "`r`n" + $migrationSql + "`r`n" + $assertionSql
  New-Item -ItemType Directory -Path $testRoot | Out-Null
  $sqlPath = Join-Path $testRoot 'recover_legacy_image_uploads.sql'
  [System.IO.File]::WriteAllText($sqlPath, $fullTestSql, [System.Text.UTF8Encoding]::new($false))

  $phase = 'postgres-container-start'
  $containerStartAttempted = $true
  $tmpfsSpec = '/var/lib/postgresql/data:rw,noexec,nosuid,size=512m'
  $runResult = Invoke-Docker -DockerArgs @(
    'run', '--detach', '--rm', '--pull=never',
    '--name', $containerName,
    '--label', "$containerLabelKey=$runId",
    '--label', "$containerPurposeKey=$containerPurpose",
    '--network', 'none',
    '--tmpfs', $tmpfsSpec,
    '--env', 'POSTGRES_HOST_AUTH_METHOD=trust',
    'postgres:17', 'postgres', '-c', 'listen_addresses='
  )
  if ($runResult.ExitCode -ne 0) { throw "No se pudo iniciar el contenedor local (código $($runResult.ExitCode))." }
  $containerId = $runResult.Stdout.Trim()
  if ($containerId -notmatch '^[0-9a-f]{64}$') { throw 'Docker no devolvió un ID completo y válido para el contenedor.' }

  $phase = 'verify-container-before-sql'
  $identity = Get-ContainerIdentity -Id $containerId
  $containerOwnershipVerified = $identity.OwnershipVerified
  $containerConfigVerified = $identity.ConfigVerified
  if (-not $containerOwnershipVerified -or -not $containerConfigVerified) {
    throw 'La identidad o configuración del contenedor no coincide exactamente; no se ejecutará SQL.'
  }

  $phase = 'postgres-ready'
  $waitScript = 'n=0; until pg_isready -h /var/run/postgresql -U postgres -d postgres >/dev/null 2>&1; do n=$((n+1)); if [ "$n" -ge 60 ]; then echo "PostgreSQL readiness timeout" >&2; exit 1; fi; sleep 1; done; echo "PostgreSQL ready"'
  $readyResult = Invoke-Docker -DockerArgs @('exec', $containerId, 'sh', '-c', $waitScript)
  if ($readyResult.ExitCode -ne 0) { throw 'PostgreSQL no quedó listo dentro del contenedor temporal.' }

  $phase = 'verify-tmpfs-before-sql'
  $tmpfsRuntimeCheck = 'awk ''$2 == "/var/lib/postgresql/data" && $3 == "tmpfs" { found++ } END { exit (found == 1 ? 0 : 1) }'' /proc/mounts'
  $tmpfsResult = Invoke-Docker -DockerArgs @('exec', $containerId, 'sh', '-c', $tmpfsRuntimeCheck)
  if ($tmpfsResult.ExitCode -ne 0) { throw 'PGDATA no está montado exactamente una vez como tmpfs; no se ejecutará SQL.' }

  $phase = 'verify-container-before-sql'
  $identity = Get-ContainerIdentity -Id $containerId
  $containerOwnershipVerified = $identity.OwnershipVerified
  $containerConfigVerified = $identity.ConfigVerified
  if (-not $containerOwnershipVerified -or -not $containerConfigVerified) {
    throw 'La identidad o configuración cambió antes de SQL; no se ejecutó la prueba.'
  }

  $phase = 'migration-and-assertions'
  $sqlResult = Invoke-Docker -DockerArgs @(
    'exec', '-i', $containerId,
    'psql', '-X', '-v', 'ON_ERROR_STOP=1', '-U', 'postgres', '-d', 'postgres'
  ) -StandardInputText $fullTestSql
  if ($sqlResult.ExitCode -ne 0) { throw "La migración o sus aserciones SQL fallaron (código $($sqlResult.ExitCode))." }
  if ($sqlResult.Stdout -notmatch 'RECOVERY_MIGRATION_ASSERTIONS_OK') {
    throw 'psql terminó sin emitir el marcador de aserciones satisfactorias.'
  }
  $sqlPassed = $true
  Write-Output (Protect-DiagnosticText $sqlResult.Stdout.TrimEnd())
} catch {
  $failurePhase = $phase
  $failure = [pscustomobject]@{
    Type = $_.Exception.GetType().FullName
    Message = Protect-DiagnosticText ([string]$_.Exception.Message)
  }
} finally {
  if ($containerStartAttempted) {
    try {
      $phase = 'cleanup-verify-container'
      $matchingIds = @(Get-RunContainerIds)
      if ($matchingIds.Count -gt 1) {
        throw 'Hay varios contenedores con la etiqueta de esta ejecución; no se limpiará ninguno.'
      }
      if (-not $containerId) {
        if ($matchingIds.Count -eq 1) { $containerId = $matchingIds[0] }
      }

      if ($containerId) {
        if ($matchingIds.Count -eq 0) {
          $identity = Get-ContainerIdentity -Id $containerId
          if ($identity.ExitCode -eq 0) {
            throw 'El contenedor existe pero ya no aparece con la etiqueta exacta; no se tocará.'
          }
          $containerId = $null
          $cleanupStatus = 'container-auto-removed'
        } elseif ($matchingIds[0] -cne $containerId) {
          throw 'La etiqueta ya no identifica un único contenedor creado por esta ejecución.'
        } else {
          $identity = Get-ContainerIdentity -Id $containerId
          $containerOwnershipVerified = $identity.OwnershipVerified
          if (-not $containerOwnershipVerified) {
            throw 'No se confirmó la etiqueta, el nombre y el ID del contenedor; se conserva para inspección.'
          }
          $stopResult = Invoke-Docker -DockerArgs @('stop', '--time', '10', $containerId)
          if ($stopResult.ExitCode -ne 0) {
            $afterStopIds = @(Get-RunContainerIds)
            if ($afterStopIds.Count -ne 0) { throw "No se pudo detener el contenedor exacto (código $($stopResult.ExitCode))." }
          }
        }

        $remainingIds = @(Get-RunContainerIds)
        if ($remainingIds.Count -ne 0) {
          if ($remainingIds.Count -ne 1 -or $remainingIds[0] -cne $containerId) {
            throw 'Quedó un contenedor con la etiqueta de esta ejecución, pero su identidad es ambigua.'
          }
          $identity = Get-ContainerIdentity -Id $containerId
          if (-not $identity.OwnershipVerified) { throw 'No se verificó la identidad antes de retirar el contenedor detenido.' }
          $removeResult = Invoke-Docker -DockerArgs @('rm', $containerId)
          if ($removeResult.ExitCode -ne 0) { throw "No se pudo retirar el contenedor exacto (código $($removeResult.ExitCode))." }
        }
      } else {
        $cleanupStatus = 'container-not-created-or-already-removed'
      }

      if (@(Get-RunContainerIds).Count -ne 0) { throw 'El contenedor de esta ejecución todavía aparece después de la limpieza.' }
      $cleanupConfirmed = $true
      if ($cleanupStatus -eq 'not-started') {
        $cleanupStatus = 'container-removed-and-verified'
      }
    } catch {
      $cleanupStatus = 'cleanup-unconfirmed; container-and-diagnostics-preserved'
      if (-not $failure) {
        $failurePhase = $phase
        $failure = [pscustomobject]@{
          Type = $_.Exception.GetType().FullName
          Message = Protect-DiagnosticText ([string]$_.Exception.Message)
        }
      }
    }
  } elseif (-not $failure) {
    $cleanupConfirmed = $true
    $cleanupStatus = 'container-not-created'
  }

  if ($failure) {
    try { Write-FailureDiagnostic } catch {
      Write-Warning 'No se pudo escribir el diagnóstico; se conserva el directorio temporal.'
      $cleanupConfirmed = $false
    }
  }

  $expectedTestRoot = [System.IO.Path]::GetFullPath((Join-Path $tempParent "a-mano-recovery-$runId"))
  $resolvedTestRoot = [System.IO.Path]::GetFullPath($testRoot)
  $testRootIsExactRunPath = $resolvedTestRoot.Equals($expectedTestRoot, [System.StringComparison]::OrdinalIgnoreCase) -and
    $resolvedTestRoot.StartsWith($tempParent, [System.StringComparison]::OrdinalIgnoreCase)
  if ($cleanupConfirmed -and -not $failure -and $testRootIsExactRunPath) {
    Remove-Item -LiteralPath $resolvedTestRoot -Recurse -Force -ErrorAction SilentlyContinue
  } elseif (Test-Path -LiteralPath $testRoot) {
    Write-Warning "Se conserva el directorio temporal: $testRoot"
    if ($failure -and -not (Test-Path -LiteralPath $diagnosticPath)) {
      Write-Warning 'El diagnóstico no quedó disponible; conservá el directorio para inspección.'
    }
  }
}

if ($failure) {
  throw "Falló el runner en la fase '$phase'. Diagnóstico: $diagnosticPath. Contenedor: name='$containerName', id='$containerId', run_id='$runId'. Limpieza: $cleanupStatus."
}
Write-Output "Migración 202610250002 verificada; contenedor '$containerName' eliminado y no se usó Supabase CLI."
