/**
 * İstemci Tabanlı Veritabanı Servisi
 * File System Access API + sql.js
 * (GELİŞTİRME MODU: Şifreleme geçici olarak devredışı bırakıldı)
 */

let SQL = null;
let currentDb = null;
let fileHandle = null;

let seciliDersId = null;
let seciliKonuId = null;
let seciliKazanimId = null;

// Başlangıç: sql.js'yi yükle
document.addEventListener('DOMContentLoaded', async () => {
    try {
        const sql = await initSqlJs({ locateFile: file => /lib/sqljs/ + file });
        SQL = sql;
        console.log("sql.js hazır.");
    } catch (e) {
        console.error("sql.js yüklenemedi:", e);
        showAlert("Veritabanı motoru yüklenemedi.", "danger");
    }

    bindEvents();
});

function bindEvents() {
    document.getElementById('btnSelectDatabase').addEventListener('click', openDatabase);
    document.getElementById('btnCloseDatabase').addEventListener('click', closeDatabase);
    document.getElementById('btnCreateNewBank')?.addEventListener('click', createNewDatabase);

    // Ders İşlemleri
    document.getElementById('btnDersEkle').addEventListener('click', addDers);
    document.getElementById('btnDersSil').addEventListener('click', deleteDers);

    // Konu İşlemleri
    document.getElementById('btnKonuEkle').addEventListener('click', addKonu);
    document.getElementById('btnKonuSil').addEventListener('click', deleteKonu);

    // Kazanım İşlemleri
    document.getElementById('btnKazanimEkle').addEventListener('click', addKazanim);
    document.getElementById('btnKazanimSil').addEventListener('click', deleteKazanim);

    // Dönüştürücü İşlemi
    const legacyInput = document.getElementById('fileLegacyDb');
    if (legacyInput) {
        legacyInput.addEventListener('change', convertLegacyFile);
    }
}

function showAlert(message, type = "info") {
    const box = document.getElementById('alertBox');
    box.className = lert alert- + type;
    box.innerText = message;
    box.classList.remove('d-none');
    setTimeout(() => box.classList.add('d-none'), 5000);
}

function setLoader(show, text = "") {
    const loader = document.getElementById('loadingIndicator');
    const textEl = document.getElementById('loadingText');
    if (show) {
        textEl.innerText = text;
        loader.classList.remove('d-none');
    } else {
        loader.classList.add('d-none');
    }
}

// ----------------------------------------------------
// YENİ BANKA OLUŞTURMA
// ----------------------------------------------------

async function createNewDatabase() {
    const input = document.getElementById('newBankName');
    const bankaAdi = input.value.trim();
    if (!bankaAdi) {
        showAlert("Lütfen oluşturulacak banka için bir isim girin.", "warning");
        return;
    }

    try {
        // Kullanıcıdan kaydedilecek yeri seçmesini iste
        const newFileHandle = await window.showSaveFilePicker({
            suggestedName: bankaAdi.endsWith('.mg') ? bankaAdi : bankaAdi + '.mg',
            types: [{
                description: 'Soru Bankası Dosyası',
                accept: { 'application/octet-stream': ['.mg'] },
            }],
        });

        setLoader(true, "Veritabanı oluşturuluyor...");

        // Boş veritabanı oluştur
        const db = new SQL.Database();

        // Temel tabloları kur
        db.exec(
            CREATE TABLE IF NOT EXISTS Ders (Id INTEGER PRIMARY KEY AUTOINCREMENT, DersAdi TEXT NOT NULL);
            CREATE TABLE IF NOT EXISTS Konu (Id INTEGER PRIMARY KEY AUTOINCREMENT, DersId INTEGER NOT NULL, KonuAdi TEXT NOT NULL);
            CREATE TABLE IF NOT EXISTS Kazanim (Id INTEGER PRIMARY KEY AUTOINCREMENT, DersId INTEGER NOT NULL, KonuId INTEGER NOT NULL, KazanimAdi TEXT NOT NULL);
        );

        // Kaydet
        const dbData = db.export();
        const writable = await newFileHandle.createWritable();
        await writable.write(dbData);
        await writable.close();

        // Sistemi bu dosyaya bağla
        fileHandle = newFileHandle;
        currentDb = db;

        document.getElementById('activeFileName').innerText = fileHandle.name;
        document.getElementById('stepFileSelection').classList.add('d-none');
        document.getElementById('stepDatabaseOperations').classList.remove('d-none');

        showAlert("Yeni soru bankası başarıyla oluşturuldu ve bağlandı!", "success");
        input.value = "";
        
        loadDersler();

    } catch (e) {
        if (e.name !== "AbortError") {
            console.error("Veritabanı oluşturma hatası:", e);
            showAlert("Oluşturma başarısız: " + e.message, "danger");
        }
    } finally {
        setLoader(false);
    }
}

