// Ders/Konu/Kazanım JSON API

using System.Text;
using System;
using System.Collections.Generic;
using System.Linq;
using System.Text.Json.Serialization;
using System.Threading.Tasks;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using mgtest.Data;
using mgtest.Models;
using mgtest.Services;
using System.Text.Json;
using ClosedXML.Excel;


// 

namespace mgtest.Controllers
{
    public class mgtestController : Controller
    {

        private readonly ServerDbContext _serverContext;
        private readonly ISqliteFileService _sqliteService;
        private readonly IEncryptionService _encryptionService;
        private readonly IExportService _exportService;

        public mgtestController(
            ServerDbContext serverContext,
            ISqliteFileService sqliteService,
            IEncryptionService encryptionService,
            IExportService exportService)
        {
            _serverContext = serverContext;
            _sqliteService = sqliteService;
            _encryptionService = encryptionService;
            _exportService = exportService;
        }

        private int? GetKullaniciId()
        {
            return HttpContext.Session.GetInt32("KullaniciId");
        }

        private KullaniciTuru? GetKullaniciTuru()
        {
            var turStr = HttpContext.Session.GetString("KullaniciTuru");
            if (Enum.TryParse<KullaniciTuru>(turStr, out var tur))
            {
                return tur;
            }
            return null;
        }

        // Kullanıcı Id'sini al
        private int? GetUserId()
        {
            // Session'dan "KullaniciId" anahtarıyla kaydedilmiş değeri çek
            // Login olunmamışsa null döner
            return HttpContext.Session.GetInt32("KullaniciId");
        }

        [HttpGet]
        public async Task<IActionResult> GetDersler()
        {
            // 1. Session'dan kullanıcı ID'sini al
            var userId = GetUserId();

            // 2. Eğer userId null ise, kullanıcı login olmamış demektir
            // Unauthorized (401) yerine, login sayfasına yönlendir
            if (userId == null)
            {
                // AJAX isteği olduğu için JSON döndür
                return Json(new { success = false, message = "Oturum süreniz dolmuş. Lütfen tekrar giriş yapın." });

                // Alternatif: Eğer normal sayfa isteği olsaydı:
                // return RedirectToAction("Login", "Account");
            }

            // 3. Kullanıcının derslerini veritabanından çek
            // userId.Value kullanıyoruz çünkü artık null olmadığını biliyoruz
            var dersler = await _serverContext.UserDersleri
                .Where(d => d.KullaniciId == userId.Value)
                .OrderBy(d => d.Ders)
                .ToListAsync();

            // 4. JSON formatında döndür
            return Json(dersler);
        }

        [HttpPost]
        public async Task<IActionResult> AddDers(string dersAdi)
        {
            var userId = GetUserId();
            if (userId == null) return Unauthorized();
            if (string.IsNullOrWhiteSpace(dersAdi)) return Json(new { success = false, message = "Ders adı boş olamaz." });
            var ders = new UserDers { Ders = dersAdi, KullaniciId = userId.Value };
            _serverContext.UserDersleri.Add(ders);
            await _serverContext.SaveChangesAsync();
            return Json(new { success = true, ders });
        }

        [HttpPost]
        public async Task<IActionResult> DeleteDers(int dersId)
        {
            var userId = GetUserId();
            if (userId == null) return Unauthorized();
            var ders = await _serverContext.UserDersleri.FirstOrDefaultAsync(d => d.Id == dersId && d.KullaniciId == userId);
            if (ders == null) return Json(new { success = false, message = "Ders bulunamadı." });
            // İlişkili konuları ve kazanımları sil
            var konular = _serverContext.UserKonulari.Where(k => k.DersId == dersId && k.KullaniciId == userId).ToList();
            foreach (var konu in konular)
            {
                var kazanims = _serverContext.UserKazanimlari.Where(kz => kz.KonuId == konu.Id && kz.KullaniciId == userId);
                _serverContext.UserKazanimlari.RemoveRange(kazanims);
            }
            _serverContext.UserKonulari.RemoveRange(konular);
            _serverContext.UserDersleri.Remove(ders);
            await _serverContext.SaveChangesAsync();
            return Json(new { success = true });
        }

        [HttpGet]
        public async Task<IActionResult> GetKonular(int dersId)
        {
            var userId = GetUserId();
            if (userId == null) return Unauthorized();
            var konular = await _serverContext.UserKonulari.Where(k => k.DersId == dersId && k.KullaniciId == userId).OrderBy(k => k.Konu).ToListAsync();
            return Json(konular);
        }

        [HttpPost]
        public async Task<IActionResult> AddKonu(int dersId, string konuAdi)
        {
            var userId = GetUserId();
            if (userId == null) return Unauthorized();
            if (string.IsNullOrWhiteSpace(konuAdi)) return Json(new { success = false, message = "Konu adı boş olamaz." });
            var konu = new UserKonu { DersId = dersId, Konu = konuAdi, KullaniciId = userId.Value };
            _serverContext.UserKonulari.Add(konu);
            await _serverContext.SaveChangesAsync();
            return Json(new { success = true, konu });
        }

        [HttpPost]
        public async Task<IActionResult> DeleteKonu(int konuId)
        {
            var userId = GetUserId();
            if (userId == null) return Unauthorized();
            var konu = await _serverContext.UserKonulari.FirstOrDefaultAsync(k => k.Id == konuId && k.KullaniciId == userId);
            if (konu == null) return Json(new { success = false, message = "Konu bulunamadı." });
            // İlişkili kazanımları sil
            var kazanims = _serverContext.UserKazanimlari.Where(kz => kz.KonuId == konuId && kz.KullaniciId == userId);
            _serverContext.UserKazanimlari.RemoveRange(kazanims);
            _serverContext.UserKonulari.Remove(konu);
            await _serverContext.SaveChangesAsync();
            return Json(new { success = true });
        }

        [HttpGet]
        public async Task<IActionResult> GetKazanims(int konuId)
        {
            var userId = GetUserId();
            if (userId == null) return Unauthorized();
            var kazanims = await _serverContext.UserKazanimlari.Where(k => k.KonuId == konuId && k.KullaniciId == userId).OrderBy(k => k.Kazanim).ToListAsync();
            return Json(kazanims);
        }

