using System.Data;
using System.Text.RegularExpressions;
using Microsoft.Data.Sqlite;
using Microsoft.EntityFrameworkCore;
using mgtest.Data;
using mgtest.Models;

namespace mgtest.Services
{
    public class BankaDonusturucuService : IBankaDonusturucuService
    {
        private readonly ServerDbContext _serverDbContext;
        private readonly IEncryptionService _encryptionService;
        private readonly IFileLogService _fileLogService;
        private readonly IConfiguration _configuration;
        private readonly string _tempFolder;

        private static readonly Regex ImgSrcRegex = new Regex(@"<img[^>]+src=[""']([^""']+)[""']", RegexOptions.IgnoreCase | RegexOptions.Compiled);
        private static readonly Regex HtmlTagRegex = new Regex(@"<[^>]+>", RegexOptions.Compiled);

        public BankaDonusturucuService(
            ServerDbContext serverDbContext,
            IEncryptionService encryptionService,
            IFileLogService fileLogService,
            IConfiguration configuration)
        {
            _serverDbContext = serverDbContext;
            _encryptionService = encryptionService;
            _fileLogService = fileLogService;
            _configuration = configuration;
            
            _tempFolder = configuration["AppSettings:TempFileFolder"] ?? "TempFiles";
            if (!Directory.Exists(_tempFolder))
            {
                Directory.CreateDirectory(_tempFolder);
            }
        }

