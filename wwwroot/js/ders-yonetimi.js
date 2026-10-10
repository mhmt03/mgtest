/**
 * DERS YÖNETİMİ MODÜLÜ
 * 
 * Bu dosya Ders/Konu/Kazanım hiyerarşisini yönetir.
 * Bu kodu başka bir sayfaya taşımak için:
 * 1. Bu JS dosyasını sayfanıza dahil edin
 * 2. Aşağıdaki HTML kodunu sayfanıza ekleyin (HTML bölümüne bakın)
 * 3. Backend endpoint'lerinin hazır olduğundan emin olun
 */

// Global notification helper (if not already defined)
if (typeof window.showNotification !== 'function') {
    window.showNotification = function(message, type = 'info') {
        const colors = {
            success: '#28a745',
            error: '#dc3545',
            warning: '#ffc107',
            info: '#17a2b8'
        };

        // Toast-like notification
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
    };
}

// ============================================
// GLOBAL DEĞİŞKENLER - DERS YÖNETİMİ
// ============================================

let seciliDersId = null;      // Seçili ders ID'si
let seciliKonuId = null;      // Seçili konu ID'si
let seciliKazanimId = null;   // Seçili kazanım ID'si
let dersEkleModal = null;     // Modal instance

// ============================================
// BAŞLATMA FONKSİYONU
// ============================================

document.addEventListener('DOMContentLoaded', function() {
    initializeDersYonetimi();
});

function initializeDersYonetimi() {
    // Modal instance'ını oluştur
    const modalElement = document.getElementById('dersEkleModal');
    if (modalElement) {
        dersEkleModal = new bootstrap.Modal(modalElement);
    }
    
    // Event listener'ları bağla
    bindDersYonetimiEvents();
    
    console.log('✅ Ders Yönetimi modülü başlatıldı');
}

// ============================================
// EVENT LISTENER'LAR
// ============================================

function bindDersYonetimiEvents() {
    // Ders Ekle butonu - Modalı açar
    const dersEkleBtn = document.getElementById('dersEkleBtn');
    if (dersEkleBtn) {
        dersEkleBtn.addEventListener('click', dersEkleModalAc);
    }
    
    // DERS İŞLEMLERİ
    document.getElementById('dersEkleOnayBtn')?.addEventListener('click', dersEkle);
    document.getElementById('dersSilBtn')?.addEventListener('click', dersSil);
    
    // KONU İŞLEMLERİ
    document.getElementById('konuEkleOnayBtn')?.addEventListener('click', konuEkle);
    document.getElementById('konuSilBtn')?.addEventListener('click', konuSil);
    
    // KAZANIM İŞLEMLERİ
    document.getElementById('kazanimEkleOnayBtn')?.addEventListener('click', kazanimEkle);
    document.getElementById('kazanimSilBtn')?.addEventListener('click', kazanimSil);
}

// ============================================
// MODAL AÇMA FONKSİYONU
// ============================================

/**
 * Ders yönetimi modalını açar ve dersleri yükler
 */
async function dersEkleModalAc() {
    if (dersEkleModal) {
        dersEkleModal.show();
        await dersleriYukle();
    }
}

// ============================================
// DERS İŞLEMLERİ
// ============================================

/**
 * Kullanıcının derslerini backend'den çeker ve listeler
 */
async function dersleriYukle() {
    try {
        showLoadingSpinner('dersListesi');
        
        const response = await fetch('/mgtest/GetDersler');
        
        if (!response.ok) {
            throw new Error('Dersler yüklenemedi');
        }
        
        const dersler = await response.json();
        
        let html = '';
        if (dersler.length === 0) {
            html = '<li class="list-group-item text-muted text-center">Henüz ders eklenmemiş</li>';
        } else {
            dersler.forEach(d => {
                html += `
                    <li class='list-group-item list-group-item-action d-flex justify-content-between align-items-center' 
                        data-id='${d.id}' 
                        onclick='dersSec(${d.id}, this)'
                        style='cursor:pointer'>
                        <span>${d.ders}</span>
                        <i class="bi bi-chevron-right"></i>
                    </li>
                `;
            });
        }
        
        document.getElementById('dersListesi').innerHTML = html;
        
        // Seçili dersi temizle
        seciliDersId = null;
        konulariTemizle();
        kazanimlariTemizle();
        
    } catch (error) {
        console.error('Ders yükleme hatası:', error);
        showNotification('Dersler yüklenirken bir hata oluştu', 'error');
        document.getElementById('dersListesi').innerHTML = 
            '<li class="list-group-item text-danger">Yükleme hatası</li>';
    }
}

/**
 * Ders seçildiğinde çağrılır
 */
