using DocumentFormat.OpenXml;
using DocumentFormat.OpenXml.Packaging;
using DocumentFormat.OpenXml.Wordprocessing;
using SixLabors.ImageSharp;
using mgtest.Data;
using mgtest.Models;

using A = DocumentFormat.OpenXml.Drawing;
using DW = DocumentFormat.OpenXml.Drawing.Wordprocessing;
using PIC = DocumentFormat.OpenXml.Drawing.Pictures;

// Alias'lar – System.Drawing ile isim çakışmasını önlemek için
using WordParagraph = DocumentFormat.OpenXml.Wordprocessing.Paragraph;
using WordDocument = DocumentFormat.OpenXml.Wordprocessing.Document;
using WordBody = DocumentFormat.OpenXml.Wordprocessing.Body;
using WordRun = DocumentFormat.OpenXml.Wordprocessing.Run;
using WordText = DocumentFormat.OpenXml.Wordprocessing.Text;
using WordParagraphProperties = DocumentFormat.OpenXml.Wordprocessing.ParagraphProperties;
using WordRunProperties = DocumentFormat.OpenXml.Wordprocessing.RunProperties;
using WordJustification = DocumentFormat.OpenXml.Wordprocessing.Justification;
using WordJustificationValues = DocumentFormat.OpenXml.Wordprocessing.JustificationValues;
using WordFontSize = DocumentFormat.OpenXml.Wordprocessing.FontSize;
using WordBold = DocumentFormat.OpenXml.Wordprocessing.Bold;
using WordBreak = DocumentFormat.OpenXml.Wordprocessing.Break;
using WordBreakValues = DocumentFormat.OpenXml.Wordprocessing.BreakValues;

namespace mgtest.Services
{
    public interface IExportService
    {
        Task<byte[]> ExportToDocx(List<Soru> sorular, ExportOptions options);
        // PDF ileride eklenecek
    }

    public class ExportOptions
    {
        /// <summary>
        /// wwwroot altındaki şablon dosyasının yolu.
        /// Örnek: "templates/sinav_2sutun.docx"
        /// Belirtilmezse veya dosya bulunamazsa basit varsayılan şablon kullanılır.
        /// </summary>
        public string? SablonDosyaYolu { get; set; }

        public string? HeaderMetni { get; set; }
        public string? FooterMetni { get; set; }
        public bool AnahtarEkle { get; set; } = true;
        public bool DetayliCevapAnahtari { get; set; } = false;
    }

    public class ExportService : IExportService
    {
        private readonly IWebHostEnvironment _env;

        public ExportService(IWebHostEnvironment env)
        {
            _env = env;
        }

