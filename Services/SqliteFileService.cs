using Microsoft.EntityFrameworkCore;
using Microsoft.Data.Sqlite;
using mgtest.Data;
using mgtest.Models;

namespace mgtest.Services
{
    public interface ISqliteFileService
    {
        Task<string> CreateNewBankaFile(int kullaniciId, string bankaAdi, string dosyaId);
        Task<string?> LoadBankaFile(IFormFile file, int kullaniciId);
        Task<byte[]> SaveAndEncryptBankaFile(string tempFilePath, int kullaniciId);
        Task<bool> ValidateFileOwnership(string tempFilePath, int kullaniciId);
        Task<List<Soru>> GetSorular(string tempFilePath);
        Task<Soru?> GetSoru(string tempFilePath, int soruId);
        Task AddSoru(string tempFilePath, Soru soru);
        Task UpdateSoru(string tempFilePath, Soru soru);
        Task DeleteSoru(string tempFilePath, int soruId);
        Task<BankaAyarlari?> GetBankaAyarlari(string tempFilePath);
        Task UpdateBankaAyarlari(string tempFilePath, BankaAyarlari ayarlar);
        Task<int> GetToplamSoruSayisi(string tempFilePath);
    }

    public class SqliteFileService : ISqliteFileService
    {
        private readonly IEncryptionService _encryptionService;
        private readonly ServerDbContext _serverDbContext;
        private readonly IFileLogService _fileLogService;
        private readonly string _tempFolder;
        private static readonly object _fileLock = new object();
        private static readonly SemaphoreSlim _fileSemaphore = new SemaphoreSlim(1, 1);
        // Temp dosyalar�n �ifrelerini cache'de tut (session s�resi boyunca)
        private static readonly Dictionary<string, string> _tempFilePasswords = new Dictionary<string, string>();

        public SqliteFileService(IEncryptionService encryptionService, ServerDbContext serverDbContext, IFileLogService fileLogService, IConfiguration configuration)
        {
            _encryptionService = encryptionService;
            _serverDbContext = serverDbContext;
            _fileLogService = fileLogService;
            _tempFolder = configuration["AppSettings:TempFileFolder"] ?? "TempFiles";

            if (!Directory.Exists(_tempFolder))
            {
                Directory.CreateDirectory(_tempFolder);
            }
        }

        // Temp dosya �ifresi cache'ye ekle
        private void CacheTempFilePassword(string tempFilePath, string password)
        {
            lock (_fileLock)
            {
                _tempFilePasswords[tempFilePath] = password;
            }
        }

        // Cache'den temp dosya �ifresi al
        private string? GetCachedPassword(string tempFilePath)
        {
            lock (_fileLock)
            {
                _tempFilePasswords.TryGetValue(tempFilePath, out var password);
                return password;
            }
        }

        // Cache'den temp dosya �ifresi sil
        private void RemoveCachedPassword(string tempFilePath)
        {
            lock (_fileLock)
            {
                _tempFilePasswords.Remove(tempFilePath);
            }
        }

