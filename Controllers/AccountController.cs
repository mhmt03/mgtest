using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using mgtest.Data;
using mgtest.Models;

namespace mgtest.Controllers
{
    public class AccountController : Controller
    {
        private readonly ServerDbContext _context;

        public AccountController(ServerDbContext context)
        {
            _context = context;
        }

        // Veri tabaný þifresi oluþtur (KullaniciAdi + rastgele sayý)
        private string GenerateDatabasePassword(string kullaniciAdi)
        {
            var randomNumbers = new Random().Next(10000, 99999).ToString();
            return $"{kullaniciAdi}_{randomNumbers}";
        }

        // GET: /Account/Login
        [HttpGet]
        public IActionResult Login()
        {
            // Zaten giriþ yapmýþsa ana sayfaya yönlendir
            if (HttpContext.Session.GetInt32("KullaniciId") != null)
            {
                return RedirectToAction("Index", "mgtest");
            }
            return View();
        }

        // POST: /Account/Login
        [HttpPost]
        [ValidateAntiForgeryToken]
        public async Task<IActionResult> Login(string kullaniciAdi, string sifre)
        {
            if (string.IsNullOrEmpty(kullaniciAdi) || string.IsNullOrEmpty(sifre))
            {
                ViewBag.Error = "Kullanýcý adý ve þifre zorunludur.";
                return View();
            }

            var kullanici = await _context.Kullanicilar
                .FirstOrDefaultAsync(k => k.KullaniciAdi == kullaniciAdi && k.AktifMi);

            if (kullanici == null || kullanici.Sifre != sifre)
            {
                ViewBag.Error = "Kullanýcý adý veya þifre hatalý.";
                return View();
            }

            // Süresi geçen kullanýcýyý kontrol et
            if (kullanici.SonKullanmaTarihi < DateTime.Now)
            {
                // Otomatik olarak kisitliUser'a çevir
                kullanici.KullaniciTuru = KullaniciTuru.kisitliUser;
                await _context.SaveChangesAsync();
            }

            // Session'a kaydet
            HttpContext.Session.SetInt32("KullaniciId", kullanici.Id);
            HttpContext.Session.SetString("KullaniciAdi", kullanici.KullaniciAdi);
            HttpContext.Session.SetString("AdSoyad", $"{kullanici.Ad} {kullanici.Soyad}");
            HttpContext.Session.SetString("KullaniciTuru", kullanici.KullaniciTuru.ToString());

            // Doðrudan ana sayfaya yönlendir (register deðil)
            return RedirectToAction("Index", "mgtest");
        }

        // GET: /Account/Register
        [HttpGet]
        public IActionResult Register()
        {
            if (HttpContext.Session.GetInt32("KullaniciId") != null)
            {
                return RedirectToAction("Index", "mgtest");
            }
            return View();
        }

        // POST: /Account/Register
        [HttpPost]
        [ValidateAntiForgeryToken]
        public async Task<IActionResult> Register(Kullanici model, string sifreTekrar)
        {
            if (!ModelState.IsValid)
            {
                return View(model);
            }

            if (model.Sifre != sifreTekrar)
            {
                ViewBag.Error = "Þifreler eþleþmiyor.";
                return View(model);
            }

            if (model.Sifre.Length < 6)
            {
                ViewBag.Error = "Þifre en az 6 karakter olmalýdýr.";
                return View(model);
            }

            // Kullanýcý adý kontrolü
            if (await _context.Kullanicilar.AnyAsync(k => k.KullaniciAdi == model.KullaniciAdi))
            {
                ViewBag.Error = "Bu kullanýcý adý zaten kullanýlýyor.";
                return View(model);
            }

            // Email kontrolü
            if (await _context.Kullanicilar.AnyAsync(k => k.Email == model.Email))
            {
                ViewBag.Error = "Bu email adresi zaten kullanýlýyor.";
                return View(model);
            }

            model.KayitTarihi = DateTime.Now;
            // SonKullanmaTarihi = KayitTarihi + 1 ay
            model.SonKullanmaTarihi = DateTime.Now.AddMonths(1);
            model.AktifMi = true;
            // Default kullanýcý türü = kisitliUser
            model.KullaniciTuru = KullaniciTuru.kisitliUser;
            // Veri tabaný þifresi oluþtur
            model.VeriTabanSifresi = GenerateDatabasePassword(model.KullaniciAdi);

            try
            {
                _context.Kullanicilar.Add(model);
                await _context.SaveChangesAsync();

                ViewBag.Success = "Kayýt baþarýlý! Giriþ yapabilirsiniz.";
                return View("Login");
            }
            catch (Exception ex)
            {
                ViewBag.Error = $"Kayýt sýrasýnda hata oluþtu: {ex.Message}";
                if (ex.InnerException != null)
                {
                    ViewBag.Error += $" | {ex.InnerException.Message}";
                }
                return View(model);
            }
        }

        // GET: /Account/Logout
        public IActionResult Logout()
        {
            HttpContext.Session.Clear();
            return RedirectToAction("Login");
        }

        // GET: /Account/Profile
        [HttpGet]
        public async Task<IActionResult> Profile()
        {
            var kullaniciId = HttpContext.Session.GetInt32("KullaniciId");
            if (kullaniciId == null)
            {
                return RedirectToAction("Login");
            }

            var kullanici = await _context.Kullanicilar.FindAsync(kullaniciId.Value);
            if (kullanici == null)
            {
                return RedirectToAction("Logout");
            }

            return View(kullanici);
        }

        // POST: /Account/UpdateProfile
        [HttpPost]
        [ValidateAntiForgeryToken]
        public async Task<IActionResult> UpdateProfile(string ad, string soyad, string email, string? yeniSifre, string? yeniSifreTekrar)
        {
            var kullaniciId = HttpContext.Session.GetInt32("KullaniciId");
            if (kullaniciId == null)
            {
                return RedirectToAction("Login");
            }

            var kullanici = await _context.Kullanicilar.FindAsync(kullaniciId.Value);
            if (kullanici == null)
            {
                return RedirectToAction("Logout");
            }

            kullanici.Ad = ad;
            kullanici.Soyad = soyad;
            kullanici.Email = email;

            // Þifre deðiþikliði varsa
            if (!string.IsNullOrEmpty(yeniSifre))
            {
                if (yeniSifre != yeniSifreTekrar)
                {
                    ViewBag.Error = "Yeni þifreler eþleþmiyor.";
                    return View("Profile", kullanici);
                }

                if (yeniSifre.Length < 6)
                {
                    ViewBag.Error = "Yeni þifre en az 6 karakter olmalýdýr.";
                    return View("Profile", kullanici);
                }

                kullanici.Sifre = yeniSifre;
            }

            await _context.SaveChangesAsync();

            // Session'ý güncelle
            HttpContext.Session.SetString("AdSoyad", $"{kullanici.Ad} {kullanici.Soyad}");

            ViewBag.Success = "Profil baþarýyla güncellendi.";
            return View("Profile", kullanici);
        }
    }
}