        // ─── Ana metot ─────────────────────────────────────────────────────────────
        /// <summary>
        /// Çalışma mantığı:
        ///   1. Şablonu diskten TAZE oku (cache yok).
        ///   2. Şablonun body'sindeki ilk tabloyu bul.
        ///   3. O tablodaki mevcut satırları temizle.
        ///   4. Her soru için yeni bir <w:tr> ekle; her tr içinde tek <w:tc> var.
        ///   5. Sütun düzeni (1/2/3 sütun), sayfa geçişi tamamen Word'e bırakılır —
        ///      sectPr'deki <w:cols> şablonda zaten ayarlı olmalıdır.
        /// </summary>
        public async Task<byte[]> ExportToDocx(List<Soru> sorular, ExportOptions options)
        {
            // 1. Şablonu taze oku
            byte[] sablon = await SablonOkuAsync(options.SablonDosyaYolu);

            // 2. Belleğe al ve WordprocessingDocument olarak aç
            using var ms = new MemoryStream();
            ms.Write(sablon, 0, sablon.Length);
            ms.Position = 0;

            using var doc = WordprocessingDocument.Open(ms, isEditable: true);
            var mainPart = doc.MainDocumentPart!;
            var body = mainPart.Document.Body!;

            // 3. İlk tabloyu bul
            var soruTablosu = body.Elements<Table>().FirstOrDefault()
                ?? throw new InvalidOperationException("Şablon dosyasında tablo bulunamadı.");

            // 4. İçinde {sorular} yazan satırı bul (Case Insensitive)
            var sablonSatiri = soruTablosu.Elements<TableRow>()
                .FirstOrDefault(r => r.InnerText.IndexOf("{sorular}", StringComparison.OrdinalIgnoreCase) >= 0)
                ?? throw new InvalidOperationException($"Şablon tablosunda {{sorular}} etiketi bulunamadı. Lütfen şablonu kontrol edin. (Kullanılan şablon: {options.SablonDosyaYolu ?? "Varsayılan"})");

            // 5. {sorular} ın bulunduğu sütunun genişliğini bul (resim boyutlandırma için)
            var hucreler = sablonSatiri.Elements<TableCell>().ToList();
            int soruHucreIndex = hucreler.FindIndex(c => c.InnerText.IndexOf("{sorular}", StringComparison.OrdinalIgnoreCase) >= 0);
            if (soruHucreIndex == -1) soruHucreIndex = hucreler.Count - 1; // fallback

            int hucreDXA = HucreGenisligiHesapla(soruTablosu, soruHucreIndex);

            // 6. Her soru için yeni bir tablo oluşturup doldur
            // Bu sayede sorular bağımsız bloklar halinde Word'ün çoklu sütun akışına (2/3 sütun) katılır.
            // Tek bir büyük tablo yerine bağımsız tablolar olması, soruların sayfa bazında sütunlara düzgünce sarmasını sağlar.
            int soruNo = 1;
            OpenXmlElement sonEklenenEleman = soruTablosu;
            foreach (var soru in sorular)
            {
                var yeniTablo = (Table)soruTablosu.CloneNode(true);

                // Tablo kenarlıklarını görünmez yap
                TabloKenarliklariniGizle(yeniTablo);

                // {sorular} içermeyen diğer tüm boş/artık satırları temizle (5 boş satır sorununu çözer)
                var silinecekSatirlar = yeniTablo.Elements<TableRow>()
                    .Where(r => r.InnerText.IndexOf("{sorular}", StringComparison.OrdinalIgnoreCase) == -1)
                    .ToList();
                foreach (var sSatir in silinecekSatirlar)
                {
                    sSatir.Remove();
                }

                var yeniSatir = yeniTablo.Elements<TableRow>()
                    .FirstOrDefault(r => r.InnerText.IndexOf("{sorular}", StringComparison.OrdinalIgnoreCase) >= 0);

                if (yeniSatir != null)
                {
                    SoruSatiriniDoldur(mainPart, yeniSatir, soru, soruNo, hucreDXA);
                }

                // Dinamik olarak son eklenen elemanın ardına ekle
                sonEklenenEleman.InsertAfterSelf(yeniTablo);
                sonEklenenEleman = yeniTablo;
                soruNo++;
            }

            // Orijinal şablon tablosunu kaldır (çünkü kopyalarını ekledik)
            soruTablosu.Remove();

            // 7. Test Başlığı ({baslik}) Değiştirimi
            foreach (var text in body.Descendants<WordText>().ToList())
            {
                if (text.Text.IndexOf("{baslik}", StringComparison.OrdinalIgnoreCase) >= 0)
                {
                    text.Text = System.Text.RegularExpressions.Regex.Replace(
                        text.Text, 
                        "{baslik}", 
                        options.HeaderMetni ?? "", 
                        System.Text.RegularExpressions.RegexOptions.IgnoreCase);
                }
            }

            // 8. Cevap Anahtarı İşlemleri
            var anahtarTexts = body.Descendants<WordText>()
                .Where(t => t.Text.IndexOf("{anahtar}", StringComparison.OrdinalIgnoreCase) >= 0)
                .ToList();

            if (anahtarTexts.Any())
            {
                foreach (var text in anahtarTexts)
                {
                    var para = text.Ancestors<WordParagraph>().FirstOrDefault();
                    if (para != null)
                    {
                        if (options.AnahtarEkle && sorular.Any())
                        {
                            var b = new WordParagraph();
                            b.Append(new ParagraphProperties(new Justification { Val = JustificationValues.Center }));
                            var r1 = new WordRun();
                            r1.Append(RunOzellikleri(16, bold: true));
                            r1.Append(new WordText("CEVAP ANAHTARI"));
                            b.Append(r1);
                            para.InsertAfterSelf(b);

                            DocumentFormat.OpenXml.OpenXmlElement current = b;

                            if (options.DetayliCevapAnahtari)
                            {
                                for (int i = 0; i < sorular.Count; i++)
                                {
                                    var s = sorular[i];
                                    var p = new WordParagraph();
                                    var r2 = new WordRun();
                                    r2.Append(RunOzellikleri(11, bold: false));
                                    
                                    string info = $"{i + 1}. {s.DogruCevapSikki}";
                                    if (s.Ders != null && !string.IsNullOrEmpty(s.Ders.DersAdi)) info += $" | Ders: {s.Ders.DersAdi}";
                                    if (s.Konu != null && !string.IsNullOrEmpty(s.Konu.KonuAdi)) info += $" | Konu: {s.Konu.KonuAdi}";
                                    if (s.Kazanim != null && !string.IsNullOrEmpty(s.Kazanim.KazanimAdi)) info += $" | Kazanım: {s.Kazanim.KazanimAdi}";

                                    r2.Append(new WordText(info) { Space = SpaceProcessingModeValues.Preserve });
                                    p.Append(r2);
                                    current.InsertAfterSelf(p);
                                    current = p;
                                }
                            }
                            else
                            {
                                 var p = new WordParagraph();
                                 p.Append(new ParagraphProperties(new Justification { Val = JustificationValues.Center }));
                                 for (int i = 0; i < sorular.Count; i++)
                                 {
                                     var r2 = new WordRun();
                                     r2.Append(RunOzellikleri(11, bold: false));
                                     string textStr = $"{i + 1}. {sorular[i].DogruCevapSikki}";
                                     if (i < sorular.Count - 1)
                                     {
                                         textStr += "      "; // Yan yana boşluklu yazılması için spacer
                                     }
                                     r2.Append(new WordText(textStr) { Space = SpaceProcessingModeValues.Preserve });
                                     p.Append(r2);
                                 }
                                 b.InsertAfterSelf(p);
                            }
                        }
                        para.Remove(); // {anahtar} etiketini tamamen sil
                    }
                }
            }
            else
            {
                // {anahtar} etiketi yoksa, eski yöntemle sayfa sonuna ekle
                if (options.AnahtarEkle && sorular.Any())
                    AnahtarEkle(body, sorular, options.DetayliCevapAnahtari);
            }

            mainPart.Document.Save();
            doc.Dispose();
            return ms.ToArray();
        }

