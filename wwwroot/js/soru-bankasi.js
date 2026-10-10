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

    // Matematik araç çubuğunu başlat
    initializeMathToolbar();

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
        const modalEl = document.getElementById('soruEkleModal');
        const isModalOpen = modalEl && modalEl.classList.contains('show');

        // Ctrl + K veya Cmd + K kısayolu ile kaydet
        if ((e.ctrlKey || e.metaKey) && (e.key === 'k' || e.key === 'K')) {
            if (isModalOpen) {
                e.preventDefault();
                e.stopPropagation();
                document.getElementById('soruKaydetBtn')?.click();
                return;
            }
        }

        // Alt + A, Alt + B, Alt + C, Alt + D, Alt + E kısayolları ile doğru cevabı seçme
        if (isModalOpen && e.altKey && !e.ctrlKey && !e.metaKey) {
            const keyLower = (e.key || '').toLowerCase();
            const code = e.code || '';
            let secilenHarf = null;

            if (keyLower === 'a' || code === 'KeyA') secilenHarf = 'A';
            else if (keyLower === 'b' || code === 'KeyB') secilenHarf = 'B';
            else if (keyLower === 'c' || code === 'KeyC') secilenHarf = 'C';
            else if (keyLower === 'd' || code === 'KeyD') secilenHarf = 'D';
            else if (keyLower === 'e' || code === 'KeyE') secilenHarf = 'E';

            if (secilenHarf) {
                e.preventDefault();
                e.stopPropagation();
                const targetRadio = document.getElementById(`dogruSik_${secilenHarf}`);
                if (targetRadio) {
                    targetRadio.checked = true;
                    targetRadio.dispatchEvent(new Event('change', { bubbles: true }));
                    if (typeof showNotification === 'function') {
                        showNotification(`Doğru cevap: ${secilenHarf} şıkkı olarak seçildi (Alt+${secilenHarf})`, 'info');
                    }
                }
                return;
            }
        }

        if (isModalOpen) {
            const activeTag = document.activeElement ? document.activeElement.tagName.toLowerCase() : '';
            const isEditingText = activeTag === 'input' || activeTag === 'textarea';
            if (!isEditingText) {
                if (e.key === 'ArrowLeft') oncekiSoru();
                if (e.key === 'ArrowRight') sonrakiSoru();
            }
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

    // Panodan Yapıştır butonu
    document.getElementById('panodanYapistirBtn')?.addEventListener('click', () => {
        panodanResimYapistir();
    });

    // Soru Resmi Önizleme alanına sürükle-bırak (Drag & Drop) desteği
    const previewArea = document.getElementById('soruResmiPreview');
    if (previewArea) {
        previewArea.addEventListener('dragover', (e) => {
            e.preventDefault();
            e.stopPropagation();
            previewArea.style.borderColor = '#198754';
            previewArea.style.backgroundColor = '#f0fff4';
        });
        ['dragleave', 'dragend'].forEach(evtName => {
            previewArea.addEventListener(evtName, (e) => {
                e.preventDefault();
                e.stopPropagation();
                previewArea.style.borderColor = '#dee2e6';
                previewArea.style.backgroundColor = '#f8f9fa';
            });
        });
        previewArea.addEventListener('drop', (e) => {
            e.preventDefault();
            e.stopPropagation();
            previewArea.style.borderColor = '#dee2e6';
            previewArea.style.backgroundColor = '#f8f9fa';
            if (e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files.length > 0) {
                const droppedFile = e.dataTransfer.files[0];
                if (droppedFile.type && droppedFile.type.startsWith('image/')) {
                    if (droppedFile.size > 5 * 1024 * 1024) {
                        showNotification('Resim boyutu en fazla 5MB olabilir!', 'error');
                        return;
                    }
                    const reader = new FileReader();
                    reader.onload = (evt) => {
                        gosterSoruResmiOnizleme(evt.target.result);
                        showNotification('Resim başarıyla yüklendi!', 'success');
                    };
                    reader.readAsDataURL(droppedFile);
                } else {
                    showNotification('Lütfen geçerli bir resim dosyası bırakın.', 'warning');
                }
            }
        });
    }

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
// MATEMATİK & SEMBOL ARAÇ ÇUBUĞU YÖNETİMİ
// ============================================

let sonSeciliInput = null;

const SUPERSCRIPT_MAP = {
    '0': '⁰', '1': '¹', '2': '²', '3': '³', '4': '⁴', '5': '⁵', '6': '⁶', '7': '⁷', '8': '⁸', '9': '⁹',
    '+': '⁺', '-': '⁻', '=': '⁼', '(': '⁽', ')': '⁾', 'n': 'ⁿ', 'i': 'ⁱ', 'x': 'ˣ', 'y': 'ʸ', 'a': 'ᵃ', 'b': 'ᵇ'
};

const SUBSCRIPT_MAP = {
    '0': '₀', '1': '₁', '2': '₂', '3': '₃', '4': '₄', '5': '₅', '6': '₆', '7': '₇', '8': '₈', '9': '₉',
    '+': '₊', '-': '₋', '=': '₌', '(': '₍', ')': '₎', 'a': 'ₐ', 'e': 'ₑ', 'o': 'ₒ', 'x': 'ₓ', 'h': 'ₕ', 'k': 'ₖ', 'l': 'ₗ', 'm': 'ₘ', 'n': 'ₙ', 'p': 'ₚ', 's': 'ₛ', 't': 'ₜ'
};

const AUTO_REPLACE_RULES = [
    { from: /\^0/g, to: '⁰' },
    { from: /\^1/g, to: '¹' },
    { from: /\^2/g, to: '²' },
    { from: /\^3/g, to: '³' },
    { from: /\^4/g, to: '⁴' },
    { from: /\^5/g, to: '⁵' },
    { from: /\^6/g, to: '⁶' },
    { from: /\^7/g, to: '⁷' },
    { from: /\^8/g, to: '⁸' },
    { from: /\^9/g, to: '⁹' },
    { from: /\^\+/g, to: '⁺' },
    { from: /\^\-/g, to: '⁻' },
    { from: /\^n/g, to: 'ⁿ' },
    { from: /\^x/g, to: 'ˣ' },
    { from: /\^y/g, to: 'ʸ' },
    { from: /_0/g, to: '₀' },
    { from: /_1/g, to: '₁' },
    { from: /_2/g, to: '₂' },
    { from: /_3/g, to: '₃' },
    { from: /_4/g, to: '₄' },
    { from: /_5/g, to: '₅' },
    { from: /_6/g, to: '₆' },
    { from: /_7/g, to: '₇' },
    { from: /_8/g, to: '₈' },
    { from: /_9/g, to: '₉' },
    { from: /_\+/g, to: '₊' },
    { from: /_\-/g, to: '₋' },
    { from: /\+\-/g, to: '±' },
    { from: /<=/g, to: '≤' },
    { from: />=/g, to: '≥' },
    { from: /!=/g, to: '≠' },
    { from: /->/g, to: '→' },
    { from: /=>/g, to: '⇒' }
];

function initializeMathToolbar() {
    const inputIds = ['soruMetniInput', 'A', 'B', 'C', 'D', 'E'];
    inputIds.forEach(id => {
        const el = document.getElementById(id);
        if (el) {
            el.addEventListener('focus', () => { sonSeciliInput = el; });
            el.addEventListener('click', () => { sonSeciliInput = el; });
            el.addEventListener('input', () => { applyAutoReplace(el); });
        }
    });
}

function getAktifGirisElementi() {
    if (sonSeciliInput && document.body.contains(sonSeciliInput)) {
        return sonSeciliInput;
    }
    return document.getElementById('soruMetniInput');
}

function sembolEkle(sembol) {
    const input = getAktifGirisElementi();
    if (!input) return;

    const start = input.selectionStart ?? input.value.length;
    const end = input.selectionEnd ?? input.value.length;
    const val = input.value || '';

    input.value = val.substring(0, start) + sembol + val.substring(end);
    const newPos = start + sembol.length;
    input.focus();
    input.setSelectionRange(newPos, newPos);
    input.dispatchEvent(new Event('input', { bubbles: true }));
}

function secileniUstIndisYap() {
    metinDonustur(c => SUPERSCRIPT_MAP[c] || c, '²');
}

function secileniAltIndisYap() {
    metinDonustur(c => SUBSCRIPT_MAP[c] || c, '₁');
}

function metinDonustur(mapFn, defaultChar) {
    const input = getAktifGirisElementi();
    if (!input) return;

    const start = input.selectionStart ?? 0;
    const end = input.selectionEnd ?? 0;
    const val = input.value || '';

    if (start !== end) {
        const selected = val.substring(start, end);
        let result = '';
        for (let i = 0; i < selected.length; i++) {
            result += mapFn(selected[i]);
        }
        input.value = val.substring(0, start) + result + val.substring(end);
        input.focus();
        input.setSelectionRange(start, start + result.length);
    } else {
        sembolEkle(defaultChar);
    }
    input.dispatchEvent(new Event('input', { bubbles: true }));
}

function toggleMathDrawer() {
    const drawer = document.getElementById('mathSymbolsDrawer');
    const text = document.getElementById('toggleMathDrawerText');
    const icon = document.getElementById('toggleMathDrawerIcon');
    if (!drawer) return;

    if (drawer.classList.contains('d-none')) {
        drawer.classList.remove('d-none');
        if (text) text.textContent = 'Daralt';
        if (icon) icon.className = 'bi bi-chevron-up';
    } else {
        drawer.classList.add('d-none');
        if (text) text.textContent = 'Tüm Semboller';
        if (icon) icon.className = 'bi bi-chevron-down';
    }
}

function applyAutoReplace(input) {
    if (!input || !input.value) return;
    const cursorPos = input.selectionStart;
    let text = input.value;
    let changed = false;

    for (const rule of AUTO_REPLACE_RULES) {
        if (rule.from.test(text)) {
            text = text.replace(rule.from, rule.to);
            changed = true;
        }
    }

    if (changed) {
        const diff = input.value.length - text.length;
        input.value = text;
        const newPos = Math.max(0, cursorPos - diff);
        input.setSelectionRange(newPos, newPos);
    }
}

window.sembolEkle = sembolEkle;
window.secileniUstIndisYap = secileniUstIndisYap;
window.secileniAltIndisYap = secileniAltIndisYap;
window.toggleMathDrawer = toggleMathDrawer;

// ============================================
// SORU EKLEME/DÜZENLEME FONKSİYONLARI
// ============================================

/**
 * Soru Ekleme modalını açar ve formu temizler
 */
async function soruEkleModalAc() {
    duzenlenenSoruIndex = null;
    sonSeciliInput = document.getElementById('soruMetniInput');
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

    soruResmiKaldir(true);
}

/**
 * Soru kaydeder (yeni ekler veya mevcut olanı günceller)
 */
let isSavingSoru = false;
function soruKaydet(e) {
    if (e && e.preventDefault) e.preventDefault();
    if (isSavingSoru) return;
    isSavingSoru = true;

    try {
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
            dersAdi: dersSelect?.options[dersSelect.selectedIndex]?.text || '',
            dersId: dersSelect?.value || 1,
            konuAdi: konuSelect?.options[konuSelect.selectedIndex]?.text || '',
            konuId: konuSelect?.value || 1,
            kazanimAdi: kazanimSelect?.options[kazanimSelect.selectedIndex]?.text || '',
            kazanimId: kazanimSelect?.value || 1,
            soruMetni: soruMetni,
            soruMetniAyriMi: document.getElementById('soruMetniAyriMi')?.checked || false,
            sikkarAyriMi: document.getElementById('sikkarAyriMi')?.checked || false,
            siklar: {
                A: document.getElementById('A') ? document.getElementById('A').value.trim() : '',
                B: document.getElementById('B') ? document.getElementById('B').value.trim() : '',
                C: document.getElementById('C') ? document.getElementById('C').value.trim() : '',
                D: document.getElementById('D') ? document.getElementById('D').value.trim() : '',
                E: document.getElementById('E') ? document.getElementById('E').value.trim() : ''
            },
            dogruSik: document.querySelector('input[name="dogruSik"]:checked')?.value || 'A',
            zorlukSeviye: document.getElementById('zorlukSelect')?.value || 'orta',
            kaynak: document.getElementById('kaynakInput')?.value?.trim() || '',
            etiket: document.getElementById('etiketInput')?.value?.trim() || '',
            cozumLinki: document.getElementById('cozumLinkiInput')?.value?.trim() || '',
            aciklama: document.getElementById('aciklamaInput')?.value?.trim() || '',
            tarihOlusturma: duzenlenenSoruIndex !== null ?
                (sorular[duzenlenenSoruIndex].tarihOlusturma || sorular[duzenlenenSoruIndex].olusturmaTarihi || new Date().toISOString()) :
                new Date().toISOString(),
            tarihDuzenleme: duzenlenenSoruIndex !== null ? new Date().toISOString() : null,
            olusturmaTarihi: duzenlenenSoruIndex !== null ?
                sorular[duzenlenenSoruIndex].olusturmaTarihi :
                new Date().toISOString()
        };

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

        // Kullanıcı istekleri doğrultusunda form alanlarını temizle:
        // 1. Resim kutusu temizlenmeli
        // 2. Soru metni ve şıklar temizlenmeli
        // 3. Checkbox'ların (soruMetniAyriMi, sikkarAyriMi) durumu DEĞİŞMEMELİ
        // 4. Dropdownlist'lerde (dersSelect, konuSelect, kazanimSelect) seçili olan öğeler DEĞİŞMEMELİ
        soruGirisAlanlariniTemizle();
    } finally {
        setTimeout(() => {
            isSavingSoru = false;
        }, 300);
    }
}

