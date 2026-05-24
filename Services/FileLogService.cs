using System;
using System.IO;
using System.Text;
using System.Threading.Tasks;

namespace mgtest.Services
{
    public interface IFileLogService
    {
        Task LogFileCreated(int kullaniciId, string dosyaId, string bankaAdi, string sifre, string tempFilePath);
        Task LogFileUploaded(int kullaniciId, string dosyaId, string bankaAdi, string sifre, string tempFilePath, bool success);
        Task<string> GetLogContent();
        Task<List<FileLogEntry>> GetLogEntries();
        Task UpdateFilePassword(string dosyaId, string newPassword);
        Task LogDetay(string islem, int? kullaniciId = null, string? detay = null);
    }

    public class FileLogEntry
    {
        public string DosyaId { get; set; }
        public int KullaniciId { get; set; }
        public string BankaAdi { get; set; }
        public string Sifre { get; set; }
        public string TempFilePath { get; set; }
        public DateTime IslemTarihi { get; set; }
        public string IslemTipi { get; set; } // "Olusturuldu" / "Yuklendi"
        public bool Basarili { get; set; }
    }

    public class FileLogService : IFileLogService
    {
        private readonly string _logFilePath;
        private readonly string _detailLogFilePath;
        private readonly IConfiguration _configuration;
        private static readonly object _logLock = new object();

        public FileLogService(IConfiguration configuration)
        {
            _configuration = configuration;
            var logFolder = configuration["AppSettings:LogFolder"] ?? "Logs";
            
            if (!Directory.Exists(logFolder))
            {
                Directory.CreateDirectory(logFolder);
            }

            _logFilePath = Path.Combine(logFolder, "DosyaSifreLog.txt");
            _detailLogFilePath = Path.Combine(logFolder, "SifreAtamaDetay.txt");
        }

        // Detaylı log yazma
        public async Task LogDetay(string islem, int? kullaniciId = null, string? detay = null)
        {
            var entry = $"[{DateTime.Now:yyyy-MM-dd HH:mm:ss}] {islem}";
            if (kullaniciId.HasValue)
                entry += $" | KullaniciID: {kullaniciId}";
            if (!string.IsNullOrEmpty(detay))
                entry += $" | {detay}";

            await AppendToDetailLogAsync(entry);
        }

        private async Task AppendToDetailLogAsync(string logEntry)
        {
            try
            {
                lock (_logLock)
                {
                    File.AppendAllText(_detailLogFilePath, logEntry + Environment.NewLine, Encoding.UTF8);
                }
            }
            catch (Exception ex)
            {
                Console.WriteLine($"Detail log yazma hatası: {ex.Message}");
            }
        }

        public async Task LogFileCreated(int kullaniciId, string dosyaId, string bankaAdi, string sifre, string tempFilePath)
        {
            var entry = $"[{DateTime.Now:yyyy-MM-dd HH:mm:ss}] OLUŞTURULDU | DosyaID: {dosyaId} | KullaniciID: {kullaniciId} | BankaAdi: {bankaAdi} | Sifre: {sifre} | TempPath: {tempFilePath}";
            
            await AppendToLogAsync(entry);
        }

        public async Task LogFileUploaded(int kullaniciId, string dosyaId, string bankaAdi, string sifre, string tempFilePath, bool success)
        {
            var status = success ? "BAŞARILI" : "BAŞARISIZ";
            var entry = $"[{DateTime.Now:yyyy-MM-dd HH:mm:ss}] YÜKLENDI ({status}) | DosyaID: {dosyaId} | KullaniciID: {kullaniciId} | BankaAdi: {bankaAdi} | Sifre: {sifre} | TempPath: {tempFilePath}";
            
            await AppendToLogAsync(entry);
        }

        private async Task AppendToLogAsync(string logEntry)
        {
            try
            {
                lock (_logLock)
                {
                    File.AppendAllText(_logFilePath, logEntry + Environment.NewLine, Encoding.UTF8);
                }
            }
            catch (Exception ex)
            {
                Console.WriteLine($"Log yazma hatası: {ex.Message}");
            }
        }