        public async Task<DosyaSemaSonuc> SemaAnalizEtAsync(Stream fileStream)
        {
            var tempForeignFile = Path.Combine(_tempFolder, $"inspect_{Guid.NewGuid()}.db");
            try
            {
                using (var fs = new FileStream(tempForeignFile, FileMode.Create, FileAccess.Write))
                {
                    await fileStream.CopyToAsync(fs);
                }

                var connectionString = $"Data Source={tempForeignFile};Mode=ReadOnly;";
                using var connection = new SqliteConnection(connectionString);
                await connection.OpenAsync();

                var tablolar = new List<TabloSemaBilgisi>();

                // Tabloları listele
                using (var cmd = connection.CreateCommand())
                {
                    cmd.CommandText = "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name;";
                    using var reader = await cmd.ExecuteReaderAsync();
                    while (await reader.ReadAsync())
                    {
                        var tableName = reader.GetString(0);
                        tablolar.Add(new TabloSemaBilgisi { TabloAdi = tableName });
                    }
                }

                // Her tablonun kolonlarını ve satır sayısını al
                foreach (var tbl in tablolar)
                {
                    // Kolonlar
                    using (var cmdCols = connection.CreateCommand())
                    {
                        cmdCols.CommandText = $"PRAGMA table_info(\"{tbl.TabloAdi.Replace("\"", "\"\"")}\");";
                        using var readerCols = await cmdCols.ExecuteReaderAsync();
                        while (await readerCols.ReadAsync())
                        {
                            var colName = readerCols["name"]?.ToString() ?? "";
                            tbl.Kolonlar.Add(colName);
                        }
                    }

                    // Satır sayısı
                    try
                    {
                        using var cmdCount = connection.CreateCommand();
                        cmdCount.CommandText = $"SELECT COUNT(*) FROM \"{tbl.TabloAdi.Replace("\"", "\"\"")}\";";
                        var countObj = await cmdCount.ExecuteScalarAsync();
                        tbl.SatirSayisi = Convert.ToInt32(countObj);
                    }
                    catch
                    {
                        tbl.SatirSayisi = 0;
                    }
                }

                return new DosyaSemaSonuc
                {
                    Basarili = true,
                    Tablolar = tablolar
                };
            }
            catch (Exception ex)
            {
                return new DosyaSemaSonuc
                {
                    Basarili = false,
                    Mesaj = "Veritabanı analiz edilirken hata oluştu: " + ex.Message
                };
            }
            finally
            {
                try
                {
                    if (File.Exists(tempForeignFile)) File.Delete(tempForeignFile);
                }
                catch { }
            }
        }

        public async Task<BankaDonusturSonuc> DonusturAsync(int adminKullaniciId, Stream fileStream, BankaDonusturmeAyarlari ayarlar)
        {
            var sonuc = new BankaDonusturSonuc();
            var tempForeignFile = Path.Combine(_tempFolder, $"convert_src_{Guid.NewGuid()}.db");
            var tempMgDbPath = Path.Combine(_tempFolder, $"convert_dest_{Guid.NewGuid()}.mg");
            var dosyaId = Guid.NewGuid().ToString();

            try
            {
                // 1. Admin kullanıcısını doğrula
                var admin = await _serverDbContext.Kullanicilar.FindAsync(adminKullaniciId);
                if (admin == null || string.IsNullOrEmpty(admin.VeriTabanSifresi))
                {
                    sonuc.Basarili = false;
                    sonuc.Mesaj = "Admin kullanıcısı veya veritabanı şifresi bulunamadı.";
                    return sonuc;
                }

                // 2. Yüklenen yabancı dosyayı diske kaydet
                using (var fs = new FileStream(tempForeignFile, FileMode.Create, FileAccess.Write))
                {
                    await fileStream.CopyToAsync(fs);
                }

                // 3. Yabancı dosyayı SQLite olarak aç
                var foreignConnStr = $"Data Source={tempForeignFile};Mode=ReadOnly;";
                using (var foreignConn = new SqliteConnection(foreignConnStr))
                {
                    await foreignConn.OpenAsync();

                    // Tablo var mı kontrol et
                    var tableExists = false;
                    using (var cmdCheck = foreignConn.CreateCommand())
                    {
                        cmdCheck.CommandText = "SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND LOWER(name) = LOWER(@tableName);";
                        cmdCheck.Parameters.AddWithValue("@tableName", ayarlar.SoruTabloAdi.Trim());
                        tableExists = Convert.ToInt32(await cmdCheck.ExecuteScalarAsync()) > 0;
                    }

                    if (!tableExists)
                    {
                        sonuc.Basarili = false;
                        sonuc.Mesaj = $"Yüklenen veritabanı dosyasında '{ayarlar.SoruTabloAdi}' isimli tablo bulunamadı!";
                        return sonuc;
                    }

                    // Kolonları çek ve doğrula
                    var mevcutKolonlar = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
                    using (var cmdCols = foreignConn.CreateCommand())
                    {
                        cmdCols.CommandText = $"PRAGMA table_info(\"{ayarlar.SoruTabloAdi.Replace("\"", "\"\"")}\");";
                        using var rdrCols = await cmdCols.ExecuteReaderAsync();
                        while (await rdrCols.ReadAsync())
                        {
                            mevcutKolonlar.Add(rdrCols["name"]?.ToString() ?? "");
                        }
                    }

                    // Zorunlu Soru Kolonunu doğrula
                    if (!mevcutKolonlar.Contains(ayarlar.SoruMetniVeyaResmiKolon.Trim()))
                    {
                        sonuc.Basarili = false;
                        sonuc.Mesaj = $"'{ayarlar.SoruTabloAdi}' tablosunda '{ayarlar.SoruMetniVeyaResmiKolon}' başlıklı kolon bulunamadı!";
                        return sonuc;
                    }

                    // Konu tablosu varsa konuları haritala
                    var konuMap = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);
                    if (!string.IsNullOrWhiteSpace(ayarlar.KonuTabloAdi) &&
                        !string.IsNullOrWhiteSpace(ayarlar.KonuTabloIdKolon) &&
                        !string.IsNullOrWhiteSpace(ayarlar.KonuTabloAdiKolon))
                    {
                        try
                        {
                            using var cmdKonular = foreignConn.CreateCommand();
                            cmdKonular.CommandText = $"SELECT \"{ayarlar.KonuTabloIdKolon.Replace("\"", "\"\"")}\", \"{ayarlar.KonuTabloAdiKolon.Replace("\"", "\"\"")}\" FROM \"{ayarlar.KonuTabloAdi.Replace("\"", "\"\"")}\";";
                            using var rdrKonular = await cmdKonular.ExecuteReaderAsync();
                            while (await rdrKonular.ReadAsync())
                            {
                                var kId = rdrKonular[0]?.ToString()?.Trim() ?? "";
                                var kAd = rdrKonular[1]?.ToString()?.Trim() ?? "";
                                if (!string.IsNullOrEmpty(kId) && !konuMap.ContainsKey(kId))
                                {
                                    konuMap[kId] = kAd;
                                }
                            }
                        }
                        catch (Exception ex)
                        {
                            sonuc.UyariListesi.Add($"Konu tablosu '{ayarlar.KonuTabloAdi}' okunamadı: {ex.Message}");
                        }
                    }

                    // Soruları oku
                    var okunacakSorular = new List<Soru>();
                    var uniqueKonular = new Dictionary<string, int>(StringComparer.OrdinalIgnoreCase);
                    var konuSayac = 1;

                    using (var cmdSorular = foreignConn.CreateCommand())
                    {
                        cmdSorular.CommandText = $"SELECT * FROM \"{ayarlar.SoruTabloAdi.Replace("\"", "\"\"")}\";";
                        using var rdr = await cmdSorular.ExecuteReaderAsync();
                        var sira = 1;

                        while (await rdr.ReadAsync())
                        {
                            sonuc.ToplamSoruSayisi++;

                            // Soru metni / resmi ayıkla
                            var soruRaw = rdr[ayarlar.SoruMetniVeyaResmiKolon]?.ToString() ?? "";
                            var (soruMetni, soruResmi, soruMetniAyriMi) = AyiklaMetinVeResim(soruRaw);

                            // Şıklar (Varsa)
                            var sikA = OkuKolonMetni(rdr, mevcutKolonlar, ayarlar.SikAKolon);
                            var sikB = OkuKolonMetni(rdr, mevcutKolonlar, ayarlar.SikBKolon);
                            var sikC = OkuKolonMetni(rdr, mevcutKolonlar, ayarlar.SikCKolon);
                            var sikD = OkuKolonMetni(rdr, mevcutKolonlar, ayarlar.SikDKolon);
                            var sikE = OkuKolonMetni(rdr, mevcutKolonlar, ayarlar.SikEKolon);

                            var ayriSikVarMi = !string.IsNullOrWhiteSpace(sikA) || !string.IsNullOrWhiteSpace(sikB);

                            // Doğru Cevap
                            var dogruCevap = "A";
                            if (!string.IsNullOrWhiteSpace(ayarlar.DogruCevapKolon) && mevcutKolonlar.Contains(ayarlar.DogruCevapKolon))
                            {
                                var dcRaw = rdr[ayarlar.DogruCevapKolon];
                                dogruCevap = NormalizeDogruCevap(dcRaw);
                            }

                            // Zorluk Derecesi
                            var zorluk = ZorlukSeviye.orta;
                            if (!string.IsNullOrWhiteSpace(ayarlar.ZorlukKolon) && mevcutKolonlar.Contains(ayarlar.ZorlukKolon))
                            {
                                var zorlukRaw = rdr[ayarlar.ZorlukKolon];
                                zorluk = NormalizeZorluk(zorlukRaw);
                            }

                            // Konu tespiti
                            var konuAdi = "Genel Konu";
                            if (!string.IsNullOrWhiteSpace(ayarlar.SoruKonuKolon) && mevcutKolonlar.Contains(ayarlar.SoruKonuKolon))
                            {
                                var rawKonuDeger = rdr[ayarlar.SoruKonuKolon]?.ToString()?.Trim(',', ' ') ?? "";
                                if (!string.IsNullOrEmpty(rawKonuDeger))
                                {
                                    if (konuMap.TryGetValue(rawKonuDeger, out var haritalanmisKonu))
                                    {
                                        konuAdi = haritalanmisKonu;
                                    }
                                    else
                                    {
                                        konuAdi = rawKonuDeger;
                                    }
                                }
                            }

                            if (!uniqueKonular.TryGetValue(konuAdi, out var konuId))
                            {
                                konuId = konuSayac++;
                                uniqueKonular[konuAdi] = konuId;
                            }

                            var yeniSoru = new Soru
                            {
                                DersId = 1,
                                KonuId = konuId,
                                KazanimId = 1,
                                SoruMetni = soruMetni,
                                SoruResmi = soruResmi,
                                SoruMetniAyriMi = soruMetniAyriMi,
                                SikkarAyriMi = ayriSikVarMi,
                                ASikkiMetni = ayriSikVarMi ? sikA : null,
                                BSikkiMetni = ayriSikVarMi ? sikB : null,
                                CSikkiMetni = ayriSikVarMi ? sikC : null,
                                DSikkiMetni = ayriSikVarMi ? sikD : null,
                                ESikkiMetni = ayriSikVarMi ? sikE : null,
                                DogruCevapSikki = dogruCevap,
                                ZorlukSeviye = zorluk,
                                Sira = sira++,
                                YuklenmeTarihi = DateTime.Now
                            };

                            okunacakSorular.Add(yeniSoru);
                        }
                    }

                    if (okunacakSorular.Count == 0)
                    {
                        sonuc.Basarili = false;
                        sonuc.Mesaj = "Tabloda dönüştürülecek herhangi bir soru kaydı bulunamadı.";
                        return sonuc;
                    }

                    // 4. Hedef .mg SQLite Veritabanını Oluştur
                    var destConnStr = $"Data Source={tempMgDbPath}";
                    var escapedPassword = admin.VeriTabanSifresi.Replace("'", "''");

                    using (var destConn = new SqliteConnection(destConnStr))
                    {
                        await destConn.OpenAsync();

                        // SQLCipher Key uygula
                        var cmdKey = destConn.CreateCommand();
                        cmdKey.CommandText = $"PRAGMA key='{escapedPassword}'";
                        await cmdKey.ExecuteNonQueryAsync();

                        var optionsBuilder = new DbContextOptionsBuilder<mgtestDbContext>();
                        optionsBuilder.UseSqlite(destConn);

                        using (var destContext = new mgtestDbContext(optionsBuilder.Options))
                        {
                            await destContext.Database.EnsureCreatedAsync();

                            // Metadata ekle
                            destContext.DosyaMetadata.Add(new DosyaMetadata
                            {
                                SifreliKullaniciId = adminKullaniciId.ToString(),
                                DosyaId = dosyaId,
                                BankaAdi = ayarlar.BankaAdi,
                                OlusturmaTarihi = DateTime.Now,
                                SonDuzenleme = DateTime.Now,
                                DosyaHash = ""
                            });

                            // Ayarlar ekle
                            destContext.BankaAyarlari.Add(new BankaAyarlari
                            {
                                BankaAdi = ayarlar.BankaAdi,
                                Aciklama = $"Dönüştürüldü ({DateTime.Now:dd.MM.yyyy HH:mm})",
                                OlusturmaTarihi = DateTime.Now,
                                SonDuzenleme = DateTime.Now,
                                VarsayilanSutunSayisi = 2,
                                VarsayilanAnahtarEkle = true
                            });

                            // Ders ekle
                            var dersAdi = string.IsNullOrWhiteSpace(ayarlar.VarsayilanDersAdi) ? "Genel" : ayarlar.VarsayilanDersAdi.Trim();
                            destContext.Dersler.Add(new Ders
                            {
                                Id = 1,
                                DersAdi = dersAdi,
                                EklemeTarihi = DateTime.Now
                            });

                            // Konuları ekle
                            foreach (var item in uniqueKonular)
                            {
                                destContext.Konular.Add(new Konu
                                {
                                    Id = item.Value,
                                    DersId = 1,
                                    KonuAdi = item.Key,
                                    EklemeTarihi = DateTime.Now
                                });
                            }

                            // Varsayılan Kazanım ekle
                            destContext.Kazanimlar.Add(new Kazanim
                            {
                                Id = 1,
                                DersId = 1,
                                KonuId = uniqueKonular.Values.FirstOrDefault(1),
                                KazanimAdi = "Genel Kazanım",
                                EklemeTarihi = DateTime.Now
                            });

                            // Soruları toplu ekle
                            destContext.Sorular.AddRange(okunacakSorular);

                            await destContext.SaveChangesAsync();
                        }

                        await destConn.CloseAsync();
                        SqliteConnection.ClearPool(destConn);
                    }

                    SqliteConnection.ClearAllPools();

                    // 5. Dosyayı AES ile şifrele ve nihai .mg formatına dönüştür
                    var dbBytes = await File.ReadAllBytesAsync(tempMgDbPath);
                    var key = _encryptionService.GenerateKeyFromPassword(admin.VeriTabanSifresi);
                    var encryptedBytes = _encryptionService.Encrypt(dbBytes, key);

                    var finalMgPath = Path.Combine(_tempFolder, $"{dosyaId}.mg");
                    await File.WriteAllBytesAsync(finalMgPath, encryptedBytes);

                    // 6. Kullanıcı Bankalarına Kaydet
                    var kullaniciBankasi = new KullaniciBankasi
                    {
                        KullaniciId = adminKullaniciId,
                        BankaAdi = ayarlar.BankaAdi,
                        DosyaId = dosyaId,
                        OlusturmaTarihi = DateTime.Now
                    };
                    _serverDbContext.KullaniciBankalari.Add(kullaniciBankasi);
                    await _serverDbContext.SaveChangesAsync();

                    await _fileLogService.LogFileCreated(adminKullaniciId, dosyaId, ayarlar.BankaAdi, admin.VeriTabanSifresi, finalMgPath);

                    sonuc.Basarili = true;
                    sonuc.Mesaj = $"{okunacakSorular.Count} adet soru başarıyla .mg biçimine dönüştürüldü.";
                    sonuc.DosyaAdi = $"{ayarlar.BankaAdi}.mg";
                    sonuc.DosyaId = dosyaId;
                    sonuc.DonusturulenSoruSayisi = okunacakSorular.Count;
                    sonuc.DownloadUrl = $"/Admin/DownloadConvertedBank?dosyaId={dosyaId}";

                    return sonuc;
                }
            }
            catch (Exception ex)
            {
                sonuc.Basarili = false;
                sonuc.Mesaj = "Dönüştürme sırasında beklenmeyen bir hata oluştu: " + ex.Message;
                return sonuc;
            }
            finally
            {
                SqliteConnection.ClearAllPools();
                // Geçici dosyaları temizle
                try
                {
                    if (File.Exists(tempForeignFile)) File.Delete(tempForeignFile);
                    if (File.Exists(tempMgDbPath)) File.Delete(tempMgDbPath);
                }
                catch { }
            }
        }

        private static (string metin, string resim, bool metinAyriMi) AyiklaMetinVeResim(string rawContent)
        {
            if (string.IsNullOrWhiteSpace(rawContent))
                return ("", "", false);

            var imgMatch = ImgSrcRegex.Match(rawContent);
            if (imgMatch.Success)
            {
                var src = imgMatch.Groups[1].Value.Trim();
                
                // HTML etiketlerini ve resmi kaldırarak salt metni bul
                var htmlWithoutImg = ImgSrcRegex.Replace(rawContent, "");
                var plainText = HtmlTagRegex.Replace(htmlWithoutImg, " ")
                    .Replace("&nbsp;", " ")
                    .Replace("\r\n", " ")
                    .Replace("\n", " ")
                    .Trim();

                return (plainText, src, !string.IsNullOrWhiteSpace(plainText));
            }

            // Eğer HTML tag yoksa ve düz metinse
            var stripped = HtmlTagRegex.Replace(rawContent, " ").Replace("&nbsp;", " ").Trim();
            
            // Eğer doğrudan base64 resim stringi girilmişse
            if (rawContent.StartsWith("data:image/") || rawContent.StartsWith("iVBORw0KGgo") || rawContent.StartsWith("/9j/"))
            {
                return ("", rawContent, false);
            }

            return (stripped, "", true);
        }

        private static string? OkuKolonMetni(SqliteDataReader rdr, HashSet<string> mevcutKolonlar, string? kolonAdi)
        {
            if (string.IsNullOrWhiteSpace(kolonAdi) || !mevcutKolonlar.Contains(kolonAdi.Trim()))
                return null;

            var val = rdr[kolonAdi.Trim()]?.ToString()?.Trim();
            if (string.IsNullOrWhiteSpace(val)) return null;

            return HtmlTagRegex.Replace(val, " ").Replace("&nbsp;", " ").Trim();
        }

        private static string NormalizeDogruCevap(object? rawVal)
        {
            if (rawVal == null || rawVal == DBNull.Value) return "A";

            var str = rawVal.ToString()?.Trim().ToUpperInvariant() ?? "";
            return str switch
            {
                "1" => "A",
                "2" => "B",
                "3" => "C",
                "4" => "D",
                "5" => "E",
                "6" => "F",
                "A" => "A",
                "B" => "B",
                "C" => "C",
                "D" => "D",
                "E" => "E",
                "F" => "F",
                _ => "A"
            };
        }

        private static ZorlukSeviye NormalizeZorluk(object? rawVal)
        {
            if (rawVal == null || rawVal == DBNull.Value) return ZorlukSeviye.orta;

            var str = rawVal.ToString()?.Trim().ToLowerInvariant() ?? "";
            return str switch
            {
                "1" or "cokkolay" or "çok kolay" => ZorlukSeviye.cokKolay,
                "2" or "kolay" => ZorlukSeviye.kolay,
                "3" or "orta" => ZorlukSeviye.orta,
                "4" or "zor" => ZorlukSeviye.zor,
                "5" or "cokzor" or "çok zor" => ZorlukSeviye.cokZor,
                _ => ZorlukSeviye.orta
            };
        }
    }
}
