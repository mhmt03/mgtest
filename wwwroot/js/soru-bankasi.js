function safeGetElementById(id) { return document.getElementById(id); }
window.safeGetElementById = safeGetElementById;

// GLOBAL DEĞİŞKENLER
let sorular = []; 
let duzenlenenSoruIndex = null; 
let cropper = null; 
let soruResmiBase64 = null; 
let secilenMaxGenislik = 800;
let soruEkleModal = null;
let cropperModal = null;

// ============================================
// INDEXEDDB YÖNETİMİ (Yüksek Kapasite)
// ============================================
const dbHandler = {
    dbName: 'SoruBankasiDB',
    version: 1,
    storeName: 'workspace',
    db: null,

    init() {
        return new Promise((resolve, reject) => {
            const request = indexedDB.open(this.dbName, this.version);
            request.onupgradeneeded = (e) => {
                const db = e.target.result;
                if (!db.objectStoreNames.contains(this.storeName)) {
                    db.createObjectStore(this.storeName);
                }
            };
            request.onsuccess = (e) => {
                this.db = e.target.result;
                resolve();
            };
            request.onerror = (e) => reject(e);
        });
    },

    save(key, data) {
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction([this.storeName], 'readwrite');
            const store = transaction.objectStore(this.storeName);
            const request = store.put(data, key);
            request.onsuccess = () => resolve();
            request.onerror = (e) => reject(e);
        });
    },

    get(key) {
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction([this.storeName], 'readonly');
            const store = transaction.objectStore(this.storeName);
            const request = store.get(key);
            request.onsuccess = (e) => resolve(e.target.result);
            request.onerror = (e) => reject(e);
        });
    }
};

/**
 * Mevcut çalışmayı IndexedDB'ye kaydeder
 */
async function saveToWorkspace() {
    await dbHandler.save('sorular', sorular);
    const bankaAdi = document.getElementById('bankaAdi')?.value || localStorage.getItem('bankaAdi');
    if (bankaAdi) await dbHandler.save('bankaAdi', bankaAdi);
}

/**
 * Çalışmayı IndexedDB'den yükler
 */
async function loadFromWorkspace() {
    try {
        const savedSorular = await dbHandler.get('sorular');
        if (savedSorular && Array.isArray(savedSorular)) {
            sorular = savedSorular;
            guncelleSoruListesi();
        }
        const savedBankaAdi = await dbHandler.get('bankaAdi');
        if (savedBankaAdi) {
            const input = document.getElementById('bankaAdi');
            if (input) input.value = savedBankaAdi;
            localStorage.setItem('bankaAdi', savedBankaAdi);
        }
    } catch (err) {
        console.error('Yükleme hatası:', err);
    }
}

// Eski LocalStorage fonksiyonlarını IndexedDB'ye yönlendir
function saveToLocalStorage() { saveToWorkspace(); }
function loadSorular() { loadFromWorkspace(); }

// ============================================
// SAYFA YÜKLENDİĞİNDE ÇALIŞACAK FONKSİYONLAR
// ============================================

document.addEventListener('DOMContentLoaded', function () {
    initializeApp();
});

function initializeApp() {
    // Modal instance'larını oluştur
    soruEkleModal = new bootstrap.Modal(document.getElementById('soruEkleModal'));
    cropperModal = new bootstrap.Modal(document.getElementById('cropperModal'));


    // Event listener'ları bağla
    bindEventListeners();

    // Sortable'ı başlat (sürükle-bırak için)
    initializeSortable();

    // IndexedDB'yi başlat
    dbHandler.init().then(() => {
        // Local storage'dan soruları yükle (varsa) - Geriye dönük uyumluluk ve ilk yükleme
        loadFromWorkspace();
    });

    // Toplu soru ekleme event'i
    // document.getElementById('topluSoruResimInput')?.addEventListener('change', topluSoruResimleriYukle);

    document.addEventListener('keydown', function(e) {
        if (soruEkleModal && document.getElementById('soruEkleModal').classList.contains('show')) {
            if (e.key === 'ArrowLeft') oncekiSoru();
            if (e.key === 'ArrowRight') sonrakiSoru();
        }
    });

    console.log('✅ Soru Bankası Uygulaması başlatıldı');
}

// ============================================
// EVENT LISTENER'LAR
// ============================================

function bindEventListeners() {
    // Soru Ekle butonu
    document.getElementById('soruEkleBtn')?.addEventListener('click', soruEkleModalAc);

    // Soru Kaydet butonu
    document.getElementById('soruKaydetBtn')?.addEventListener('click', soruKaydet);

    // Resim seçme butonları
    document.getElementById('soruResmiSecBtn')?.addEventListener('click', () => {
        document.getElementById('soruResmiInput').click();
    });

    document.getElementById('soruResmiInput')?.addEventListener('change', soruResmiSec);

    // Cropper onayla butonu
    document.getElementById('cropperOnaylaBtn')?.addEventListener('click', cropperOnayla);

    // Banka kaydet butonu
    document.getElementById('bankaKaydetBtn')?.addEventListener('click', bankaKaydet);

    // Export butonları
    document.querySelectorAll('[onclick^="wordOlustur"]').forEach(btn => {
        btn.onclick = null; // Eski onclick'i kaldır
        const args = btn.getAttribute('onclick').match(/\(([^)]+)\)/)[1].split(',');
        btn.addEventListener('click', () => {
            const kaynak = args[0].replace(/'/g, '');
            const anahtarli = args[1].trim() === 'true';
            wordOlustur(kaynak, anahtarli);
        });
    });

    document.querySelectorAll('[onclick^="pdfOlustur"]').forEach(btn => {
        btn.onclick = null;
        const args = btn.getAttribute('onclick').match(/\(([^)]+)\)/)[1].split(',');
        btn.addEventListener('click', () => {
            const kaynak = args[0].replace(/'/g, '');
            const anahtarli = args[1].trim() === 'true';
            pdfOlustur(kaynak, anahtarli);
        });
    });
}

// ============================================
// SORU EKLEME/DÜZENLEME FONKSİYONLARI
// ============================================

/**
 * Soru Ekleme modalını açar ve formu temizler
 */
async function soruEkleModalAc() {
    duzenlenenSoruIndex = null;
    soruFormTemizle();
    await derslerYukleForSoru(); // Dersleri yükle
    soruEkleModal.show();
}

/**
 * Soru formunu temizler
 */
function soruFormTemizle() {
    window.safeGetElementById('dersSelect') && (safeGetElementById('dersSelect').innerHTML = '<option value="">Ders Seçin</option>');
    window.safeGetElementById('konuSelect') && (safeGetElementById('konuSelect').innerHTML = '<option value="">Önce ders seçin</option>');
    window.safeGetElementById('kazanimSelect') && (safeGetElementById('kazanimSelect').innerHTML = '<option value="">Önce konu seçin</option>');
    window.safeGetElementById('soruMetniInput') && (safeGetElementById('soruMetniInput').value = '');

    ['A', 'B', 'C', 'D', 'E'].forEach(harf => {
        window.safeGetElementById(harf) && (safeGetElementById(harf).value = '');
    });

    // İlk şıkkı seç
    document.querySelectorAll('input[name="dogruSik"]').forEach((radio, index) => {
        radio.checked = (index === 0);
    });

    window.safeGetElementById('soruResmiPreview') && (safeGetElementById('soruResmiPreview').innerHTML = '');
    soruResmiBase64 = null;
}