/**
 * Kaydetme sonrası soru giriş alanlarını temizler:
 * - Resim kutusunu temizler
 * - Soru metnini ve şıkları temizler
 * - Checkbox'lara ve dropdownlist seçimlerine dokunmaz
 */
function soruGirisAlanlariniTemizle() {
    // 1. Resim kutusunu ve dosya inputlarını temizle
    soruResmiKaldir(true);
    const soruResmiInput = document.getElementById('soruResmiInput');
    if (soruResmiInput) soruResmiInput.value = '';
    const pdfResmiInput = document.getElementById('pdfResmiInput');
    if (pdfResmiInput) pdfResmiInput.value = '';

    // 2. Soru metnini temizle
    const soruMetniInput = window.safeGetElementById('soruMetniInput');
    if (soruMetniInput) {
        soruMetniInput.value = '';
    }

    // 3. Şıkları temizle
    ['A', 'B', 'C', 'D', 'E'].forEach(harf => {
        const sikInput = window.safeGetElementById(harf);
        if (sikInput) {
            sikInput.value = '';
        }
    });

    // 4. Doğru cevabı varsayılan olarak 'A' şıkkına getir
    const dogruA = document.getElementById('dogruSik_A');
    if (dogruA) {
        dogruA.checked = true;
        dogruA.dispatchEvent(new Event('change', { bubbles: true }));
    }

    // 5. Düzenleme modunu sıfırla (sıradaki kayıt yeni soru olsun)
    duzenlenenSoruIndex = null;
    const nav = document.getElementById('modalNavigasyon');
    if (nav) nav.classList.add('d-none');

    // 6. Yeni meta alanları temizle / varsayılana getir
    const zorlukSel = document.getElementById('zorlukSelect');
    if (zorlukSel) zorlukSel.value = 'orta';
    const kaynakIn = document.getElementById('kaynakInput');
    if (kaynakIn) kaynakIn.value = '';
    const etiketIn = document.getElementById('etiketInput');
    if (etiketIn) etiketIn.value = '';
    const cozumIn = document.getElementById('cozumLinkiInput');
    if (cozumIn) cozumIn.value = '';
    const aciklamaIn = document.getElementById('aciklamaInput');
    if (aciklamaIn) aciklamaIn.value = '';
    const tarihBox = document.getElementById('soruTarihBilgisi');
    if (tarihBox) { tarihBox.innerHTML = ''; tarihBox.style.display = 'none'; }

    // NOT: dersSelect, konuSelect, kazanimSelect (dropdownlist'ler) ve 
    // soruMetniAyriMi, sikkarAyriMi (checkbox switch'ler) durumu kasıtlı olarak DEĞİŞTİRİLMEZ.
}