        // ─── Şablonu diskten taze oku ──────────────────────────────────────────────
        private async Task<byte[]> SablonOkuAsync(string? gorecliYol)
        {
            if (!string.IsNullOrWhiteSpace(gorecliYol))
            {
                // wwwroot'a göre tam yol oluştur
                var tamYol = Path.Combine(_env.WebRootPath, gorecliYol);
                if (File.Exists(tamYol))
                {
                    // Her seferinde diskten oku — hiç cache yok
                    return await File.ReadAllBytesAsync(tamYol);
                }
            }

            // Şablon bulunamazsa minimal in-memory şablon döndür
            return VarsayilanSablonOlustur();
        }

        private int HucreGenisligiHesapla(Table tablo, int index)
        {
            var grid = tablo.Elements<TableGrid>().FirstOrDefault();
            if (grid == null) return 9360; // A4 varsayılan

            var cols = grid.Elements<GridColumn>().ToList();
            if (index >= 0 && index < cols.Count)
            {
                if (int.TryParse(cols[index].Width?.Value, out int w))
                    return w;
            }

            int toplam = cols.Sum(gc => int.TryParse(gc.Width?.Value, out int w) ? w : 0);
            return toplam > 0 ? toplam : 9360;
        }

        // ─── Soru hücresi ──────────────────────────────────────────────────────────
        private void SoruSatiriniDoldur(
            MainDocumentPart mainPart,
            TableRow satir,
            Soru soru,
            int soruNo,
            int hucreDXA)
        {
            foreach (var hucre in satir.Elements<TableCell>())
            {
                if (hucre.InnerText.IndexOf("{no}", StringComparison.OrdinalIgnoreCase) >= 0)
                {
                    hucre.RemoveAllChildren<WordParagraph>();
                    var p = new WordParagraph();
                    var r = new WordRun();
                    r.Append(RunOzellikleri(11, bold: true));
                    r.Append(new WordText($"{soruNo}.") { Space = SpaceProcessingModeValues.Preserve });
                    p.Append(r);
                    hucre.Append(p);
                }

                if (hucre.InnerText.IndexOf("{sorular}", StringComparison.OrdinalIgnoreCase) >= 0)
                {
                    hucre.RemoveAllChildren<WordParagraph>();

                    // 1. Resim (Varsa)
                    if (!string.IsNullOrEmpty(soru.SoruResmi))
                    {
                        var resimPara = ResimParagrafiOlustur(mainPart, soru.SoruResmi, soruNo, hucreDXA);
                        if (resimPara != null)
                            hucre.Append(resimPara);
                    }

                    // 2. Metin (Varsa ve ayrı ise)
                    if (soru.SoruMetniAyriMi && !string.IsNullOrEmpty(soru.SoruMetni))
                    {
                        var metinPara = new WordParagraph();
                        var metinRun = new WordRun();
                        metinRun.Append(RunOzellikleri(11, bold: false));
                        metinRun.Append(new WordText(soru.SoruMetni) { Space = SpaceProcessingModeValues.Preserve });
                        metinPara.Append(metinRun);
                        hucre.Append(metinPara);
                    }

                    // 3. Şıklar (Varsa ve ayrı ise)
                    if (soru.SikkarAyriMi)
                    {
                        string[] harfler = { "A", "B", "C", "D", "E" };
                        string?[] resimler = { soru.ASikkiResmi, soru.BSikkiResmi, soru.CSikkiResmi, soru.DSikkiResmi, soru.ESikkiResmi };
                        string?[] metinler = { soru.ASikkiMetni, soru.BSikkiMetni, soru.CSikkiMetni, soru.DSikkiMetni, soru.ESikkiMetni };

                        for (int i = 0; i < harfler.Length; i++)
                        {
                            bool isCorrect = (soru.DogruCevapSikki == harfler[i]);
                            var sikPara = new WordParagraph();
                            var sikRun = new WordRun();

                            // Harf ekle (Örn: A) ) (kalın/bold olmasın)
                            sikRun.Append(RunOzellikleri(11, bold: false));
                            sikRun.Append(new WordText($"{harfler[i]}) ") { Space = SpaceProcessingModeValues.Preserve });
                            sikPara.Append(sikRun);

                            // Şıkkın resmi varsa
                            if (!string.IsNullOrEmpty(resimler[i]))
                            {
                                var sikResimPara = ResimParagrafiOlustur(mainPart, resimler[i]!, soruNo * 100 + i, hucreDXA);
                                if (sikResimPara != null)
                                {
                                    hucre.Append(sikPara); // Önce harfi ekle
                                    hucre.Append(sikResimPara); // Sonra resmi ekle
                                    continue;
                                }
                            }

                            // Şıkkın metni varsa
                            if (!string.IsNullOrEmpty(metinler[i]))
                            {
                                var secenekRun = new WordRun();
                                secenekRun.Append(RunOzellikleri(11, bold: false)); // Doğru şık olsa bile kalın olmasın
                                secenekRun.Append(new WordText(metinler[i]!) { Space = SpaceProcessingModeValues.Preserve });
                                sikPara.Append(secenekRun);
                            }

                            hucre.Append(sikPara);
                        }
                    }

                    // 4. Alt bilgi (Ders/Konu)
                    var bilgiler = new List<string>();
                    if (soru.Ders != null && !string.IsNullOrEmpty(soru.Ders.DersAdi)) bilgiler.Add($"Ders: {soru.Ders.DersAdi}");
                    if (soru.Konu != null && !string.IsNullOrEmpty(soru.Konu.KonuAdi)) bilgiler.Add($"Konu: {soru.Konu.KonuAdi}");

                    if (bilgiler.Any())
                    {
                        var infoPara = new WordParagraph();
                        infoPara.Append(new ParagraphProperties(new SpacingBetweenLines { Before = "40", After = "120" }));
                        var infoRun = new WordRun();
                        infoRun.Append(RunOzellikleri(8, bold: false, renk: "999999"));
                        infoRun.Append(new WordText(string.Join(" | ", bilgiler)) { Space = SpaceProcessingModeValues.Preserve });
                        infoPara.Append(infoRun);
                        hucre.Append(infoPara);
                    }

                    // Word hücresi (TableCell) en az bir paragrafa (Paragraph) sahip olmalıdır!
                    if (!hucre.Elements<WordParagraph>().Any())
                    {
                        hucre.Append(new WordParagraph(new WordRun(new WordText(""))));
                    }
                }
            }
        }