/**
 * Soru kaydeder (yeni ekler veya mevcut olanı günceller)
 */
function soruKaydet() {
    // Form validasyonu - Artık ders/konu/kazanım zorunlu değil
    const dersSelect = window.safeGetElementById('dersSelect');
    const konuSelect = window.safeGetElementById('konuSelect');
    const kazanimSelect = window.safeGetElementById('kazanimSelect');
    const soruMetni = window.safeGetElementById('soruMetniInput') ? safeGetElementById('soruMetniInput').value.trim() : '';

    // Sadece soru metni veya resim kontrolü
    if (!soruMetni && !soruResmiBase64) {
        showNotification('En az soru metni veya soru resmi ekleyin!', 'warning');
        return;
    }

    // Soru objesini oluştur
    const soru = {
        id: duzenlenenSoruIndex !== null ? sorular[duzenlenenSoruIndex].id : Math.floor(Math.random() * 114748364),
        soruResmi: soruResmiBase64,
        dersAdi: dersSelect.options[dersSelect.selectedIndex]?.text || '',
        dersId: dersSelect.value || 1,
        konuAdi: konuSelect.options[konuSelect.selectedIndex]?.text || '',
        konuId: konuSelect.value || 1,
        kazanimAdi: kazanimSelect.options[kazanimSelect.selectedIndex]?.text || '',
        kazanimId: kazanimSelect.value || 1,
        soruMetni: soruMetni,
        soruMetniAyriMi: document.getElementById('soruMetniAyriMi')?.checked || false,
        sikkarAyriMi: document.getElementById('sikkarAyriMi')?.checked || false,
        siklar: {
            A: document.getElementById('A').value.trim(),
            B: document.getElementById('B').value.trim(),
            C: document.getElementById('C').value.trim(),
            D: document.getElementById('D').value.trim(),
            E: document.getElementById('E').value.trim()
        },
        dogruSik: document.querySelector('input[name="dogruSik"]:checked')?.value || 'A',
        olusturmaTarihi: duzenlenenSoruIndex !== null ?
            sorular[duzenlenenSoruIndex].olusturmaTarihi :
            new Date().toISOString()
    };

    // Şık zorunluluğu kaldırıldı

    // Ekleme veya güncelleme
    if (duzenlenenSoruIndex !== null) {
        sorular[duzenlenenSoruIndex] = soru;
        showNotification('Soru başarıyla güncellendi!', 'success');
    } else {
        sorular.push(soru);
        showNotification('Soru başarıyla eklendi!', 'success');
    }

    // Listeyi güncelle
    guncelleSoruListesi();
    saveToLocalStorage();
    // soruEkleModal.hide(); // Kullanıcı isteği üzerine kapatılmıyor
}

/**
 * Soru düzenleme modalını açar
 */
async function duzenleSoru(index) {
    const soru = sorular[index];

    // Form alanlarını sıfırla
    document.getElementById('dersSelect').value = '';
    document.getElementById('konuSelect').innerHTML = '<option value="">Konu Seçin</option>';
    document.getElementById('kazanimSelect').innerHTML = '<option value="">Kazanım Seçin</option>';
    document.getElementById('soruMetniInput').value = '';
    document.getElementById('soruMetniAyriMi').checked = soru.soruMetniAyriMi || false;
    document.getElementById('sikkarAyriMi').checked = soru.sikkarAyriMi || false;
    
    // Checkbox'lara bağlı input durumlarını güncelle
    document.getElementById('soruMetniInput').disabled = !soru.soruMetniAyriMi;
    document.querySelectorAll('.sikk-input').forEach(input => input.disabled = !soru.sikkarAyriMi);

    // Dersleri yükle
    await derslerYukleForSoru();

    // Ders/Konu/Kazanım seç
    if (soru.dersId) {
        document.getElementById('dersSelect').value = soru.dersId;
        await konulariYukleForSoru(soru.dersId);
        if (soru.konuId) {
            document.getElementById('konuSelect').value = soru.konuId;
            await kazanimlariYukleForSoru(soru.konuId);
            if (soru.kazanimId) {
                document.getElementById('kazanimSelect').value = soru.kazanimId;
            }
        }
    }

    // Form alanlarını doldur
    document.getElementById('soruMetniInput').value = soru.soruMetni || '';

    ['A', 'B', 'C', 'D', 'E'].forEach(harf => {
        const input = document.getElementById(harf);
        if (input) {
            input.value = (soru.siklar && soru.siklar[harf]) || '';
        }
    });

    document.querySelectorAll('input[name="dogruSik"]').forEach(radio => {
        radio.checked = (radio.value === soru.dogruSik);
    });

    // Resim önizlemesi
    soruResmiBase64 = soru.soruResmi;
    currentModalZoom = 1;
    const zoomCtrl = document.getElementById('zoomKontrolleriModal');
    
    if (soru.soruResmi) {
        document.getElementById('soruResmiPreview').innerHTML = 
            `<img src='${soru.soruResmi}' style='max-width:100%; transition: transform 0.2s;' class='img-fluid'>`;
        zoomCtrl.style.setProperty('display', 'flex', 'important');
    } else {
        document.getElementById('soruResmiPreview').innerHTML = '<div class="text-muted small p-5">Resim seçilmedi</div>';
        zoomCtrl.style.setProperty('display', 'none', 'important');
    }

    duzenlenenSoruIndex = index;
    
    // Navigasyonu güncelle
    guncelleModalNavigasyon(index);
    
    soruEkleModal.show();
}

/**
 * Modal navigasyonunu günceller
 */
function guncelleModalNavigasyon(currentIndex) {
    const nav = document.getElementById('modalNavigasyon');
    const select = document.getElementById('soruAtlaSelect');
    const sayac = document.getElementById('soruSayaci');
    
    if (sorular.length <= 1) {
        nav.classList.add('d-none');
        return;
    }
    
    nav.classList.remove('d-none');
    sayac.textContent = `${currentIndex + 1} / ${sorular.length}`;
    
    // Select kutusunu doldur
    select.innerHTML = '';
    sorular.forEach((_, i) => {
        const opt = document.createElement('option');
        opt.value = i;
        opt.textContent = i + 1;
        opt.selected = (i === currentIndex);
        select.appendChild(opt);
    });
}

/**
 * Bir sonraki soruya geçer
 */
