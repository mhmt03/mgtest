function getLocalKey(key) {
    const userId = window.currentUserId || 'guest';
    return key + '_' + userId;
}

// ============================================
// SEPET SAYFASI - sepet.js
// ============================================

let sepetSorular = [];
let sortableInstance = null;

// ============================================
// SAYFA YÜKLENINCE
// ============================================
document.addEventListener('DOMContentLoaded', function () {
    loadSepet();
    document.getElementById('sepetTemizleBtn')?.addEventListener('click', sepetTemizle);
    document.getElementById('bankayiKaydetBtn')?.addEventListener('click', bankayiKaydet);
});

// ============================================
// SEPET YÜKLENMESİ
// ============================================
function loadSepet() {
    try {
        const raw = localStorage.getItem(getLocalKey('sepetSorular'));
        if (raw) {
            const parsed = JSON.parse(raw);
            if (Array.isArray(parsed)) {
                sepetSorular = parsed;
            }
        }
    } catch (e) {
        console.error('Sepet yüklenirken hata:', e);
        sepetSorular = [];
    }
    renderSepet();
    guncelleBaslikSayac();
}

// ============================================
// SEPET RENDER
// ============================================
function renderSepet() {
    const container = document.getElementById('sepetSoruListesi');
    if (!container) return;

    if (sepetSorular.length === 0) {
        container.innerHTML = `
            <div class="alert alert-info text-center py-5" style="border-radius: 16px;">
                <i class="bi bi-cart-x fs-1 d-block mb-3"></i>
                <h5>Sepetiniz Boş</h5>
                <p class="mb-3 text-muted">CreateBank sayfasında soruları seçip "Sepete Gönder" butonuna basarak buraya soru ekleyebilirsiniz.</p>
                <a href="/mgtest/CreateBank" class="btn btn-primary">
                    <i class="bi bi-journal-plus"></i> Yeni Banka Oluştur
                </a>
                &nbsp;
                <a href="/mgtest/Index" class="btn btn-outline-secondary">
                    <i class="bi bi-house"></i> Anasayfa
                </a>
            </div>`;
        document.getElementById('kartAltBar')?.classList.add('d-none');
        return;
    }

    document.getElementById('kartAltBar')?.classList.remove('d-none');

    let html = '<div class="row g-4" id="sepet-sortable">';
    sepetSorular.forEach((soru, i) => {
        const ders = (soru.dersAdi && soru.dersAdi !== 'undefined') ? soru.dersAdi : '';
        const konu = (soru.konuAdi && soru.konuAdi !== 'undefined') ? soru.konuAdi : '';
        const kazanim = (soru.kazanimAdi && soru.kazanimAdi !== 'undefined') ? soru.kazanimAdi : '';

        html += `
        <div class="col-12 col-xl-6 mb-2" data-sepet-id="${soru.sepetId || i}" data-index="${i}">
            <div class="card shadow-sm h-100 border-start border-warning border-4 sepet-card">
                <div class="card-body p-3">
                    <!-- HEADER -->
                    <div class="d-flex justify-content-between align-items-center mb-3 border-bottom pb-2">
                        <div class="d-flex align-items-center gap-2">
                            <span class="drag-handle btn btn-sm btn-outline-secondary py-0" style="cursor:move" title="Sürükle-Bırak">
                                <i class="bi bi-grip-vertical fs-5"></i>
                            </span>
                            <span class="fw-bold text-warning"># ${i + 1}</span>
                            <span class="badge bg-success ms-1">Cevap: ${soru.dogruSik || 'A'}</span>
                        </div>
                        <button class="btn btn-sm btn-outline-danger" onclick="sepettenSil(${i})" title="Sepetten Çıkar">
                            <i class="bi bi-trash"></i>
                        </button>
                    </div>

                    <!-- İÇERİK -->
                    <div class="question-body">
                        ${soru.soruResmi ? `
                        <div class="text-center mb-3">
                            <img src="${soru.soruResmi}" class="img-fluid rounded" style="max-height:350px;">
                        </div>` : ''}

                        ${soru.soruMetniAyriMi && soru.soruMetni ? `
                        <div class="alert alert-light border p-2 mb-2" style="font-size:0.95rem">
                            <div class="text-break">${soru.soruMetni}</div>
                        </div>` : ''}

                        ${soru.sikkarAyriMi ? `
                        <div class="py-2 px-1 mb-3" style="font-size:0.9rem">
                            <ul class="list-unstyled mb-0">
                                ${['A','B','C','D','E'].map(h => {
                                    if (!soru.siklar || !soru.siklar[h]) return '';
                                    const isCorrect = soru.dogruSik === h;
                                    return `<li class="mb-1 d-flex align-items-center p-1 rounded ${isCorrect ? 'bg-success bg-opacity-10' : ''}">
                                        <span class="badge ${isCorrect ? 'bg-success' : 'bg-light text-dark border'} me-2" style="width:25px">${h}</span>
                                        <span class="${isCorrect ? 'fw-bold text-success' : ''}">${soru.siklar[h]}</span>
                                        ${isCorrect ? '<i class="bi bi-check-circle-fill ms-auto text-success"></i>' : ''}
                                    </li>`;
                                }).join('')}
                            </ul>
                        </div>` : ''}

                        <div class="mt-2 pt-2 border-top d-flex flex-wrap gap-1">
                            ${ders ? `<span class="badge bg-info-subtle text-info border border-info-subtle">${ders}</span>` : ''}
                            ${konu ? `<span class="badge bg-secondary-subtle text-secondary border border-secondary-subtle">${konu}</span>` : ''}
                            ${kazanim ? `<span class="badge bg-light text-dark border">${kazanim}</span>` : ''}
                        </div>
                    </div>
                </div>
            </div>
        </div>`;
    });
    html += '</div>';
    container.innerHTML = html;

    initSortable();
    guncelleBaslikSayac();
}