// ----------------------------------------------------
// VERİTABANI DOSYA İŞLEMLERİ
// ----------------------------------------------------

async function openDatabase() {
    try {
        const [handles] = await window.showOpenFilePicker({
            types: [{ description: 'Soru Bankası Dosyaları', accept: { 'application/octet-stream': ['.mg', '.db'] } }],
            excludeAcceptAllOption: false,
            multiple: false
        });
        fileHandle = handles;

        setLoader(true, "Veritabanı açılıyor (Şifresiz Mod)...");

        const file = await fileHandle.getFile();
        const rawData = await file.arrayBuffer();

        // ŞİFRELEME KAPALI: Doğrudan veriyi okuyoruz
        currentDb = new SQL.Database(new Uint8Array(rawData));

        // Tablo kontrolü (Ders tablosu var mı?)
        try {
            currentDb.exec("SELECT 1 FROM Ders LIMIT 1;");
        } catch (e) {
            // Eğer tablo yoksa, veritabanı yapısını oluştur
            currentDb.exec(
                CREATE TABLE IF NOT EXISTS Ders (Id INTEGER PRIMARY KEY AUTOINCREMENT, DersAdi TEXT NOT NULL);
                CREATE TABLE IF NOT EXISTS Konu (Id INTEGER PRIMARY KEY AUTOINCREMENT, DersId INTEGER NOT NULL, KonuAdi TEXT NOT NULL);
                CREATE TABLE IF NOT EXISTS Kazanim (Id INTEGER PRIMARY KEY AUTOINCREMENT, DersId INTEGER NOT NULL, KonuId INTEGER NOT NULL, KazanimAdi TEXT NOT NULL);
            );
            await saveDatabase();
        }

        // UI Güncelle
        document.getElementById('activeFileName').innerText = fileHandle.name;
        document.getElementById('stepFileSelection').classList.add('d-none');
        document.getElementById('stepDatabaseOperations').classList.remove('d-none');

        showAlert("Veritabanı başarıyla açıldı.", "success");

        loadDersler();

    } catch (error) {
        if (error.name !== "AbortError") {
            console.error("Dosya açma hatası:", error);
            showAlert("Dosya açılamadı (Eğer dosya şifreliyse, önce şifresini kaldırmalısınız): " + error.message, "danger");
        }
    } finally {
        setLoader(false);
    }
}

function closeDatabase() {
    if (currentDb) {
        currentDb.close();
        currentDb = null;
    }
    fileHandle = null;
    seciliDersId = null;
    seciliKonuId = null;
    seciliKazanimId = null;

    document.getElementById('stepDatabaseOperations').classList.add('d-none');
    document.getElementById('stepFileSelection').classList.remove('d-none');
}

async function saveDatabase() {
    if (!currentDb || !fileHandle) return;

    try {
        // sql.js'den binary datayı al
        const dbData = currentDb.export();
        
        // ŞİFRELEME KAPALI: Doğrudan yazıyoruz
        const writable = await fileHandle.createWritable();
        await writable.write(dbData);
        await writable.close();

        console.log("Değişiklikler şifresiz olarak dosyaya kaydedildi.");
    } catch (e) {
        console.error("Kaydetme hatası:", e);
        showAlert("Değişiklikler kaydedilemedi!", "danger");
    }
}