window.soruKaydet = soruKaydet;
window.soruGirisAlanlariniTemizle = soruGirisAlanlariniTemizle;

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
    if (soru.soruResmi) {
        gosterSoruResmiOnizleme(soru.soruResmi);
    } else {
        soruResmiKaldir(true);
    }

    // Yeni meta alanları doldur
    if (document.getElementById('zorlukSelect')) {
        document.getElementById('zorlukSelect').value = soru.zorlukSeviye || 'orta';
    }
    if (document.getElementById('kaynakInput')) {
        document.getElementById('kaynakInput').value = soru.kaynak || '';
    }
    if (document.getElementById('etiketInput')) {
        document.getElementById('etiketInput').value = soru.etiket || '';
    }
    if (document.getElementById('cozumLinkiInput')) {
        document.getElementById('cozumLinkiInput').value = soru.cozumLinki || '';
    }
    if (document.getElementById('aciklamaInput')) {
        document.getElementById('aciklamaInput').value = soru.aciklama || '';
    }
    const tarihBox = document.getElementById('soruTarihBilgisi');
    if (tarihBox) {
        let tHtml = '';
        if (soru.tarihOlusturma || soru.olusturmaTarihi) {
            const d = new Date(soru.tarihOlusturma || soru.olusturmaTarihi);
            tHtml += `<div><i class="bi bi-calendar-plus text-primary me-1"></i>Oluşturulma: <strong>${d.toLocaleString('tr-TR')}</strong></div>`;
        }
        if (soru.tarihDuzenleme) {
            const d = new Date(soru.tarihDuzenleme);
            tHtml += `<div><i class="bi bi-pencil-square text-warning me-1"></i>Son Düzenleme: <strong>${d.toLocaleString('tr-TR')}</strong></div>`;
        }
        tarihBox.innerHTML = tHtml;
        tarihBox.style.display = tHtml ? 'block' : 'none';
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
    gosterSoruResmiOnizleme(soruResmiBase64);

    cropper.destroy();
    cropper = null;
    cropperModal.hide();
}

