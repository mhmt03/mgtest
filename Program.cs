using Microsoft.EntityFrameworkCore;
using mgtest.Data;
using mgtest.Services;
using mgtest.Models;

var builder = WebApplication.CreateBuilder(args);

// SQLCipher desteği için gerekli
SQLitePCL.Batteries_V2.Init();

// Add services to the container.
builder.Services.AddControllersWithViews();


var connectionString = builder.Configuration.GetConnectionString("DefaultConnection");
// Proje klasöründe "db" klasörü altında veritabanı dosyasının tam yolunu oluştur
var projectDir = AppContext.BaseDirectory;
var dbFolder = Path.Combine(projectDir, "db");
if (!Directory.Exists(dbFolder))
{
    Directory.CreateDirectory(dbFolder);
}
var dbFileName = "mgtest.db";
var dbPath = Path.Combine(dbFolder, dbFileName);
// Connection string'i dosya yoluyla güncelle
var finalConnectionString = $"Data Source={dbPath}";
//Console.WriteLine($"Using database at: {dbPath}");


builder.Services.AddDbContext<ServerDbContext>(options =>
           options.UseSqlite(finalConnectionString));

// Services
builder.Services.AddScoped<IEncryptionService, EncryptionService>();
builder.Services.AddScoped<ISqliteFileService, SqliteFileService>();
builder.Services.AddScoped<IExportService, ExportService>();
builder.Services.AddScoped<IFileLogService, FileLogService>();
builder.Services.AddScoped<IBankaDonusturucuService, BankaDonusturucuService>();
//loglama
builder.Services.AddLogging(logging =>
{
    logging.AddConsole();
    logging.SetMinimumLevel(LogLevel.Debug);
});

// Session
builder.Services.AddDistributedMemoryCache();
builder.Services.AddSession(options =>
{
    options.IdleTimeout = TimeSpan.FromMinutes(
        builder.Configuration.GetValue<int>("AppSettings:SessionTimeoutMinutes"));
    options.Cookie.HttpOnly = true;
    options.Cookie.IsEssential = true;
});

// HTTP Context Accessor
builder.Services.AddHttpContextAccessor();

var app = builder.Build();

// Tüm işlenmeyen (unhandled) hataları db altındaki log dosyasına kaydeden global hata yakalama middleware'i
app.Use(async (context, next) =>
{
    try
    {
        await next();
    }
    catch (Exception ex)
    {
        var logService = context.RequestServices.GetService<IFileLogService>();
        if (logService != null)
        {
            await logService.LogDetay($"UNHANDLED_EXCEPTION: {ex.Message}", detay: ex.StackTrace);
        }
        throw;
    }
});

// Configure the HTTP request pipeline.
if (app.Environment.IsDevelopment())
{
    app.UseDeveloperExceptionPage();
}
else
{
    app.UseExceptionHandler("/Home/Error");
    app.UseHsts();
}

// app.UseHttpsRedirection(); // Disabled for development
app.UseStaticFiles();

app.UseRouting();

app.UseSession();

// SHIELD_ENCRYPTION_START: Middleware to log all site activities
app.Use(async (context, next) =>
{
    var path = context.Request.Path.Value ?? "";
    // Ignore static files, favicon, etc.
    if (!path.StartsWith("/css") && !path.StartsWith("/js") && !path.StartsWith("/lib") && 
        !path.StartsWith("/favicon") && !path.StartsWith("/img") && !path.EndsWith(".js") && !path.EndsWith(".css"))
    {
        var logService = context.RequestServices.GetService<IFileLogService>();
        if (logService != null)
        {
            var username = context.Session.GetString("KullaniciAdi") ?? "Ziyaretci";
            var ip = context.Connection.RemoteIpAddress?.ToString() ?? "Bilinmiyor";
            var method = context.Request.Method;
            await logService.LogSiteActivity(username, ip, method, path);
        }
    }
    await next();
});
// SHIELD_ENCRYPTION_END

app.UseAuthorization();

app.MapControllerRoute(
    name: "default",
    pattern: "{controller=Account}/{action=Login}/{id?}");

// Database initialization and seed data
try
{
    using (var scope = app.Services.CreateScope())
    {
        var dbContext = scope.ServiceProvider.GetRequiredService<ServerDbContext>();
        var encryptionService = scope.ServiceProvider.GetRequiredService<IEncryptionService>();

        // Create database and apply migrations
        dbContext.Database.EnsureCreated();

        // Seed data - create default user if not exists
        if (!dbContext.Kullanicilar.Any(k => k.KullaniciAdi == "mg"))
        {
            var now = DateTime.Now;
            var dbPassword = $"mg_{now:yyyy_MM_dd_HH_mm_ss}";
            var kullanici = new Kullanici
            {
                KullaniciAdi = "mg",
                Ad = "Mehmet",
                Soyad = "Gültekin",
                Email = "mg@example.com",
                Sifre = "123456", // Şifre hashlenmeden düz olarak atanıyor
                KayitTarihi = now,
                SonKullanmaTarihi = now.AddYears(10),
                AktifMi = true,
                KullaniciTuru = KullaniciTuru.admin,
                VeriTabanSifresi = dbPassword
            };

            //  todo kullanıcı oluşunca o kullanıcıya ait yeni ders konu ve kazanım da eklesin hepsinin id değerleri de 1 olsun

            dbContext.Kullanicilar.Add(kullanici);
            //Console.WriteLine($"Default admin user 'mg' created. DB Password: {dbPassword}");
            dbContext.SaveChanges();
        }
    }
}
catch (Exception ex)
{
    Console.WriteLine($"Database initialization error: {ex.Message}");
    Console.WriteLine($"Stack trace: {ex.StackTrace}");
}

app.Run();