// ----------------------------------------------------
// UI YARDIMCILARI
// ----------------------------------------------------

function renderList(elementId, items, selectedId, onClickName, nameProp) {
    const list = document.getElementById(elementId);
    if (items.length === 0) {
        list.innerHTML = '<li class="list-group-item text-muted">Kayıt bulunamadı.</li>';
        return;
    }

    let html = '';
    items.forEach(item => {
        const isActive = item.Id === selectedId ? 'active' : '';
        html += <li class="list-group-item list-group-item-action  + isActive +  d-flex justify-content-between align-items-center" 
                     style="cursor:pointer;" onclick=" + onClickName + ( + item.Id + )">
                      + item[nameProp] +  <i class="fas fa-chevron-right text-muted"></i>
                 </li>;
    });
    list.innerHTML = html;
}

function queryAsObjects(query, params = []) {
    const stmt = currentDb.prepare(query);
    stmt.bind(params);
    const result = [];
    while (stmt.step()) {
        result.push(stmt.getAsObject());
    }
    stmt.free();
    return result;
}

// ----------------------------------------------------
// DERS İŞLEMLERİ
// ----------------------------------------------------

function loadDersler() {
    const dersler = queryAsObjects("SELECT Id, DersAdi FROM Ders ORDER BY DersAdi");
    renderList('dersListesi', dersler, seciliDersId, 'selectDers', 'DersAdi');
    
    // Alt listeleri temizle
    if (!seciliDersId) {
        document.getElementById('konuListesi').innerHTML = '<li class="list-group-item text-muted">Önce ders seçin</li>';
        document.getElementById('kazanimListesi').innerHTML = '<li class="list-group-item text-muted">Önce konu seçin</li>';
    }
}

window.selectDers = function(id) {
    seciliDersId = id;
    seciliKonuId = null;
    seciliKazanimId = null;
    loadDersler();
    loadKonular();
}

async function addDers() {
    const input = document.getElementById('yeniDersAd');
    const ad = input.value.trim();
    if (!ad) return;

    currentDb.exec("INSERT INTO Ders (DersAdi) VALUES (?)", [ad]);
    await saveDatabase();
    
    input.value = '';
    loadDersler();
}

async function deleteDers() {
    if (!seciliDersId) {
        showAlert("Lütfen silinecek bir ders seçin.", "warning");
        return;
    }
    if (!confirm("Seçili ders ve altındaki tüm konu ve kazanımlar silinecek. Emin misiniz?")) return;

    currentDb.exec("DELETE FROM Kazanim WHERE DersId = ?", [seciliDersId]);
    currentDb.exec("DELETE FROM Konu WHERE DersId = ?", [seciliDersId]);
    currentDb.exec("DELETE FROM Ders WHERE Id = ?", [seciliDersId]);
    
    await saveDatabase();

    seciliDersId = null;
    loadDersler();
}

// ----------------------------------------------------
// KONU İŞLEMLERİ
// ----------------------------------------------------

function loadKonular() {
    if (!seciliDersId) return;
    const konular = queryAsObjects("SELECT Id, KonuAdi FROM Konu WHERE DersId = ? ORDER BY KonuAdi", [seciliDersId]);
    renderList('konuListesi', konular, seciliKonuId, 'selectKonu', 'KonuAdi');
    
    if (!seciliKonuId) {
        document.getElementById('kazanimListesi').innerHTML = '<li class="list-group-item text-muted">Önce konu seçin</li>';
    }
}

window.selectKonu = function(id) {
    seciliKonuId = id;
    seciliKazanimId = null;
    loadKonular();
    loadKazanimlar();
}

async function addKonu() {
    if (!seciliDersId) return showAlert("Önce bir ders seçin.", "warning");
    const input = document.getElementById('yeniKonuAd');
    const ad = input.value.trim();
    if (!ad) return;

    currentDb.exec("INSERT INTO Konu (DersId, KonuAdi) VALUES (?, ?)", [seciliDersId, ad]);
    await saveDatabase();
    
    input.value = '';
    loadKonular();
}