        private WordParagraph? ResimParagrafiOlustur(
            MainDocumentPart mainPart,
            string base64,
            int soruNo,
            int hucreDXA)
        {
            try
            {
                if (base64.Contains(","))
                {
                    base64 = base64.Substring(base64.IndexOf(",") + 1);
                }
                var imgBytes = Convert.FromBase64String(base64);
                var (cx, cy) = ResimEMUHesapla(imgBytes, hucreDXA);

                // ImagePart ekle
                var imgPart = mainPart.AddImagePart(ResimContentType(imgBytes));
                using (var imgStream = new MemoryStream(imgBytes))
                    imgPart.FeedData(imgStream);

                string rId   = mainPart.GetIdOfPart(imgPart);
                uint   imgId = (uint)mainPart.ImageParts.Count();
                string ad    = $"SoruResim_{soruNo}";

                var para = new WordParagraph();
                para.Append(new ParagraphProperties(
                    new SpacingBetweenLines { Before = "80", After = "80" }
                ));

                var run = new WordRun();

                var graphicData = new A.GraphicData(
                    new PIC.Picture(
                        new PIC.NonVisualPictureProperties(
                            new PIC.NonVisualDrawingProperties { Id = 0, Name = ad },
                            new PIC.NonVisualPictureDrawingProperties(
                                new A.PictureLocks { NoChangeAspect = true, NoChangeArrowheads = true })),
                        new PIC.BlipFill(
                            new A.Blip { Embed = rId },
                            new A.SourceRectangle(),
                            new A.Stretch(new A.FillRectangle())),
                        new PIC.ShapeProperties(
                            new A.Transform2D(
                                new A.Offset { X = 0, Y = 0 },
                                new A.Extents { Cx = cx, Cy = cy }),
                            new A.PresetGeometry(new A.AdjustValueList()) { Preset = A.ShapeTypeValues.Rectangle },
                            new A.NoFill(),
                            new A.Outline(new A.NoFill()))));
                graphicData.Uri = "http://schemas.openxmlformats.org/drawingml/2006/picture";

                var inline = new DW.Inline(
                    new DW.Extent { Cx = cx, Cy = cy },
                    new DW.EffectExtent { LeftEdge = 0, TopEdge = 0, RightEdge = 9525, BottomEdge = 9525 },
                    new DW.DocProperties { Id = imgId, Name = ad },
                    new DW.NonVisualGraphicFrameDrawingProperties(
                        new A.GraphicFrameLocks { NoChangeAspect = true }),
                    new A.Graphic(graphicData));
                inline.DistanceFromTop = 0;
                inline.DistanceFromBottom = 0;
                inline.DistanceFromLeft = 0;
                inline.DistanceFromRight = 0;

                run.Append(new Drawing(inline));
                para.Append(run);
                return para;
            }
            catch
            {
                return null; // resim işlenemezse sessizce atla
            }
        }

