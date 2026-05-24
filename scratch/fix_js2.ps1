$path = "wwwroot\js\soru-bankasi.js"
$content = Get-Content -Path $path -Raw -Encoding utf8

# Fix line with msg using single-quote to avoid PS variable expansion
$broken1 = "            let msg = `` soru sepete g" + [char]246 + "nderildi.``;"
$fix1 = '            let msg = `' + '${eklenenSayac}' + ' soru sepete g' + [char]246 + 'nderildi.`;'

$broken2 = "                msg += `` ( adet soru zaten sepette oldu" + [char]351 + "u i" + [char]231 + "in eklenmedi)``;"
$fix2 = '                msg += ` (' + '${ciftSayac}' + ' adet soru zaten sepette oldu' + [char]351 + 'u i' + [char]231 + 'in eklenmedi)`;'

Write-Host "Searching for broken1..."
if ($content.Contains("soru sepete")) {
    Write-Host "Found 'soru sepete' in content"
} else {
    Write-Host "NOT found"
}

# Use regex replace to target these lines regardless of Turkish chars
$content = $content -replace '            let msg = `[^`]*soru sepete g[^`]*`;', $fix1
$content = $content -replace '                msg \+= `[^`]*adet soru zaten sepette[^`]*`;', $fix2

[System.IO.File]::WriteAllText((Resolve-Path $path), $content, [System.Text.Encoding]::UTF8)
Write-Host "Done!"
