using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace mgtest.Models
{
    // Zorluk seviyesi enum
    public enum ZorlukSeviye
    {
        cokKolay,
        kolay,
        orta,
        zor,
        cokZor
    }

    // .mg dosyasi icindeki tablolar

    // Dosya metadata - guvenlik icin
    public class DosyaMetadata
    {
        [Key]
        public int Id { get; set; }

        [Required]
        public string SifreliKullaniciId { get; set; } = string.Empty;

        [Required]
        public string DosyaId { get; set; } = string.Empty;

        [Required]
        public string BankaAdi { get; set; } = string.Empty;

        public DateTime OlusturmaTarihi { get; set; } = DateTime.Now;

        public DateTime SonDuzenleme { get; set; } = DateTime.Now;

        [Required]
        public string DosyaHash { get; set; } = string.Empty;
    }

    // Ders tablosu
    public class Ders
    {
        [Key]
        public int Id { get; set; }

        [StringLength(255)]
        public string? DersAdi { get; set; }

        public DateTime EklemeTarihi { get; set; } = DateTime.Now;
    }

    // Konu tablosu
    public class Konu
    {
        [Key]
        public int Id { get; set; }

        public int? DersId { get; set; }

        [ForeignKey("DersId")]
        public virtual Ders? Ders { get; set; }

        [Required]
        [StringLength(255)]
        public string KonuAdi { get; set; } = string.Empty;

        public DateTime EklemeTarihi { get; set; } = DateTime.Now;
    }

    // Kazanim tablosu
    public class Kazanim
    {
        [Key]
        public int Id { get; set; }

        public int? DersId { get; set; }

        [Required]
        public int KonuId { get; set; }

        [ForeignKey("KonuId")]
        public virtual Konu? Konu { get; set; }

        [Required]
        [StringLength(500)]
        public string KazanimAdi { get; set; } = string.Empty;

        public DateTime EklemeTarihi { get; set; } = DateTime.Now;
    }

    // Soru modeli - .mg dosyasinda
    public class Soru
    {
        public bool SoruMetniAyriMi { get; set; } = true;
        public bool SikkarAyriMi { get; set; }
        
        [Key]
        public int Id { get; set; }

        [StringLength(5000)]
        public string? SoruMetni { get; set; }

        // Base64 encoded resim
        [Column(TypeName = "TEXT")]
        public string? SoruResmi { get; set; }

        [Required]
        public ZorlukSeviye ZorlukSeviye { get; set; } = ZorlukSeviye.orta;

        public bool IsaretliMi { get; set; } = false;

        [Required]
        public int DersId { get; set; }

        [ForeignKey("DersId")]
        public virtual Ders? Ders { get; set; }

        [Required]
        public int KonuId { get; set; }

        [ForeignKey("KonuId")]
        public virtual Konu Konu { get; set; } = null!;

        [Required]
        public int KazanimId { get; set; }

        [ForeignKey("KazanimId")]
        public virtual Kazanim Kazanim { get; set; } = null!;

        [StringLength(500)]
        public string? DogruCevapMetni { get; set; }

        [StringLength(1)]
        public string? DogruCevapSikki { get; set; }

        // Siklar - Base64 encoded resimler
        [Column(TypeName = "TEXT")]
        public string? ASikkiResmi { get; set; }

        [Column(TypeName = "TEXT")]
        public string? BSikkiResmi { get; set; }

        [Column(TypeName = "TEXT")]
        public string? CSikkiResmi { get; set; }

        [Column(TypeName = "TEXT")]
        public string? DSikkiResmi { get; set; }

        [Column(TypeName = "TEXT")]
        public string? ESikkiResmi { get; set; }

        [Column(TypeName = "TEXT")]
        public string? FSikkiResmi { get; set; }

        // Siklar - Metinler
        [StringLength(500)]
        public string? ASikkiMetni { get; set; }

        [StringLength(500)]
        public string? BSikkiMetni { get; set; }

        [StringLength(500)]
        public string? CSikkiMetni { get; set; }

        [StringLength(500)]
        public string? DSikkiMetni { get; set; }

        [StringLength(500)]
        public string? ESikkiMetni { get; set; }

        [StringLength(500)]
        public string? FSikkiMetni { get; set; }

        public DateTime YuklenmeTarihi { get; set; } = DateTime.Now;

        // Siralama icin
        public int Sira { get; set; }

        [StringLength(1000)]
        public string? Notlar { get; set; }

        // Soru Ek Ozellikleri & Meta Verileri
        public DateTime? TarihOlusturma { get; set; } = DateTime.Now;

        public DateTime? TarihDuzenleme { get; set; }

        [StringLength(1000)]
        public string? Aciklama { get; set; }

        [StringLength(500)]
        public string? Kaynak { get; set; }

        [StringLength(500)]
        public string? Etiket { get; set; }

        [StringLength(1000)]
        public string? CozumLinki { get; set; }
    }

    // Soru Bankasi Ayarlari - .mg dosyasinda
    public class BankaAyarlari
    {
        [Key]
        public int Id { get; set; }

        [Required]
        [StringLength(255)]
        public string BankaAdi { get; set; } = string.Empty;

        [StringLength(1000)]
        public string? Aciklama { get; set; }

        public DateTime OlusturmaTarihi { get; set; } = DateTime.Now;

        public DateTime SonDuzenleme { get; set; } = DateTime.Now;

        // PDF/DOCX varsayilan ayarlari
        public int VarsayilanSutunSayisi { get; set; } = 2;

        [StringLength(500)]
        public string? VarsayilanHeader { get; set; }

        [StringLength(500)]
        public string? VarsayilanFooter { get; set; }

        public bool VarsayilanAnahtarEkle { get; set; } = true;
    }
}