        public async Task<string> GetLogContent()
        {
            try
            {
                if (!File.Exists(_logFilePath))
                    return "Log dosyası henüz oluşturulmadı.";

                lock (_logLock)
                {
                    return File.ReadAllText(_logFilePath, Encoding.UTF8);
                }
            }
            catch (Exception ex)
            {
                return $"Log okunurken hata: {ex.Message}";
            }
        }

        public async Task<List<FileLogEntry>> GetLogEntries()
        {
            var entries = new List<FileLogEntry>();

            try
            {
                if (!File.Exists(_logFilePath))
                    return entries;

                lock (_logLock)
                {
                    var lines = File.ReadAllLines(_logFilePath, Encoding.UTF8);
                    foreach (var line in lines)
                    {
                        var entry = ParseLogLine(line);
                        if (entry != null)
                            entries.Add(entry);
                    }
                }
            }
            catch (Exception ex)
            {
                Console.WriteLine($"Log parse hatası: {ex.Message}");
            }

            return entries;
        }

        private FileLogEntry ParseLogLine(string line)
        {
            try
            {
                // Format: [2026-01-29 12:34:56] OLUŞTURULDU | DosyaID: xxx | KullaniciID: 123 | BankaAdi: xxx | Sifre: xxx | TempPath: xxx
                
                if (string.IsNullOrWhiteSpace(line))
                    return null;

                var parts = line.Split(" | ");
                if (parts.Length < 6)
                    return null;

                // Tarihi ve işlem tipini ayrıştır
                var timeAndType = parts[0]; // "[2026-01-29 12:34:56] OLUŞTURULDU" veya "YÜKLENDI (BAŞARILI)"
                var dateEnd = timeAndType.IndexOf("]");
                var dateStr = timeAndType.Substring(1, dateEnd - 1);
                var typeStr = timeAndType.Substring(dateEnd + 2).Split("(")[0].Trim();

                // Dosya ID'sini al
                var dosyaId = ExtractValue(parts[1]);
                
                // Kullanıcı ID'sini al
                var kullaniciIdStr = ExtractValue(parts[2]);
                int.TryParse(kullaniciIdStr, out int kullaniciId);
                
                // Banka adını al
                var bankaAdi = ExtractValue(parts[3]);
                
                // Şifreyi al
                var sifre = ExtractValue(parts[4]);
                
                // Temp path'i al
                var tempPath = ExtractValue(parts[5]);

                DateTime.TryParse(dateStr, out var tarih);

                return new FileLogEntry
                {
                    DosyaId = dosyaId,
                    KullaniciId = kullaniciId,
                    BankaAdi = bankaAdi,
                    Sifre = sifre,
                    TempFilePath = tempPath,
                    IslemTarihi = tarih,
                    IslemTipi = typeStr,
                    Basarili = !typeStr.Contains("BAŞARISIZ")
                };
            }
            catch
            {
                return null;
            }
        }

        private string ExtractValue(string part)
        {
            var colonIndex = part.IndexOf(":");
            if (colonIndex >= 0)
                return part.Substring(colonIndex + 1).Trim();
            return part.Trim();
        }

        public async Task UpdateFilePassword(string dosyaId, string newPassword)
        {
            try
            {
                if (!File.Exists(_logFilePath))
                    return;

                lock (_logLock)
                {
                    var lines = File.ReadAllLines(_logFilePath, Encoding.UTF8);
                    for (int i = 0; i < lines.Length; i++)
                    {
                        if (lines[i].Contains($"DosyaID: {dosyaId}"))
                        {
                            // Şifreyi güncelle
                            var originalSifre = ExtractValue(lines[i].Split("Sifre:")[1].Split("|")[0]);
                            lines[i] = lines[i].Replace($"Sifre: {originalSifre}", $"Sifre: {newPassword} [GÜNCELLENDİ]");
                        }
                    }

                    File.WriteAllLines(_logFilePath, lines, Encoding.UTF8);
                }

                // Update log'u da ekle
                var updateEntry = $"[{DateTime.Now:yyyy-MM-dd HH:mm:ss}] ŞİFRE GÜNCELLENDİ | DosyaID: {dosyaId} | YeniSifre: {newPassword}";
                File.AppendAllText(_logFilePath, updateEntry + Environment.NewLine, Encoding.UTF8);
            }
            catch (Exception ex)
            {
                Console.WriteLine($"Şifre güncelleme hatası: {ex.Message}");
            }
        }
    }
}