window.dersSec = function(id, element) {
    seciliDersId = id;
    
    // Tüm derslerin active class'ını kaldır
    document.querySelectorAll('#dersListesi .list-group-item').forEach(item => {
        item.classList.remove('active');
    });
    
    // Seçili dersi vurgula
    element.classList.add('active');
    
    // İlgili konuları yükle
    konulariYukle();
}

/**
 * Yeni ders ekler
 */
async function dersEkle() {
    const dersAdiInput = document.getElementById('dersAdiInput');
    const dersAdi = dersAdiInput.value.trim();
    
    if (!dersAdi) {
        showNotification('Ders adı boş olamaz!', 'warning');
        return;
    }
    
    try {
        const response = await fetch('/mgtest/AddDers', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
            },
            body: `dersAdi=${encodeURIComponent(dersAdi)}`
        });
        
        const result = await response.json();
        
        if (result.success) {
            showNotification('Ders eklendi', 'success');
            dersAdiInput.value = '';
            
            // Dersleri tekrar yükle
            await dersleriYukle();
            
            // Yeni eklenen dersi otomatik seç
            if (result.ders && result.ders.id) {
                setTimeout(() => {
                    const newDersElement = document.querySelector(`#dersListesi .list-group-item[data-id='${result.ders.id}']`);
                    if (newDersElement) {
                        dersSec(result.ders.id, newDersElement);
                    }
                }, 100);
            }
        } else {
            showNotification(result.message || 'Ders eklenemedi', 'error');
        }
    } catch (error) {
        console.error('Ders ekleme hatası:', error);
        showNotification('Ders eklenirken bir hata oluştu', 'error');
    }
}

/**
 * Seçili dersi siler
 */
async function dersSil() {
    if (!seciliDersId) {
        showNotification('Lütfen silinecek bir ders seçin', 'warning');
        return;
    }
    
    if (!confirm('Bu ders ve altındaki tüm konular/kazanımlar silinecek. Emin misiniz?')) {
        return;
    }
    
    try {
        const response = await fetch('/mgtest/DeleteDers', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
            },
            body: `dersId=${seciliDersId}`
        });
        
        const result = await response.json();
        
        if (result.success) {
            showNotification('Ders silindi', 'success');
            await dersleriYukle();
        } else {
            showNotification(result.message || 'Ders silinemedi', 'error');
        }
    } catch (error) {
        console.error('Ders silme hatası:', error);
        showNotification('Ders silinirken bir hata oluştu', 'error');
    }
}

// ============================================
// KONU İŞLEMLERİ
// ============================================

/**
 * Seçili derse ait konuları yükler
 */
async function konulariYukle() {
    if (!seciliDersId) {
        konulariTemizle();
        return;
    }
    
    try {
        showLoadingSpinner('konuListesi');
        
        const response = await fetch(`/mgtest/GetKonular?dersId=${seciliDersId}`);
        const konular = await response.json();
        
        let html = '';
        if (konular.length === 0) {
            html = '<li class="list-group-item text-muted text-center">Henüz konu eklenmemiş</li>';
        } else {
            konular.forEach(k => {
                html += `
                    <li class='list-group-item list-group-item-action d-flex justify-content-between align-items-center' 
                        data-id='${k.id}' 
                        onclick='konuSec(${k.id}, this)'
                        style='cursor:pointer'>
                        <span>${k.konu}</span>
                        <i class="bi bi-chevron-right"></i>
                    </li>
                `;
            });
        }
        
        document.getElementById('konuListesi').innerHTML = html;
        seciliKonuId = null;
        kazanimlariTemizle();
        
    } catch (error) {
        console.error('Konu yükleme hatası:', error);
        showNotification('Konular yüklenirken bir hata oluştu', 'error');
    }
}

/**
 * Konu listesini temizler
 */
function konulariTemizle() {
    document.getElementById('konuListesi').innerHTML = 
        '<li class="list-group-item text-muted text-center">Önce bir ders seçin</li>';
    seciliKonuId = null;
    kazanimlariTemizle();
}

/**
 * Konu seçildiğinde çağrılır
 */
window.konuSec = function(id, element) {
    seciliKonuId = id;
    
    document.querySelectorAll('#konuListesi .list-group-item').forEach(item => {
        item.classList.remove('active');
    });
    
    element.classList.add('active');
    kazanimlariYukle();
}

/**
 * Yeni konu ekler
 */
