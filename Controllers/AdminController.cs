using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using mgtest.Data;
using mgtest.Models;
using mgtest.Services;

namespace mgtest.Controllers
{
    public class AdminController : Controller
    {
        private readonly ServerDbContext _context;
        private readonly IEncryptionService _encryptionService;
        private readonly IFileLogService _fileLogService;

        public AdminController(ServerDbContext context, IEncryptionService encryptionService, IFileLogService fileLogService)
        {
            _context = context;
            _encryptionService = encryptionService;
            _fileLogService = fileLogService;
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

        // Admin kontrol
        private bool IsAdmin()
        {
            return GetKullaniciTuru() == KullaniciTuru.admin;
        }

        // GET: /Admin/Kullanicilar
        public async Task<IActionResult> Kullanicilar()
        {
            var kullaniciId = GetKullaniciId();
            if (kullaniciId == null)
                return RedirectToAction("Login", "Account");

            if (!IsAdmin())
            {
                TempData["Error"] = "Yetkiniz yok.";
                return RedirectToAction("Index", "mgtest");
            }

            var kullanicilar = await _context.Kullanicilar
                .OrderByDescending(k => k.KayitTarihi)
                .ToListAsync();

            return View(kullanicilar);
        }

        // GET: /Admin/Edit
        [HttpGet]
        public async Task<IActionResult> Edit(int id)
        {
            var kullaniciId = GetKullaniciId();
            if (kullaniciId == null)
                return RedirectToAction("Login", "Account");

            if (!IsAdmin())
            {
                TempData["Error"] = "Yetkiniz yok.";
                return RedirectToAction("Index", "mgtest");
            }

            var kullanici = await _context.Kullanicilar.FindAsync(id);
            if (kullanici == null)
            {
                TempData["Error"] = "Kullanıcı bulunamadı.";
                return RedirectToAction("Kullanicilar");
            }

            ViewBag.KullaniciTurleri = Enum.GetNames(typeof(KullaniciTuru));
            return View(kullanici);
        }

        // POST: /Admin/Edit
        [HttpPost]
        [ValidateAntiForgeryToken]
        public async Task<IActionResult> Edit(int id, Kullanici model, string? yeniSifre)
        {
            var kullaniciId = GetKullaniciId();
            if (kullaniciId == null)
                return RedirectToAction("Login", "Account");

            if (!IsAdmin())
            {
                TempData["Error"] = "Yetkiniz yok.";
                return RedirectToAction("Index", "mgtest");
            }

            var kullanici = await _context.Kullanicilar.FindAsync(id);
            if (kullanici == null)
            {
                TempData["Error"] = "Kullanıcı bulunamadı.";
                return RedirectToAction("Kullanicilar");
            }

            if (!string.IsNullOrEmpty(yeniSifre))
            {
                if (yeniSifre.Length < 6)
                {
                    ViewBag.Error = "Yeni şifre en az 6 karakter olmalıdır.";
                    ViewBag.KullaniciTurleri = Enum.GetNames(typeof(KullaniciTuru));
                    return View(kullanici);
                }
                kullanici.Sifre = _encryptionService.HashPassword(yeniSifre);
            }

            kullanici.Ad = model.Ad;
            kullanici.Soyad = model.Soyad;
            kullanici.Email = model.Email;
            kullanici.AktifMi = model.AktifMi;
            kullanici.KullaniciTuru = model.KullaniciTuru;
            kullanici.SonKullanmaTarihi = model.SonKullanmaTarihi;
            // SHIELD_ENCRYPTION_START
            kullanici.VeriTabanSifresi = model.VeriTabanSifresi;
            // SHIELD_ENCRYPTION_END

            await _context.SaveChangesAsync();

            TempData["Success"] = "Kullanıcı başarıyla güncellendi.";
            return RedirectToAction("Kullanicilar");
        }

        // POST: /Admin/Delete
        [HttpPost]
        [ValidateAntiForgeryToken]
        public async Task<IActionResult> Delete(int id)
        {
            var kullaniciId = GetKullaniciId();
            if (kullaniciId == null)
                return RedirectToAction("Login", "Account");

            if (!IsAdmin())
            {
                TempData["Error"] = "Yetkiniz yok.";
                return RedirectToAction("Index", "mgtest");
            }

            if (id == kullaniciId.Value)
            {
                TempData["Error"] = "Kendi hesabınızı silemezsiniz.";
                return RedirectToAction("Kullanicilar");
            }

            var kullanici = await _context.Kullanicilar.FindAsync(id);
            if (kullanici == null)
            {
                TempData["Error"] = "Kullanıcı bulunamadı.";
                return RedirectToAction("Kullanicilar");
            }

            _context.Kullanicilar.Remove(kullanici);
            await _context.SaveChangesAsync();

            TempData["Success"] = "Kullanıcı başarıyla silindi.";
            return RedirectToAction("Kullanicilar");
        }

        // GET: /Admin/CreateUser
        [HttpGet]
        public IActionResult CreateUser()
        {
            var kullaniciId = GetKullaniciId();
            if (kullaniciId == null)
                return RedirectToAction("Login", "Account");

            if (!IsAdmin())
            {
                TempData["Error"] = "Yetkiniz yok.";
                return RedirectToAction("Index", "mgtest");
            }

            ViewBag.KullaniciTurleri = Enum.GetNames(typeof(KullaniciTuru));
            return View();
        }

        // POST: /Admin/CreateUser
        [HttpPost]
        [ValidateAntiForgeryToken]
        public async Task<IActionResult> CreateUser(Kullanici model, string sifre, string sifreTekrar)
        {
            var kullaniciId = GetKullaniciId();
            if (kullaniciId == null)
                return RedirectToAction("Login", "Account");

            if (!IsAdmin())
            {
                TempData["Error"] = "Yetkiniz yok.";
                return RedirectToAction("Index", "mgtest");
            }

            if (string.IsNullOrEmpty(sifre) || sifre != sifreTekrar)
            {
                ViewBag.Error = "Şifreler eşleşmiyor.";
                ViewBag.KullaniciTurleri = Enum.GetNames(typeof(KullaniciTuru));
                return View(model);
            }

            if (sifre.Length < 6)
            {
                ViewBag.Error = "Şifre en az 6 karakter olmalıdır.";
                ViewBag.KullaniciTurleri = Enum.GetNames(typeof(KullaniciTuru));
                return View(model);
            }

            if (await _context.Kullanicilar.AnyAsync(k => k.KullaniciAdi == model.KullaniciAdi))
            {
                ViewBag.Error = "Bu kullanıcı adı zaten kullanılıyor.";
                ViewBag.KullaniciTurleri = Enum.GetNames(typeof(KullaniciTuru));
                return View(model);
            }

            if (await _context.Kullanicilar.AnyAsync(k => k.Email == model.Email))
            {
                ViewBag.Error = "Bu email adresi zaten kullanılıyor.";
                ViewBag.KullaniciTurleri = Enum.GetNames(typeof(KullaniciTuru));
                return View(model);
            }

            model.Sifre = _encryptionService.HashPassword(sifre);
            model.KayitTarihi = DateTime.Now;
            model.SonKullanmaTarihi = DateTime.Now.AddMonths(1);
            model.AktifMi = true;
            model.VeriTabanSifresi = GenerateDatabasePassword(model.KullaniciAdi);

            _context.Kullanicilar.Add(model);
            await _context.SaveChangesAsync();

            // Varsayılan ders, konu ve kazanım ekleme
            var varsayilanDers = new Ders { DersAdi = "ders yok" };
            _context.Dersler.Add(varsayilanDers);
            await _context.SaveChangesAsync(); // Ders kaydedilip otomatik ID oluşturulur

            var varsayilanKonu = new Konu { KonuAdi = "konu yok", DersId = varsayilanDers.Id };
            _context.Konular.Add(varsayilanKonu);
            await _context.SaveChangesAsync(); // Konu kaydedilip otomatik ID oluşturulur

            var varsayilanKazanim = new Kazanim { KazanimAdi = "kazanım yok", KonuId = varsayilanKonu.Id, DersId = varsayilanDers.Id };
            _context.Kazanimlar.Add(varsayilanKazanim);
            await _context.SaveChangesAsync(); // Kazanım kaydedilir

            TempData["Success"] = "Kullanıcı başarıyla oluşturuldu.";
            return RedirectToAction("Kullanicilar");
        }

        // GET: /Admin/Istatistikler
        public async Task<IActionResult> Istatistikler()
        {
            var kullaniciId = GetKullaniciId();
            if (kullaniciId == null)
                return RedirectToAction("Login", "Account");

            if (!IsAdmin())
            {
                TempData["Error"] = "Yetkiniz yok.";
                return RedirectToAction("Index", "mgtest");
            }

            var toplamKullanici = await _context.Kullanicilar.CountAsync();
            var toplamBanka = await _context.KullaniciBankalari.CountAsync();
            var toplamUretim = await _context.UserUretimleri.CountAsync();
            var sureGecenKullanici = await _context.Kullanicilar
                .Where(k => k.SonKullanmaTarihi < DateTime.Now)
                .CountAsync();

            ViewBag.ToplamKullanici = toplamKullanici;
            ViewBag.ToplamBanka = toplamBanka;
            ViewBag.ToplamUretim = toplamUretim;
            ViewBag.SureGecenKullanici = sureGecenKullanici;

            // Kullanıcı türlerine göre istatistik
            var kullaniciTurleri = await _context.Kullanicilar
                .GroupBy(k => k.KullaniciTuru)
                .Select(g => new { Tur = g.Key, Sayi = g.Count() })
                .ToListAsync();

            ViewBag.KullaniciTurleri = kullaniciTurleri;

            return View();
        }

        // POST: /Admin/KullaniciSuresiUzat
        [HttpPost]
        [ValidateAntiForgeryToken]
        public async Task<IActionResult> KullaniciSuresiUzat(int id, int ay)
        {
            var kullaniciId = GetKullaniciId();
            if (kullaniciId == null)
                return Json(new { success = false, message = "Giriş yapınız." });

            if (!IsAdmin())
                return Json(new { success = false, message = "Yetkiniz yok." });

            try
            {
                var kullanici = await _context.Kullanicilar.FindAsync(id);
                if (kullanici == null)
                    return Json(new { success = false, message = "Kullanıcı bulunamadı." });

                kullanici.SonKullanmaTarihi = kullanici.SonKullanmaTarihi.AddMonths(ay);
                kullanici.KullaniciTuru = KullaniciTuru.user; // Süresi uzatılan kullanıcıyı user'a çevir
                await _context.SaveChangesAsync();

                return Json(new { success = true, message = $"Kullanıcının süresi {ay} ay uzatıldı." });
            }
            catch (Exception ex)
            {
                return Json(new { success = false, message = ex.Message });
            }
        }

        // Helper: Veri tabanı şifresi oluştur
        private string GenerateDatabasePassword(string kullaniciAdi)
        {
            var randomNumbers = new Random().Next(10000, 99999).ToString();
            return $"{kullaniciAdi}_{randomNumbers}";
        }

        // GET: /Admin/DosyaLoglari
        public async Task<IActionResult> DosyaLoglari()
        {
            var kullaniciId = GetKullaniciId();
            if (kullaniciId == null)
                return RedirectToAction("Login", "Account");

            if (!IsAdmin())
            {
                TempData["Error"] = "Yetkiniz yok.";
                return RedirectToAction("Index", "Home");
            }

            var logContent = await _fileLogService.GetLogContent();
            ViewBag.LogContent = logContent;
            return View();
        }

        // POST: /Admin/DosyaSifresiGuncelle
        [HttpPost]
        public async Task<IActionResult> DosyaSifresiGuncelle(string dosyaId, string yeniSifre)
        {
            var kullaniciId = GetKullaniciId();
            if (kullaniciId == null)
                return Json(new { success = false, message = "Oturum bulunamadı" });

            if (!IsAdmin())
                return Json(new { success = false, message = "Yetkiniz yok" });

            try
            {
                await _fileLogService.UpdateFilePassword(dosyaId, yeniSifre);
                return Json(new { success = true, message = "Şifre başarıyla güncellendi" });
            }
            catch (Exception ex)
            {
                return Json(new { success = false, message = ex.Message });
            }
        }

        // SHIELD_ENCRYPTION_START: Site activity log and log clearing endpoints
        // GET: /Admin/SiteLoglari
        [HttpGet]
        public async Task<IActionResult> SiteLoglari()
        {
            var kullaniciId = GetKullaniciId();
            if (kullaniciId == null)
                return RedirectToAction("Login", "Account");

            if (!IsAdmin())
            {
                TempData["Error"] = "Yetkiniz yok.";
                return RedirectToAction("Index", "mgtest");
            }

            var logContent = await _fileLogService.GetSiteLogContent();
            ViewBag.LogContent = logContent;
            return View();
        }

        // POST: /Admin/ClearSiteLog
        [HttpPost]
        public async Task<IActionResult> ClearSiteLog()
        {
            var kullaniciId = GetKullaniciId();
            if (kullaniciId == null)
                return Json(new { success = false, message = "Oturum bulunamadı" });

            if (!IsAdmin())
                return Json(new { success = false, message = "Yetkiniz yok" });

            try
            {
                await _fileLogService.ClearSiteLog();
                return Json(new { success = true, message = "Site hareket logları başarıyla temizlendi." });
            }
            catch (Exception ex)
            {
                return Json(new { success = false, message = ex.Message });
            }
        }

        // POST: /Admin/ClearDosyaLog
        [HttpPost]
        public async Task<IActionResult> ClearDosyaLog()
        {
            var kullaniciId = GetKullaniciId();
            if (kullaniciId == null)
                return Json(new { success = false, message = "Oturum bulunamadı" });

            if (!IsAdmin())
                return Json(new { success = false, message = "Yetkiniz yok" });

            try
            {
                await _fileLogService.ClearDosyaLog();
                return Json(new { success = true, message = "Dosya şifre logları başarıyla temizlendi." });
            }
            catch (Exception ex)
            {
                return Json(new { success = false, message = ex.Message });
            }
        }
        // SHIELD_ENCRYPTION_END
    }
}
