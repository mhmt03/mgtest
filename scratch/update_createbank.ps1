$path = "Views\mgtest\CreateBank.cshtml"
$content = Get-Content -Path $path -Raw -Encoding utf8

$target = @"
                      <button class="btn btn-danger btn-sm" onclick="secilenleriSil()">
                          <i class="bi bi-trash"></i> Seilenleri Sil
                      </button>
"@

$replacement = @"
                      <button class="btn btn-danger btn-sm" onclick="secilenleriSil()">
                          <i class="bi bi-trash"></i> Seilenleri Sil
                      </button>
                      <button class="btn btn-warning btn-sm" onclick="secilenleriSepeteGonder()">
                          <i class="bi bi-cart-plus"></i> Seilenleri Sepete Gnder
                      </button>
"@

if ($content -like "*secilenleriSepeteGonder*") {
    Write-Host "Cart button already exists in CreateBank."
} else {
    # Let's handle character encoding issues with matching by trying regex or literal replace
    # We will replace based on secilenleriSil button
    $newContent = $content.Replace('onclick="secilenleriSil()">', 'onclick="secilenleriSil()">')
    
    # Let's do a direct replacement of the exact button block
    # Since there are Turkish characters like 'ş' 'ü' in Razor file, we will search for the specific lines
    $lines = $content -split "`r`n"
    $newLines = @()
    $found = $false
    for ($i = 0; $i -lt $lines.Length; $i++) {
        $newLines += $lines[$i]
        if ($lines[$i] -like "*onclick=`"secilenleriSil()`"*" -and -not $found) {
            # Check if the next line is </button>
            if ($lines[$i+1] -like "*Se*ilenleri Sil*") {
                $newLines += $lines[$i+1]
                $newLines += $lines[$i+2]
                $newLines += "                      <button class=`"btn btn-warning btn-sm`" onclick=`"secilenleriSepeteGonder()`">"
                $newLines += "                          <i class=`"bi bi-cart-plus`"></i> Se&ccedil;ilenleri Sepete G&ouml;nder"
                $newLines += "                      </button>"
                $i += 2
                $found = $true
            }
        }
    }
    
    if ($found) {
        $newContent = $newLines -join "`r`n"
        [System.IO.File]::WriteAllText((Resolve-Path $path), $newContent, [System.Text.Encoding]::UTF8)
        Write-Host "Success: CreateBank file updated successfully!"
    } else {
        Write-Host "Error: Could not find the target button in CreateBank.cshtml"
    }
}