        // Yeni banka dosyas� olu�tur
        // Ensure proper file creation and return a FileResult for download
        public async Task<string> CreateNewBankaFile(int kullaniciId, string bankaAdi, string dosyaId)
        {

            var tempFilePath = Path.Combine(_tempFolder, $"{Guid.NewGuid()}.mg");
            try
            {
                // Kullan�c� ve �ifreyi al
                var kullanici = await _serverDbContext.Kullanicilar.FindAsync(kullaniciId);
                if (kullanici == null || string.IsNullOrEmpty(kullanici.VeriTabanSifresi))
                {
                    await _fileLogService.LogDetay("HATA: CreateNewBankaFile - Kullan�c� bulunamad�", kullaniciId);
                    throw new Exception("Kullan�c� veya �ifre bulunamad�");
                }

                await _fileLogService.LogDetay("1. Kullan�c� veritaban�ndan al�nd�", kullaniciId, $"VeriTabanSifresi: {kullanici.VeriTabanSifresi}");

                Directory.CreateDirectory(_tempFolder);
                var connectionString = $"Data Source={tempFilePath}";
                var escapedPassword = kullanici.VeriTabanSifresi.Replace("'", "''");
                using (var connection = new SqliteConnection(connectionString))
                {
                    await connection.OpenAsync();
                    // SQLCipher �ifreyi uygula
                    var command = connection.CreateCommand();
                    command.CommandText = $"PRAGMA key='{escapedPassword}'";
                    await command.ExecuteNonQueryAsync();
                    await _fileLogService.LogDetay("2. PRAGMA key ayarlan�yor (ba�lant� a��l�r a��lmaz)", kullaniciId, $"EscapedPassword: {escapedPassword}");
                    await _fileLogService.LogDetay("PRAGMA key uyguland�", kullaniciId);

                    // EF Core ile context olu�tur
                    var optionsBuilder = new DbContextOptionsBuilder<mgtestDbContext>();
                    optionsBuilder.UseSqlite(connection)
                                  .LogTo(Console.WriteLine, Microsoft.Extensions.Logging.LogLevel.Information);

                    using (var context = new mgtestDbContext(optionsBuilder.Options))
                    {
                        await _fileLogService.LogDetay("3. Database olu�turuluyor", kullaniciId, $"TempPath: {tempFilePath}");
                        await context.Database.EnsureCreatedAsync();

                        await _fileLogService.LogDetay("4. Metadata kaydediliyor", kullaniciId, $"DosyaId: {dosyaId}, BankaAdi: {bankaAdi}");

                        var metadata = new DosyaMetadata
                        {
                            SifreliKullaniciId = kullaniciId.ToString(),
                            DosyaId = dosyaId,
                            BankaAdi = bankaAdi,
                            OlusturmaTarihi = DateTime.Now,
                            SonDuzenleme = DateTime.Now,
                            DosyaHash = ""
                        };
                        context.DosyaMetadata.Add(metadata);

                        var ayarlar = new BankaAyarlari
                        {
                            BankaAdi = bankaAdi,
                            OlusturmaTarihi = DateTime.Now,
                            SonDuzenleme = DateTime.Now,
                            VarsayilanSutunSayisi = 2,
                            VarsayilanAnahtarEkle = true
                        };
                        context.BankaAyarlari.Add(ayarlar);

                        var saveResult = await context.SaveChangesAsync();
                        await _fileLogService.LogDetay("SaveChangesAsync �a�r�ld�", kullaniciId, $"Result: {saveResult}");

                        var kontrolMetadata = await context.DosyaMetadata.FirstOrDefaultAsync();
                        if (kontrolMetadata == null)
                            await _fileLogService.LogDetay("UYARI: Metadata kaydedilemedi!", kullaniciId);
                        else
                            await _fileLogService.LogDetay("Metadata ba�ar�yla kaydedildi", kullaniciId, $"SifreliKullaniciId: {kontrolMetadata.SifreliKullaniciId}");
                    }
                }

                CacheTempFilePassword(tempFilePath, kullanici.VeriTabanSifresi);
                await _fileLogService.LogFileCreated(kullaniciId, dosyaId, bankaAdi, kullanici.VeriTabanSifresi, tempFilePath);
                Console.WriteLine($"File created successfully: {tempFilePath}");
                return tempFilePath;
            }
            catch (IOException ioEx)
            {
                Console.WriteLine($"IOException in CreateNewBankaFile: {ioEx.Message}");
                throw;
            }
            catch (Exception ex)
            {
                Console.WriteLine($"Error in CreateNewBankaFile: {ex.Message}");
                throw;
            }
        }