async function konuEkle() {
    if (!seciliDersId) {
        showNotification('Önce bir ders seçin!', 'warning');
        return;
    }
    
    const konuAdiInput = document.getElementById('konuAdiInput');
    const konuAdi = konuAdiInput.value.trim();
    
    if (!konuAdi) {
        showNotification('Konu adı boş olamaz!', 'warning');
        return;
    }
    
    try {
        const response = await fetch('/mgtest/AddKonu', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
            },
            body: `dersId=${seciliDersId}&konuAdi=${encodeURIComponent(konuAdi)}`
        });
        
        const result = await response.json();
        
        if (result.success) {
            showNotification('Konu eklendi', 'success');
            konuAdiInput.value = '';
            await konulariYukle();
            
            if (result.konu && result.konu.id) {
                setTimeout(() => {
                    const newKonuElement = document.querySelector(`#konuListesi .list-group-item[data-id='${result.konu.id}']`);
                    if (newKonuElement) {
                        konuSec(result.konu.id, newKonuElement);
                    }
                }, 100);
            }
        } else {
            showNotification(result.message || 'Konu eklenemedi', 'error');
        }
    } catch (error) {
        console.error('Konu ekleme hatası:', error);
        showNotification('Konu eklenirken bir hata oluştu', 'error');
    }
}

/**
 * Seçili konuyu siler
 */
async function konuSil() {
    if (!seciliKonuId) {
        showNotification('Lütfen silinecek bir konu seçin', 'warning');
        return;
    }
    
    if (!confirm('Bu konu ve altındaki tüm kazanımlar silinecek. Emin misiniz?')) {
        return;
    }
    
    try {
        const response = await fetch('/mgtest/DeleteKonu', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
            },
            body: `konuId=${seciliKonuId}`
        });
        
        const result = await response.json();
        
        if (result.success) {
            showNotification('Konu silindi', 'success');
            await konulariYukle();
        } else {
            showNotification(result.message || 'Konu silinemedi', 'error');
        }
    } catch (error) {
        console.error('Konu silme hatası:', error);
        showNotification('Konu silinirken bir hata oluştu', 'error');
    }
}

// ============================================
// KAZANIM İŞLEMLERİ
// ============================================

/**
 * Seçili konuya ait kazanımları yükler
 */
async function kazanimlariYukle() {
    if (!seciliKonuId) {
        kazanimlariTemizle();
        return;
    }
    
    try {
        showLoadingSpinner('kazanimListesi');
        
        const response = await fetch(`/mgtest/GetKazanims?konuId=${seciliKonuId}`);
        const kazanimlar = await response.json();
        
        let html = '';
        if (kazanimlar.length === 0) {
            html = '<li class="list-group-item text-muted text-center">Henüz kazanım eklenmemiş</li>';
        } else {
            kazanimlar.forEach(kz => {
                html += `
                    <li class='list-group-item list-group-item-action d-flex justify-content-between align-items-center' 
                        data-id='${kz.id}' 
                        onclick='kazanimSec(${kz.id}, this)'
                        style='cursor:pointer'>
                        <span>${kz.kazanim}</span>
                        <i class="bi bi-check-circle"></i>
                    </li>
                `;
            });
        }
        
        document.getElementById('kazanimListesi').innerHTML = html;
        seciliKazanimId = null;
        
    } catch (error) {
        console.error('Kazanım yükleme hatası:', error);
        showNotification('Kazanımlar yüklenirken bir hata oluştu', 'error');
    }
}

/**
 * Kazanım listesini temizler
 */
function kazanimlariTemizle() {
    document.getElementById('kazanimListesi').innerHTML = 
        '<li class="list-group-item text-muted text-center">Önce bir konu seçin</li>';
    seciliKazanimId = null;
}

/**
 * Kazanım seçildiğinde çağrılır
 */
window.kazanimSec = function(id, element) {
    seciliKazanimId = id;
    
    document.querySelectorAll('#kazanimListesi .list-group-item').forEach(item => {
        item.classList.remove('active');
    });
    
    element.classList.add('active');
}

/**
 * Yeni kazanım ekler
 */
async function kazanimEkle() {
    if (!seciliKonuId) {
        showNotification('Önce bir konu seçin!', 'warning');
        return;
    }
    
    const kazanimAdiInput = document.getElementById('kazanimAdiInput');
    const kazanimAdi = kazanimAdiInput.value.trim();
    
    if (!kazanimAdi) {
        showNotification('Kazanım adı boş olamaz!', 'warning');
        return;
    }
    
    try {
        const response = await fetch('/mgtest/AddKazanim', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
            },
            body: `konuId=${seciliKonuId}&kazanimAdi=${encodeURIComponent(kazanimAdi)}`
        });
        
        const result = await response.json();
        
        if (result.success) {
            showNotification('Kazanım eklendi', 'success');
            kazanimAdiInput.value = '';
            await kazanimlariYukle();
            
            if (result.kazanim && result.kazanim.id) {
                setTimeout(() => {
                    const newKazanimElement = document.querySelector(`#kazanimListesi .list-group-item[data-id='${result.kazanim.id}']`);
                    if (newKazanimElement) {
                        kazanimSec(result.kazanim.id, newKazanimElement);
                    }
                }, 100);
            }
        } else {
            showNotification(result.message || 'Kazanım eklenemedi', 'error');
        }
    } catch (error) {
        console.error('Kazanım ekleme hatası:', error);
        showNotification('Kazanım eklenirken bir hata oluştu', 'error');
    }
}