async function deleteKonu() {
    if (!seciliKonuId) return showAlert("Lütfen silinecek bir konu seçin.", "warning");
    if (!confirm("Konu ve altındaki kazanımlar silinecek. Emin misiniz?")) return;

    currentDb.exec("DELETE FROM Kazanim WHERE KonuId = ?", [seciliKonuId]);
    currentDb.exec("DELETE FROM Konu WHERE Id = ?", [seciliKonuId]);
    
    await saveDatabase();

    seciliKonuId = null;
    loadKonular();
}

// ----------------------------------------------------
// KAZANIM İŞLEMLERİ
// ----------------------------------------------------

function loadKazanimlar() {
    if (!seciliKonuId) return;
    const kazanimlar = queryAsObjects("SELECT Id, KazanimAdi FROM Kazanim WHERE KonuId = ? ORDER BY KazanimAdi", [seciliKonuId]);
    renderList('kazanimListesi', kazanimlar, seciliKazanimId, 'selectKazanim', 'KazanimAdi');
}

window.selectKazanim = function(id) {
    seciliKazanimId = id;
    loadKazanimlar();
}

async function addKazanim() {
    if (!seciliKonuId) return showAlert("Önce bir konu seçin.", "warning");
    const input = document.getElementById('yeniKazanimAd');
    const ad = input.value.trim();
    if (!ad) return;

    currentDb.exec("INSERT INTO Kazanim (DersId, KonuId, KazanimAdi) VALUES (?, ?, ?)", [seciliDersId, seciliKonuId, ad]);
    await saveDatabase();
    
    input.value = '';
    loadKazanimlar();
}

async function deleteKazanim() {
    if (!seciliKazanimId) return showAlert("Lütfen silinecek bir kazanım seçin.", "warning");
    if (!confirm("Kazanım silinecek. Emin misiniz?")) return;

    currentDb.exec("DELETE FROM Kazanim WHERE Id = ?", [seciliKazanimId]);
    await saveDatabase();

    seciliKazanimId = null;
    loadKazanimlar();
}

// ----------------------------------------------------
// DÖNÜŞTÜRÜCÜ (CONVERTER) İŞLEMLERİ
// ----------------------------------------------------

async function convertLegacyFile(event) {
    const file = event.target.files[0];
    if (!file) return;

    try {
        setLoader(true, "Eski dosya sunucuya gönderilip şifresi çözülüyor...");
        
        const formData = new FormData();
        formData.append("file", file);

        const response = await fetch('/mgtest/ConvertLegacyFile', {
            method: 'POST',
            body: formData
        });

        if (!response.ok) {
            throw new Error("Sunucu dönüştürme işlemini reddetti (HTTP " + response.status + ")");
        }

        setLoader(true, "Çözülen veri indirildi. Lütfen şifresiz dosyayı kaydedin...");
        const plainBuffer = await response.arrayBuffer();

        // Kullanıcıya kaydetmesi için diyalog aç
        const newFileHandle = await window.showSaveFilePicker({
            suggestedName: file.name.replace(".mg", "_unencrypted.mg"),
            types: [{
                description: 'Şifresiz Yeni Nesil Veritabanı',
                accept: { 'application/octet-stream': ['.mg'] },
            }],
        });

        const writable = await newFileHandle.createWritable();
        await writable.write(plainBuffer);
        await writable.close();

        showAlert("Dönüştürme başarıyla tamamlandı! Şifresiz dosyanızı artık 'Mevcut Veritabanını Aç' diyerek okuyabilir veya DB Browser ile açabilirsiniz.", "success");

    } catch (e) {
        console.error("Dönüştürme hatası:", e);
        showAlert("Dönüştürme başarısız oldu: " + e.message, "danger");
    } finally {
        setLoader(false);
        event.target.value = ""; // inputu sıfırla
    }
}