        // Dosya y�kle ve �ifreyi ��z
        public async Task<string?> LoadBankaFile(IFormFile file, int kullaniciId)
        {
            if (file == null || file.Length == 0)
                return null;

            var tempFilePath = Path.Combine(_tempFolder, $"{Guid.NewGuid()}.mg");

            try
            {
                // Kullan�c�n�n VeriTabanSifresi'ni al
                var kullanici = await _serverDbContext.Kullanicilar.FindAsync(kullaniciId);
                if (kullanici == null || string.IsNullOrEmpty(kullanici.VeriTabanSifresi))
                {
                    Console.WriteLine("Kullan�c� veya �ifre bulunamad�");
                    return null;
                }

                // �ifreli dosyay� oku (oldu�u gibi, SQLite encryption var)
                using var ms = new MemoryStream();
                await file.CopyToAsync(ms);
                var fileData = ms.ToArray();

                // Temp klas�re kaydet
                await File.WriteAllBytesAsync(tempFilePath, fileData);

                // Biraz bekle dosya yazma i�leminin tamamlanmas�n� sa�la
                await Task.Delay(100);

                // Dosya sahipli�ini do�rula
                if (!await ValidateFileOwnership(tempFilePath, kullaniciId))
                {
                    // Do�rulama ba�ar�s�z oldu, log'a yazal�m
                    await _fileLogService.LogFileUploaded(kullaniciId, Path.GetFileNameWithoutExtension(file.FileName), file.FileName, kullanici.VeriTabanSifresi, tempFilePath, false);
                    
                    try { File.Delete(tempFilePath); } catch { }
                    return null;
                }

                // �ifreyi cache'ye ekle
                CacheTempFilePassword(tempFilePath, kullanici.VeriTabanSifresi);

                // Ba�ar�l� y�kleme log'a yazal�m
                await _fileLogService.LogFileUploaded(kullaniciId, Path.GetFileNameWithoutExtension(file.FileName), file.FileName, kullanici.VeriTabanSifresi, tempFilePath, true);

                return tempFilePath;
            }
            catch (Exception ex)
            {
                Console.WriteLine($"Error in LoadBankaFile: {ex.Message}");
                if (File.Exists(tempFilePath))
                {
                    try { File.Delete(tempFilePath); } catch { }
                }
                return null;
            }
        }

