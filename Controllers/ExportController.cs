using Microsoft.AspNetCore.Mvc;
using mgtest.Services;

namespace mgtest.Controllers
{
    public class ExportController : Controller
    {
        private readonly ISqliteFileService _sqliteService;
        private readonly IExportService _exportService;

        public ExportController(ISqliteFileService sqliteService, IExportService exportService)
        {
            _sqliteService = sqliteService;
            _exportService = exportService;
        }

        private int? GetKullaniciId()
        {
            return HttpContext.Session.GetInt32("KullaniciId");
        }

        // GET: /Export/Options
        [HttpGet]
        public async Task<IActionResult> Options(string sessionKey, string? secilenIds)
        {
            var kullaniciId = GetKullaniciId();
            if (kullaniciId == null)
                return RedirectToAction("Login", "Account");

            var tempFilePath = HttpContext.Session.GetString(sessionKey);
            if (string.IsNullOrEmpty(tempFilePath))
            {
                TempData["Error"] = "Soru bankası bulunamadı.";
                return RedirectToAction("Index", "mgtest");
            }

            var ayarlar = await _sqliteService.GetBankaAyarlari(tempFilePath);

            ViewBag.SessionKey = sessionKey;
            ViewBag.SecilenIds = secilenIds;
            ViewBag.BankaAdi = ayarlar?.BankaAdi ?? "Soru Bankası";
            ViewBag.VarsayilanSutun = ayarlar?.VarsayilanSutunSayisi ?? 2;
            ViewBag.VarsayilanHeader = ayarlar?.VarsayilanHeader;
            ViewBag.VarsayilanFooter = ayarlar?.VarsayilanFooter;
            ViewBag.VarsayilanAnahtar = ayarlar?.VarsayilanAnahtarEkle ?? true;

            return View();
        }

        // POST: /Export/GeneratePdf
        // PDF sınav kağıdı üretir (Geriye dönük uyumluluk ve sunucu tarafı DOCX-to-PDF çağrıları için)
        [HttpPost]
        public async Task<IActionResult> GeneratePdf(
            string sessionKey,
            string? secilenIds,
            int sutunSayisi,
            string? header,
            string? footer,
            bool anahtarEkle)
        {
            var kullaniciId = GetKullaniciId();
            if (kullaniciId == null)
                return RedirectToAction("Login", "Account");

            var tempFilePath = HttpContext.Session.GetString(sessionKey);
            if (string.IsNullOrEmpty(tempFilePath))
            {
                TempData["Error"] = "Soru bankası bulunamadı.";
                return RedirectToAction("Index", "mgtest");
            }

            try
            {
                var sorular = await _sqliteService.GetSorular(tempFilePath);

                // Seçili soruları ID listesine göre filtrele
                if (!string.IsNullOrEmpty(secilenIds))
                {
                    var ids = secilenIds.Split(',').Select(int.Parse).ToList();
                    sorular = sorular.Where(s => ids.Contains(s.Id)).ToList();
                }

                if (!sorular.Any())
                {
                    TempData["Error"] = "Hiç soru seçilmedi.";
                    return RedirectToAction("Options", new { sessionKey, secilenIds });
                }

                // Sütun sayısına göre uygun şablonu belirle
                string sablonAdi = sutunSayisi == 3 ? "3_.docx" : $"{sutunSayisi}.docx";
                string sablonYolu = $"templates/{sablonAdi}";

                var options = new ExportOptions
                {
                    HeaderMetni = header,
                    FooterMetni = footer,
                    AnahtarEkle = anahtarEkle,
                    SablonDosyaYolu = sablonYolu
                };

                // Word olarak üret ve PDF formatında indirilmesi için başlıkları ayarla
                var pdfBytes = await _exportService.ExportToDocx(sorular, options);
                var ayarlar = await _sqliteService.GetBankaAyarlari(tempFilePath);
                var fileName = $"{ayarlar?.BankaAdi ?? "mgtest"}_{DateTime.Now:yyyyMMdd}.pdf";

                return File(pdfBytes, "application/pdf", fileName);
            }
            catch (Exception ex)
            {
                TempData["Error"] = $"PDF oluşturulurken hata: {ex.Message}";
                return RedirectToAction("Options", new { sessionKey, secilenIds });
            }
        }

        // POST: /Export/GenerateDocx
        // Word sınav belgesi üretir (Şablondaki {sorular} ve {anahtar} yerlerini doldurur)
        [HttpPost]
        public async Task<IActionResult> GenerateDocx(
            string sessionKey,
            string? secilenIds,
            int sutunSayisi,
            string? header,
            string? footer,
            bool anahtarEkle)
        {
            var kullaniciId = GetKullaniciId();
            if (kullaniciId == null)
                return RedirectToAction("Login", "Account");

            var tempFilePath = HttpContext.Session.GetString(sessionKey);
            if (string.IsNullOrEmpty(tempFilePath))
            {
                TempData["Error"] = "Soru bankası bulunamadı.";
                return RedirectToAction("Index", "mgtest");
            }

            try
            {
                var sorular = await _sqliteService.GetSorular(tempFilePath);

                // Seçili soruları ID listesine göre filtrele
                if (!string.IsNullOrEmpty(secilenIds))
                {
                    var ids = secilenIds.Split(',').Select(int.Parse).ToList();
                    sorular = sorular.Where(s => ids.Contains(s.Id)).ToList();
                }

                if (!sorular.Any())
                {
                    TempData["Error"] = "Hiç soru seçilmedi.";
                    return RedirectToAction("Options", new { sessionKey, secilenIds });
                }

                // Sütun sayısına göre uygun şablonu belirle
                string sablonAdi = sutunSayisi == 3 ? "3_.docx" : $"{sutunSayisi}.docx";
                string sablonYolu = $"templates/{sablonAdi}";

                var options = new ExportOptions
                {
                    HeaderMetni = header,
                    FooterMetni = footer,
                    AnahtarEkle = anahtarEkle,
                    SablonDosyaYolu = sablonYolu
                };

                var docxBytes = await _exportService.ExportToDocx(sorular, options);
                var ayarlar = await _sqliteService.GetBankaAyarlari(tempFilePath);
                var fileName = $"{ayarlar?.BankaAdi ?? "mgtest"}_{DateTime.Now:yyyyMMdd}.docx";

                return File(docxBytes, "application/vnd.openxmlformats-officedocument.wordprocessingml.document", fileName);
            }
            catch (Exception ex)
            {
                TempData["Error"] = $"DOCX oluşturulurken hata: {ex.Message}";
                return RedirectToAction("Options", new { sessionKey, secilenIds });
            }
        }
    }
}