        // ─── Resim boyutu: orijinal DPI'a göre EMU, hücreye sığdır ───────────────
        private (long cx, long cy) ResimEMUHesapla(byte[] imgBytes, int hucreDXA)
        {
            // Hücrenin kullanılabilir genişliği (padding çıkarılmış)
            // 150+150 = 300 DXA padding; 1 DXA = 635 EMU
            const int paddingDXA = 300;
            long maxCx = (long)(hucreDXA - paddingDXA) * 635L;

            try
            {
                using var img = SixLabors.ImageSharp.Image.Load(imgBytes);
                // Gerçek boyut EMU cinsinden (DPI'a göre)
                double dpiX = img.Metadata.HorizontalResolution > 0 ? img.Metadata.HorizontalResolution : 96;
                double dpiY = img.Metadata.VerticalResolution > 0 ? img.Metadata.VerticalResolution : 96;
                long oCx = (long)(img.Width  / dpiX * 914400);
                long oCy = (long)(img.Height / dpiY * 914400);

                if (oCx <= maxCx)
                    return (oCx, oCy); // zaten sığıyor, küçültme

                double oran = (double)maxCx / oCx;
                return (maxCx, (long)(oCy * oran));
            }
            catch
            {
                // DPI okunamazsa: maxCx genişlik, 4:3 oran
                return (maxCx, (long)(maxCx * 0.75));
            }
        }

