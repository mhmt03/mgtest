using System.Security.Cryptography;
using System.Text;

namespace mgtest.Services
{
    public interface IEncryptionService
    {
        string GenerateKey(int kullaniciId);
        string GenerateKeyFromPassword(string password);
        byte[] Encrypt(byte[] data, string key);
        byte[] Decrypt(byte[] data, string key);
        string HashPassword(string password);
        bool VerifyPassword(string password, string hash);
        string ComputeFileHash(byte[] data);
        string EncryptString(string text, string key);
        string DecryptString(string encryptedText, string key);
    }

    public class EncryptionService : IEncryptionService
    {
        private readonly string _salt;

        public EncryptionService(IConfiguration configuration)
        {
            _salt = configuration["AppSettings:EncryptionSalt"] ?? throw new ArgumentNullException("EncryptionSalt");
        }

        // Kullanýcýya özel þifreleme anahtarý oluþtur
        public string GenerateKey(int kullaniciId)
        {
            var combined = $"{kullaniciId}_{_salt}";
            using var sha256 = SHA256.Create();
            var hashBytes = sha256.ComputeHash(Encoding.UTF8.GetBytes(combined));
            return Convert.ToBase64String(hashBytes);
        }

        // Kullanýcý þifresinden þifreleme anahtarý oluþtur (VeriTabanSifresi için)
        public string GenerateKeyFromPassword(string password)
        {
            using var sha256 = SHA256.Create();
            var hashBytes = sha256.ComputeHash(Encoding.UTF8.GetBytes(password + _salt));
            return Convert.ToBase64String(hashBytes);
        }

        // Dosya þifreleme (AES)
        public byte[] Encrypt(byte[] data, string key)
        {
            using var aes = Aes.Create();
            var keyBytes = Convert.FromBase64String(key);
            Array.Resize(ref keyBytes, 32); // AES-256
            aes.Key = keyBytes;
            aes.GenerateIV();

            using var encryptor = aes.CreateEncryptor();
            using var ms = new MemoryStream();

            // IV'yi baþa yaz
            ms.Write(aes.IV, 0, aes.IV.Length);

            using (var cs = new CryptoStream(ms, encryptor, CryptoStreamMode.Write))
            {
                cs.Write(data, 0, data.Length);
            }

            return ms.ToArray();
        }

        // Dosya þifre çözme
        public byte[] Decrypt(byte[] data, string key)
        {
            using var aes = Aes.Create();
            var keyBytes = Convert.FromBase64String(key);
            Array.Resize(ref keyBytes, 32);
            aes.Key = keyBytes;

            // IV'yi oku
            var iv = new byte[16];
            Array.Copy(data, 0, iv, 0, 16);
            aes.IV = iv;

            using var decryptor = aes.CreateDecryptor();
            using var ms = new MemoryStream();
            using (var cs = new CryptoStream(ms, decryptor, CryptoStreamMode.Write))
            {
                cs.Write(data, 16, data.Length - 16);
            }

            return ms.ToArray();
        }

        // String þifreleme
        public string EncryptString(string text, string key)
        {
            var data = Encoding.UTF8.GetBytes(text);
            var encrypted = Encrypt(data, key);
            return Convert.ToBase64String(encrypted);
        }

        // String þifre çözme
        public string DecryptString(string encryptedText, string key)
        {
            var data = Convert.FromBase64String(encryptedText);
            var decrypted = Decrypt(data, key);
            return Encoding.UTF8.GetString(decrypted);
        }

        // Þifre hash'leme (BCrypt)
        public string HashPassword(string password)
        {
            return BCrypt.Net.BCrypt.HashPassword(password);
        }

        // Þifre doðrulama
        public bool VerifyPassword(string password, string hash)
        {
            return BCrypt.Net.BCrypt.Verify(password, hash);
        }

        // Dosya bütünlük kontrolü için hash
        public string ComputeFileHash(byte[] data)
        {
            using var sha256 = SHA256.Create();
            var hashBytes = sha256.ComputeHash(data);
            return Convert.ToBase64String(hashBytes);
        }
    }
}