        [HttpPost]
        public async Task<IActionResult> AddKazanim(int konuId, string kazanimAdi)
        {
            var userId = GetUserId();
            if (userId == null) return Unauthorized();
            if (string.IsNullOrWhiteSpace(kazanimAdi)) return Json(new { success = false, message = "Kazanım adı boş olamaz." });
            var konu = await _serverContext.UserKonulari.FirstOrDefaultAsync(k => k.Id == konuId && k.KullaniciId == userId);
            if (konu == null) return Json(new { success = false, message = "Konu bulunamadı." });
            var kazanim = new UserKazanim { KonuId = konuId, DersId = konu.DersId, Kazanim = kazanimAdi, KullaniciId = userId.Value };
            _serverContext.UserKazanimlari.Add(kazanim);
            await _serverContext.SaveChangesAsync();
            return Json(new { success = true, kazanim });
        }

        [HttpPost]
        public async Task<IActionResult> DeleteKazanim(int kazanimId)
        {
            var userId = GetUserId();
            if (userId == null) return Unauthorized();
            var kazanim = await _serverContext.UserKazanimlari.FirstOrDefaultAsync(k => k.Id == kazanimId && k.KullaniciId == userId);
            if (kazanim == null) return Json(new { success = false, message = "Kazanım bulunamadı." });
            _serverContext.UserKazanimlari.Remove(kazanim);
            await _serverContext.SaveChangesAsync();
            return Json(new { success = true });
        }





        [HttpGet]
        public IActionResult DownloadDersSablon()
        {
            using (var workbook = new XLWorkbook())
            {
                var worksheet = workbook.Worksheets.Add("Ders-Konu-Kazanim");
                worksheet.Cell(1, 1).Value = "ders";
                worksheet.Cell(1, 2).Value = "konu";
                worksheet.Cell(1, 3).Value = "kazanim";

                // Örnek veri
                worksheet.Cell(2, 1).Value = "Matematik";
                worksheet.Cell(2, 2).Value = "Sayılar";
                worksheet.Cell(2, 3).Value = "Doğal sayıları kavrar.";

                worksheet.Columns().AdjustToContents();

                using (var stream = new MemoryStream())
                {
                    workbook.SaveAs(stream);
                    var content = stream.ToArray();
                    return File(content, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "ders_sablon.xlsx");
                }
            }
        }

        [HttpPost]
        public async Task<IActionResult> UploadDersExcel(IFormFile file)
        {
            var userId = GetUserId();
            if (userId == null) return Unauthorized();

            if (file == null || file.Length == 0)
                return Json(new { success = false, message = "Dosya seçilmedi." });

            try
            {
                using (var stream = new MemoryStream())
                {
                    await file.CopyToAsync(stream);
                    using (var workbook = new XLWorkbook(stream))
                    {
                        var worksheet = workbook.Worksheet(1);
                        var range = worksheet.RangeUsed();
                        if (range == null) return Json(new { success = false, message = "Excel dosyası boş." });
                        var rows = range.RowsUsed().Skip(1); // Header'ı atla

                        foreach (var row in rows)
                        {
                            var dersAdi = row.Cell(1).GetValue<string>()?.Trim();
                            var konuAdi = row.Cell(2).GetValue<string>()?.Trim();
                            var kazanimAdi = row.Cell(3).GetValue<string>()?.Trim();

                            if (string.IsNullOrEmpty(dersAdi)) continue;

                            // 1. Ders kontrolü ve ekleme
                            var ders = await _serverContext.UserDersleri
                                .FirstOrDefaultAsync(d => d.KullaniciId == userId && d.Ders.ToLower() == dersAdi.ToLower());
                            
                            if (ders == null)
                            {
                                ders = new UserDers { Ders = dersAdi, KullaniciId = userId.Value };
                                _serverContext.UserDersleri.Add(ders);
                                await _serverContext.SaveChangesAsync();
                            }

                            if (string.IsNullOrEmpty(konuAdi)) continue;

                            // 2. Konu kontrolü ve ekleme
                            var konu = await _serverContext.UserKonulari
                                .FirstOrDefaultAsync(k => k.KullaniciId == userId && k.DersId == ders.Id && k.Konu.ToLower() == konuAdi.ToLower());
                            
                            if (konu == null)
                            {
                                konu = new UserKonu { Konu = konuAdi, DersId = ders.Id, KullaniciId = userId.Value };
                                _serverContext.UserKonulari.Add(konu);
                                await _serverContext.SaveChangesAsync();
                            }

                            if (string.IsNullOrEmpty(kazanimAdi)) continue;

                            // 3. Kazanım kontrolü ve ekleme
                            var kazanimVarMi = await _serverContext.UserKazanimlari
                                .AnyAsync(k => k.KullaniciId == userId && k.KonuId == konu.Id && k.Kazanim.ToLower() == kazanimAdi.ToLower());
                            
                            if (!kazanimVarMi)
                            {
                                var kazanim = new UserKazanim { Kazanim = kazanimAdi, KonuId = konu.Id, DersId = ders.Id, KullaniciId = userId.Value };
                                _serverContext.UserKazanimlari.Add(kazanim);
                            }
                        }
                        await _serverContext.SaveChangesAsync();
                    }
                }
                return Json(new { success = true, message = "Excel başarıyla yüklendi." });
            }
            catch (Exception ex)
            {
                return Json(new { success = false, message = "Hata: " + ex.Message });
            }
        }