        // Dosya sahipli�ini kontrol et
        public async Task<bool> ValidateFileOwnership(string tempFilePath, int kullaniciId)
        {
            mgtestDbContext? context = null;
            try
            {
                await _fileLogService.LogDetay("ValidateFileOwnership ba�lad�", kullaniciId, 
                    $"TempPath: {tempFilePath}");

                // Kullan�c�n�n VeriTabanSifresi'ni al
                var kullanici = await _serverDbContext.Kullanicilar.FindAsync(kullaniciId);
                if (kullanici == null || string.IsNullOrEmpty(kullanici.VeriTabanSifresi))
                {
                    await _fileLogService.LogDetay("HATA: ValidateFileOwnership - Kullan�c� bulunamad�", kullaniciId);
                    Console.WriteLine("Kullan�c� veya �ifre bulunamad�");
                    return false;
                }

                await _fileLogService.LogDetay("1. Kullan�c� bulundu", kullaniciId, 
                    $"VeriTabanSifresi: {kullanici.VeriTabanSifresi}");

                var optionsBuilder = new DbContextOptionsBuilder<mgtestDbContext>();
                optionsBuilder.UseSqlite($"Data Source={tempFilePath}");

                context = new mgtestDbContext(optionsBuilder.Options);
                

                // �ifre bo�sa PRAGMA key uygulama (�ifresiz dosya deste�i)
                if (!string.IsNullOrEmpty(kullanici.VeriTabanSifresi))
                {
                    var escapedPassword = kullanici.VeriTabanSifresi.Replace("'", "''");
                    await _fileLogService.LogDetay("2. PRAGMA key ayarlan�yor", kullaniciId, $"EscapedPassword: {escapedPassword}");
#pragma warning disable EF1000
                    var pragmaResult = await context.Database.ExecuteSqlRawAsync($"PRAGMA key='{escapedPassword}'");
#pragma warning restore EF1000
                    await _fileLogService.LogDetay("PRAGMA key uyguland� (do�rulama)", kullaniciId, $"Result: {pragmaResult}");
                }

                await _fileLogService.LogDetay("3. Metadata sorgulan�yor", kullaniciId);

                var metadata = await context.DosyaMetadata.FirstOrDefaultAsync();

                if (metadata == null)
                {
                    // Metadata tablosu yoksa veya veri yoksa, tabloyu olu�turmay� dene (�ifresiz dosya i�in)
                    try
                    {
                        await context.Database.EnsureCreatedAsync();
                        metadata = await context.DosyaMetadata.FirstOrDefaultAsync();
                    }
                    catch (Exception ex)
                    {
                        await _fileLogService.LogDetay($"HATA: Metadata tablosu olu�turulamad� veya okunamad�: {ex.Message}", kullaniciId);
                        return false;
                    }
                }

                if (metadata == null)
                {
                    await _fileLogService.LogDetay("HATA: Metadata null d�nd� - dosya �ifresiz olu�turulmu� olabilir veya metadata eklenmemi�.", kullaniciId);
                    return false;
                }

                await _fileLogService.LogDetay("4. Metadata bulundu", kullaniciId, $"SifreliKullaniciId: {metadata.SifreliKullaniciId}, Beklenen: {kullaniciId.ToString()}");

                // Plain text olarak saklanan kullan�c� ID'si kar��la�t�r
                var isOwner = metadata.SifreliKullaniciId == kullaniciId.ToString();

                await _fileLogService.LogDetay(isOwner ? "5. Do�rulama ba�ar�l�" : "5. Do�rulama ba�ar�s�z", kullaniciId);

                return isOwner;
            }
            catch (Exception ex)
            {
                Console.WriteLine($"Error in ValidateFileOwnership: {ex.Message}");
                return false;
            }
            finally
            {
                // DbContext'i d�zg�n �ekilde kapat
                if (context != null)
                {
                    await context.Database.CloseConnectionAsync();
                    context.Dispose();
                }
            }
        }

        // Dosyay� indir i�in haz�rla (SQLite encryption zaten var)
                public async Task<byte[]> SaveAndEncryptBankaFile(string tempFilePath, int kullaniciId)
        {
            var kullanici = await _serverDbContext.Kullanicilar.FindAsync(kullaniciId);
            if (kullanici == null || string.IsNullOrEmpty(kullanici.VeriTabanSifresi))
                throw new Exception("Kullanıcı veya şifre bulunamadı");

            var downloadPath = Path.Combine(_tempFolder, $"download_{Guid.NewGuid()}.mg");
            File.Copy(tempFilePath, downloadPath, true);
            var fileBytes = await File.ReadAllBytesAsync(downloadPath);
            
            var key = _encryptionService.GenerateKeyFromPassword(kullanici.VeriTabanSifresi);
            var encryptedBytes = _encryptionService.Encrypt(fileBytes, key);
            
            try { File.Delete(downloadPath); } catch { }
            return encryptedBytes;
        }

        // Sorular� getir
        public async Task<List<Soru>> GetSorular(string tempFilePath)
        {
            var optionsBuilder = new DbContextOptionsBuilder<mgtestDbContext>();
            optionsBuilder.UseSqlite($"Data Source={tempFilePath}");

            using var context = new mgtestDbContext(optionsBuilder.Options);
            
            // Cache'den �ifre al ve PRAGMA key'i set et
            var password = GetCachedPassword(tempFilePath);
            if (!string.IsNullOrEmpty(password))
            {
                var escapedPassword = password.Replace("'", "''");
#pragma warning disable EF1000
                await context.Database.ExecuteSqlRawAsync($"PRAGMA key='{escapedPassword}'");
#pragma warning restore EF1000
            }

            var sorular = await context.Sorular.OrderBy(s => s.Sira).ToListAsync();
            await context.Database.CloseConnectionAsync();
            return sorular;
        }

