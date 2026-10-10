namespace mgtest.Models
{
    public class BankaDonusturmeAyarlari
    {
        public string BankaAdi { get; set; } = "DonusturulenBanka";

        // Tablo İsimleri
        public string SoruTabloAdi { get; set; } = "SORULAR";
        public string? KonuTabloAdi { get; set; } = "KONULAR";

        // Soru Alanları
        public string SoruMetniVeyaResmiKolon { get; set; } = "Soru";
        public string? DogruCevapKolon { get; set; } = "DogruCevap";
        public string? ZorlukKolon { get; set; } = "ZorlukDerecesi";

        // Şık Alanları (Ayrı kolonlar halindeyse)
        public string? SikAKolon { get; set; } = "Seçenek_1";
        public string? SikBKolon { get; set; } = "Seçenek_2";
        public string? SikCKolon { get; set; } = "Seçenek_3";
        public string? SikDKolon { get; set; } = "Seçenek_4";
        public string? SikEKolon { get; set; } = "Seçenek_5";

        // Konu & Ders Eşleşmesi
        public string? SoruKonuKolon { get; set; } = "Konu"; // SORULAR tablosundaki konu ID/kodu kolonu
        public string? KonuTabloIdKolon { get; set; } = "konuNo"; // KONULAR tablosundaki eşleşen ID/kodu kolonu
        public string? KonuTabloAdiKolon { get; set; } = "konuAdi"; // KONULAR tablosundaki konu adı kolonu
        public string? VarsayilanDersAdi { get; set; } = "Genel";
    }

    public class BankaDonusturSonuc
    {
        public bool Basarili { get; set; }
        public string Mesaj { get; set; } = string.Empty;
        public string? DosyaAdi { get; set; }
        public string? DosyaId { get; set; }
        public int ToplamSoruSayisi { get; set; }
        public int DonusturulenSoruSayisi { get; set; }
        public string? DownloadUrl { get; set; }
        public List<string> UyariListesi { get; set; } = new List<string>();
    }

    public class TabloSemaBilgisi
    {
        public string TabloAdi { get; set; } = string.Empty;
        public int SatirSayisi { get; set; }
        public List<string> Kolonlar { get; set; } = new List<string>();
    }

    public class DosyaSemaSonuc
    {
        public bool Basarili { get; set; }
        public string? Mesaj { get; set; }
        public List<TabloSemaBilgisi> Tablolar { get; set; } = new List<TabloSemaBilgisi>();
    }
}
