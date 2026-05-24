using Microsoft.AspNetCore.Mvc;
using mgtest.Data;
using mgtest.Models;
using mgtest.Services;
using SixLabors.ImageSharp;
using SixLabors.ImageSharp.Processing;

namespace mgtest.Controllers
{
    public class SoruController : Controller
    {
        private readonly ISqliteFileService _sqliteService;
        private readonly ServerDbContext _serverContext;

        public SoruController(ISqliteFileService sqliteService, ServerDbContext serverContext)
        {
            _sqliteService = sqliteService;
            _serverContext = serverContext;
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

        private bool CanEditBank()
        {
            var tur = GetKullaniciTuru();
            return tur == KullaniciTuru.user || tur == KullaniciTuru.admin;
        }

        // GET: /Soru/Sorular
        public async Task<IActionResult> Sorular(string sessionKey)
        {
            var kullaniciId = GetKullaniciId();
            if (kullaniciId == null)
                return RedirectToAction("Login", "Account");

            var tempFilePath = HttpContext.Session.GetString(sessionKey);
            if (string.IsNullOrEmpty(tempFilePath))
            {
                TempData["Error"] = "Lütfen önce bir soru bankasý açýn.";
                return RedirectToAction("Index", "mgtest");
            }

            var sorular = await _sqliteService.GetSorular(tempFilePath);
            var ayarlar = await _sqliteService.GetBankaAyarlari(tempFilePath);

            ViewBag.SessionKey = sessionKey;
            ViewBag.BankaAdi = ayarlar?.BankaAdi ?? "Soru Bankasý";
            ViewBag.CanEdit = CanEditBank();

            return View(sorular);
        }

        // POST: /Soru/ToggleMark - Ýþaretli durumunu deðiþtir
        [HttpPost]
        public async Task<IActionResult> ToggleMark(string sessionKey, int id)
        {
            var kullaniciId = GetKullaniciId();
            if (kullaniciId == null)
                return Json(new { success = false, message = "Giriþ yapýnýz." });

            var tempFilePath = HttpContext.Session.GetString(sessionKey);
            if (string.IsNullOrEmpty(tempFilePath))
                return Json(new { success = false, message = "Banka bulunamadý." });

            try
            {
                var soru = await _sqliteService.GetSoru(tempFilePath, id);
                if (soru == null)
                    return Json(new { success = false, message = "Soru bulunamadý." });

                soru.IsaretliMi = !soru.IsaretliMi;
                await _sqliteService.UpdateSoru(tempFilePath, soru);

                return Json(new { success = true, isaretliMi = soru.IsaretliMi });
            }
            catch (Exception ex)
            {
                return Json(new { success = false, message = ex.Message });
            }
        }

        // GET: /Soru/Create
        [HttpGet]
        public IActionResult Create(string sessionKey)
        {
            var kullaniciId = GetKullaniciId();
            if (kullaniciId == null)
                return RedirectToAction("Login", "Account");

            if (!CanEditBank())
            {
                TempData["Error"] = "Yetkiniz yok.";
                return RedirectToAction("Sorular", new { sessionKey });
            }

            ViewBag.SessionKey = sessionKey;
            ViewBag.ZorlukSeviyeleri = Enum.GetNames(typeof(ZorlukSeviye));
            return View();
        }

        // POST: /Soru/Create
        [HttpPost]
        [ValidateAntiForgeryToken]
        public async Task<IActionResult> Create(string sessionKey, Soru soru, IFormFile? soruResmiFile, 
            IFormFile? aSikkiResmiFile, IFormFile? bSikkiResmiFile, IFormFile? cSikkiResmiFile,
            IFormFile? dSikkiResmiFile, IFormFile? eSikkiResmiFile, IFormFile? fSikkiResmiFile)
        {
            var kullaniciId = GetKullaniciId();
            if (kullaniciId == null)
                return RedirectToAction("Login", "Account");

            if (!CanEditBank())
            {
                TempData["Error"] = "Yetkiniz yok.";
                return RedirectToAction("Sorular", new { sessionKey });
            }

            var tempFilePath = HttpContext.Session.GetString(sessionKey);
            if (string.IsNullOrEmpty(tempFilePath))
            {
                TempData["Error"] = "Soru bankasý bulunamadý.";
                return RedirectToAction("Index", "mgtest");
            }

            try
            {
                // Soru resmi
                if (soruResmiFile != null && soruResmiFile.Length > 0)
                {
                    soru.SoruResmi = await ConvertImageToBase64(soruResmiFile);
                }

                // Þýk resimleri
                if (soru.SikkarAyriMi)
                {
                    if (aSikkiResmiFile != null && aSikkiResmiFile.Length > 0)
                        soru.ASikkiResmi = await ConvertImageToBase64(aSikkiResmiFile);
                    if (bSikkiResmiFile != null && bSikkiResmiFile.Length > 0)
                        soru.BSikkiResmi = await ConvertImageToBase64(bSikkiResmiFile);
                    if (cSikkiResmiFile != null && cSikkiResmiFile.Length > 0)
                        soru.CSikkiResmi = await ConvertImageToBase64(cSikkiResmiFile);
                    if (dSikkiResmiFile != null && dSikkiResmiFile.Length > 0)
                        soru.DSikkiResmi = await ConvertImageToBase64(dSikkiResmiFile);
                    if (eSikkiResmiFile != null && eSikkiResmiFile.Length > 0)
                        soru.ESikkiResmi = await ConvertImageToBase64(eSikkiResmiFile);
                    if (fSikkiResmiFile != null && fSikkiResmiFile.Length > 0)
                        soru.FSikkiResmi = await ConvertImageToBase64(fSikkiResmiFile);
                }
                else
                {
                    // Þýk resimleri boþ býrak
                    soru.ASikkiResmi = null;
                    soru.BSikkiResmi = null;
                    soru.CSikkiResmi = null;
                    soru.DSikkiResmi = null;
                    soru.ESikkiResmi = null;
                    soru.FSikkiResmi = null;
                }

                // Varsayýlan deðerleri kontrol et ve ata
                if (Convert.ToInt64(soru.DersId) <= 0)
                {
                    soru.DersId = 1; // Varsayýlan "ders yok"
                }
                if (soru.KonuId <= 0)
                {
                    soru.KonuId = 1; // Varsayýlan "konu yok"
                }
                if (soru.KazanimId <= 0)
                {
                    soru.KazanimId = 1; // Varsayýlan "kazaným yok"
                }

                await _sqliteService.AddSoru(tempFilePath, soru);

                TempData["Success"] = "Soru baþarýyla eklendi.";
                return RedirectToAction("Sorular", new { sessionKey });
            }
            catch (Exception ex)
            {
                ViewBag.Error = $"Soru eklenirken hata: {ex.Message}";
                ViewBag.SessionKey = sessionKey;
                ViewBag.ZorlukSeviyeleri = Enum.GetNames(typeof(ZorlukSeviye));
                return View(soru);
            }
        }

        // GET: /Soru/Edit
        [HttpGet]
        public async Task<IActionResult> Edit(string sessionKey, int id)
        {
            var kullaniciId = GetKullaniciId();
            if (kullaniciId == null)
                return RedirectToAction("Login", "Account");

            if (!CanEditBank())
            {
                TempData["Error"] = "Yetkiniz yok.";
                return RedirectToAction("Sorular", new { sessionKey });
            }

            var tempFilePath = HttpContext.Session.GetString(sessionKey);
            if (string.IsNullOrEmpty(tempFilePath))
            {
                TempData["Error"] = "Soru bankasý bulunamadý.";
                return RedirectToAction("Index", "mgtest");
            }

            var soru = await _sqliteService.GetSoru(tempFilePath, id);
            if (soru == null)
            {
                TempData["Error"] = "Soru bulunamadý.";
                return RedirectToAction("Sorular", new { sessionKey });
            }

            ViewBag.SessionKey = sessionKey;
            ViewBag.ZorlukSeviyeleri = Enum.GetNames(typeof(ZorlukSeviye));
            return View(soru);
        }

        // POST: /Soru/Edit
        [HttpPost]
        [ValidateAntiForgeryToken]
        public async Task<IActionResult> Edit(string sessionKey, Soru soru, 
            IFormFile? soruResmiFile, bool soruResmiSil,
            IFormFile? aSikkiResmiFile, bool aSikkiResmiSil,
            IFormFile? bSikkiResmiFile, bool bSikkiResmiSil,
            IFormFile? cSikkiResmiFile, bool cSikkiResmiSil,
            IFormFile? dSikkiResmiFile, bool dSikkiResmiSil,
            IFormFile? eSikkiResmiFile, bool eSikkiResmiSil,
            IFormFile? fSikkiResmiFile, bool fSikkiResmiSil)
        {
            var kullaniciId = GetKullaniciId();
            if (kullaniciId == null)
                return RedirectToAction("Login", "Account");

            if (!CanEditBank())
            {
                TempData["Error"] = "Yetkiniz yok.";
                return RedirectToAction("Sorular", new { sessionKey });
            }

            var tempFilePath = HttpContext.Session.GetString(sessionKey);
            if (string.IsNullOrEmpty(tempFilePath))
            {
                TempData["Error"] = "Soru bankasý bulunamadý.";
                return RedirectToAction("Index", "mgtest");
            }

            try
            {
                var mevcutSoru = await _sqliteService.GetSoru(tempFilePath, soru.Id);
                if (mevcutSoru == null)
                {
                    TempData["Error"] = "Soru bulunamadý.";
                    return RedirectToAction("Sorular", new { sessionKey });
                }

                // Soru resmi güncelle
                if (soruResmiSil)
                {
                    soru.SoruResmi = null;
                }
                else if (soruResmiFile != null && soruResmiFile.Length > 0)
                {
                    soru.SoruResmi = await ConvertImageToBase64(soruResmiFile);
                }
                else
                {
                    soru.SoruResmi = mevcutSoru.SoruResmi;
                }

                // Þýk resimleri
                if (!soru.SikkarAyriMi)
                {
                    soru.ASikkiResmi = null;
                    soru.BSikkiResmi = null;
                    soru.CSikkiResmi = null;
                    soru.DSikkiResmi = null;
                    soru.ESikkiResmi = null;
                    soru.FSikkiResmi = null;
                }
                else
                {
                    soru.ASikkiResmi = aSikkiResmiSil ? null : (aSikkiResmiFile != null ? await ConvertImageToBase64(aSikkiResmiFile) : mevcutSoru.ASikkiResmi);
                    soru.BSikkiResmi = bSikkiResmiSil ? null : (bSikkiResmiFile != null ? await ConvertImageToBase64(bSikkiResmiFile) : mevcutSoru.BSikkiResmi);
                    soru.CSikkiResmi = cSikkiResmiSil ? null : (cSikkiResmiFile != null ? await ConvertImageToBase64(cSikkiResmiFile) : mevcutSoru.CSikkiResmi);
                    soru.DSikkiResmi = dSikkiResmiSil ? null : (dSikkiResmiFile != null ? await ConvertImageToBase64(dSikkiResmiFile) : mevcutSoru.DSikkiResmi);
                    soru.ESikkiResmi = eSikkiResmiSil ? null : (eSikkiResmiFile != null ? await ConvertImageToBase64(eSikkiResmiFile) : mevcutSoru.ESikkiResmi);
                    soru.FSikkiResmi = fSikkiResmiSil ? null : (fSikkiResmiFile != null ? await ConvertImageToBase64(fSikkiResmiFile) : mevcutSoru.FSikkiResmi);
                }

                soru.Sira = mevcutSoru.Sira;
                soru.YuklenmeTarihi = mevcutSoru.YuklenmeTarihi;

                await _sqliteService.UpdateSoru(tempFilePath, soru);

                TempData["Success"] = "Soru baþarýyla güncellendi.";
                return RedirectToAction("Sorular", new { sessionKey });
            }
            catch (Exception ex)
            {
                ViewBag.Error = $"Soru güncellenirken hata: {ex.Message}";
                ViewBag.SessionKey = sessionKey;
                ViewBag.ZorlukSeviyeleri = Enum.GetNames(typeof(ZorlukSeviye));
                return View(soru);
            }
        }

        // POST: /Soru/Delete
        [HttpPost]
        [ValidateAntiForgeryToken]
        public async Task<IActionResult> Delete(string sessionKey, int id)
        {
            var kullaniciId = GetKullaniciId();
            if (kullaniciId == null)
                return RedirectToAction("Login", "Account");

            if (!CanEditBank())
            {
                TempData["Error"] = "Yetkiniz yok.";
                return RedirectToAction("Sorular", new { sessionKey });
            }

            var tempFilePath = HttpContext.Session.GetString(sessionKey);
            if (string.IsNullOrEmpty(tempFilePath))
            {
                TempData["Error"] = "Soru bankasý bulunamadý.";
                return RedirectToAction("Index", "mgtest");
            }

            try
            {
                await _sqliteService.DeleteSoru(tempFilePath, id);
                TempData["Success"] = "Soru baþarýyla silindi.";
            }
            catch (Exception ex)
            {
                TempData["Error"] = $"Soru silinirken hata: {ex.Message}";
            }

            return RedirectToAction("Sorular", new { sessionKey });
        }

        // POST: /Soru/CropImage - AJAX için
        [HttpPost]
        public async Task<IActionResult> CropImage(IFormFile file, int x, int y, int width, int height)
        {
            try
            {
                using var ms = new MemoryStream();
                await file.CopyToAsync(ms);
                ms.Position = 0;

                using var image = await Image.LoadAsync(ms);

                // Kýrp
                image.Mutate(i => i.Crop(new Rectangle(x, y, width, height)));

                using var output = new MemoryStream();
                await image.SaveAsJpegAsync(output);

                var base64 = Convert.ToBase64String(output.ToArray());

                return Json(new { success = true, data = base64 });
            }
            catch (Exception ex)
            {
                return Json(new { success = false, message = ex.Message });
            }
        }

        // POST: /Soru/ExportToWord
        [HttpPost]
        [ValidateAntiForgeryToken]
        public async Task<IActionResult> ExportToWord(string sessionKey, string bankaAdi, 
            int sutunSayisi, string? header, string? footer, bool cevapAnahtariEkle, 
            [FromBody] int[] selectedSoruIds)
        {
            var kullaniciId = GetKullaniciId();
            if (kullaniciId == null)
                return RedirectToAction("Login", "Account");

            var tempFilePath = HttpContext.Session.GetString(sessionKey);
            if (string.IsNullOrEmpty(tempFilePath))
                return Json(new { success = false, message = "Banka bulunamadý." });

            try
            {
                var sorular = await _sqliteService.GetSorular(tempFilePath);
                var secilenSorular = sorular.Where(s => selectedSoruIds.Contains(s.Id)).ToList();

                if (!secilenSorular.Any())
                {
                    return Json(new { success = false, message = "Seçili soru yok." });
                }

                // Ýleri de implement edilecek
                return Json(new { success = true, message = "Word dosyasý hazýrlanýyor..." });
            }
            catch (Exception ex)
            {
                return Json(new { success = false, message = ex.Message });
            }
        }

        // POST: /Soru/ExportToPdf
        [HttpPost]
        [ValidateAntiForgeryToken]
        public async Task<IActionResult> ExportToPdf(string sessionKey, string bankaAdi,
            int sutunSayisi, string? header, string? footer, bool cevapAnahtariEkle,
            [FromBody] int[] selectedSoruIds)
        {
            var kullaniciId = GetKullaniciId();
            if (kullaniciId == null)
                return RedirectToAction("Login", "Account");

            var tempFilePath = HttpContext.Session.GetString(sessionKey);
            if (string.IsNullOrEmpty(tempFilePath))
                return Json(new { success = false, message = "Banka bulunamadý." });

            try
            {
                var sorular = await _sqliteService.GetSorular(tempFilePath);
                var secilenSorular = sorular.Where(s => selectedSoruIds.Contains(s.Id)).ToList();

                if (!secilenSorular.Any())
                {
                    return Json(new { success = false, message = "Seçili soru yok." });
                }

                // Ýleri de implement edilecek
                return Json(new { success = true, message = "PDF dosyasý hazýrlanýyor..." });
            }
            catch (Exception ex)
            {
                return Json(new { success = false, message = ex.Message });
            }
        }

        // Helper: Resim dosyasýný Base64'e çevir
        private async Task<string> ConvertImageToBase64(IFormFile file)
        {
            using var ms = new MemoryStream();
            await file.CopyToAsync(ms);
            return Convert.ToBase64String(ms.ToArray());
        }
    }
}