async function sonrakiSoru() {
    if (duzenlenenSoruIndex === null || duzenlenenSoruIndex >= sorular.length - 1) return;
    await duzenleSoru(duzenlenenSoruIndex + 1);
}

/**
 * Bir önceki soruya geçer
 */
async function oncekiSoru() {
    if (duzenlenenSoruIndex === null || duzenlenenSoruIndex <= 0) return;
    await duzenleSoru(duzenlenenSoruIndex - 1);
}

/**
 * Belirli bir numaralı soruya atlar
 */
async function soruAtla(index) {
    await duzenleSoru(parseInt(index));
}

window.oncekiSoru = oncekiSoru;
window.sonrakiSoru = sonrakiSoru;
window.soruAtla = soruAtla;

let currentModalZoom = 1;
function zoomModal(delta) {
    const img = document.querySelector('#soruResmiPreview img');
    if (!img) return;
    currentModalZoom += delta;
    if (currentModalZoom < 0.1) currentModalZoom = 0.1;
    img.style.transform = `scale(${currentModalZoom})`;
    img.style.transformOrigin = 'top center';
}

function resetModalZoom() {
    const img = document.querySelector('#soruResmiPreview img');
    if (!img) return;
    currentModalZoom = 1;
    img.style.transform = 'scale(1)';
}

window.zoomModal = zoomModal;
window.resetModalZoom = resetModalZoom;

/**
 * Soru silme
 */
function soruSil(index) {
    if (!confirm('Bu soruyu silmek istediğinizden emin misiniz?')) {
        return;
    }

    sorular.splice(index, 1);
    guncelleSoruListesi();
    saveToLocalStorage();
    showNotification('Soru silindi', 'info');
}

// ============================================
// RESİM İŞLEMLERİ (CROPPER)
// ============================================

/**
 * Resim dosyası seçildiğinde cropper modalını açar
 */
function soruResmiSec(e) {
    const file = e.target.files[0];
    if (!file) return;

    // Dosya boyutu kontrolü (max 5MB)
    if (file.size > 5 * 1024 * 1024) {
        showNotification('Resim boyutu en fazla 5MB olabilir!', 'error');
        return;
    }

    const reader = new FileReader();
    reader.onload = function (evt) {
        const cropperImg = document.getElementById('cropperImage');
        cropperImg.src = evt.target.result;

        cropperModal.show();

        // Modal açıldıktan sonra cropper'ı başlat
        setTimeout(() => {
            if (cropper) {
                cropper.destroy();
            }

            cropper = new Cropper(cropperImg, {
                aspectRatio: NaN, // Serbest oran
                viewMode: 1,
                autoCropArea: 1,
                movable: true,
                zoomable: true,
                scalable: true,
                rotatable: true,
                responsive: true,
                guides: true,
                center: true,
                highlight: true,
                background: true,
                cropBoxResizable: true,
                cropBoxMovable: true
            });
        }, 300);
    };

    reader.readAsDataURL(file);
}

/**
 * Cropper'dan kırpılmış resmi alır ve önizleme gösterir
 */
function cropperOnayla() {
    if (!cropper) return;

    const canvas = cropper.getCroppedCanvas({
        maxWidth: 800,
        maxHeight: 800,
        imageSmoothingEnabled: true,
        imageSmoothingQuality: 'high'
    });

    soruResmiBase64 = canvas.toDataURL('image/jpeg', 0.85);

    // Önizleme göster
    if (window.safeGetElementById('soruResmiPreview')) {
        safeGetElementById('soruResmiPreview').innerHTML = `
            <div class="position-relative d-inline-block">
                <img src='${soruResmiBase64}' class='img-thumbnail' style='max-width:300px;max-height:300px;'>
                <button type="button" class="btn btn-sm btn-danger position-absolute top-0 end-0 m-1" 
                        onclick="soruResmiKaldir()">
                    <i class="bi bi-x"></i>
                </button>
            </div>
        `;
    }

    cropper.destroy();
    cropper = null;
    cropperModal.hide();
}

/**
 * Seçilen resmi kaldırır
 */
function soruResmiKaldir() {
    soruResmiBase64 = null;
    window.safeGetElementById('soruResmiPreview') && (safeGetElementById('soruResmiPreview').innerHTML = '');
    window.safeGetElementById('soruResmiInput') && (safeGetElementById('soruResmiInput').value = '');
}

// ============================================
// SORU LİSTESİ RENDER FONKSİYONU
// ============================================

/**
 * Soru listesini ekrana çizer
 */
