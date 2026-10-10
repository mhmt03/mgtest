# Proje Mimarisi ve Teknik Dokümantasyon (mgtest)

Bu dosya, `mgtest` projesinin mimari yapısını, kullanılan teknolojileri, veritabanı şemasını, veri akışını ve modülleri detaylandırmaktadır. Proje üzerinde geliştirme yaparken bu doküman referans alınabilir.

---

## 1. Genel Teknoloji Yığını
Proje, **yarı online (sunucu tabanlı) yarı yerel (istemci tabanlı)** çalışan bir sınav ve soru bankası hazırlama uygulamasıdır.
- **Sunucu Tarafı**: .NET 10.0 Web API / MVC
- **Sunucu Veritabanı**: SQLite (Entity Framework Core)
- **Güvenlik**: SQLCipher (SQLite veritabanı şifreleme) ve BCrypt şifre hashleme
- **İstemci Tarafı**: HTML5, Vanilla CSS, Bootstrap 5, Javascript
- **Tarayıcı İçi Veritabanı**: `sql.js` (WebAssembly tabanlı SQLite) ve IndexedDB (Büyük verileri yerel depolama için)
- **Dosya İşleme**: OpenXML SDK (Word Belgesi üretimi)

---

## 2. Dizin Yapısı ve Dosya Görevleri

```text
mgtest/
│
├── Controllers/
│   ├── AccountController.cs    # Kullanıcı giriş, kayıt ve oturum işlemleri
│   ├── AdminController.cs      # Yönetici paneli, kullanıcı yönetimi, loglar
│   ├── ExportController.cs     # PDF ve Word test dökümanı üretimi controller'ı
│   ├── SoruController.cs       # Temel soru listeleme ve düzenleme
│   └── mgtestController.cs     # Yerel/Sunucu soru bankaları yönetimi, .mg dosyası yükleme/kaydetme
│
├── Models/
│   ├── ServerModels.cs         # Merkezi SQL veritabanı tabloları (Kullanıcılar, Üretim logları vb.)
│   ├── SqliteModels.cs         # Her bir .mg soru bankası dosyası içindeki yerel SQLite tabloları
│   └── mgtestViewModel.cs      # Arayüz veri transfer modelleri
│
├── Services/
│   ├── EncryptionService.cs    # .mg SQLite dosyalarının SQLCipher ile şifrelenmesi/çözülmesi
│   ├── SqliteFileService.cs    # SQLite .mg dosyalarından veri okuma/yazma servisleri
│   ├── ExportService.cs        # OpenXML kullanarak Word (DOCX) belgesi oluşturma
│   └── FileLogService.cs       # Dosya tabanlı hata ve sistem loglama servisi
│
├── wwwroot/
│   ├── js/
│   │   ├── client-db-service.js # sql.js WebAssembly SQLite istemci katmanı
│   │   ├── soru-bankasi.js     # CreateBank arayüzündeki soru CRUD, IndexedDB yedekleme ve form işlemleri
│   │   ├── export-handler.js   # Word ve PDF oluşturma fonksiyonları (İstemci/Sunucu köprüsü)
│   │   └── ders-yonetimi.js    # Ders/Konu/Kazanım yönetim arayüzü dinamik kodları
│   └── templates/              # Word döküman üretimi için kullanılan 1, 2 ve 3 sütunlu .docx şablonları
│
└── Program.cs                  # Uygulama başlangıcı, DI (Dependency Injection) kayıtları ve DB Seed
```

---

## 3. Veritabanı Mimarisi

### A. Sunucu Ana Veritabanı (`mgtest.db`)
Merkezi sunucuda çalışan SQLite veritabanıdır. Kullanıcı profillerini ve hangi kullanıcının hangi soru bankası dosyasına sahip olduğunu saklar.
- **Kullanici**: Kullanıcı adı, e-posta, hash'lenmiş şifre, veritabanı şifresi (her kullanıcıya özel rastgele üretilen SQLCipher anahtarı).
- **KullaniciBankasi**: Kullanıcının oluşturduğu soru bankalarının isimleri, GUID dosya ID'leri, soru sayıları.
- **UserDers / UserKonu / UserKazanim**: Kullanıcının tanımladığı global ders, konu ve kazanım listesi.
- **UserUretim**: Üretilen sınav dökümanlarının logları.

### B. Yerel Soru Sınav Dosyası (`.mg` formatı)
Kullanıcının bilgisayarına indirdiği `.mg` uzantılı dosya aslında şifrelenmiş bir SQLite veritabanıdır. Her soru bankası dosyası bağımsızdır ve aşağıdaki tabloları içerir:
- **Ders / Konu / Kazanim**: O soru bankasına ait yerel ders ağacı.
- **Soru**: Soru metni, doğru şık, zorluk derecesi, base64 formatında soru resmi, ayrı ayrı şık resimleri/metinleri, sıra numarası.
- **BankaAyarlari**: Sınav kağıdı başlığı, alt bilgi, sütun sayısı ve cevap anahtarı ekleme gibi varsayılan çıktı tercihleri.