/**
 * Seçili kazanımı siler
 */
async function kazanimSil() {
    if (!seciliKazanimId) {
        showNotification('Lütfen silinecek bir kazanım seçin', 'warning');
        return;
    }
    
    if (!confirm('Bu kazanım silinecek. Emin misiniz?')) {
        return;
    }
    
    try {
        const response = await fetch('/mgtest/DeleteKazanim', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
            },
            body: `kazanimId=${seciliKazanimId}`
        });
        
        const result = await response.json();
        
        if (result.success) {
            showNotification('Kazanım silindi', 'success');
            await kazanimlariYukle();
        } else {
            showNotification(result.message || 'Kazanım silinemedi', 'error');
        }
    } catch (error) {
        console.error('Kazanım silme hatası:', error);
        showNotification('Kazanım silinirken bir hata oluştu', 'error');
    }
}

// ============================================
// YARDIMCI FONKSİYONLAR
// ============================================

/**
 * Yükleme spinner'ı gösterir
 */
function showLoadingSpinner(elementId) {
    const element = document.getElementById(elementId);
    if (element) {
        element.innerHTML = `
            <li class="list-group-item text-center">
                <div class="spinner-border spinner-border-sm text-primary" role="status">
                    <span class="visually-hidden">Yükleniyor...</span>
                </div>
                Yükleniyor...
            </li>
        `;
    }
}

// showNotification fonksiyonu ana dosyada (soru-bankasi.js) tanımlı
// Eğer bu dosya bağımsız kullanılacaksa, aşağıdaki fonksiyonu ekleyin:

/*
function showNotification(message, type = 'info') {
    const colors = {
        success: 'alert-success',
        error: 'alert-danger',
        warning: 'alert-warning',
        info: 'alert-info'
    };
    
    const notification = document.createElement('div');
    notification.className = `alert ${colors[type]} alert-dismissible fade show position-fixed top-0 end-0 m-3`;
    notification.style.zIndex = '9999';
    notification.style.minWidth = '300px';
    notification.innerHTML = `
        ${message}
        <button type="button" class="btn-close" data-bs-dismiss="alert"></button>
    `;
    
    document.body.appendChild(notification);
    
    setTimeout(() => {
        notification.remove();
    }, 3000);
}
// ============================================
// EXCEL İŞLEMLERİ
// ============================================

/**
 * Excel şablonunu indirir
 */
window.dersSablonIndir = function() {
    window.location.href = '/mgtest/DownloadDersSablon';
}

/**
 * Excel dosyasını yükler
 */
window.dersExcelYukle = async function(event) {
    const file = event.target.files[0];
    if (!file) return;

    if (!confirm(`${file.name} dosyasındaki veriler yüklenecek. Devam edilsin mi?`)) {
        event.target.value = '';
        return;
    }

    const formData = new FormData();
    formData.append('file', file);

    try {
        // Yükleme göstergesi
        const uploadBtn = document.querySelector('button[onclick*="dersExcelInput"]');
        const originalHtml = uploadBtn.innerHTML;
        uploadBtn.disabled = true;
        uploadBtn.innerHTML = '<span class="spinner-border spinner-border-sm" role="status" aria-hidden="true"></span> Yükleniyor...';

        const response = await fetch('/mgtest/UploadDersExcel', {
            method: 'POST',
            body: formData
        });

        const result = await response.json();

        if (result.success) {
            showNotification(result.message, 'success');
            // Listeyi yenile
            await dersleriYukle();
        } else {
            showNotification(result.message || 'Yükleme başarısız', 'error');
        }

        // Butonu eski haline getir
        uploadBtn.disabled = false;
        uploadBtn.innerHTML = originalHtml;
        event.target.value = '';

    } catch (error) {
        console.error('Excel yükleme hatası:', error);
        showNotification('Excel yüklenirken bir hata oluştu', 'error');
        
        const uploadBtn = document.querySelector('button[onclick*="dersExcelInput"]');
        uploadBtn.disabled = false;
        uploadBtn.innerHTML = '<i class="bi bi-upload"></i> Excel\'den Yükle';
        event.target.value = '';
    }
}

