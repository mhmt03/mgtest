$path = "wwwroot\js\soru-bankasi.js"
$lines = Get-Content -Path $path -Encoding utf8

$fixed = @()
foreach ($line in $lines) {
    if ($line -like '*let msg = ${eklenenSayac} soru sepete g*') {
        $fixed += "            let msg = ``${eklenenSayac} soru sepete gönderildi.``;"
    } elseif ($line -like '*msg +=  ( adet soru zaten sepette*') {
        $fixed += "                msg += `` (${ciftSayac} adet soru zaten sepette olduğu için eklenmedi)``;"
    } else {
        $fixed += $line
    }
}

[System.IO.File]::WriteAllLines((Resolve-Path $path), $fixed, [System.Text.Encoding]::UTF8)
Write-Host "Done fixing template literals."