// ============================================
// SORTABLE (SÜRÜKLE-BIRAK)
// ============================================
function initSortable() {
    const el = document.getElementById('sepet-sortable');
    if (!el || typeof Sortable === 'undefined') return;

    if (sortableInstance) {
        sortableInstance.destroy();
    }

    sortableInstance = Sortable.create(el, {
        handle: '.drag-handle',
        animation: 150,
        ghostClass: 'sortable-ghost',
        onEnd: function () {
            // Yeni sırayı hesapla
            const newOrder = [];
            el.querySelectorAll('[data-index]').forEach(item => {
                const idx = parseInt(item.getAttribute('data-index'));
                if (!isNaN(idx) && idx >= 0 && idx < sepetSorular.length) {
                    newOrder.push(sepetSorular[idx]);
                }
            });
            sepetSorular = newOrder;
            localStorage.setItem(getLocalKey('sepetSorular'), JSON.stringify(sepetSorular));
            window.dispatchEvent(new Event('updateCartBadge'));
            renderSepet();
        }
    });
}

// ============================================
// SEPETTEN SİL
// ============================================
function sepettenSil(index) {
    if (index < 0 || index >= sepetSorular.length) return;
    sepetSorular.splice(index, 1);
    localStorage.setItem(getLocalKey('sepetSorular'), JSON.stringify(sepetSorular));
    window.dispatchEvent(new Event('updateCartBadge'));
    renderSepet();
    showSepetNotification(`Soru sepetten çıkarıldı. (${sepetSorular.length} soru kaldı)`, 'info');
}

// ============================================
// SEPETİ TEMİZLE
// ============================================
function sepetTemizle() {
    if (sepetSorular.length === 0) {
        showSepetNotification('Sepet zaten boş!', 'info');
        return;
    }

    if (!confirm(`Sepetteki tüm ${sepetSorular.length} soruyu silmek istediğinizden emin misiniz? Bu işlem geri alınamaz.`)) {
        return;
    }

    sepetSorular = [];
    localStorage.removeItem(getLocalKey('sepetSorular'));
    window.dispatchEvent(new Event('updateCartBadge'));
    renderSepet();
    showSepetNotification('Sepet temizlendi!', 'success');
}

// ============================================
// BANKA ADI GÜNCELLE
// ============================================
function guncelleBaslikSayac() {
    const el = document.getElementById('sepetSoruSayac');
    if (el) el.textContent = sepetSorular.length;
}

// ============================================
// BANKAY KAYDET
// ============================================
async function bankayiKaydet() {
    const bankaAdi = document.getElementById('sepetBankaAdi')?.value.trim();

    if (!bankaAdi) {
        showSepetNotification('Lütfen banka adı giriniz!', 'warning');
        document.getElementById('sepetBankaAdi')?.focus();
        return;
    }

    if (sepetSorular.length === 0) {
        showSepetNotification('Sepette kayıt edilecek soru yok!', 'warning');
        return;
    }

    const btn = document.getElementById('bankayiKaydetBtn');
    const originalText = btn.innerHTML;
    btn.disabled = true;
    btn.innerHTML = '<span class="spinner-border spinner-border-sm me-2"></span>Kaydediliyor...';

    try {
        const payload = { BankaAdi: bankaAdi, Sorular: sepetSorular };

        const response = await fetch('/mgtest/SaveBank', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'RequestVerificationToken': ''
            },
            body: JSON.stringify(payload)
        });

        if (response.ok) {
            const result = await response.json();
            if (result.success) {
                showSepetNotification('Banka kaydedildi! İndirme başlıyor...', 'success');

                const downloadUrl = `/mgtest/Download?dosyaId=${result.dosyaId}`;
                const downloadLink = document.createElement('a');
                downloadLink.href = downloadUrl;
                downloadLink.download = `${bankaAdi}.mg`;
                downloadLink.target = '_blank';
                document.body.appendChild(downloadLink);
                downloadLink.click();
                document.body.removeChild(downloadLink);

                setTimeout(() => {
                    if (confirm('Dosya indirildi. Sepeti temizlemek ister misiniz?')) {
                        sepetSorular = [];
                        localStorage.removeItem(getLocalKey('sepetSorular'));
                        window.dispatchEvent(new Event('updateCartBadge'));
                        renderSepet();
                    }
                }, 1500);
            } else {
                showSepetNotification(result.message || 'Kaydetme başarısız!', 'error');
            }
        } else {
            throw new Error('Sunucu hatası: ' + response.statusText);
        }
    } catch (error) {
        console.error('Kaydetme hatası:', error);
        showSepetNotification('Kaydetme sırasında hata oluştu: ' + error.message, 'error');
    } finally {
        btn.disabled = false;
        btn.innerHTML = originalText;
    }
}