/**
 * Seçilen resmi kaldırır
 */
/**
 * Soru resmi için önizleme kartı ve iptal/kaldır minik çarpı butonunu gösterir
 */
function gosterSoruResmiOnizleme(base64Data) {
    soruResmiBase64 = base64Data;
    const previewEl = window.safeGetElementById('soruResmiPreview');
    const zoomCtrl = document.getElementById('zoomKontrolleriModal');
    currentModalZoom = 1;

    if (base64Data && previewEl) {
        previewEl.innerHTML = `
            <div class="position-relative d-inline-block text-center" style="max-width: 100%; height: 100%; display: flex; align-items: center; justify-content: center;">
                <img src="${base64Data}" class="img-fluid rounded border shadow-sm" style="max-height: calc(100vh - 230px); max-width: 100%; object-fit: contain; transition: transform 0.2s;" alt="Soru Resmi">
                <button type="button" class="btn btn-danger position-absolute top-0 end-0 m-2 rounded-circle shadow" 
                        onclick="soruResmiKaldir()" title="Resmi Kaldır (İptal Et)" style="width: 32px; height: 32px; padding: 0; display: inline-flex; align-items: center; justify-content: center; z-index: 10; border: 2px solid #fff;">
                    <i class="bi bi-x-lg" style="font-size: 14px;"></i>
                </button>
            </div>
        `;
        if (zoomCtrl) zoomCtrl.style.setProperty('display', 'flex', 'important');
    } else if (previewEl) {
        previewEl.innerHTML = `
            <span class="text-muted text-center p-4">
                <i class="bi bi-card-image fs-1 opacity-50 d-block mb-1"></i>
                <small class="text-secondary">Resim seçin veya panodan yapıştırın (<kbd class="bg-light text-dark border">Ctrl+V</kbd>)</small>
            </span>
        `;
        if (zoomCtrl) zoomCtrl.style.setProperty('display', 'none', 'important');
    }
}

