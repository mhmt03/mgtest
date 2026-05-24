$path = "Views\Shared\_Layout.cshtml"
$content = Get-Content -Path $path -Raw -Encoding utf8

$toAdd = @"
    <!-- Yüzen Sepet Butonu -->
    <a href="/mgtest/Cart" id="yuzenSepetBtn" class="yuzen-sepet shadow-lg" style="position: fixed; bottom: 30px; right: 30px; z-index: 9999; width: 60px; height: 60px; border-radius: 50%; background: linear-gradient(135deg, #764ba2 0%, #667eea 100%); display: flex; align-items: center; justify-content: center; text-decoration: none; transition: transform 0.3s ease, box-shadow 0.3s ease; box-shadow: 0 10px 20px rgba(0,0,0,0.19), 0 6px 6px rgba(0,0,0,0.23);">
        <i class="bi bi-cart-fill text-white fs-3"></i>
        <span id="yuzenSepetBadge" class="position-absolute top-0 start-100 translate-middle badge rounded-pill bg-danger" style="display: none; font-size: 0.8rem; padding: 0.35em 0.65em;">0</span>
    </a>

    <style>
        .yuzen-sepet:hover {
            transform: scale(1.1);
            box-shadow: 0 14px 28px rgba(0,0,0,0.25), 0 10px 10px rgba(0,0,0,0.22);
        }
    </style>

    <script>
        function guncelleYuzenSepetBadge() {
            try {
                const sepetSorularRaw = localStorage.getItem("sepetSorular");
                const badge = document.getElementById("yuzenSepetBadge");
                if (badge) {
                    if (sepetSorularRaw) {
                        const sepetSorular = JSON.parse(sepetSorularRaw);
                        if (Array.isArray(sepetSorular) && sepetSorular.length > 0) {
                            badge.textContent = sepetSorular.length;
                            badge.style.display = "block";
                            return;
                        }
                    }
                    badge.style.display = "none";
                }
            } catch (e) {
                console.error("Sepet badge güncelleme hatası:", e);
            }
        }
        document.addEventListener("DOMContentLoaded", guncelleYuzenSepetBadge);
        window.addEventListener("storage", guncelleYuzenSepetBadge);
        window.addEventListener("updateCartBadge", guncelleYuzenSepetBadge);
    </script>
</body>
"@

if ($content -like "*yuzenSepetBtn*") {
    Write-Host "Floating cart button already exists in Layout."
} else {
    $newContent = $content -replace "</body>", $toAdd
    [System.IO.File]::WriteAllText((Resolve-Path $path), $newContent, [System.Text.Encoding]::UTF8)
    Write-Host "Success: Layout file updated successfully!"
}
