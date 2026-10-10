using mgtest.Models;

namespace mgtest.Services
{
    public interface IBankaDonusturucuService
    {
        Task<DosyaSemaSonuc> SemaAnalizEtAsync(Stream fileStream);
        Task<BankaDonusturSonuc> DonusturAsync(int adminKullaniciId, Stream fileStream, BankaDonusturmeAyarlari ayarlar);
    }
}