        [HttpPost]
        public async Task<IActionResult> DownloadBankaSablon([FromBody] List<SoruDto> sorular)
        {
            var userId = GetUserId();
            if (userId == null) return Unauthorized();

            using (var workbook = new XLWorkbook())
            {
                // 1. Anahtar Sayfası
                var wsAnahtar = workbook.Worksheets.Add("anahtar");
                wsAnahtar.Cell(1, 1).Value = "soru_no";
                wsAnahtar.Cell(1, 2).Value = "anahtar";
                wsAnahtar.Cell(1, 3).Value = "ders";
                wsAnahtar.Cell(1, 4).Value = "konu";
                wsAnahtar.Cell(1, 5).Value = "kazanim";

                // Başlıkları kalın yap
                wsAnahtar.Range("A1:E1").Style.Font.Bold = true;

                if (sorular != null)
                {
                    for (int i = 0; i < sorular.Count; i++)
                    {
                        var s = sorular[i];
                        wsAnahtar.Cell(i + 2, 1).Value = i + 1;
                        wsAnahtar.Cell(i + 2, 2).Value = s.DogruSik ?? s.DogruCevapSikki ?? "A";
                        wsAnahtar.Cell(i + 2, 3).Value = s.DersAdi;
                        wsAnahtar.Cell(i + 2, 4).Value = s.KonuAdi;
                        wsAnahtar.Cell(i + 2, 5).Value = s.KazanimAdi;
                    }
                }

                // 2. Kazanımlar Sayfası
                var wsKazanimlar = workbook.Worksheets.Add("kazanimlar");
                wsKazanimlar.Cell(1, 1).Value = "ders";
                wsKazanimlar.Cell(1, 2).Value = "konu";
                wsKazanimlar.Cell(1, 3).Value = "kazanim";
                wsKazanimlar.Range("A1:C1").Style.Font.Bold = true;

                var kazanimListesi = await (from kz in _serverContext.UserKazanimlari
                                           join kn in _serverContext.UserKonulari on kz.KonuId equals kn.Id
                                           join dr in _serverContext.UserDersleri on kz.DersId equals dr.Id
                                           where kz.KullaniciId == userId
                                           orderby dr.Ders, kn.Konu, kz.Kazanim
                                           select new {
                                               DersAdi = dr.Ders,
                                               KonuAdi = kn.Konu,
                                               KazanimAdi = kz.Kazanim
                                           }).ToListAsync();

                int kRow = 2;
                foreach (var kz in kazanimListesi)
                {
                    wsKazanimlar.Cell(kRow, 1).Value = kz.DersAdi;
                    wsKazanimlar.Cell(kRow, 2).Value = kz.KonuAdi;
                    wsKazanimlar.Cell(kRow, 3).Value = kz.KazanimAdi;
                    kRow++;
                }

                wsAnahtar.Columns().AdjustToContents();
                wsKazanimlar.Columns().AdjustToContents();

                using (var stream = new MemoryStream())
                {
                    workbook.SaveAs(stream);
                    var content = stream.ToArray();
                    return File(content, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "banka_anahtar_sablon.xlsx");
                }
            }
        }

        [HttpPost]
        public async Task<IActionResult> UploadBankaExcel(IFormFile file)
        {
            if (file == null || file.Length == 0)
                return Json(new { success = false, message = "Dosya seçilmedi." });

            try
            {
                var updatedData = new List<dynamic>();
                using (var stream = new MemoryStream())
                {
                    await file.CopyToAsync(stream);
                    using (var workbook = new XLWorkbook(stream))
                    {
                        var worksheet = workbook.Worksheet("anahtar");
                        if (worksheet == null) worksheet = workbook.Worksheet(1);

                        var range = worksheet.RangeUsed();
                        if (range == null) return Json(new { success = false, message = "Excel dosyası veya 'anahtar' sayfası boş." });
                        var rows = range.RowsUsed().Skip(1);
                        foreach (var row in rows)
                        {
                            updatedData.Add(new
                            {
                                SoruNo = row.Cell(1).GetValue<int>(),
                                DogruSik = row.Cell(2).GetValue<string>()?.Trim(),
                                DersAdi = row.Cell(3).GetValue<string>()?.Trim(),
                                KonuAdi = row.Cell(4).GetValue<string>()?.Trim(),
                                KazanimAdi = row.Cell(5).GetValue<string>()?.Trim()
                            });
                        }
                    }
                }
                return Json(new { success = true, data = updatedData });
            }
            catch (Exception ex)
            {
                return Json(new { success = false, message = "Hata: " + ex.Message });
            }
        }

        // GET: /mgtest/CreateBank
        [HttpGet]
        public IActionResult CreateBank()
        {
            return View();
        }

        // GET: /mgtest/Cart
        [HttpGet]
        public IActionResult Cart()
        {
            return View();
        }

        // GET: /mgtest
        public async Task<IActionResult> Index()
        {
            var kullaniciId = GetKullaniciId();
            if (kullaniciId == null)
                return RedirectToAction("Login", "Account");

            // Kullanıcıya ait soruları çek (örnek: tüm soruları getir)
            List<mgtest.Models.Soru> sorular = new List<mgtest.Models.Soru>();
            try
            {
                // Eğer sorular bir veritabanında tutuluyorsa, buradan çekebilirsiniz.
                // Örnek: sorular = await _serverContext.Sorular.Where(s => s.KullaniciId == kullaniciId.Value).ToListAsync();
                // Şimdilik boş liste gönderiyoruz.
            }
            catch { }

            var viewModel = new mgtest.Models.mgtestViewModel
            {
                Sorular = sorular
            };
            return View(viewModel);
        }