function guncelleSoruListesi() {
    const container = window.safeGetElementById('soruListesi');
    if (!container) return;

    const topluBar = document.getElementById('topluIslemlerBar');
    if (sorular.length === 0) {
        if (topluBar) topluBar.classList.add('d-none');
        container.innerHTML = `
            <div class="alert alert-info text-center py-5">
                <i class="bi bi-info-circle fs-1 d-block mb-3"></i>
                <p class="mb-0">Henüz soru eklenmedi. Soru Ekle butonuna tıklayarak başlayın!</p>
            </div>
        `;
        return;
    }

    if (topluBar) topluBar.classList.remove('d-none');

    let html = '<div class="row g-4" id="sortable-sorular">';
    sorular.forEach((soru, i) => {
        // Handle old undefined strings if any
        const ders = (soru.dersAdi && soru.dersAdi !== 'undefined') ? soru.dersAdi : (soru.ders && soru.ders !== 'undefined' ? soru.ders : '');
        const konu = (soru.konuAdi && soru.konuAdi !== 'undefined') ? soru.konuAdi : (soru.konu && soru.konu !== 'undefined' ? soru.konu : '');
        const kazanim = (soru.kazanimAdi && soru.kazanimAdi !== 'undefined') ? soru.kazanimAdi : (soru.kazanim && soru.kazanim !== 'undefined' ? soru.kazanim : '');

        html += `
        <div class="col-12 col-xl-6 mb-2" data-index="${i}" data-id="${soru.id}">
            <div class="card question-card shadow-sm h-100 border-start border-primary border-4">
                <div class="card-body p-3">
                    <!-- HEADER: Soru No, Cevap ve Butonlar -->
                    <div class="d-flex justify-content-between align-items-center mb-3 border-bottom pb-2">
                        <div class="d-flex align-items-center gap-2">
                            <span class="drag-handle btn btn-sm btn-outline-secondary py-0" style="cursor:move">
                                <i class="bi bi-grip-vertical fs-5"></i>
                            </span>
                            <input type="checkbox" class="form-check-input soru-sec m-0" data-index="${i}" id="chk_${i}">
                            <label class="form-check-label fw-bold text-primary mb-0" for="chk_${i}">Soru #${i + 1}</label>
                            <span class="badge bg-success ms-2">Cevap: ${soru.dogruSik || 'A'}</span>
                            <span class="ms-2 small text-muted">
                                ${soru.sikkarAyriMi ? '<i class="bi bi-list-check"></i>' : '<i class="bi bi-image"></i>'}
                            </span>
                        </div>
                        <div class="btn-group btn-group-sm">
                            <button class="btn btn-outline-warning" onclick="duzenleSoru(${i})" title="Düzenle"><i class="bi bi-pencil"></i></button>
                            <button class="btn btn-outline-danger" onclick="soruSil(${i})" title="Sil"><i class="bi bi-trash"></i></button>
                        </div>
                    </div>

                    <!-- İÇERİK: Resim (Üstte), Metin, Şıklar ve Bilgiler -->
                    <div class="question-body">
                        <!-- RESİM -->
                        ${soru.soruResmi ? `
                        <div class="text-center mb-3">
                            <div class="position-relative border rounded bg-light p-2 d-inline-block" style="max-width:100%;">
                                <img src="${soru.soruResmi}" id="soruResmi_${i}" class="img-fluid rounded" data-zoom="1" style="max-height:400px; transition: transform 0.2s;">
                                <div class="btn-group btn-group-sm position-absolute bottom-0 end-0 m-1 bg-white border shadow-sm opacity-75 no-print" style="z-index:100;">
                                    <button class="btn btn-light border-end" onclick="zoomImage(${i}, 0.1)"><i class="bi bi-zoom-in"></i></button>
                                    <button class="btn btn-light border-end" onclick="zoomImage(${i}, -0.1)"><i class="bi bi-zoom-out"></i></button>
                                    <button class="btn btn-light" onclick="resetZoom(${i})"><i class="bi bi-arrow-clockwise"></i></button>
                                </div>
                            </div>
                        </div>
                        ` : ''}

                        <!-- METİN (Varsa) -->
                        ${soru.soruMetniAyriMi && soru.soruMetni ? `
                        <div class="alert alert-light border p-2 mb-2" style="font-size:0.95rem">
                            <div class="text-break">${soru.soruMetni}</div>
                        </div>
                        ` : ''}

                        <!-- ŞIKLAR (Varsa) -->
                        ${soru.sikkarAyriMi ? `
                        <div class="siklar-container py-2 px-1 mb-3" style="font-size:0.9rem">
                            <ul class="list-unstyled mb-0">
                                ${['A', 'B', 'C', 'D', 'E'].map(h => {
                                    if (!soru.siklar || !soru.siklar[h]) return '';
                                    const isCorrect = soru.dogruSik === h;
                                    return '<li class="mb-1 d-flex align-items-center p-1 rounded ' + (isCorrect ? 'bg-success bg-opacity-10' : '') + '">' + 
                                           '<span class="badge ' + (isCorrect ? 'bg-success' : 'bg-light text-dark border') + ' me-2" style="width:25px">' + h + '</span>' + 
                                           '<span class="' + (isCorrect ? 'fw-bold text-success' : '') + '">' + soru.siklar[h] + '</span>' +
                                           (isCorrect ? ' <i class="bi bi-check-circle-fill ms-auto text-success"></i>' : '') + 
                                           '</li>';
                                }).join('')}
                            </ul>
                        </div>
                        ` : ''}

                        <!-- ALT BİLGİ: Ders, Konu, Kazanım -->
                        <div class="mt-3 pt-2 border-top d-flex flex-wrap gap-1">
                            ${ders ? '<span class="badge bg-info-subtle text-info border border-info-subtle">' + ders + '</span>' : ''}
                            ${konu ? '<span class="badge bg-secondary-subtle text-secondary border border-secondary-subtle">' + konu + '</span>' : ''}
                            ${kazanim ? '<span class="badge bg-light text-dark border">' + kazanim + '</span>' : ''}
                        </div>
                    </div>
                </div>
            </div>
        </div>`;
    });
    html += '</div>';
    container.innerHTML = html;
    initializeSortable();
}


// ============================================
// BİLDİRİM FONKSİYONU
// ============================================

function showNotification(message, type = 'info') {
    const colors = {
        success: '#28a745',
        error: '#dc3545',
        warning: '#ffc107',
        info: '#17a2b8'
    };

    // Toast benzeri bildirim göster
    const notification = document.createElement('div');
    notification.className = `alert alert-${type} position-fixed top-0 end-0 m-3`;
    notification.style.zIndex = '9999';
    notification.style.minWidth = '300px';
    notification.innerHTML = `
        <div class="d-flex align-items-center">
            <i class="bi bi-${type === 'success' ? 'check-circle' : type === 'error' ? 'x-circle' : 'info-circle'} me-2"></i>
            <div>${message}</div>
        </div>
    `;

    document.body.appendChild(notification);

    setTimeout(() => {
        notification.style.transition = 'opacity 0.3s';
        notification.style.opacity = '0';
        setTimeout(() => notification.remove(), 300);
    }, 3000);
}

// ============================================
// BANKA KAYDETME (SERVER'A GÖNDERME)
// ============================================

async function bankaKaydet() {
    const bankaAdi = document.getElementById('bankaAdi')?.value.trim();

    if (!bankaAdi) {
        showNotification('Lütfen banka adı giriniz!', 'warning');
        return;
    }

    if (sorular.length === 0) {
        showNotification('En az bir soru ekleyiniz!', 'warning');
        return;
    }
    // Loading göster
    const kaydetBtn = document.getElementById('bankaKaydetBtn');
    const originalText = kaydetBtn.innerHTML;
    kaydetBtn.disabled = true;
    kaydetBtn.innerHTML = '<span class="spinner-border spinner-border-sm me-2"></span>Kaydediliyor...';

    try {
        // CSRF token'ı al
        // const token = document.querySelector('input[name="__RequestVerificationToken"]')?.value;
        const payload = { BankaAdi: bankaAdi, Sorular: sorular };

        console.log('Banka kaydediliyor...', {
            bankaAdi: bankaAdi,
            soruSayisi: sorular.length
        });

        const jsonString = JSON.stringify(payload);

        // JSON'u tekrar parse edelim - kontrol için
        const parsed = JSON.parse(jsonString);
        console.log('Parsed back:', parsed);
        //  console.log('Parsed.BankaAdi:', parsed.BankaAdi);

        // Server'a gönder
        const response = await fetch('/mgtest/SaveBank', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'RequestVerificationToken': '' || '' // token
            },
            body: JSON.stringify(payload)
        });
        console.log('Response status:', response.status);

        if (response.ok) {
            const result = await response.json();
            console.log('Server response:', result);
            if (result.success) {
                showNotification('Soru bankası kaydedildi! İndirme başlıyor...', 'success');

                // İndirme linkini oluştur ve tıklat
                const downloadUrl = `/mgtest/Download?dosyaId=${result.dosyaId}`;
                console.log('İndirme URL\'si:', downloadUrl);

                // Yeni sekmede indir
                const downloadLink = document.createElement('a');
                downloadLink.href = downloadUrl;
                downloadLink.download = `${bankaAdi}.mg`;
                downloadLink.target = '_blank';
                document.body.appendChild(downloadLink);
                downloadLink.click();
                document.body.removeChild(downloadLink);

                // Alternatif yöntem - doğrudan window.location
                // setTimeout(() => {
                //     window.location.href = downloadUrl;
                // }, 500);

                // Başarılı mesajı
                setTimeout(() => {
                    if (confirm('Dosya indirildi. Yeni bir soru bankası oluşturmak ister misiniz?')) {
                        sorular = [];
                        guncelleSoruListesi();
                        document.getElementById('bankaAdi').value = '';
                        localStorage.clear();
                    }
                }, 2000);
                showNotification(result.message || 'Kaydetme başarısız!', 'error');
            }
        } else {
            throw new Error('Sunucu hatası: ' + response.statusText);
        }
    } catch (error) {
        console.error('Kaydetme hatası:', error);
        showNotification('Bir hata oluştu: ' + error.message, 'error');
    } finally {
        // Loading'i kaldır
        kaydetBtn.disabled = false;
        kaydetBtn.innerHTML = originalText;
    }
}

