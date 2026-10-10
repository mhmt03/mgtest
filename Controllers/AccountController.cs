using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using mgtest.Data;
using mgtest.Models;
using mgtest.Services;

namespace mgtest.Controllers
{
    public class AccountController : Controller
    {
        private readonly ServerDbContext _context;

        public AccountController(ServerDbContext context)
        {
            _context = context;
        }

        // Veri tabanı şifresi oluştur (KullaniciAdi + rastgele sayı)
        private string GenerateDatabasePassword(string kullaniciAdi)
        {
            var randomNumbers = new Random().Next(10000, 99999).ToString();
            return $"{kullaniciAdi}_{randomNumbers}";
        }

        // GET: /Account/Login
        [HttpGet]
        public IActionResult Login()
        {
            // Zaten giriş yapmışsa ana sayfaya yönlendir
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
                ViewBag.Error = "Kullanıcı adı ve şifre zorunludur.";
                return View();
            }

            var kullanici = await _context.Kullanicilar
                .FirstOrDefaultAsync(k => k.KullaniciAdi == kullaniciAdi && k.AktifMi);

            if (kullanici == null || kullanici.Sifre != sifre)
            {
                ViewBag.Error = "Kullanıcı adı veya şifre hatalı.";
                return View();
            }

            // Süresi geçen kullanıcıyı kontrol et
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
            HttpContext.Session.SetString("SonKullanmaTarihi", kullanici.SonKullanmaTarihi.ToString("dd.MM.yyyy"));

            // Doğrudan ana sayfaya yönlendir (register değil)
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
                ViewBag.Error = "Şifreler eşleşmiyor.";
                return View(model);
            }

            if (model.Sifre.Length < 6)
            {
                ViewBag.Error = "Şifre en az 6 karakter olmalıdır.";
                return View(model);
            }

            // Kullanıcı adı kontrolü
            if (await _context.Kullanicilar.AnyAsync(k => k.KullaniciAdi == model.KullaniciAdi))
            {
                ViewBag.Error = "Bu kullanıcı adı zaten kullanılıyor.";
                return View(model);
            }

            // Email kontrolü
            if (await _context.Kullanicilar.AnyAsync(k => k.Email == model.Email))
            {
                ViewBag.Error = "Bu email adresi zaten kullanılıyor.";
                return View(model);
            }

            model.KayitTarihi = DateTime.Now;
            // SonKullanmaTarihi = KayitTarihi + 1 ay
            model.SonKullanmaTarihi = DateTime.Now.AddMonths(1);
            model.AktifMi = true;
            // Default kullanıcı türü = kisitliUser
            model.KullaniciTuru = KullaniciTuru.kisitliUser;
            // Veri tabanı şifresi oluştur
            model.VeriTabanSifresi = GenerateDatabasePassword(model.KullaniciAdi);

            try
            {
                _context.Kullanicilar.Add(model);
                await _context.SaveChangesAsync();

                ViewBag.Success = "Kayıt başarılı! Giriş yapabilirsiniz.";
                return View("Login");
            }
            catch (Exception ex)
            {
                ViewBag.Error = $"Kayıt sırasında hata oluştu: {ex.Message}";
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

            // Şifre değişikliği varsa
            if (!string.IsNullOrEmpty(yeniSifre))
            {
                if (yeniSifre != yeniSifreTekrar)
                {
                    ViewBag.Error = "Yeni şifreler eşleşmiyor.";
                    return View("Profile", kullanici);
                }

                if (yeniSifre.Length < 6)
                {
                    ViewBag.Error = "Yeni şifre en az 6 karakter olmalıdır.";
                    return View("Profile", kullanici);
                }

                kullanici.Sifre = yeniSifre;
            }

            await _context.SaveChangesAsync();

            // Session'ı güncelle
            HttpContext.Session.SetString("AdSoyad", $"{kullanici.Ad} {kullanici.Soyad}");

            ViewBag.Success = "Profil başarıyla güncellendi.";
            return View("Profile", kullanici);
        }
    }
}
