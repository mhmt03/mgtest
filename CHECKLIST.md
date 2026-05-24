# Soru Bankası - Yapılması Gereken Kontroller ve Sonraki Adımlar

## 🔍 Yapılması Gereken Hemen Kontroller

### 1. Database Migration
- [ ] SQL Server'da SoruBankasi_Server adında database oluştur
- [ ] `Update-Database` komutu ile migration'ları uygula
- [ ] Server DB'de tabloların oluşturulduğunu kontrol et

### 2. Configuration Doğrulama
- [ ] appsettings.json'daki connection string'i kendi ortamına göre güncelle
- [ ] EncryptionSalt değerini değiştir (güvenlik için)
- [ ] TempFiles klasörü var mı kontrol et, yoksa oluştur

### 3. NuGet Paketleri
- [ ] Tüm required paketler yüklü mi kontrol et:
  - EntityFrameworkCore
  - EntityFrameworkCore.SqlServer
  - EntityFrameworkCore.Sqlite
  - BCrypt.Net-Next
  - iTextSharp
  - DocumentFormat.OpenXml
  - SixLabors.ImageSharp

### 4. Proje Derleme
- [ ] `dotnet build` komutu ile derle
- [ ] Hiç compilation error var mı kontrol et
- [ ] Warning'ler düzelt

### 5. İlk Admin Kullanıcısı Oluşturma
Uygulama başladıktan sonra manuel olarak:
- [ ] "Kayıt Ol" sayfasından bir kullanıcı oluştur
- [ ] SQL Server Management Studio'da bu kullanıcıyı admin yap:
```sql
UPDATE Kullanicilar SET KullaniciTuru = 'admin' WHERE KullaniciAdi = 'your-username'
```

## 📝 Views Tamamlanması Gereken İşler

### Soru Ekleme/Düzenleme Form (Soru/Create.cshtml ve Edit.cshtml)
- [ ] Form HTML'i oluştur
- [ ] Resim yükleme input'ları
- [ ] Şık input'ları (A-F)
- [ ] Zorluk seviyesi dropdown'u
- [ ] Şıklar ayrı mı checkbox'u
- [ ] Image crop preview
- [ ] Form validation

### Soru Listesi Sayfası (Soru/Sorular.cshtml)
- [ ] Soru tablosu
- [ ] İşaretleme checkbox'ları
- [ ] Soru düzenle/sil butonları
- [ ] Seçili sorulardan Word/PDF export butonları
- [ ] Seçili sorulardan banka oluştur butonu

### Banka Listesi Sayfası (SoruBankasi/Index.cshtml)
- [ ] Banka tablosu
- [ ] Upload/Download butonları
- [ ] Yeni banka oluştur butonu

## 🔧 Uygulamaya Spesifik Kodlamalar

### 1. Image Crop Editor
- [ ] jQuery veya başka bir library ile resim kırpma özelliği ekle
- [ ] CropImage action'ını test et

### 2. Word/PDF Export Detaylandırma
- [ ] SoruController'daki ExportToWord action'ını tamamla
- [ ] SoruController'daki ExportToPdf action'ını tamamla
- [ ] Seçili sorulardan dosya üretmeyi test et

### 3. Session Yönetimi
- [ ] Çoklu banka yönetiminin düzgün çalışması
- [ ] Session timeout sonrası login'e yönlendirme
- [ ] Banka kapatma işleminin temiz olması

### 4. Error Handling
- [ ] Tüm action'larda try-catch'ler kontrol edildi mi?
- [ ] TempData ve ViewBag error message'ları tutarlı mı?
- [ ] Custom error page'ler var mı?

## 🧪 Test Edilmesi Gereken Senaryolar

### Kullanıcı Yönetimi
- [ ] Kaydolma ve doğru enum değerlerin set edilmesi
- [ ] Login ve session oluşturma
- [ ] Süresi geçen kullanıcının otomatik kisitliUser'a çevrilmesi
- [ ] Admin tarafından kullanıcı oluşturma/düzenleme/silme

### Soru Bankası
- [ ] Yeni banka oluşturma
- [ ] Banka dosyasını indir ve açıklamaktan yükle
- [ ] Şifreleme/deşifreleme düzgün çalışması
- [ ] Dosya sahipliği kontrol'ü

### Soru İşlemleri
- [ ] Soru ekleme (resim, şıklar)
- [ ] Soru düzenleme
- [ ] Soru silme
- [ ] Soru işaretleme/işaret kaldırma

### Export İşlemleri
- [ ] Seçili sorulardan PDF oluşturma
- [ ] Seçili sorulardan Word oluşturma
- [ ] Cevap anahtarı oluşturma
- [ ] Header/Footer ekleme

### Admin Panel
- [ ] İstatistikler sayfasının veriler gösterip göstermediği
- [ ] Kullanıcı süresi uzatma işleminin çalışması
- [ ] Kullanıcı türü değişiminin etkili olması

## 📚 Belgeleme

- [ ] Kullanıcı rehberi oluştur
- [ ] API documentation ekle (varsa)
- [ ] Database schema diagram oluştur
- [ ] Deployment guide yaz

## 🚀 Deployment Hazırlığı

- [ ] Production database kurulumu
- [ ] Connection string'leri güvenli hale getir (Secrets Manager)
- [ ] SSL sertifikası ayarlanması
- [ ] HTTPS yapılandırması
- [ ] CORS ayarları (gerekli ise)
- [ ] Rate limiting ayarları
- [ ] Logging yapılandırması

## 📦 İlave Özellikler (İsteğe Bağlı)

- [ ] Email doğrulaması
- [ ] İki faktörlü kimlik doğrulama
- [ ] Kullanıcı aktivite logu
- [ ] Yedekleme sistemi
- [ ] API rate limiting
- [ ] Analytics dashboard
- [ ] Dark mode
- [ ] Mobil responsiveness
- [ ] Çok dil desteği

## ⚠️ Önemli Hatırlatmalar

1. **Security:** Encryption salt'ı production'da değiştir
2. **Database:** Backup stratejisi belirle
3. **Performance:** Büyük dosyalar için stream işlemesi düşün
4. **Testing:** Unit test'ler yaz
5. **Monitoring:** Logging ve error tracking kur

---

**Notlar:**
- Views henüz tam olarak tasarlanmamıştır, Bootstrap template'i ile güzelleştirilebilir
- Resim crop editor için Cropperjs vb. library kullanılabilir
- Export işlemleri daha detaylı konfigürasyon ile iyileştirilebilir