// Global scope'a export et
window.duzenleSoru = duzenleSoru;
window.soruSil = soruSil;
window.zoomImage = zoomImage;
window.resetZoom = resetZoom;
window.zoomAll = zoomAll;
window.resetAllZoom = resetAllZoom;
window.soruResmiKaldir = soruResmiKaldir;

// ============================================
// DROPDOWN YÖNETİMİ - SORU EKLE FORMU İÇİN
// ============================================

/**
 * Soru ekle formuna dersleri yükler
 */
async function derslerYukleForSoru() {
    try {
        const response = await fetch('/mgtest/GetDersler');
        const dersler = await response.json();

        const dersSelect = document.getElementById('dersSelect');
        dersSelect.innerHTML = '<option value="">Ders Seçin</option>';

        dersler.forEach(d => {
            const option = document.createElement('option');
            option.value = d.id;
            option.textContent = d.ders;
            dersSelect.appendChild(option);
        });

    } catch (error) {
        console.error('Ders yükleme hatası:', error);
        showNotification('Dersler yüklenirken bir hata oluştu', 'error');
    }
}

/**
 * Ders seçildiğinde konuları yükler
 */
async function konulariYukleForSoru(dersId) {
    const konuSelect = document.getElementById('konuSelect');
    const kazanimSelect = document.getElementById('kazanimSelect');

    if (!dersId) {
        konuSelect.innerHTML = '<option value="">Önce ders seçin</option>';
        kazanimSelect.innerHTML = '<option value="">Önce konu seçin</option>';
        return;
    }

    try {
        const response = await fetch(`/mgtest/GetKonular?dersId=${dersId}`);
        const konular = await response.json();

        konuSelect.innerHTML = '<option value="">Konu Seçin</option>';

        konular.forEach(k => {
            const option = document.createElement('option');
            option.value = k.id;
            option.textContent = k.konu;
            konuSelect.appendChild(option);
        });

        // Kazanımları temizle
        kazanimSelect.innerHTML = '<option value="">Önce konu seçin</option>';

    } catch (error) {
        console.error('Konu yükleme hatası:', error);
        showNotification('Konular yüklenirken bir hata oluştu', 'error');
    }
}

/**
 * Konu seçildiğinde kazanımları yükler
 */
async function kazanimlariYukleForSoru(konuId) {
    const kazanimSelect = document.getElementById('kazanimSelect');

    if (!konuId) {
        kazanimSelect.innerHTML = '<option value="">Önce konu seçin</option>';
        return;
    }

    try {
        const response = await fetch(`/mgtest/GetKazanims?konuId=${konuId}`);
        const kazanimlar = await response.json();

        kazanimSelect.innerHTML = '<option value="">Kazanım Seçin</option>';

        kazanimlar.forEach(kz => {
            const option = document.createElement('option');
            option.value = kz.id;
            option.textContent = kz.kazanim;
            kazanimSelect.appendChild(option);
        });

    } catch (error) {
        console.error('Kazanım yükleme hatası:', error);
        showNotification('Kazanımlar yüklenirken bir hata oluştu', 'error');
    }
}

// Dropdown change event'lerini bağla
document.addEventListener('DOMContentLoaded', function () {
    const dersSelect = document.getElementById('dersSelect');
    const konuSelect = document.getElementById('konuSelect');

    if (dersSelect) {
        dersSelect.addEventListener('change', function () {
            konulariYukleForSoru(this.value);
        });
    }

    if (konuSelect) {
        konuSelect.addEventListener('change', function () {
            kazanimlariYukleForSoru(this.value);
        });
    }
});

// ============================================
// TOPLU SORU EKLEME
// ============================================

/**
 * Klasörden toplu resim yükleme
 */
async function topluSoruResimleriYukle(e) {
    const files = Array.from(e.target.files);

    if (files.length === 0) {
        showNotification('Resim seçilmedi', 'warning');
        return;
    }

    showNotification(`${files.length} resim yükleniyor...`, 'info');

    let yuklenenSayisi = 0;

    for (const file of files) {
        try {
            const base64 = await fileToBase64(file);

            // Yeni soru oluştur
            const soru = {
                id: Math.floor(Math.random() * 114748364),
                soruResmi: base64,
                ders: '',
                dersId: null,
                konuAdi: '',
                konuId: null,
                kazanimAdi: '',
                kazanimId: null,
                soruMetni: '',
                soruMetniAyriMi: false, // Varsayılan: metni resimde
                sikkarAyriMi: false,     // Varsayılan: şıklar resimde
                siklar: { A: '', B: '', C: '', D: '', E: '' },
                dogruSik: 'A',           // Varsayılan doğru cevap
                olusturmaTarihi: new Date().toISOString()
            };

            sorular.push(soru);
            yuklenenSayisi++;

        } catch (error) {
            console.error('Resim yükleme hatası:', file.name, error);
        }
    }

    guncelleSoruListesi();
    saveToLocalStorage();

    showNotification(`${yuklenenSayisi} soru başarıyla eklendi!`, 'success');

    // Input'u temizle
    e.target.value = '';
}

/**
 * Dosyayı Base64'e çevirir
 */
function fileToBase64(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = reject;
        reader.readAsDataURL(file);
    });
}

/**
 * Excel şablonu indir
 */
function topluAnahtarSablonIndir() {
    if (sorular.length === 0) {
        showNotification('Önce soru ekleyin!', 'warning');
        return;
    }

    // CSV formatında basit şablon oluştur
    let csv = 'Soru No,Doğru Cevap,Ders,Konu,Kazanım\n';

    sorular.forEach((soru, index) => {
        csv += `${index + 1},${soru.dogruSik || 'A'},${soru.ders || ''},${soru.konu || ''},${soru.kazanim || ''}\n`;
    });

    // CSV'yi indir
    const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `soru_anahtarlari_${new Date().getTime()}.csv`;
    link.click();

    showNotification('Şablon dosyası indirildi!', 'success');
}

/**
 * Excel'den toplu anahtar yükleme
 */