/**
 * Seçilen veya yapıştırılan soru resmini kaldırır / iptal eder
 */
function soruResmiKaldir(silent = false) {
    const hadImage = !!soruResmiBase64;
    soruResmiBase64 = null;
    const previewEl = window.safeGetElementById('soruResmiPreview');
    if (previewEl) {
        previewEl.innerHTML = `
            <span class="text-muted text-center p-4">
                <i class="bi bi-card-image fs-1 opacity-50 d-block mb-1"></i>
                <small class="text-secondary">Resim seçin veya panodan yapıştırın (<kbd class="bg-light text-dark border">Ctrl+V</kbd>)</small>
            </span>
        `;
    }
    const input = window.safeGetElementById('soruResmiInput');
    if (input) input.value = '';
    const zoomCtrl = document.getElementById('zoomKontrolleriModal');
    if (zoomCtrl) zoomCtrl.style.setProperty('display', 'none', 'important');
    if (!silent && hadImage) {
        showNotification('Soru resmi kaldırıldı.', 'info');
    }
}

/**
 * Pano verisinden resim dosyasını ayıklar
 */
function extractImageFromClipboard(clipboardData) {
    if (!clipboardData) return null;
    if (clipboardData.items) {
        for (let i = 0; i < clipboardData.items.length; i++) {
            const item = clipboardData.items[i];
            if (item.type && item.type.startsWith('image/')) {
                const file = item.getAsFile();
                if (file) return file;
            }
        }
    }
    if (clipboardData.files && clipboardData.files.length > 0) {
        for (let i = 0; i < clipboardData.files.length; i++) {
            const file = clipboardData.files[i];
            if (file.type && file.type.startsWith('image/')) {
                return file;
            }
        }
    }
    return null;
}

/**
 * 'Panodan Yapıştır' butonuna tıklandığında panodaki resmi okur
 */
async function panodanResimYapistir() {
    const soruEkleEl = document.getElementById('soruEkleModal');
    if (!soruEkleEl || !soruEkleEl.classList.contains('show')) return;

    if (!navigator.clipboard || !navigator.clipboard.read) {
        showNotification('Pano doğrudan okunamadı. Lütfen resmi kopyaladıktan sonra doğrudan Ctrl + V kısayolunu kullanın.', 'warning');
        return;
    }

    try {
        const items = await navigator.clipboard.read();
        let imageBlob = null;

        for (const item of items) {
            const imageType = item.types.find(type => type.startsWith('image/'));
            if (imageType) {
                imageBlob = await item.getType(imageType);
                break;
            }
        }

        if (imageBlob) {
            if (imageBlob.size > 5 * 1024 * 1024) {
                showNotification('Panodaki resim boyutu en fazla 5MB olabilir!', 'error');
                return;
            }
            const reader = new FileReader();
            reader.onload = function (evt) {
                gosterSoruResmiOnizleme(evt.target.result);
                showNotification('Resim panodan başarıyla yapıştırıldı!', 'success');
            };
            reader.readAsDataURL(imageBlob);
        } else {
            showNotification('Panoda kopyalanmış bir resim bulunamadı. Lütfen bir resmi kopyalayıp tekrar deneyin.', 'warning');
        }
    } catch (err) {
        console.warn('Pano okuma hatası / izni verilmedi:', err);
        showNotification('Panoya erişilemedi. Resmi kopyaladıktan sonra Ctrl + V tuşlarına basarak yapıştırabilirsiniz.', 'warning');
    }
}