        // Tek soru getir
        public async Task<Soru?> GetSoru(string tempFilePath, int soruId)
        {
            var optionsBuilder = new DbContextOptionsBuilder<mgtestDbContext>();
            optionsBuilder.UseSqlite($"Data Source={tempFilePath}");

            using var context = new mgtestDbContext(optionsBuilder.Options);
            
            // Cache'den �ifre al ve PRAGMA key'i set et
            var password = GetCachedPassword(tempFilePath);
            if (!string.IsNullOrEmpty(password))
            {
                var escapedPassword = password.Replace("'", "''");
                await context.Database.ExecuteSqlRawAsync($"PRAGMA key='{escapedPassword}'");
            }

            var soru = await context.Sorular.FindAsync(soruId);
            await context.Database.CloseConnectionAsync();
            return soru;
        }

        // Soru ekle
        public async Task AddSoru(string tempFilePath, Soru soru)
        {
            var optionsBuilder = new DbContextOptionsBuilder<mgtestDbContext>();
            optionsBuilder.UseSqlite($"Data Source={tempFilePath}");

            using var context = new mgtestDbContext(optionsBuilder.Options);
            
            // Cache'den �ifre al ve PRAGMA key'i set et
            var password = GetCachedPassword(tempFilePath);
            if (!string.IsNullOrEmpty(password))
            {
                var escapedPassword = password.Replace("'", "''");
                await context.Database.ExecuteSqlRawAsync($"PRAGMA key='{escapedPassword}'");
            }

            // Check and create missing Ders
            if (!await context.Dersler.AnyAsync(d => d.Id == soru.DersId))
            {
                var newDers = new Ders { Id = soru.DersId, DersAdi = "Ders Yok", EklemeTarihi = DateTime.Now };
                context.Dersler.Add(newDers);
                await context.SaveChangesAsync();
            }

            // Check and create missing Konu
            if (!await context.Konular.AnyAsync(k => k.Id == soru.KonuId))
            {
                var newKonu = new Konu { Id = soru.KonuId, DersId = soru.DersId, KonuAdi = "Konu Yok", EklemeTarihi = DateTime.Now };
                context.Konular.Add(newKonu);
                await context.SaveChangesAsync();
            }

            // Check and create missing Kazanim
            if (!await context.Kazanimlar.AnyAsync(kz => kz.Id == soru.KazanimId))
            {
                var newKazanim = new Kazanim { Id = soru.KazanimId, KonuId = soru.KonuId, KazanimAdi = "Kazanim Yok", EklemeTarihi = DateTime.Now };
                context.Kazanimlar.Add(newKazanim);
                await context.SaveChangesAsync();
            }

            // Add the Soru 
            context.Sorular.Add(soru);
            await context.SaveChangesAsync();
            await context.Database.CloseConnectionAsync();
        }

        // Soru g�ncelle
        public async Task UpdateSoru(string tempFilePath, Soru soru)
        {
            var optionsBuilder = new DbContextOptionsBuilder<mgtestDbContext>();
            optionsBuilder.UseSqlite($"Data Source={tempFilePath}");

            using var context = new mgtestDbContext(optionsBuilder.Options);
            
            // Cache'den �ifre al ve PRAGMA key'i set et
            var password = GetCachedPassword(tempFilePath);
            if (!string.IsNullOrEmpty(password))
            {
                var escapedPassword = password.Replace("'", "''");
                await context.Database.ExecuteSqlRawAsync($"PRAGMA key='{escapedPassword}'");
            }

            context.Sorular.Update(soru);
            await context.SaveChangesAsync();
            await UpdateSonDuzenleme(context);
            await context.Database.CloseConnectionAsync();
        }