async function topluAnahtarYukle(e) {
    const file = e.target.files[0];
    if (!file) return;

    try {
        const text = await file.text();
        const lines = text.split('\n').slice(1); // Başlığı atla

        let guncellenenSayisi = 0;

        lines.forEach(line => {
            const parts = line.split(',').map(p => p.trim());

            if (parts.length >= 2) {
                const soruNo = parseInt(parts[0]) - 1;
                const dogruCevap = parts[1];
                const ders = parts[2] || '';
                const konu = parts[3] || '';
                const kazanim = parts[4] || '';

                if (sorular[soruNo]) {
                    sorular[soruNo].dogruSik = dogruCevap;
                    if (ders) sorular[soruNo].ders = ders;
                    if (konu) sorular[soruNo].konu = konu;
                    if (kazanim) sorular[soruNo].kazanim = kazanim;
                    guncellenenSayisi++;
                }
            }
        });

        guncelleSoruListesi();
        saveToLocalStorage();

        showNotification(`${guncellenenSayisi} sorunun anahtarı güncellendi!`, 'success');

    } catch (error) {
        console.error('Dosya okuma hatası:', error);
        showNotification('Dosya okunamadı!', 'error');
    }

    e.target.value = '';
}

// Global export
window.topluAnahtarSablonIndir = topluAnahtarSablonIndir;

async function bankaKaydet() {
    const bankaAdi = document.getElementById('bankaAdi')?.value.trim();
    if (!bankaAdi) { showNotification('Lütfen banka adı giriniz!', 'warning'); return; }
    if (sorular.length === 0) { showNotification('En az bir soru ekleyiniz!', 'warning'); return; }
    
    const kaydetBtn = document.getElementById('bankaKaydetBtn');
    const originalText = kaydetBtn.innerHTML;
    kaydetBtn.disabled = true;
    kaydetBtn.innerHTML = '<span class="spinner-border spinner-border-sm me-2"></span>Oluşturuluyor...';

    try {
        const SQL = await window.initSqlJs({ locateFile: file => '/lib/sqljs/' + file });
        const db = new SQL.Database();
        db.exec(`
            CREATE TABLE IF NOT EXISTS Ders (Id INTEGER PRIMARY KEY AUTOINCREMENT, DersAdi TEXT NOT NULL);
            CREATE TABLE IF NOT EXISTS Konu (Id INTEGER PRIMARY KEY AUTOINCREMENT, DersId INTEGER NOT NULL, KonuAdi TEXT NOT NULL);
            CREATE TABLE IF NOT EXISTS Kazanim (Id INTEGER PRIMARY KEY AUTOINCREMENT, DersId INTEGER NOT NULL, KonuId INTEGER NOT NULL, KazanimAdi TEXT NOT NULL);
            CREATE TABLE IF NOT EXISTS Soru (
                Id INTEGER PRIMARY KEY AUTOINCREMENT, DersId INTEGER, KonuId INTEGER, KazanimId INTEGER,
                DersAdi TEXT, KonuAdi TEXT, KazanimAdi TEXT, SoruMetni TEXT, SoruMetniAyriMi INTEGER,
                SiklarAyriMi INTEGER, SikA TEXT, SikB TEXT, SikC TEXT, SikD TEXT, SikE TEXT, DogruSik TEXT,
                SoruResmi TEXT, OlusturmaTarihi TEXT
            );
            CREATE TABLE IF NOT EXISTS BankaAyarlari (Id INTEGER PRIMARY KEY AUTOINCREMENT, BankaAdi TEXT, ToplamSoruSayisi INTEGER, OlusturmaTarihi TEXT);
        `);

        const dersMap = {}, konuMap = {}, kazanimMap = {};
        let dC = 1, kC = 1, kzC = 1;

        const stmtS = db.prepare("INSERT INTO Soru (DersId, KonuId, KazanimId, DersAdi, KonuAdi, KazanimAdi, SoruMetni, SoruMetniAyriMi, SiklarAyriMi, SikA, SikB, SikC, SikD, SikE, DogruSik, SoruResmi, OlusturmaTarihi) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)");
        const stmtD = db.prepare("INSERT INTO Ders (Id, DersAdi) VALUES (?,?)");
        const stmtK = db.prepare("INSERT INTO Konu (Id, DersId, KonuAdi) VALUES (?,?,?)");
        const stmtKZ = db.prepare("INSERT INTO Kazanim (Id, DersId, KonuId, KazanimAdi) VALUES (?,?,?,?)");

        for (const s of sorular) {
            let dId = null, kId = null, kzId = null;
            const dA = s.dersAdi || s.ders || '';
            const kA = s.konuAdi || s.konu || '';
            const kzA = s.kazanimAdi || s.kazanim || '';

            if (dA) {
                if (!dersMap[dA]) { dersMap[dA] = dC++; stmtD.run([dersMap[dA], dA]); }
                dId = dersMap[dA];
                if (kA) {
                    const kK = dId + '_' + kA;
                    if (!konuMap[kK]) { konuMap[kK] = kC++; stmtK.run([konuMap[kK], dId, kA]); }
                    kId = konuMap[kK];
                    if (kzA) {
                        const kzK = dId + '_' + kId + '_' + kzA;
                        if (!kazanimMap[kzK]) { kazanimMap[kzK] = kzC++; stmtKZ.run([kazanimMap[kzK], dId, kId, kzA]); }
                        kzId = kazanimMap[kzK];
                    }
                }
            }
            stmtS.run([dId, kId, kzId, dA, kA, kzA, s.soruMetni||'', s.soruMetniAyriMi?1:0, s.sikkarAyriMi?1:0, s.siklar?.A||'', s.siklar?.B||'', s.siklar?.C||'', s.siklar?.D||'', s.siklar?.E||'', s.dogruSik||'A', s.soruResmi||'', s.olusturmaTarihi||new Date().toISOString()]);
        }
        stmtS.free(); stmtD.free(); stmtK.free(); stmtKZ.free();
        db.run("INSERT INTO BankaAyarlari (BankaAdi, ToplamSoruSayisi, OlusturmaTarihi) VALUES (?,?,?)", [bankaAdi, sorular.length, new Date().toISOString()]);

        const dbData = db.export();
        const nfh = await window.showSaveFilePicker({ suggestedName: bankaAdi + '.mg', types: [{ description: 'Soru Bankası', accept: {'application/octet-stream': ['.mg']}}]});
        const w = await nfh.createWritable(); await w.write(dbData); await w.close();
        showNotification('Kaydedildi!', 'success');
    } catch (e) { if (e.name !== 'AbortError') showNotification('Hata: ' + e.message, 'error'); }
    finally { kaydetBtn.disabled = false; kaydetBtn.innerHTML = originalText; }
}

window.bankaKaydet = bankaKaydet;
/**
 * Sıralama özelliğini başlatır
 */