                        [HttpPost]
        public async Task<IActionResult> ConvertLegacyFile(IFormFile file)
        {
            var kullaniciId = GetKullaniciId();
            if (kullaniciId == null) return Unauthorized();

            var kullanici = await _serverContext.Kullanicilar.FindAsync(kullaniciId);
            if (kullanici == null) return Unauthorized();

            if (file == null || file.Length == 0) return BadRequest("Dosya secilmedi.");

            var tempPath = Path.Combine(Path.GetTempPath(), $"{Guid.NewGuid()}.mg");
            var plainPath = Path.Combine(Path.GetTempPath(), $"{Guid.NewGuid()}_plain.db");

            try
            {
                using (var stream = new FileStream(tempPath, FileMode.Create))
                {
                    await file.CopyToAsync(stream);
                }

                var connectionString = $"Data Source={tempPath}";
                var escapedPassword = kullanici.VeriTabanSifresi.Replace("'", "''");

                using (var connection = new Microsoft.Data.Sqlite.SqliteConnection(connectionString))
                {
                    await connection.OpenAsync();
                    
                    var cmd = connection.CreateCommand();
                    cmd.CommandText = $"PRAGMA key='{escapedPassword}'";
                    await cmd.ExecuteNonQueryAsync();

                    cmd.CommandText = $"ATTACH DATABASE '{plainPath}' AS plaintext KEY ''";
                    await cmd.ExecuteNonQueryAsync();

                    cmd.CommandText = "SELECT sqlcipher_export('plaintext')";
                    await cmd.ExecuteNonQueryAsync();

                    cmd.CommandText = "DETACH DATABASE plaintext";
                    await cmd.ExecuteNonQueryAsync();
                }

                var plainBytes = await System.IO.File.ReadAllBytesAsync(plainPath);
                return File(plainBytes, "application/octet-stream", "converted.db");
            }
            finally
            {
                if (System.IO.File.Exists(tempPath)) System.IO.File.Delete(tempPath);
                if (System.IO.File.Exists(plainPath)) System.IO.File.Delete(plainPath);
            }
        }

        // GET: /mgtest/ClientSideYonetim
        [HttpGet]
        public async Task<IActionResult> ClientSideYonetim()
        {
            var kullaniciId = GetKullaniciId();
            if (kullaniciId == null)
                return RedirectToAction("Login", "Account");

            var kullanici = await _serverContext.Kullanicilar.FindAsync(kullaniciId);
            if (kullanici == null)
                return RedirectToAction("Login", "Account");

            ViewData["Sifre"] = kullanici.VeriTabanSifresi;
            return View();
        }

        // GET: /mgtest/Create
        [HttpGet]
        public IActionResult Create()
        {
            var kullaniciId = GetKullaniciId();
            if (kullaniciId == null)
                return RedirectToAction("Login", "Account");

            if (!CanCreateBank())
            {
                TempData["Error"] = "Yetkiniz yok.";
                return RedirectToAction("Index");
            }

            return View();
        }

        // POST: /mgtest/Create
        [HttpPost]
        [ValidateAntiForgeryToken]
        public async Task<IActionResult> Create(string bankaAdi, string? aciklama)
        {
            var kullaniciId = GetKullaniciId();
            if (kullaniciId == null)
                return RedirectToAction("Login", "Account");

            if (!CanCreateBank())
            {
                TempData["Error"] = "Yetkiniz yok.";
                return RedirectToAction("Index");
            }

            if (string.IsNullOrWhiteSpace(bankaAdi))
            {
                ViewBag.Error = "Banka adı zorunludur.";
                return View();
            }

            try
            {
                var dosyaId = Guid.NewGuid().ToString();

                // SQLite dosyası oluştur
                var tempFilePath = await _sqliteService.CreateNewBankaFile(
                    kullaniciId.Value,
                    bankaAdi,
                    dosyaId);

                // Server DB'ye kaydet
                var kullaniciBankasi = new KullaniciBankasi
                {
                    KullaniciId = kullaniciId.Value,
                    BankaAdi = bankaAdi,
                    DosyaId = dosyaId,
                    Aciklama = aciklama,
                    OlusturmaTarihi = DateTime.Now
                };

                _serverContext.KullaniciBankalari.Add(kullaniciBankasi);
                await _serverContext.SaveChangesAsync();

                // Session'a temp dosya yolunu kaydet
                HttpContext.Session.SetString($"BankaFile_{dosyaId}", tempFilePath);

                TempData["Success"] = "Soru bankası başarıyla oluşturdu.";
                return RedirectToAction("Sorular", new { dosyaId });
            }
            catch (Exception ex)
            {
                ViewBag.Error = $"Banka oluşturulurken hata: {ex.Message}";
                return View();
            }
        }

        // POST: /mgtest/Upload
        [HttpPost]
        public async Task<IActionResult> Upload(IFormFile file)
        {
            var kullaniciId = GetKullaniciId();
            if (kullaniciId == null)
                return Json(new { success = false, message = "Oturum süreniz dolmuş." });

            if (file == null || file.Length == 0)
            {
                return Json(new { success = false, message = "Lütfen bir dosya seçin." });
            }

            try
            {
                // Dosyayı yükle ve şifresini çöz
                var tempFilePath = await _sqliteService.LoadBankaFile(file, kullaniciId.Value);

                if (tempFilePath == null)
                {
                    return Json(new { success = false, message = "Dosya açılamadı. Dosya bozuk olabilir veya size ait olmayabilir." });
                }

                // Metadata'dan dosya bilgilerini al
                var ayarlar = await _sqliteService.GetBankaAyarlari(tempFilePath);
                if (ayarlar == null)
                {
                    return Json(new { success = false, message = "Dosya formatı hatalı." });
                }

                // Session'a kaydet - çoklu banka yönetimi için
                var sessionKey = $"OpenBank_{Guid.NewGuid()}";
                HttpContext.Session.SetString(sessionKey, tempFilePath);
                HttpContext.Session.SetString($"{sessionKey}_BankaAdi", ayarlar.BankaAdi);

                return Json(new { success = true, sessionKey = sessionKey, bankaAdi = ayarlar.BankaAdi });
            }
            catch (Exception ex)
            {
                Console.WriteLine($"Upload Error: {ex.Message}");
                return Json(new { success = false, message = $"Dosya yüklenirken hata: {ex.Message}" });
            }
        }

        // GET: /mgtest/GetSorular
        [HttpGet]
        public async Task<IActionResult> GetSorular(string sessionKey)
        {
            var kullaniciId = GetKullaniciId();
            if (kullaniciId == null)
                return Json(new { success = false, message = "Oturum süreniz dolmuş." });

            try
            {
                var tempFilePath = HttpContext.Session.GetString(sessionKey);
                if (string.IsNullOrEmpty(tempFilePath) || !System.IO.File.Exists(tempFilePath))
                {
                    return Json(new { success = false, message = "Banka bulunamadı." });
                }

                var sorular = await _sqliteService.GetSorular(tempFilePath);
                return Json(sorular);
            }
            catch (Exception ex)
            {
                Console.WriteLine($"GetSorular Error: {ex.Message}");
                return Json(new { success = false, message = $"Sorular yüklenirken hata: {ex.Message}" });
            }
        }

