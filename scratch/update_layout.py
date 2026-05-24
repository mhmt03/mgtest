# -*- coding: utf-8 -*-
import os

layout_path = r"Views/Shared/_Layout.cshtml"

if not os.path.exists(layout_path):
    print("Error: Layout file not found!")
    exit(1)

with open(layout_path, "r", encoding="utf-8") as f:
    content = f.read()

to_add = """    <!-- Yüzen Sepet Butonu -->
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
</body>"""

if "yuzenSepetBtn" in content:
    print("Floating cart button already exists in Layout.")
else:
    new_content = content.replace("</body>", to_add)
    with open(layout_path, "w", encoding="utf-8") as f:
        f.write(new_content)
    print("Success: Layout file updated successfully!")