function initializeSortable() {
    const el = document.getElementById('sortable-sorular');
    if (!el) return;
    
    // Varsa eski nesneyi temizle
    const oldSortable = Sortable.get(el);
    if (oldSortable) oldSortable.destroy();

    Sortable.create(el, {
        animation: 150,
        handle: '.drag-handle',
        onEnd: async function() {
            const newOrder = Array.from(el.children).map(item => parseInt(item.dataset.id));
            const updatedSorular = [];
            newOrder.forEach(id => {
                const soru = sorular.find(s => s.id === id);
                if (soru) updatedSorular.push(soru);
            });
            sorular = updatedSorular;
            guncelleSoruListesi(); // Index numaralarını (Soru #1, #2) güncellemek için
            await saveToWorkspace();
        }
    });
}

/**
 * Resim yakınlaştırma/uzaklaştırma
 */
function zoomImage(index, delta) {
    const img = document.getElementById(`soruResmi_${index}`);
    if (!img) return;
    let currentZoom = parseFloat(img.dataset.zoom || 1);
    currentZoom += delta;
    if (currentZoom < 0.1) currentZoom = 0.1;
    img.style.transform = `scale(${currentZoom})`;
    img.dataset.zoom = currentZoom;
}

function resetZoom(index) {
    const img = document.getElementById(`soruResmi_${index}`);
    if (!img) return;
    img.style.transform = 'scale(1)';
    img.dataset.zoom = 1;
}

function zoomAll(delta) {
    sorular.forEach((_, i) => zoomImage(i, delta));
}

function resetAllZoom() {
    sorular.forEach((_, i) => resetZoom(i));
}

window.duzenleSoru = duzenleSoru;
window.soruSil = soruSil;
window.zoomImage = zoomImage;
window.resetZoom = resetZoom;
window.zoomAll = zoomAll;
window.resetAllZoom = resetAllZoom;
window.soruResmiKaldir = soruResmiKaldir;

/**
 * Seçili sorulardan yeni bir banka oluşturur
 */
async function secilenlerdenYeniBanka() {
    const seciliSorular = getSeciliSorular();
    if (seciliSorular.length === 0) {
        showNotification('Lütfen en az bir soru seçiniz.', 'warning');
        return;
    }

    const newBankaAdi = prompt('Yeni banka adını giriniz:', 'Yeni Banka');
    if (!newBankaAdi) return;

    const kaydetBtn = document.querySelector('[onclick="secilenlerdenYeniBanka()"]');
    const originalText = kaydetBtn.innerHTML;
    kaydetBtn.disabled = true;
    kaydetBtn.innerHTML = '<span class="spinner-border spinner-border-sm me-2"></span>Oluşturuluyor...';

    try {
        const SQL = await window.initSqlJs({ locateFile: file => '/lib/sqljs/' + file });
        const db = new SQL.Database();
        db.exec(`
            CREATE TABLE IF NOT EXISTS Ders (Id INTEGER PRIMARY KEY AUTOINCREMENT, DersAdi TEXT NOT NULL);
            CREATE TABLE IF NOT EXISTS Konu (Id INTEGER PRIMARY KEY AUTOINCREMENT, DersId INTEGER NOT NULL, KonuAdi TEXT NOT NULL);
            CREATE TABLE IF NOT EXISTS Kazanim (Id INTEGER PRIMARY KEY AUTOINCREMENT, DersId INTEGER NOT NULL, KonuId INTEGER NOT NULL, KazanimAdi TEXT NOT NULL);
            CREATE TABLE IF NOT EXISTS Soru (
                Id INTEGER PRIMARY KEY AUTOINCREMENT, DersId INTEGER, KonuId INTEGER, KazanimId INTEGER,
                DersAdi TEXT, KonuAdi TEXT, KazanimAdi TEXT, SoruMetni TEXT, SoruMetniAyriMi INTEGER,
                SiklarAyriMi INTEGER, SikA TEXT, SikB TEXT, SikC TEXT, SikD TEXT, SikE TEXT, DogruSik TEXT,
                SoruResmi TEXT, OlusturmaTarihi TEXT
            );
            CREATE TABLE IF NOT EXISTS BankaAyarlari (Id INTEGER PRIMARY KEY AUTOINCREMENT, BankaAdi TEXT, ToplamSoruSayisi INTEGER, OlusturmaTarihi TEXT);
        `);

        const stmtS = db.prepare("INSERT INTO Soru (DersId, KonuId, KazanimId, DersAdi, KonuAdi, KazanimAdi, SoruMetni, SoruMetniAyriMi, SiklarAyriMi, SikA, SikB, SikC, SikD, SikE, DogruSik, SoruResmi, OlusturmaTarihi) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)");

        for (const s of seciliSorular) {
            stmtS.run([
                s.dersId || 1, s.konuId || 1, s.kazanimId || 1,
                s.dersAdi || s.ders || '', s.konuAdi || s.konu || '', s.kazanimAdi || s.kazanim || '',
                s.soruMetni || '', s.soruMetniAyriMi ? 1 : 0, s.sikkarAyriMi ? 1 : 0,
                s.siklar?.A || '', s.siklar?.B || '', s.siklar?.C || '', s.siklar?.D || '', s.siklar?.E || '',
                s.dogruSik || 'A', s.soruResmi || '', s.olusturmaTarihi || new Date().toISOString()
            ]);
        }
        stmtS.free();

        db.run("INSERT INTO BankaAyarlari (BankaAdi, ToplamSoruSayisi, OlusturmaTarihi) VALUES (?,?,?)", [
            newBankaAdi, seciliSorular.length, new Date().toISOString()
        ]);

        const data = db.export();
        const blob = new Blob([data], { type: "application/octet-stream" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `${newBankaAdi}.mg`;
        a.click();
        URL.revokeObjectURL(url);

        showNotification('Yeni banka başarıyla oluşturuldu!', 'success');
    } catch (error) {
        console.error('Banka oluşturma hatası:', error);
        showNotification('Banka oluşturulurken hata oluştu.', 'error');
    } finally {
        kaydetBtn.disabled = false;
        kaydetBtn.innerHTML = originalText;
    }
}

window.secilenlerdenYeniBanka = secilenlerdenYeniBanka;

/**
 * File nesnesini Base64'e çevirir
 */
function fileToBase64(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = error => reject(error);
        reader.readAsDataURL(file);
    });
}

/**
 * Excel şablonu indirir (Dinamik)
 */
async function topluAnahtarSablonIndir() {
    try {
        showNotification('Şablon hazırlanıyor...', 'info');
        
        // Mevcut soruların sadece gerekli kısımlarını gönder (Base64'leri gönderme, çok ağır olur)
        const simplifiedSorular = sorular.map(s => ({
            DogruSik: s.dogruSik || 'A',
            DersAdi: s.dersAdi || '',
            KonuAdi: s.konuAdi || '',
            KazanimAdi: s.kazanimAdi || ''
        }));

        const response = await fetch('/mgtest/DownloadBankaSablon', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(simplifiedSorular)
        });

        if (response.ok) {
            const blob = await response.blob();
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = 'banka_anahtar_sablon.xlsx';
            document.body.appendChild(a);
            a.click();
            window.URL.revokeObjectURL(url);
            a.remove();
            showNotification('Şablon indirildi.', 'success');
        } else {
            showNotification('Şablon oluşturulurken hata oluştu.', 'error');
        }
    } catch (error) {
        console.error('Hata:', error);
        showNotification('Sunucu bağlantı hatası.', 'error');
    }
}