        // POST: /mgtest/AddSoru
        [HttpPost]
        public async Task<IActionResult> AddSoru(string sessionKey, [FromBody] SoruDto soruDto)
        {
            var kullaniciId = GetKullaniciId();
            if (kullaniciId == null)
                return Json(new { success = false, message = "Oturum süreniz dolmuş." });

            try
            {
                var tempFilePath = HttpContext.Session.GetString(sessionKey);
                if (string.IsNullOrEmpty(tempFilePath) || !System.IO.File.Exists(tempFilePath))
                {
                    return Json(new { success = false, message = "Banka bulunamadı." });
                }

                var soru = new Soru
                {
                    SoruMetni = soruDto.SoruMetni,
                    SoruResmi = soruDto.SoruResmi,
                    SoruMetniAyriMi = soruDto.SoruMetniAyriMi,
                    SikkarAyriMi = soruDto.SikkarAyriMi,
                    DersId = soruDto.DersId ?? 1,
                    KonuId = soruDto.KonuId ?? 1,
                    KazanimId = soruDto.KazanimId ?? 1,
                    ASikkiMetni = soruDto.SikkarAyriMi ? soruDto.Siklar?.A : "",
                    BSikkiMetni = soruDto.SikkarAyriMi ? soruDto.Siklar?.B : "",
                    CSikkiMetni = soruDto.SikkarAyriMi ? soruDto.Siklar?.C : "",
                    DSikkiMetni = soruDto.SikkarAyriMi ? soruDto.Siklar?.D : "",
                    ESikkiMetni = soruDto.SikkarAyriMi ? soruDto.Siklar?.E : "",
                    DogruCevapSikki = soruDto.DogruCevapSikki,
                    ZorlukSeviye = Enum.Parse<ZorlukSeviye>(soruDto.ZorlukSeviye ?? "orta")
                };

                await _sqliteService.AddSoru(tempFilePath, soru);
                return Json(new { success = true, message = "Soru başarıyla eklendi." });
            }
            catch (Exception ex)
            {
                Console.WriteLine($"AddSoru Error: {ex.Message}");
                return Json(new { success = false, message = $"Soru eklenirken hata: {ex.Message}" });
            }
        }

        // POST: /mgtest/UpdateSoru
        [HttpPost]
        public async Task<IActionResult> UpdateSoru(string sessionKey, [FromBody] SoruDto soruDto)
        {
            var kullaniciId = GetKullaniciId();
            if (kullaniciId == null)
                return Json(new { success = false, message = "Oturum süreniz dolmuş." });

            try
            {
                var tempFilePath = HttpContext.Session.GetString(sessionKey);
                if (string.IsNullOrEmpty(tempFilePath) || !System.IO.File.Exists(tempFilePath))
                {
                    return Json(new { success = false, message = "Banka bulunamadı." });
                }

                var existingSoru = await _sqliteService.GetSoru(tempFilePath, soruDto.Id);
                if (existingSoru == null)
                {
                    return Json(new { success = false, message = "Soru bulunamadı." });
                }

                existingSoru.SoruMetni = soruDto.SoruMetni;
                existingSoru.SoruResmi = soruDto.SoruResmi;
                existingSoru.SoruMetniAyriMi = soruDto.SoruMetniAyriMi;
                existingSoru.SikkarAyriMi = soruDto.SikkarAyriMi;
                existingSoru.DersId = soruDto.DersId ?? 1;
                existingSoru.KonuId = soruDto.KonuId ?? 1;
                existingSoru.KazanimId = soruDto.KazanimId ?? 1;
                existingSoru.ASikkiMetni = soruDto.SikkarAyriMi ? soruDto.Siklar?.A : "";
                existingSoru.BSikkiMetni = soruDto.SikkarAyriMi ? soruDto.Siklar?.B : "";
                existingSoru.CSikkiMetni = soruDto.SikkarAyriMi ? soruDto.Siklar?.C : "";
                existingSoru.DSikkiMetni = soruDto.SikkarAyriMi ? soruDto.Siklar?.D : "";
                existingSoru.ESikkiMetni = soruDto.SikkarAyriMi ? soruDto.Siklar?.E : "";
                existingSoru.DogruCevapSikki = soruDto.DogruCevapSikki;
                existingSoru.ZorlukSeviye = Enum.Parse<ZorlukSeviye>(soruDto.ZorlukSeviye ?? "orta");

                await _sqliteService.UpdateSoru(tempFilePath, existingSoru);
                return Json(new { success = true, message = "Soru başarıyla güncellendi." });
            }
            catch (Exception ex)
            {
                Console.WriteLine($"UpdateSoru Error: {ex.Message}");
                return Json(new { success = false, message = $"Soru güncellenirken hata: {ex.Message}" });
            }
        }

        // DELETE: /mgtest/DeleteSoru
        [HttpDelete]
        public async Task<IActionResult> DeleteSoru(string sessionKey, int soruId)
        {
            var kullaniciId = GetKullaniciId();
            if (kullaniciId == null)
                return Json(new { success = false, message = "Oturum süreniz dolmuş." });

            try
            {
                var tempFilePath = HttpContext.Session.GetString(sessionKey);
                if (string.IsNullOrEmpty(tempFilePath) || !System.IO.File.Exists(tempFilePath))
                {
                    return Json(new { success = false, message = "Banka bulunamadı." });
                }

                await _sqliteService.DeleteSoru(tempFilePath, soruId);
                return Json(new { success = true, message = "Soru başarıyla silindi." });
            }
            catch (Exception ex)
            {
                Console.WriteLine($"DeleteSoru Error: {ex.Message}");
                return Json(new { success = false, message = $"Soru silinirken hata: {ex.Message}" });
            }
        }