---

## 4. Kritik İş Akışları

### A. Soru Bankası (.mg) Yükleme ve Çözme (Decryption)
1. Kullanıcı bir `.mg` dosyası yükler.
2. `mgtestController.ConvertLegacyFile` veya ilgili import action'ı çalışır.
3. `EncryptionService.DecryptSqliteFile` kullanılarak kullanıcının `VeriTabanSifresi` ile SQLite dosyası çözülür ve geçici bir `/TempFiles/` veritabanına dönüştürülür.
4. `SqliteFileService` bu geçici dosyadan soruları ve ayarları okuyarak JSON formatında istemciye veya sunucu arayüzüne gönderir.

### B. İstemci Tarafı Çalışma ve IndexedDB
1. `CreateBank.cshtml` sayfasında veriler ilk yüklendiğinde IndexedDB'de `workspace` isimli store'a kaydedilir.
2. Sayfa yenilendiğinde veya tarayıcı kapandığında veri kaybını önlemek için `soru-bankasi.js` otomatik olarak IndexedDB yedeklerini kullanır.
3. Kullanıcı "Bankayı Kaydet ve İndir" dediğinde, tüm sorular JSON olarak sunucuya post edilir, sunucu taze bir şifreli SQLite (.mg) dosyası oluşturur ve kullanıcının indirmesini sağlar.

---

## 5. Yapılan İyileştirmeler ve Gelişmiş Özellikler

### A. Sayfa Bazlı Dinamik PDF Yazdırma Düzeni (export-handler.js)
* **Algoritma**: PDF çıktısı alınırken tüm sorular önce gizli bir DOM havuzunda tarayıcıya ölçtürülür. Ardından A4 sayfa yüksekliği (`1000px`) baz alınarak sorular dinamik olarak tek tek ölçülüp sayfa konteynerlerine (`.page`) yerleştirilir.
* **Çoklu Sütun Akışı**: CSS `column-fill: auto;` ve sabit sayfa yüksekliği yardımıyla, soruların önce 1. sayfa sol sütuna, dolunca sağ sütuna, o da dolunca 2. sayfa sol sütuna akması (gerçek sınav düzeni) sağlanmıştır.
* **Hizalama ve Resim Boyutlandırma**: Kullanıcı sınavı hazırlarken soruları sola yaslayabilir, ortalayabilir veya iki yana yaslayabilir. Soru resimleri için ise *Sütuna Sığdır*, *Orijinal Boyut* veya *Optimize Boyut* seçenekleri modal üzerinden yönetilir.

### B. Word Belgesi Çoklu Sütun Düzeltmesi (ExportService.cs)
* **Klon Tablo Yaklaşımı**: Word'ün (`.docx`) çoklu sütun özelliğinde, tek bir tablo içindeki satırlar sonraki sütunlara geçmek yerine doğrudan alt sayfalara taşmaktaydı.
* **Çözüm**: Sunucu tarafında `ExportService.cs` üzerinde şablon tablo yapısı her soru için ayrı birer bağımsız tablo olarak kopyalanıp (Clone) ardı ardına eklenmiştir. Bağımsız blok seviyesindeki bu tablolar, MS Word tarafından sütun sınırlarına ulaştığında otomatik olarak yan sütuna taşırılmaktadır.

### C. Kullanıcı Bazlı Veri Ayrıştırma (User Isolation)
* **IndexedDB & LocalStorage**: Aynı tarayıcıyı kullanan farklı kullanıcıların verilerinin karışmaması için `window.currentUserId` (C# Session ID) değişkeni JS katmanına aktarılmıştır.
* **Dinamik Anahtarlar**: IndexedDB veritabanı adı `SoruBankasiDB_{userId}` olarak, LocalStorage sepet anahtarları ise `sepetSorular_{userId}` ve `bankaAdi_{userId}` olarak dinamikleştirilerek kullanıcı bazlı yalıtım (isolation) sağlanmıştır.

### D. Gelişmiş Görünüm Ayarları ve Kart Daraltma (CreateBank.cshtml)
* **Görünüm Sütunları (Layout Zoom)**: `CreateBank` ekranında soruların tek satıra birden fazla sığması için 1, 2, 3 veya 4 sütunlu (Liste, Kılavuz, Kompakt, Mini) görünüm ölçekleme barı eklenmiştir.
* **Kart Daraltma / Genişletme**: Kartların sağ üstüne eklenen butonlar yardımıyla sorular daraltılabilir. Kart daraldığında soru içeriği gizlenir ve başlık kısmında sorunun ilk 35 karakterinden oluşan bir önizleme (preview) gösterilir. Bu sayede sürükle-bırak (drag-drop) ile sıralama yapmak son derece kolaylaşmıştır. Tüm kartlar tek tuşla topluca daraltılıp genişletilebilir.
* **Full-Width Düzen**: Tüm sitenin sağ ve sol boşlukları `_Layout.cshtml` üzerinden `container-fluid` yapılarak ekranın tamamının kullanılması sağlanmıştır.