/**
 * Ctrl + V ile panodan resim yapıştırma dinleyicisi
 */
document.addEventListener('paste', function(e) {
    const soruEkleEl = document.getElementById('soruEkleModal');
    // Sadece soruEkleModal açıkken çalışsın
    if (!soruEkleEl || !soruEkleEl.classList.contains('show')) return;

    const clipboardData = e.clipboardData || window.clipboardData;
    const file = extractImageFromClipboard(clipboardData);

    if (file) {
        e.preventDefault();
        e.stopPropagation();

        if (file.size > 5 * 1024 * 1024) {
            showNotification('Panodaki resim boyutu en fazla 5MB olabilir!', 'error');
            return;
        }

        const reader = new FileReader();
        reader.onload = function(evt) {
            gosterSoruResmiOnizleme(evt.target.result);
            showNotification('Resim panodan yapıştırıldı! (Ctrl + V)', 'success');
        };
        reader.readAsDataURL(file);
    }
});

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
        const filtreSonuc = document.getElementById('filtreSonucBilgisi');
        if (filtreSonuc) filtreSonuc.innerText = '';
        return;
    }

    if (topluBar) topluBar.classList.remove('d-none');

    // Filtreleme kriterlerini al
    const filtreArama = (document.getElementById('soruFiltreArama')?.value || '').trim().toLowerCase();
    const filtreZorluk = document.getElementById('soruFiltreZorluk')?.value || '';

    const zorlukMap = {
        'cokKolay': { label: 'Çok Kolay', badge: 'bg-success-subtle text-success border border-success-subtle', icon: 'bi-star' },
        'kolay': { label: 'Kolay', badge: 'bg-info-subtle text-info border border-info-subtle', icon: 'bi-star-fill' },
        'orta': { label: 'Orta', badge: 'bg-primary-subtle text-primary border border-primary-subtle', icon: 'bi-star-half' },
        'zor': { label: 'Zor', badge: 'bg-warning-subtle text-warning border border-warning-subtle', icon: 'bi-stars' },
        'cokZor': { label: 'Çok Zor', badge: 'bg-danger-subtle text-danger border border-danger-subtle', icon: 'bi-fire' }
    };

    let html = '<div class="row g-4" id="sortable-sorular">';
    let gorunenSoruSayisi = 0;

    sorular.forEach((soru, i) => {
        // Handle old undefined strings if any
        const ders = (soru.dersAdi && soru.dersAdi !== 'undefined') ? soru.dersAdi : (soru.ders && soru.ders !== 'undefined' ? soru.ders : '');
        const konu = (soru.konuAdi && soru.konuAdi !== 'undefined') ? soru.konuAdi : (soru.konu && soru.konu !== 'undefined' ? soru.konu : '');
        const kazanim = (soru.kazanimAdi && soru.kazanimAdi !== 'undefined') ? soru.kazanimAdi : (soru.kazanim && soru.kazanim !== 'undefined' ? soru.kazanim : '');
        const zorlukKey = soru.zorlukSeviye || 'orta';
        const zInfo = zorlukMap[zorlukKey] || zorlukMap['orta'];

        // Zorluk Filtresi Kontrolü
        if (filtreZorluk && zorlukKey !== filtreZorluk) {
            return;
        }

        // Metin / Etiket / Kaynak Arama Kontrolü
        if (filtreArama) {
            const aramaHedefleri = [
                soru.soruMetni || '',
                soru.etiket || '',
                soru.kaynak || '',
                soru.aciklama || '',
                ders,
                konu,
                kazanim,
                soru.dogruSik || ''
            ].join(' ').toLowerCase();

            if (!aramaHedefleri.includes(filtreArama)) {
                return;
            }
        }

        gorunenSoruSayisi++;

        // Etiket Rozetleri
        let etiketlerHtml = '';
        if (soru.etiket) {
            const tagList = soru.etiket.split(/[,;]/).map(t => t.trim()).filter(t => t.length > 0);
            etiketlerHtml = tagList.map(tag => 
                `<span class="badge rounded-pill bg-light text-primary border me-1" style="cursor:pointer;" onclick="window.etiketeGoreFiltrele('${tag.replace(/'/g, "\\'")}')" title="Bu etikete göre filtrele"><i class="bi bi-hash"></i>${tag}</span>`
            ).join('');
        }

        html += `
        <div class="col-12 col-xl-6 mb-2" data-index="${i}" data-id="${soru.id}">
            <div class="card question-card shadow-sm h-100 border-start border-primary border-4">
                <div class="card-body p-3">
                    <!-- HEADER: Soru No, Cevap, Zorluk ve Butonlar -->
                    <div class="d-flex justify-content-between align-items-center mb-3 border-bottom pb-2">
                        <div class="d-flex align-items-center gap-1 flex-wrap">
                            <span class="drag-handle btn btn-sm btn-outline-secondary py-0 px-1" style="cursor:move" title="Sıralamak için sürükleyin">
                                <i class="bi bi-grip-vertical fs-5"></i>
                            </span>
                            <input type="checkbox" class="form-check-input soru-sec m-0" data-index="${i}" id="chk_${i}">
                            <label class="form-check-label fw-bold text-primary mb-0 ms-1" for="chk_${i}">Soru #${i + 1}</label>
                            <span class="badge bg-success ms-1">Cevap: ${soru.dogruSik || 'A'}</span>
                            <span class="badge ${zInfo.badge} ms-1" title="Zorluk Seviyesi"><i class="bi ${zInfo.icon} me-1"></i>${zInfo.label}</span>
                            ${soru.cozumLinki ? `<a href="${soru.cozumLinki}" target="_blank" rel="noopener noreferrer" class="btn btn-sm btn-outline-danger py-0 px-2 ms-1 text-decoration-none" title="Çözümü Yeni Sekmede Aç"><i class="bi bi-play-circle me-1"></i>Çözüm</a>` : ''}
                            <span class="ms-1 small text-muted" title="${soru.sikkarAyriMi ? 'Şıklar ayrı metin' : 'Şıklar resim içinde'}">
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
                        <div class="siklar-container py-2 px-1 mb-2" style="font-size:0.9rem">
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

                        <!-- AÇIKLAMA / EK NOT (Varsa) -->
                        ${soru.aciklama ? `
                        <div class="small text-muted fst-italic mb-2 p-2 bg-light rounded border-start border-3 border-info">
                            <i class="bi bi-info-circle text-info me-1"></i><strong>Not:</strong> ${soru.aciklama}
                        </div>
                        ` : ''}

                        <!-- ALT BİLGİ: Ders, Konu, Kazanım, Kaynak, Etiketler, Tarih -->
                        <div class="mt-3 pt-2 border-top d-flex flex-wrap align-items-center gap-1">
                            ${ders ? '<span class="badge bg-info-subtle text-info border border-info-subtle">' + ders + '</span>' : ''}
                            ${konu ? '<span class="badge bg-secondary-subtle text-secondary border border-secondary-subtle">' + konu + '</span>' : ''}
                            ${kazanim ? '<span class="badge bg-light text-dark border">' + kazanim + '</span>' : ''}
                            ${soru.kaynak ? '<span class="badge bg-light text-dark border" title="Kaynak"><i class="bi bi-journal-bookmark text-primary me-1"></i>' + soru.kaynak + '</span>' : ''}
                            ${etiketlerHtml}
                            <span class="text-muted ms-auto small" style="font-size:0.75rem;" title="Oluşturulma / Güncelleme Tarihi">
                                <i class="bi bi-clock me-1"></i>${soru.tarihDuzenleme ? 'Güncellendi: ' + new Date(soru.tarihDuzenleme).toLocaleDateString('tr-TR') : (soru.tarihOlusturma || soru.olusturmaTarihi ? new Date(soru.tarihOlusturma || soru.olusturmaTarihi).toLocaleDateString('tr-TR') : '')}
                            </span>
                        </div>
                    </div>
                </div>
            </div>
        </div>`;
    });

    html += '</div>';

    if (gorunenSoruSayisi === 0) {
        html = `
            <div class="alert alert-warning text-center py-4">
                <i class="bi bi-funnel fs-2 d-block mb-2"></i>
                <p class="mb-0">Filtreleme kriterlerinize uygun soru bulunamadı.</p>
                <button type="button" class="btn btn-sm btn-outline-secondary mt-2" onclick="window.sifirlaSoruFiltre()">Filtreleri Temizle</button>
            </div>
        `;
    }

    container.innerHTML = html;
    initializeSortable();

    // Filtre sonuç sayacını güncelle
    const filtreSonuc = document.getElementById('filtreSonucBilgisi');
    if (filtreSonuc) {
        if (filtreArama || filtreZorluk) {
            filtreSonuc.innerText = `${gorunenSoruSayisi} / ${sorular.length} Soru`;
            filtreSonuc.className = 'badge bg-primary text-white small py-2 px-2';
        } else {
            filtreSonuc.innerText = `Toplam: ${sorular.length} Soru`;
            filtreSonuc.className = 'badge bg-light text-dark border small py-2 px-2';
        }
    }
}