        // POST: /mgtest/SaveBankaChanges
        [HttpPost]
        public async Task<IActionResult> SaveBankaChanges(string sessionKey, [FromBody] dynamic data)
        {
            var kullaniciId = GetKullaniciId();
            if (kullaniciId == null)
                return Json(new { success = false, message = "Oturum süreniz dolmuş." });

            try
            {
                var tempFilePath = HttpContext.Session.GetString(sessionKey);
                if (string.IsNullOrEmpty(tempFilePath) || !System.IO.File.Exists(tempFilePath))
                {
                    return Json(new { success = false, message = "Banka bulunamadı." });
                }

                // Dosyayı şifrele ve byte[] olarak al
                var encryptedData = await _sqliteService.SaveAndEncryptBankaFile(tempFilePath, kullaniciId.Value);
                
                // Base64'e dönüştür
                var base64Data = Convert.ToBase64String(encryptedData);
                
                // İndirme linki oluştur
                var downloadUrl = $"data:application/octet-stream;base64,{base64Data}";

                return Json(new { 
                    success = true, 
                    message = "Banka başarıyla kaydedildi.",
                    downloadUrl = downloadUrl
                });
            }
            catch (Exception ex)
            {
                Console.WriteLine($"SaveBankaChanges Error: {ex.Message}");
                return Json(new { success = false, message = $"Kaydetme sırasında hata: {ex.Message}" });
            }
        }

        // POST: /mgtest/ExportSorular
        [HttpPost]
        public async Task<IActionResult> ExportSorular(string sessionKey, string type, [FromBody] dynamic data)
        {
            var kullaniciId = GetKullaniciId();
            if (kullaniciId == null)
                return Unauthorized();

            try
            {
                var tempFilePath = HttpContext.Session.GetString(sessionKey);
                if (string.IsNullOrEmpty(tempFilePath) || !System.IO.File.Exists(tempFilePath))
                {
                    return BadRequest("Banka bulunamadı.");
                }

                // JSON body'den soruIds'i al
                var json = JsonSerializer.Serialize(data);
                var options = new JsonSerializerOptions { PropertyNameCaseInsensitive = true };
                var parsedData = JsonSerializer.Deserialize<Dictionary<string, List<int>>>(json, options);
                
                if (parsedData == null || !parsedData.ContainsKey("soruIds"))
                {
                    return BadRequest("Seçili soru yok.");
                }

                var soruIds = parsedData["soruIds"];
                var allSorular = await _sqliteService.GetSorular(tempFilePath);
                var selectedSorular = allSorular.Where(s => soruIds.Contains(s.Id)).ToList();

                if (!selectedSorular.Any())
                {
                    return BadRequest("Seçili soru yok.");
                }

                var exportOptions = new ExportOptions
                {
                    AnahtarEkle = true,
                    SutunSayisi = 2
                };

                byte[] fileContent;
                string fileName;
                string contentType;

                if (type.ToLower() == "pdf")
                {
                    fileContent = await _exportService.ExportToPdf(selectedSorular, exportOptions);
                    fileName = $"sorular_{DateTime.Now:yyyyMMdd_HHmmss}.pdf";
                    contentType = "application/pdf";
                }
                else if (type.ToLower() == "docx")
                {
                    fileContent = await _exportService.ExportToDocx(selectedSorular, exportOptions);
                    fileName = $"sorular_{DateTime.Now:yyyyMMdd_HHmmss}.docx";
                    contentType = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
                }
                else
                {
                    return BadRequest("Geçersiz dışa aktarma tipi.");
                }

                return File(fileContent, contentType, fileName);
            }
            catch (Exception ex)
            {
                Console.WriteLine($"ExportSorular Error: {ex.Message}");
                return StatusCode(500, $"Dışa aktarma sırasında hata: {ex.Message}");
            }
        }

        // GET: /mgtest/Sorular
        public async Task<IActionResult> Sorular(string sessionKey)
        {
            var kullaniciId = GetKullaniciId();
            if (kullaniciId == null)
                return RedirectToAction("Login", "Account");

            var tempFilePath = HttpContext.Session.GetString(sessionKey);
            if (string.IsNullOrEmpty(tempFilePath) || !System.IO.File.Exists(tempFilePath))
            {
                TempData["Error"] = "Banka açılamadı.";
                return RedirectToAction("Index");
            }

            try
            {
                var sorular = await _sqliteService.GetSorular(tempFilePath);
                ViewBag.SessionKey = sessionKey;
                ViewBag.BankaAdi = HttpContext.Session.GetString($"{sessionKey}_BankaAdi");

                return View(sorular);
            }
            catch (Exception ex)
            {
                TempData["Error"] = $"Sorular yüklenirken hata: {ex.Message}";
                return RedirectToAction("Index");
            }
        }

        // POST: /mgtest/ExportToNewBank
        [HttpPost]
        [ValidateAntiForgeryToken]
        public async Task<IActionResult> ExportToNewBank(string sessionKey, string newBankaAdi, [FromBody] int[] selectedSoruIds)
        {
            var kullaniciId = GetKullaniciId();
            if (kullaniciId == null)
                return RedirectToAction("Login", "Account");

            if (!CanCreateBank())
            {
                return Json(new { success = false, message = "Yetkiniz yok." });
            }

            try
            {
                var tempFilePath = HttpContext.Session.GetString(sessionKey);
                if (string.IsNullOrEmpty(tempFilePath) || !System.IO.File.Exists(tempFilePath))
                {
                    return Json(new { success = false, message = "Kaynak banka bulunamadı." });
                }

                // Seçili soruları al
                var sorular = await _sqliteService.GetSorular(tempFilePath);
                var seciliSorular = sorular.Where(s => selectedSoruIds.Contains(s.Id)).ToList();

                if (!seciliSorular.Any())
                {
                    return Json(new { success = false, message = "Seçili soru yok." });
                }

                // Yeni banka oluştur
                var dosyaId = Guid.NewGuid().ToString();
                var newTempFilePath = await _sqliteService.CreateNewBankaFile(
                    kullaniciId.Value,
                    newBankaAdi,
                    dosyaId);

                // Seçili soruları yeni bankaya ekle
                foreach (var soru in seciliSorular)
                {
                    await _sqliteService.AddSoru(newTempFilePath, soru);
                }

                // Server DB'ye kaydet
                var kullaniciBankasi = new KullaniciBankasi
                {
                    KullaniciId = kullaniciId.Value,
                    BankaAdi = newBankaAdi,
                    DosyaId = dosyaId,
                    OlusturmaTarihi = DateTime.Now,
                    ToplamSoruSayisi = seciliSorular.Count
                };

                _serverContext.KullaniciBankalari.Add(kullaniciBankasi);
                await _serverContext.SaveChangesAsync();

                HttpContext.Session.SetString($"BankaFile_{dosyaId}", newTempFilePath);

                return Json(new { success = true, message = "Yeni banka başarıyla oluşturdu.", dosyaId = dosyaId });
            }
            catch (Exception ex)
            {
                return Json(new { success = false, message = $"Hata: {ex.Message}" });
            }
        }

