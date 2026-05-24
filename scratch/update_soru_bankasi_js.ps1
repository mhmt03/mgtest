$path = "wwwroot\js\soru-bankasi.js"
$content = Get-Content -Path $path -Raw -Encoding utf8

$toAdd = @"

// ============================================
// SEPETE SORU GÖNDERME FONKSİYONU
// ============================================

async function secilenleriSepeteGonder() {
    const checkboxes = document.querySelectorAll('.soru-sec:checked');
    if (checkboxes.length === 0) {
        showNotification('Lütfen önce soru seçiniz!', 'warning');
        return;
    }

    let sepetSorular = [];
    try {
        const raw = localStorage.getItem('sepetSorular');
        if (raw) {
            sepetSorular = JSON.parse(raw);
            if (!Array.isArray(sepetSorular)) sepetSorular = [];
        }
    } catch (e) {
        console.error('Sepet okunurken hata oluştu:', e);
        sepetSorular = [];
    }

    let eklenenSayac = 0;
    let ciftSayac = 0;

    checkboxes.forEach(cb => {
        const idx = parseInt(cb.getAttribute('data-index'));
        if (isNaN(idx) || idx < 0 || idx >= sorular.length) return;
        
        const soru = sorular[idx];

        const zatenVar = sepetSorular.some(s => {
            if (soru.soruResmi && s.soruResmi) {
                return soru.soruResmi === s.soruResmi;
            }
            if (soru.soruMetni && s.soruMetni) {
                return soru.soruMetni === s.soruMetni;
            }
            return false;
        });

        if (zatenVar) {
            ciftSayac++;
            return;
        }

        const yeniSoru = JSON.parse(JSON.stringify(soru));
        yeniSoru.sepetId = 'sepet_' + Math.random().toString(36).substr(2, 9) + '_' + Date.now();
        sepetSorular.push(yeniSoru);
        eklenenSayac++;
    });

    try {
        localStorage.setItem('sepetSorular', JSON.stringify(sepetSorular));
        window.dispatchEvent(new Event('updateCartBadge'));

        if (eklenenSayac > 0) {
            let msg = `${eklenenSayac} soru sepete gönderildi.`;
            if (ciftSayac > 0) {
                msg += ` (${ciftSayac} adet soru zaten sepette olduğu için eklenmedi)`;
            }
            showNotification(msg, 'success');
        } else {
            showNotification('Seçilen tüm sorular zaten sepette mevcut!', 'info');
        }
    } catch (e) {
        console.error('Sepete kaydederken hata oluştu:', e);
        showNotification('Sepete kaydedilirken hata oluştu!', 'error');
    }
}

window.secilenleriSepeteGonder = secilenleriSepeteGonder;
"@

if ($content -like "*secilenleriSepeteGonder*") {
    Write-Host "secilenleriSepeteGonder already exists in soru-bankasi.js"
} else {
    $newContent = $content + "`r`n" + $toAdd + "`r`n"
    [System.IO.File]::WriteAllText((Resolve-Path $path), $newContent, [System.Text.Encoding]::UTF8)
    Write-Host "Success: soru-bankasi.js updated successfully!"
}