// ============================================
// BİLDİRİM FONKSİYONU
// ============================================
function showSepetNotification(message, type = 'info') {
    const colors = {
        success: '#28a745',
        error: '#dc3545',
        warning: '#ffc107',
        info: '#17a2b8'
    };

    const notification = document.createElement('div');
    notification.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        z-index: 99999;
        padding: 14px 22px;
        background: ${colors[type] || colors.info};
        color: white;
        border-radius: 10px;
        box-shadow: 0 8px 24px rgba(0,0,0,0.2);
        font-weight: 500;
        font-size: 0.95rem;
        max-width: 360px;
        animation: slideInRight 0.3s ease;
    `;
    notification.textContent = message;

    if (!document.querySelector('#sepet-notif-style')) {
        const style = document.createElement('style');
        style.id = 'sepet-notif-style';
        style.textContent = '@keyframes slideInRight { from { transform: translateX(100%); opacity: 0; } to { transform: translateX(0); opacity: 1; } }';
        document.head.appendChild(style);
    }

    document.body.appendChild(notification);
    setTimeout(() => {
        notification.style.transition = 'opacity 0.3s';
        notification.style.opacity = '0';
        setTimeout(() => notification.remove(), 300);
    }, 3000);
}

window.sepettenSil = sepettenSil;
window.sepetTemizle = sepetTemizle;
window.bankayiKaydet = bankayiKaydet;

// ============================================
// SEPETİ DIŞA AKTAR (PDF/DOCX)
// ============================================
async function exportCart(type) {
    if (sepetSorular.length === 0) {
        showSepetNotification('Sepette dışa aktarılacak soru yok!', 'warning');
        return;
    }

    const btnId = type === 'pdf' ? 'exportPdfBtn' : 'exportDocxBtn';
    const btn = document.getElementById(btnId);
    let originalText = '';

    const sutunSayisi = document.getElementById('sepetSutunSayisi')?.value || 2;
    const testBasligi = document.getElementById('sepetTestBasligi')?.value || '';
    const anahtarEkle = document.getElementById('sepetAnahtarEkle')?.checked ?? true;

    if (btn) {
        originalText = btn.innerHTML;
        btn.disabled = true;
        btn.innerHTML = '<span class="spinner-border spinner-border-sm me-2"></span>Hazırlanıyor...';
    }

    try {
        const payload = {
            Sorular: sepetSorular,
            Type: type,
            SutunSayisi: parseInt(sutunSayisi),
            Baslik: testBasligi,
            AnahtarEkle: anahtarEkle
        };

        const response = await fetch('/mgtest/ExportCart', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(payload)
        });

        if (response.ok) {
            // Dosyayı blob olarak al
            const blob = await response.blob();
            const url = window.URL.createObjectURL(blob);
            
            const bankaAdi = document.getElementById('sepetBankaAdi')?.value.trim() || 'sepet';
            const ext = type === 'pdf' ? 'pdf' : 'docx';
            const filename = `${bankaAdi}_${new Date().getTime()}.${ext}`;

            // Gizli bir link oluşturup tıkla
            const a = document.createElement('a');
            a.href = url;
            a.download = filename;
            document.body.appendChild(a);
            a.click();
            
            // Temizlik
            window.URL.revokeObjectURL(url);
            document.body.removeChild(a);

            showSepetNotification('Dosya başarıyla indirildi!', 'success');
        } else {
            const errText = await response.text();
            throw new Error(errText || response.statusText);
        }
    } catch (error) {
        console.error('Dışa aktarma hatası:', error);
        showSepetNotification('Dışa aktarma sırasında hata oluştu: ' + error.message, 'error');
    } finally {
        if (btn) {
            btn.disabled = false;
            btn.innerHTML = originalText;
        }
    }
}

window.exportCart = exportCart;

// ============================================
// TÜM KARTLARI DARALT/GENİŞLET (toggleAllCards)
// ============================================
function toggleAllCards(isCollapsed) {
    const bodies = document.querySelectorAll('.question-body');
    bodies.forEach(body => {
        if (isCollapsed) {
            body.classList.add('d-none');
        } else {
            body.classList.remove('d-none');
        }
    });
}
window.toggleAllCards = toggleAllCards;