        // GET: /mgtest/Download
 
public async Task<IActionResult> Download(string dosyaId)
{
   // Console.WriteLine("----- mgtestController.Download çağrıldı -----");
   //Console.WriteLine($"dosyaId: {dosyaId}");
    
    var kullaniciId = GetKullaniciId();
    if (kullaniciId == null)
    {
        Console.WriteLine("HATA: Kullanıcı ID bulunamadı");
        return RedirectToAction("Login", "Account");
    }

   // Console.WriteLine($"KullaniciId: {kullaniciId.Value}");

    try
    {
        // Banka kaydını kontrol et
        var banka = await _serverContext.KullaniciBankalari
            .FirstOrDefaultAsync(kb => kb.DosyaId == dosyaId && kb.KullaniciId == kullaniciId.Value);

        if (banka == null)
        {
            Console.WriteLine("HATA: Banka kaydı bulunamadı");
            TempData["Error"] = "Banka kaydı bulunamadı.";
            return RedirectToAction("Index");
        }

        Console.WriteLine($"Banka bulundu: {banka.BankaAdi}");

        var tempFilePathKey = $"BankaFile_{dosyaId}";
        var tempFilePath = HttpContext.Session.GetString(tempFilePathKey);

       // Console.WriteLine($"Session key: {tempFilePathKey}");
       // Console.WriteLine($"Temp file path: {tempFilePath}");

        if (string.IsNullOrEmpty(tempFilePath) || !System.IO.File.Exists(tempFilePath))
        {
            Console.WriteLine("HATA: Dosya bulunamadı veya mevcut değil");
            TempData["Error"] = "Dosya bulunamadı.";
            return RedirectToAction("Index");
        }

        Console.WriteLine("Dosya mevcut, şifreleme başlıyor...");

        // Dosyayı şifrele - SaveAndEncryptBankaFile byte[] döndürüyor
        var encryptedData = await _sqliteService.SaveAndEncryptBankaFile(tempFilePath, kullaniciId.Value);

    

        var fileName = $"{banka.BankaAdi}_{DateTime.Now:yyyyMMdd}.mg";
        Console.WriteLine($"İndirme dosya adı: {fileName}");

        // Dosyayı indirme için döndür
        return File(encryptedData, "application/octet-stream", fileName);
    }
    catch (Exception ex)
    {
        Console.WriteLine($"Download hatası: {ex.Message}");
        Console.WriteLine($"Stack trace: {ex.StackTrace}");
        TempData["Error"] = "Dosya indirilirken bir hata oluştu: " + ex.Message;
        return RedirectToAction("Index");
    }
}
        // GET: /mgtest/Delete
        public async Task<IActionResult> Delete(int id)
        {
            var kullaniciId = GetKullaniciId();
            if (kullaniciId == null)
                return RedirectToAction("Login", "Account");

            var banka = await _serverContext.KullaniciBankalari
                .FirstOrDefaultAsync(kb => kb.Id == id && kb.KullaniciId == kullaniciId.Value);

            if (banka == null)
            {
                TempData["Error"] = "Banka bulunamadı.";
                return RedirectToAction("Index");
            }

            if (!CanCreateBank())
            {
                TempData["Error"] = "Yetkiniz yok.";
                return RedirectToAction("Index");
            }

            _serverContext.KullaniciBankalari.Remove(banka);
            await _serverContext.SaveChangesAsync();

            TempData["Success"] = "Soru bankası kaydı silindi.";
            return RedirectToAction("Index");
        }

        // POST: /mgtest/CloseBank
        [HttpPost]
        [ValidateAntiForgeryToken]
        public IActionResult CloseBank(string sessionKey)
        {
            var tempFilePath = HttpContext.Session.GetString(sessionKey);
            if (!string.IsNullOrEmpty(tempFilePath) && System.IO.File.Exists(tempFilePath))
            {
                System.IO.File.Delete(tempFilePath);
            }

            HttpContext.Session.Remove(sessionKey);
            HttpContext.Session.Remove($"{sessionKey}_BankaAdi");

            TempData["Success"] = "Banka kapatıldı.";
            return RedirectToAction("Index");
        }