        private string ResimContentType(byte[] b) =>
            b.Length >= 2 && b[0] == 0xFF && b[1] == 0xD8 ? "image/jpeg" :
            b.Length >= 4 && b[0] == 0x89 && b[1] == 0x50 ? "image/png"  :
            b.Length >= 4 && b[0] == 0x47 && b[1] == 0x49 ? "image/gif"  :
            "image/png";

        // ─── Cevap anahtarı ────────────────────────────────────────────────────────
        private void AnahtarEkle(Body body, List<Soru> sorular, bool detayli)
        {
            // Sayfa sonu
            body.Append(new WordParagraph(
                new WordRun(new WordBreak { Type = WordBreakValues.Page })));

            // Başlık
            var baslik = new WordParagraph();
            baslik.Append(new ParagraphProperties(
                new Justification { Val = JustificationValues.Center }));
            var bRun = new WordRun();
            bRun.Append(RunOzellikleri(16, bold: true));
            bRun.Append(new WordText("CEVAP ANAHTARI"));
            baslik.Append(bRun);
            body.Append(baslik);

            if (detayli)
            {
                // Cevaplar (Alt alta ve detaylı)
                for (int i = 0; i < sorular.Count; i++)
                {
                    var s = sorular[i];
                    var p = new WordParagraph();
                    var r = new WordRun();
                    r.Append(RunOzellikleri(11, bold: false));
                    
                    string info = $"{i + 1}. {s.DogruCevapSikki}";
                    if (s.Ders != null && !string.IsNullOrEmpty(s.Ders.DersAdi)) info += $" | Ders: {s.Ders.DersAdi}";
                    if (s.Konu != null && !string.IsNullOrEmpty(s.Konu.KonuAdi)) info += $" | Konu: {s.Konu.KonuAdi}";
                    if (s.Kazanim != null && !string.IsNullOrEmpty(s.Kazanim.KazanimAdi)) info += $" | Kazanım: {s.Kazanim.KazanimAdi}";

                    r.Append(new WordText(info) { Space = SpaceProcessingModeValues.Preserve });
                    p.Append(r);
                    body.Append(p);
                }
            }
            else
            {
                // Cevaplar (Yan yana)
                var p = new WordParagraph();
                p.Append(new ParagraphProperties(new Justification { Val = JustificationValues.Center }));
                for (int i = 0; i < sorular.Count; i++)
                {
                    var r = new WordRun();
                    r.Append(RunOzellikleri(11, bold: false));
                    string textStr = $"{i + 1}. {sorular[i].DogruCevapSikki}";
                    if (i < sorular.Count - 1)
                    {
                        textStr += "      "; // Yan yana boşluklu yazılması için spacer
                    }
                    r.Append(new WordText(textStr) { Space = SpaceProcessingModeValues.Preserve });
                    p.Append(r);
                }
                body.Append(p);
            }
        }