        // Soru sil
        public async Task DeleteSoru(string tempFilePath, int soruId)
        {
            var optionsBuilder = new DbContextOptionsBuilder<mgtestDbContext>();
            optionsBuilder.UseSqlite($"Data Source={tempFilePath}");

            using var context = new mgtestDbContext(optionsBuilder.Options);
            
            // Cache'den �ifre al ve PRAGMA key'i set et
            var password = GetCachedPassword(tempFilePath);
            if (!string.IsNullOrEmpty(password))
            {
                var escapedPassword = password.Replace("'", "''");
                await context.Database.ExecuteSqlRawAsync($"PRAGMA key='{escapedPassword}'");
            }

            var soru = await context.Sorular.FindAsync(soruId);
            if (soru != null)
            {
                context.Sorular.Remove(soru);
                await context.SaveChangesAsync();
                await UpdateSonDuzenleme(context);
            }
            await context.Database.CloseConnectionAsync();
        }

        // Banka ayarlar� getir
        public async Task<BankaAyarlari?> GetBankaAyarlari(string tempFilePath)
        {
            var optionsBuilder = new DbContextOptionsBuilder<mgtestDbContext>();
            optionsBuilder.UseSqlite($"Data Source={tempFilePath}");

            using var context = new mgtestDbContext(optionsBuilder.Options);
            
            // Cache'den �ifre al ve PRAGMA key'i set et
            var password = GetCachedPassword(tempFilePath);
            if (!string.IsNullOrEmpty(password))
            {
                var escapedPassword = password.Replace("'", "''");
                await context.Database.ExecuteSqlRawAsync($"PRAGMA key='{escapedPassword}'");
            }

            var ayarlar = await context.BankaAyarlari.FirstOrDefaultAsync();
            await context.Database.CloseConnectionAsync();
            return ayarlar;
        }

        // Banka ayarlar�n� g�ncelle
        public async Task UpdateBankaAyarlari(string tempFilePath, BankaAyarlari ayarlar)
        {
            var optionsBuilder = new DbContextOptionsBuilder<mgtestDbContext>();
            optionsBuilder.UseSqlite($"Data Source={tempFilePath}");

            using var context = new mgtestDbContext(optionsBuilder.Options);
            
            // Cache'den �ifre al ve PRAGMA key'i set et
            var password = GetCachedPassword(tempFilePath);
            if (!string.IsNullOrEmpty(password))
            {
                var escapedPassword = password.Replace("'", "''");
                await context.Database.ExecuteSqlRawAsync($"PRAGMA key='{escapedPassword}'");
            }

            context.BankaAyarlari.Update(ayarlar);
            await context.SaveChangesAsync();
            await UpdateSonDuzenleme(context);
            await context.Database.CloseConnectionAsync();
        }

        // Toplam soru say�s�
        public async Task<int> GetToplamSoruSayisi(string tempFilePath)
        {
            var optionsBuilder = new DbContextOptionsBuilder<mgtestDbContext>();
            optionsBuilder.UseSqlite($"Data Source={tempFilePath}");

            using var context = new mgtestDbContext(optionsBuilder.Options);
            
            // Cache'den �ifre al ve PRAGMA key'i set et
            var password = GetCachedPassword(tempFilePath);
            if (!string.IsNullOrEmpty(password))
            {
                var escapedPassword = password.Replace("'", "''");
                await context.Database.ExecuteSqlRawAsync($"PRAGMA key='{escapedPassword}'");
            }

            var count = await context.Sorular.CountAsync();
            await context.Database.CloseConnectionAsync();
            return count;
        }

        // Son d�zenleme tarihini g�ncelle
        private async Task UpdateSonDuzenleme(mgtestDbContext context)
        {
            var metadata = await context.DosyaMetadata.FirstOrDefaultAsync();
            if (metadata != null)
            {
                metadata.SonDuzenleme = DateTime.Now;
                await context.SaveChangesAsync();
            }
        }
    }
}