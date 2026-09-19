$files = git ls-files | Where-Object { $_ -like 'mdg-zip/*' }
foreach ($src in $files) {
    $dst = $src -replace '^mdg-zip/', ''
    $dir = Split-Path $dst -Parent
    if ($dir -and !(Test-Path $dir)) {
        New-Item -ItemType Directory -Path $dir -Force | Out-Null
    }
    git mv $src $dst
    Write-Host "Moved: $src -> $dst"
}
Write-Host "All done."
