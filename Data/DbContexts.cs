using Microsoft.EntityFrameworkCore;
using mgtest.Models;

namespace mgtest.Data
{
    // Server veritabaný context
    public class ServerDbContext : DbContext
    {
        public ServerDbContext(DbContextOptions<ServerDbContext> options) : base(options)
        {
        }

        public DbSet<Kullanici> Kullanicilar { get; set; }
        public DbSet<KullaniciBankasi> KullaniciBankalari { get; set; }
        public DbSet<UserDers> UserDersleri { get; set; }
        public DbSet<UserKonu> UserKonulari { get; set; }
        public DbSet<UserKazanim> UserKazanimlari { get; set; }
        public DbSet<UserUretim> UserUretimleri { get; set; }

        public DbSet<Ders> Dersler { get; set; }
        public DbSet<Konu> Konular { get; set; }
        public DbSet<Kazanim> Kazanimlar { get; set; }

        protected override void OnModelCreating(ModelBuilder modelBuilder)
        {
            base.OnModelCreating(modelBuilder);

            // Ýliþkiler
            modelBuilder.Entity<KullaniciBankasi>()
                .HasOne(kb => kb.Kullanici)
                .WithMany(k => k.SoruBankalari)
                .HasForeignKey(kb => kb.KullaniciId)
                .OnDelete(DeleteBehavior.Cascade);

            modelBuilder.Entity<UserDers>()
                .HasOne(ud => ud.Kullanici)
                .WithMany(k => k.UserDersleri)
                .HasForeignKey(ud => ud.KullaniciId)
                .OnDelete(DeleteBehavior.Cascade);

            modelBuilder.Entity<UserKonu>()
                .HasOne(uk => uk.Kullanici)
                .WithMany(k => k.UserKonulari)
                .HasForeignKey(uk => uk.KullaniciId)
                .OnDelete(DeleteBehavior.Cascade);

            modelBuilder.Entity<UserKazanim>()
                .HasOne(ukz => ukz.Kullanici)
                .WithMany(k => k.UserKazanimlari)
                .HasForeignKey(ukz => ukz.KullaniciId)
                .OnDelete(DeleteBehavior.Cascade);

            modelBuilder.Entity<UserUretim>()
                .HasOne(uu => uu.Kullanici)
                .WithMany(k => k.UserUretimleri)
                .HasForeignKey(uu => uu.KullaniciId)
                .OnDelete(DeleteBehavior.Cascade);

            // Index'ler
            modelBuilder.Entity<Kullanici>()
                .HasIndex(k => k.KullaniciAdi)
                .IsUnique();

            modelBuilder.Entity<Kullanici>()
                .HasIndex(k => k.Email)
                .IsUnique();

            modelBuilder.Entity<KullaniciBankasi>()
                .HasIndex(kb => kb.DosyaId)
                .IsUnique();

            modelBuilder.Entity<Kullanici>()
                .Property(k => k.KullaniciTuru)
                .HasConversion<string>();
        }
    }

    // SQLite (.mg dosyasý) context
    public class mgtestDbContext : DbContext
    {
        public mgtestDbContext(DbContextOptions<mgtestDbContext> options) : base(options)
        {
        }

        public DbSet<DosyaMetadata> DosyaMetadata { get; set; }
        public DbSet<Ders> Dersler { get; set; }
        public DbSet<Konu> Konular { get; set; }
        public DbSet<Kazanim> Kazanimlar { get; set; }
        public DbSet<Soru> Sorular { get; set; }
        public DbSet<BankaAyarlari> BankaAyarlari { get; set; }

        protected override void OnModelCreating(ModelBuilder modelBuilder)
        {
            base.OnModelCreating(modelBuilder);

            // Foreign keys
            modelBuilder.Entity<Konu>()
                .HasOne(k => k.Ders)
                .WithMany()
                .HasForeignKey(k => k.DersId)
                .OnDelete(DeleteBehavior.Restrict);

            modelBuilder.Entity<Kazanim>()
                .HasOne(k => k.Konu)
                .WithMany()
                .HasForeignKey(k => k.KonuId)
                .OnDelete(DeleteBehavior.Restrict);

            modelBuilder.Entity<Soru>()
                .HasOne(s => s.Ders)
                .WithMany()
                .HasForeignKey(s => s.DersId)
                .OnDelete(DeleteBehavior.Restrict);

            modelBuilder.Entity<Soru>()
                .HasOne(s => s.Konu)
                .WithMany()
                .HasForeignKey(s => s.KonuId)
                .OnDelete(DeleteBehavior.Restrict);

            modelBuilder.Entity<Soru>()
                .HasOne(s => s.Kazanim)
                .WithMany()
                .HasForeignKey(s => s.KazanimId)
                .OnDelete(DeleteBehavior.Restrict);

            // Index'ler
            modelBuilder.Entity<Soru>()
                .HasIndex(s => s.Sira);

            modelBuilder.Entity<Soru>()
                .HasIndex(s => s.DersId);

            modelBuilder.Entity<Soru>()
                .HasIndex(s => s.KonuId);

            // Enum conversion
            modelBuilder.Entity<Soru>()
                .Property(s => s.ZorlukSeviye)
                .HasConversion<string>();
        }
    }
}