        private void TabloKenarliklariniGizle(Table table)
        {
            var tblPr = table.Elements<TableProperties>().FirstOrDefault();
            if (tblPr == null)
            {
                tblPr = new TableProperties();
                table.PrependChild(tblPr);
            }

            var borders = tblPr.Elements<TableBorders>().FirstOrDefault();
            if (borders != null)
            {
                borders.Remove();
            }

            tblPr.AppendChild(new TableBorders(
                new TopBorder { Val = BorderValues.None },
                new LeftBorder { Val = BorderValues.None },
                new BottomBorder { Val = BorderValues.None },
                new RightBorder { Val = BorderValues.None },
                new InsideHorizontalBorder { Val = BorderValues.None },
                new InsideVerticalBorder { Val = BorderValues.None }
            ));
        }

        // ─── Stil yardımcıları ─────────────────────────────────────────────────────
        private RunProperties RunOzellikleri(int punto, bool bold, string? renk = null)
        {
            var rp = new RunProperties();
            rp.Append(new RunFonts { Ascii = "Arial", HighAnsi = "Arial", ComplexScript = "Arial" });
            rp.Append(new FontSize           { Val = (punto * 2).ToString() });
            rp.Append(new FontSizeComplexScript { Val = (punto * 2).ToString() });
            if (bold)  rp.Append(new WordBold());
            if (renk != null) rp.Append(new DocumentFormat.OpenXml.Wordprocessing.Color { Val = renk });
            return rp;
        }

        private void ApplyParagraphStyle(WordParagraph para, bool bold, int fontSize, bool centered = false)
        {
            var props = para.GetFirstChild<WordParagraphProperties>();
            if (props == null)
            {
                props = new WordParagraphProperties();
                para.InsertAt(props, 0);
            }

            if (centered)
            {
                props.Justification = new WordJustification { Val = WordJustificationValues.Center };
            }

            foreach (var run in para.Elements<WordRun>())
            {
                var runProps = run.GetFirstChild<WordRunProperties>();
                if (runProps == null)
                {
                    runProps = new WordRunProperties();
                    run.InsertAt(runProps, 0);
                }

                runProps.FontSize = new WordFontSize { Val = (fontSize * 2).ToString() };

                if (bold)
                {
                    runProps.Bold = new WordBold();
                }
            }
        }

        // ─── Varsayılan minimal şablon ─────────────────────────────────────────────
        /// <summary>
        /// Şablon dosyası bulunamazsa kullanılan in-memory şablon.
        /// sectPr'de <w:cols w:num="2"/> ile 2 sütunlu sayfa düzeni kurulur.
        /// Üretim ortamında bu şablonu wwwroot/templates/ altına koyun ve
        /// SablonDosyaYolu ile belirtin.
        /// </summary>
        private byte[] VarsayilanSablonOlustur()
        {
            using var ms = new MemoryStream();
            using var doc = WordprocessingDocument.Create(ms, WordprocessingDocumentType.Document);
            var mainPart = doc.AddMainDocumentPart();
            mainPart.Document = new Document();
            var body = mainPart.Document.AppendChild(new Body());

            // Tek sütunlu tablo — sayfa düzeni (kaç sütun) sectPr'de
            var tablo = new Table(
                new TableProperties(
                    new TableWidth { Width = "9360", Type = TableWidthUnitValues.Dxa },
                    new TableLayout { Type = TableLayoutValues.Fixed },
                    new TableBorders(
                        new TopBorder    { Val = BorderValues.None },
                        new LeftBorder   { Val = BorderValues.None },
                        new BottomBorder { Val = BorderValues.None },
                        new RightBorder  { Val = BorderValues.None },
                        new InsideHorizontalBorder { Val = BorderValues.None },
                        new InsideVerticalBorder   { Val = BorderValues.None }
                    )
                ),
                new TableGrid(new GridColumn { Width = "9360" })
            );
            body.Append(tablo);

            // sectPr: A4, 1" kenar boşluğu, 2 sütun
            body.Append(new SectionProperties(
                new PageSize   { Width = 12240, Height = 15840 },
                new PageMargin { Top = 1440, Right = 1440, Bottom = 1440, Left = 1440, Header = 720, Footer = 720, Gutter = 0 },
                new Columns    { ColumnCount = 2, Space = "708" }   // ← Word bunu halleder
            ));

            mainPart.Document.Save();
            doc.Dispose();
            return ms.ToArray();
        }
    }
}