        [HttpPost]
        [IgnoreAntiforgeryToken]
        public async Task<IActionResult> SaveBank()
        {
            //kullanıcı bilgi alımı
            var kullaniciId = GetKullaniciId();
            if (kullaniciId == null)
                return Json(new { success = false, message = "Oturum süreniz dolmuş." });

            try
            {
                using var reader = new StreamReader(Request.Body, Encoding.UTF8);
                var body = await reader.ReadToEndAsync();


                {// ilk 200 karakteri özellikle kontrol et
                    Console.WriteLine("===== ilk 200 KARAKTER =====");
                    Console.WriteLine(body.Substring(0, Math.Min(200, body.Length)));
                    // son 200 karakteri özellikle kontrol et
                    Console.WriteLine("===== son 200 KARAKTER =====");
                    Console.WriteLine(body.Substring(Math.Max(200, body.Length) - 200, 200));
                }

                var options = new JsonSerializerOptions
                {
                    PropertyNameCaseInsensitive = true,
                    NumberHandling = JsonNumberHandling.AllowReadingFromString,
                    DefaultIgnoreCondition = JsonIgnoreCondition.WhenWritingNull // Ignore null values during deserialization
                };


                // Preprocess JSON to ensure valid dersId values
                body = body.Replace("\"dersId\":\"\",", "\"dersId\":null,"); // Replace empty strings with null for dersId

                try
                {
                    var request = JsonSerializer.Deserialize<SaveBankRequest>(body, options);

                    // Validate deserialized data
                    if (request?.Sorular != null)
                    {
                        foreach (var soru in request.Sorular)
                        {
                            if (soru.DersId == 0) // Updated from null check
                            {
                                Console.WriteLine("Missing DersId detected. Assigning default value of 1.");
                                soru.DersId = 1; // Default value for DersId
                            }
                        }
                    }

                    // Validation ekleyin
                    if (request == null || string.IsNullOrWhiteSpace(request.BankaAdi))
                    {
                        return Json(new { success = false, message = "Banka adı boş olamaz." });
                    }


                    var dosyaId = Guid.NewGuid().ToString();

                    // SQLite dosyası oluştur
                    var tempFilePath = await _sqliteService.CreateNewBankaFile(
                        kullaniciId.Value,
                        request.BankaAdi,
                        dosyaId);
            
                    {      // Soruları ekle
                        foreach (var soru in request.Sorular)
                        {
                            // ID'yi long'a çevir - JavaScript'ten gelen büyük sayılar için
                            var yeniSoru = new Soru
                            {
                                SoruResmi = soru.SoruResmi,
                                SoruMetni = soru.SoruMetni,
                                SoruMetniAyriMi = soru.SoruMetniAyriMi,
                                SikkarAyriMi = soru.SikkarAyriMi,
                                DersId = soru.DersId ?? 1,
                                KonuId = soru.KonuId ?? 1,
                                KazanimId = soru.KazanimId ?? 1,
                                ASikkiMetni = soru.Siklar?.A,
                                BSikkiMetni = soru.Siklar?.B,
                                CSikkiMetni = soru.Siklar?.C,
                                DSikkiMetni = soru.Siklar?.D,
                                ESikkiMetni = soru.Siklar?.E,
                                DogruCevapSikki = soru.DogruCevapSikki,
                                ZorlukSeviye = ZorlukSeviye.orta,
                                Sira = request.Sorular.IndexOf(soru) + 1
                            };

                            await _sqliteService.AddSoru(tempFilePath, yeniSoru);
                        }
                    }


                    // Server DB'ye kayıt ekle
                    var kullaniciBankasi = new KullaniciBankasi
                    {
                        KullaniciId = kullaniciId.Value,
                        BankaAdi = request.BankaAdi,
                        DosyaId = dosyaId,
                        OlusturmaTarihi = DateTime.Now,
                        ToplamSoruSayisi = request.Sorular.Count
                    };

                    _serverContext.KullaniciBankalari.Add(kullaniciBankasi);
                    await _serverContext.SaveChangesAsync();

                    // Session'a kaydet
                    HttpContext.Session.SetString($"BankaFile_{dosyaId}", tempFilePath);

                    return Json(new
                    {
                        success = true,
                        dosyaId = dosyaId,
                        tempFilePath=tempFilePath,
                        message = "Soru bankası başarıyla kaydedildi!"
                    });

                }
                catch (JsonException ex)
                {
                    Console.WriteLine("JSON Deserialization Error: " + ex.Message);
                    Console.WriteLine("===== RAW JSON =====");
                    //Console.WriteLine(body); // Log the full JSON input
                    return Json(new { success = false, message = "Invalid JSON format." });
                }
            }
            catch (Exception ex)
            {
                Console.WriteLine($"EXCEPTION: {ex.Message}");
                Console.WriteLine($"STACK TRACE: {ex.StackTrace}");
                return Json(new
                {
                    success = false,
                    message = $"Hata: {ex.Message}"
                });
            }
        }




        [HttpGet]
        public IActionResult DersYonetimi()
        {
            var kullaniciId = GetKullaniciId();
            if (kullaniciId == null)
                return RedirectToAction("Login", "Account");

            return View();
        }


        // Yetki kontrolü - sadece user ve admin bankalar oluşturabilir
        private bool CanCreateBank()
        {
            var tur = GetKullaniciTuru();
            return tur == KullaniciTuru.user || tur == KullaniciTuru.admin;
        }

    }
    // Request modeli
    public class SaveBankRequest
    {
        private string _bankaAdi = string.Empty;
        public string BankaAdi { get=>_bankaAdi; set { _bankaAdi = value ?? string.Empty; } } 
        public List<SoruDto> Sorular { get; set; } = new List<SoruDto>();
    }


/**

 // Sizin yazdığınız:
public string SoruResmi
{
     get => _soruResmi ?? "boş";
    set => _soruResmi = value;
}

 Derleyicinin oluşturduğu IL kodu (kabaca):
public string SoruResmi
 {
     get { return _soruResmi ?? "boş"; }
     set { _soruResmi = value; }
 }

////////////////////////
/// 
/// 

*/
    public class SoruDto
    {
        public int Id { get; set; }
        private string _soruResmi = "";
        public string SoruResmi { 
            get => _soruResmi; 
            set { _soruResmi = value ?? string.Empty; } }
        public string? SoruMetni { get; set; }
        public bool SoruMetniAyriMi { get; set; }
        public bool SikkarAyriMi { get; set; }
        public int? DersId { get; set; }
        public int? KonuId { get; set; }
        public int? KazanimId { get; set; }
        public SikDto? Siklar { get; set; }
        public string? DogruCevapSikki { get; set; }
        public string? DogruSik { get; set; }
        public string? DersAdi { get; set; }
        public string? KonuAdi { get; set; }
        public string? KazanimAdi { get; set; }
        public string? ZorlukSeviye { get; set; }
    }

    public class SikDto
    {
        public string? A { get; set; }
        public string? B { get; set; }
        public string? C { get; set; }
        public string? D { get; set; }
        public string? E { get; set; }
    }

}