/**
 * Excel'den anahtarları yükler
 */
async function topluExcelYukle(e) {
    const file = e.target.files[0];
    if (!file) return;

    const formData = new FormData();
    formData.append('file', file);

    showNotification('Veriler işleniyor...', 'info');

    try {
        const response = await fetch('/mgtest/UploadBankaExcel', {
            method: 'POST',
            body: formData
        });

        const result = await response.json();
        if (result.success) {
            const updatedData = result.data;
            let updateCount = 0;

            updatedData.forEach(item => {
                const index = item.soruNo - 1;
                if (index >= 0 && index < sorular.length) {
                    sorular[index].dogruSik = item.dogruSik || 'A';
                    sorular[index].dersAdi = item.dersAdi || '';
                    sorular[index].konuAdi = item.konuAdi || '';
                    sorular[index].kazanimAdi = item.kazanimAdi || '';
                    updateCount++;
                }
            });

            guncelleSoruListesi();
            await saveToWorkspace();
            showNotification(`${updateCount} soru başarıyla güncellendi.`, 'success');
        } else {
            showNotification('Hata: ' + result.message, 'error');
        }
    } catch (error) {
        console.error('Hata:', error);
        showNotification('Yükleme sırasında hata oluştu.', 'error');
    } finally {
        e.target.value = '';
    }
}


function topluKlasorSoruEkleModalAc() {
    const modalElement = document.getElementById('topluSoruKaliteModal');
    if (modalElement) {
        const modal = new bootstrap.Modal(modalElement);
        modal.show();
    }
}

function topluKlasorBaslat(maxGenislik) {
    secilenMaxGenislik = maxGenislik;
    const modalElement = document.getElementById('topluSoruKaliteModal');
    if (modalElement) {
        const modal = bootstrap.Modal.getInstance(modalElement);
        if (modal) modal.hide();
    }
    document.getElementById('topluKlasorInput').click();
}

/**
 * Resim boyutunu küçültür
 */
function resizeImage(base64, maxWidth) {
    return new Promise((resolve) => {
        if (maxWidth === 'unlimited') return resolve(base64);

        const img = new Image();
        img.onload = function() {
            if (img.width <= maxWidth) return resolve(base64);

            const canvas = document.createElement('canvas');
            const ratio = maxWidth / img.width;
            canvas.width = maxWidth;
            canvas.height = img.height * ratio;

            const ctx = canvas.getContext('2d');
            ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
            resolve(canvas.toDataURL('image/jpeg', 0.8));
        };
        img.onerror = () => resolve(base64);
        img.src = base64;
    });
}

/**
 * Klasördeki tüm resimleri toplu olarak soru şeklinde ekler
 */
async function topluKlasorSoruEkle(e) {
    const files = Array.from(e.target.files);
    const imageFiles = files.filter(file => file.type.startsWith('image/'));

    if (imageFiles.length === 0) {
        showNotification('Klasörde resim dosyası bulunamadı.', 'warning');
        return;
    }

    showNotification(`${imageFiles.length} resim işleniyor...`, 'info');
    imageFiles.sort((a, b) => a.name.localeCompare(b.name, undefined, {numeric: true, sensitivity: 'base'}));

    for (const file of imageFiles) {
        try {
            let base64 = await fileToBase64(file);
            if (secilenMaxGenislik !== 'unlimited') {
                base64 = await resizeImage(base64, secilenMaxGenislik);
            }

            const yeniSoru = {
                id: Date.now() + Math.floor(Math.random() * 1000000),
                soruResmi: base64,
                soruMetni: '',
                soruMetniAyriMi: false,
                sikkarAyriMi: false,
                dogruSik: 'A',
                dersAdi: '',
                konuAdi: '',
                kazanimAdi: '',
                olusturmaTarihi: new Date().toISOString()
            };
            sorular.push(yeniSoru);
        } catch (err) {
            console.error('Dosya işleme hatası:', file.name, err);
        }
    }

    guncelleSoruListesi();
    await saveToWorkspace();
    showNotification('Toplu yükleme tamamlandı.', 'success');
    e.target.value = '';
}

window.topluKlasorSoruEkle = topluKlasorSoruEkle;

/**
 * Tüm soruları seçer
 */
function tumunuSec() {
    document.querySelectorAll('.soru-sec').forEach(cb => cb.checked = true);
}

/**
 * Tüm seçimleri kaldırır
 */
function tumunuKaldir() {
    document.querySelectorAll('.soru-sec').forEach(cb => cb.checked = false);
}

/**
 * Seçili soruları toplu olarak siler
 */
async function secilenleriSil() {
    const checkboxes = document.querySelectorAll('.soru-sec:checked');
    if (checkboxes.length === 0) {
        showNotification('Hiç soru seçilmedi!', 'warning');
        return;
    }

    if (!confirm(`${checkboxes.length} soruyu silmek istediğinizden emin misiniz?`)) {
        return;
    }

    const silinecekIndexler = Array.from(checkboxes)
        .map(cb => parseInt(cb.getAttribute('data-index')))
        .sort((a, b) => b - a);

    silinecekIndexler.forEach(idx => {
        sorular.splice(idx, 1);
    });

    guncelleSoruListesi();
    await saveToWorkspace();
    showNotification(`${silinecekIndexler.length} soru silindi.`, 'info');
}

window.tumunuSec = tumunuSec;
window.tumunuKaldir = tumunuKaldir;
window.secilenleriSil = secilenleriSil;


// ============================================
// SEPETE SORU GÃ–NDERME FONKSÄ°YONU
// ============================================

async function secilenleriSepeteGonder() {
    const checkboxes = document.querySelectorAll('.soru-sec:checked');
    if (checkboxes.length === 0) {
        showNotification('LÃ¼tfen Ã¶nce soru seÃ§iniz!', 'warning');
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
        console.error('Sepet okunurken hata oluÅŸtu:', e);
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
                msg += ` (${ciftSayac} adet soru zaten sepette olduşu için eklenmedi)`;
            }
            showNotification(msg, 'success');
        } else {
            showNotification('SeÃ§ilen tÃ¼m sorular zaten sepette mevcut!', 'info');
        }
    } catch (e) {
        console.error('Sepete kaydederken hata oluÅŸtu:', e);
        showNotification('Sepete kaydedilirken hata oluÅŸtu!', 'error');
    }
}

window.secilenleriSepeteGonder = secilenleriSepeteGonder;
