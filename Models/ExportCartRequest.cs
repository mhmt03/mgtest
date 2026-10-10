namespace mgtest.Models
{
    public class ExportCartRequest
    {
        public List<mgtest.Models.Soru> Sorular { get; set; } = new List<mgtest.Models.Soru>();
        public string Type { get; set; } = "docx";
        public int SutunSayisi { get; set; } = 2;
        public string? Baslik { get; set; }
        public bool AnahtarEkle { get; set; } = true;
        public bool DetayliCevapAnahtari { get; set; } = false;
        public bool GosterOgrenciBilgi { get; set; } = true;
        public bool GosterSayfaNo { get; set; } = true;
        public bool GosterUstAltBilgi { get; set; } = true;
    }
}