// Filtre ve Test Fonksiyonları
window.testCozumLinki = function() {
    const url = document.getElementById('cozumLinkiInput')?.value?.trim();
    if (url) {
        window.open(url, '_blank');
    } else {
        showNotification('Lütfen geçerli bir çözüm linki girin!', 'warning');
    }
};

window.uygulaSoruFiltre = function() {
    guncelleSoruListesi();
};

window.sifirlaSoruFiltre = function() {
    const a = document.getElementById('soruFiltreArama');
    if (a) a.value = '';
    const z = document.getElementById('soruFiltreZorluk');
    if (z) z.value = '';
    guncelleSoruListesi();
};

window.etiketeGoreFiltrele = function(etiket) {
    const a = document.getElementById('soruFiltreArama');
    if (a) {
        a.value = etiket;
        guncelleSoruListesi();
    }
};


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
window.gosterSoruResmiOnizleme = gosterSoruResmiOnizleme;
window.panodanResimYapistir = panodanResimYapistir;

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
                SoruResmi TEXT, OlusturmaTarihi TEXT,
                ZorlukSeviye TEXT, Kaynak TEXT, Etiket TEXT, CozumLinki TEXT, Aciklama TEXT,
                TarihOlusturma TEXT, TarihDuzenleme TEXT
            );
            CREATE TABLE IF NOT EXISTS BankaAyarlari (Id INTEGER PRIMARY KEY AUTOINCREMENT, BankaAdi TEXT, ToplamSoruSayisi INTEGER, OlusturmaTarihi TEXT);
        `);

        const dersMap = {}, konuMap = {}, kazanimMap = {};
        let dC = 1, kC = 1, kzC = 1;

        const stmtS = db.prepare("INSERT INTO Soru (DersId, KonuId, KazanimId, DersAdi, KonuAdi, KazanimAdi, SoruMetni, SoruMetniAyriMi, SiklarAyriMi, SikA, SikB, SikC, SikD, SikE, DogruSik, SoruResmi, OlusturmaTarihi, ZorlukSeviye, Kaynak, Etiket, CozumLinki, Aciklama, TarihOlusturma, TarihDuzenleme) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)");
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
            stmtS.run([
                dId, kId, kzId, dA, kA, kzA,
                s.soruMetni || '', s.soruMetniAyriMi ? 1 : 0, s.sikkarAyriMi ? 1 : 0,
                s.siklar?.A || '', s.siklar?.B || '', s.siklar?.C || '', s.siklar?.D || '', s.siklar?.E || '',
                s.dogruSik || 'A', s.soruResmi || '', s.olusturmaTarihi || new Date().toISOString(),
                s.zorlukSeviye || 'orta', s.kaynak || '', s.etiket || '', s.cozumLinki || '', s.aciklama || '',
                s.tarihOlusturma || s.olusturmaTarihi || new Date().toISOString(), s.tarihDuzenleme || ''
            ]);
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
window.gosterSoruResmiOnizleme = gosterSoruResmiOnizleme;
window.panodanResimYapistir = panodanResimYapistir;

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
                SoruResmi TEXT, OlusturmaTarihi TEXT,
                ZorlukSeviye TEXT, Kaynak TEXT, Etiket TEXT, CozumLinki TEXT, Aciklama TEXT,
                TarihOlusturma TEXT, TarihDuzenleme TEXT
            );
            CREATE TABLE IF NOT EXISTS BankaAyarlari (Id INTEGER PRIMARY KEY AUTOINCREMENT, BankaAdi TEXT, ToplamSoruSayisi INTEGER, OlusturmaTarihi TEXT);
        `);

        const stmtS = db.prepare("INSERT INTO Soru (DersId, KonuId, KazanimId, DersAdi, KonuAdi, KazanimAdi, SoruMetni, SoruMetniAyriMi, SiklarAyriMi, SikA, SikB, SikC, SikD, SikE, DogruSik, SoruResmi, OlusturmaTarihi, ZorlukSeviye, Kaynak, Etiket, CozumLinki, Aciklama, TarihOlusturma, TarihDuzenleme) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)");

        for (const s of seciliSorular) {
            stmtS.run([
                s.dersId || 1, s.konuId || 1, s.kazanimId || 1,
                s.dersAdi || s.ders || '', s.konuAdi || s.konu || '', s.kazanimAdi || s.kazanim || '',
                s.soruMetni || '', s.soruMetniAyriMi ? 1 : 0, s.sikkarAyriMi ? 1 : 0,
                s.siklar?.A || '', s.siklar?.B || '', s.siklar?.C || '', s.siklar?.D || '', s.siklar?.E || '',
                s.dogruSik || 'A', s.soruResmi || '', s.olusturmaTarihi || new Date().toISOString(),
                s.zorlukSeviye || 'orta', s.kaynak || '', s.etiket || '', s.cozumLinki || '', s.aciklama || '',
                s.tarihOlusturma || s.olusturmaTarihi || new Date().toISOString(), s.tarihDuzenleme || ''
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
