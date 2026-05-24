using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace mgtest.Models
{
    // Kullanýcý türü enum
    public enum KullaniciTuru
    {
        user,
        admin,
        kisitliUser
    }

    // Kullanýcý bilgileri - Server DB'de
    public class Kullanici
    {
        [Key]
        public int Id { get; set; }

        [Required(ErrorMessage = "Kullanýcý adý zorunludur")]
        [StringLength(50)]
        public string KullaniciAdi { get; set; } = string.Empty;

        [Required(ErrorMessage = "Þifre zorunludur")]
        [StringLength(255)]
        public string Sifre { get; set; } = string.Empty; // Hash'lenmiþ

        [Required]
        [StringLength(100)]
        public string Ad { get; set; } = string.Empty;

        [Required]
        [StringLength(100)]
        public string Soyad { get; set; } = string.Empty;

        [Required]
        [EmailAddress]
        [StringLength(255)]
        public string Email { get; set; } = string.Empty;

        public DateTime KayitTarihi { get; set; } = DateTime.Now;

        public DateTime SonKullanmaTarihi { get; set; } = DateTime.Now.AddMonths(1);

        public bool AktifMi { get; set; } = true;

        [Required]
        [StringLength(100)]
        public string VeriTabanSifresi { get; set; } = string.Empty; // KullaniciAdi + rastgele sayi

        [Required]
        public KullaniciTuru KullaniciTuru { get; set; } = KullaniciTuru.kisitliUser;

        // Kullanýcýnýn oluþturduðu soru bankalarý
        public virtual ICollection<KullaniciBankasi> SoruBankalari { get; set; } = new List<KullaniciBankasi>();

        // Kullanýcýnýn ders çalýþmalarý
        public virtual ICollection<UserDers> UserDersleri { get; set; } = new List<UserDers>();

        // Kullanýcýnýn konu çalýþmalarý
        public virtual ICollection<UserKonu> UserKonulari { get; set; } = new List<UserKonu>();

        // Kullanýcýnýn kazaným çalýþmalarý
        public virtual ICollection<UserKazanim> UserKazanimlari { get; set; } = new List<UserKazanim>();

        // Üretilen dosyalar
        public virtual ICollection<UserUretim> UserUretimleri { get; set; } = new List<UserUretim>();
    }

    // Kullanýcý - Ders iliþkisi
    public class UserDers
    {
        [Key]
        public int Id { get; set; }

        [Required]
        public int KullaniciId { get; set; }

        [ForeignKey("KullaniciId")]
        public virtual Kullanici Kullanici { get; set; } = null!;

        [Required]
        [StringLength(255)]
        public string Ders { get; set; } = string.Empty;

        public DateTime? EklemeTarihi { get; set; } = DateTime.Now;
    }

    // Kullanýcý - Konu iliþkisi
    public class UserKonu
    {
        [Key]
        public int Id { get; set; }

        [Required]
        public int KullaniciId { get; set; }

        [ForeignKey("KullaniciId")]
        public virtual Kullanici Kullanici { get; set; } = null!;

        [Required]
        public int DersId { get; set; }

        [Required]
        [StringLength(255)]
        public string Konu { get; set; } = string.Empty;

        public DateTime EklemeTarihi { get; set; } = DateTime.Now;
    }

    // Kullanýcý - Kazaným iliþkisi
    public class UserKazanim
    {
        [Key]
        public int Id { get; set; }

        [Required]
        public int KullaniciId { get; set; }

        [ForeignKey("KullaniciId")]
        public virtual Kullanici Kullanici { get; set; } = null!;

        [Required]
        public int DersId { get; set; }

        [Required]
        public int KonuId { get; set; }

        [Required]
        [StringLength(255)]
        public string Kazanim { get; set; } = string.Empty;

        public DateTime EklemeTarihi { get; set; } = DateTime.Now;
    }

    // Üretilen dosyalar (Word, PDF, vb.)
    public class UserUretim
    {
        [Key]
        public int Id { get; set; }

        [Required]
        public int KullaniciId { get; set; }

        [ForeignKey("KullaniciId")]
        public virtual Kullanici Kullanici { get; set; } = null!;

        [Required]
        [StringLength(100)]
        public string UretilenDosyaTuru { get; set; } = string.Empty; // Word, PDF, vb.

        public DateTime UretimTarihi { get; set; } = DateTime.Now;

        [Required]
        [StringLength(500)]
        public string Anahtar { get; set; } = string.Empty; // Soru seçimi anahtar
    }

    // Kullanýcýnýn soru bankasý kayýtlarý - Server DB'de
    public class KullaniciBankasi
    {
        [Key]
        public int Id { get; set; }

        [Required]
        public int KullaniciId { get; set; }

        [ForeignKey("KullaniciId")]
        public virtual Kullanici Kullanici { get; set; } = null!;

        [Required]
        [StringLength(255)]
        public string BankaAdi { get; set; } = string.Empty;

        // Dosya benzersiz tanýmlayýcý (GUID)
        [Required]
        [StringLength(100)]
        public string DosyaId { get; set; } = Guid.NewGuid().ToString();

        public DateTime OlusturmaTarihi { get; set; } = DateTime.Now;

        public DateTime? SonDuzenleme { get; set; }

        // Dosya özet bilgileri
        public int ToplamSoruSayisi { get; set; } = 0;

        [StringLength(500)]
        public string? Aciklama { get; set; }
    }
}