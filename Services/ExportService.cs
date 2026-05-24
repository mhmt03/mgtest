using DocumentFormat.OpenXml;
using DocumentFormat.OpenXml.Packaging;
using mgtest.Data;
using mgtest.Models;
using iTextSharp.text;
using iTextSharp.text.pdf;

// OpenXML için alias'lar
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
        Task<byte[]> ExportToPdf(List<Soru> sorular, ExportOptions options);
        Task<byte[]> ExportToDocx(List<Soru> sorular, ExportOptions options);
    }

    public class ExportOptions
    {
        public int SutunSayisi { get; set; } = 2;
        public string? HeaderMetni { get; set; }
        public string? FooterMetni { get; set; }
        public bool AnahtarEkle { get; set; } = true;
    }

    public class ExportService : IExportService
    {
        // PDF Export
        public async Task<byte[]> ExportToPdf(List<Soru> sorular, ExportOptions options)
        {
            return await Task.Run(() =>
            {
                using var ms = new MemoryStream();
                var document = new Document(PageSize.A4, 36, 36, 50, 50);
                var writer = PdfWriter.GetInstance(document, ms);

                writer.PageEvent = new PdfHeaderFooter
                {
                    HeaderText = options.HeaderMetni,
                    FooterText = options.FooterMetni
                };

                document.Open();

                var titleFont = FontFactory.GetFont(FontFactory.HELVETICA_BOLD, 16);
                var title = new Paragraph("SORU BANKASI", titleFont)
                {
                    Alignment = Element.ALIGN_CENTER,
                    SpacingAfter = 20 
                };
                document.Add(title);

                var normalFont = FontFactory.GetFont(FontFactory.HELVETICA, 10);
                var boldFont = FontFactory.GetFont(FontFactory.HELVETICA_BOLD, 10);

                int soruNo = 1;
                foreach (var soru in sorular)
                {
                    var soruPara = new Paragraph();
                    soruPara.Add(new Chunk($"{soruNo}. ", boldFont));
                    soruPara.Add(new Chunk(soru.SoruMetni, normalFont));
                    soruPara.SpacingAfter = 5;
                    document.Add(soruPara);

                    if (!string.IsNullOrEmpty(soru.SoruResmi))
                    {
                        try
                        {
                            var imageBytes = Convert.FromBase64String(soru.SoruResmi);
                            var image = Image.GetInstance(imageBytes);
                            image.ScaleToFit(200f, 200f);
                            image.SpacingBefore = 5;
                            image.SpacingAfter = 10;
                            document.Add(image);
                        }
                        catch { }
                    }

                    if (!string.IsNullOrEmpty(soru.Konu.KonuAdi))
                    {
                        var konuPara = new Paragraph($"Konu: {soru.Konu}", normalFont);
                        konuPara.SpacingAfter = 5;
                        document.Add(konuPara);
                    }

                    document.Add(new Paragraph(" "));
                    soruNo++;
                }

                if (options.AnahtarEkle && sorular.Any())
                {
                    document.NewPage();
                    var anahtarTitle = new Paragraph("CEVAP ANAHTARI", titleFont)
                    {
                        Alignment = Element.ALIGN_CENTER,
                        SpacingAfter = 20
                    };
                    document.Add(anahtarTitle);

                    var table = new PdfPTable(5) { WidthPercentage = 100 };

                    for (int i = 0; i < sorular.Count; i++)
                    {
                        var cell = new PdfPCell(new Phrase($"{i + 1}: {sorular[i].DogruCevapSikki}", normalFont))
                        {
                            HorizontalAlignment = Element.ALIGN_CENTER,
                            Padding = 5
                        };
                        table.AddCell(cell);
                    }

                    document.Add(table);
                }

                document.Close();
                return ms.ToArray();
            });
        }

        // DOCX Export
        public async Task<byte[]> ExportToDocx(List<Soru> sorular, ExportOptions options)
        {
            return await Task.Run(() =>
            {
                using var ms = new MemoryStream();
                using var wordDoc = WordprocessingDocument.Create(ms, WordprocessingDocumentType.Document);

                var mainPart = wordDoc.AddMainDocumentPart();
                mainPart.Document = new WordDocument();
                var body = mainPart.Document.AppendChild(new WordBody());

                if (!string.IsNullOrEmpty(options.HeaderMetni))
                {
                    var headerPara = body.AppendChild(new WordParagraph());
                    var headerRun = headerPara.AppendChild(new WordRun());
                    headerRun.AppendChild(new WordText(options.HeaderMetni));
                    ApplyParagraphStyle(headerPara, true, 14);
                }

                var titlePara = body.AppendChild(new WordParagraph());
                var titleRun = titlePara.AppendChild(new WordRun());
                titleRun.AppendChild(new WordText("SORU BANKASI"));
                ApplyParagraphStyle(titlePara, true, 16, true);

                int soruNo = 1;
                foreach (var soru in sorular)
                {
                    var soruPara = body.AppendChild(new WordParagraph());
                    var soruRun = soruPara.AppendChild(new WordRun());
                    soruRun.AppendChild(new WordText($"{soruNo}. {soru.SoruMetni}"));
                    ApplyParagraphStyle(soruPara, false, 11);

                    if (!string.IsNullOrEmpty(soru.Ders.DersAdi ) || !string.IsNullOrEmpty(soru.Konu.KonuAdi))
                    {
                        var infoPara = body.AppendChild(new WordParagraph());
                        var infoRun = infoPara.AppendChild(new WordRun());
                        var info = $"Ders: {soru.Ders.DersAdi}";
                        if (!string.IsNullOrEmpty(soru.Konu.KonuAdi))
                            info += $" | Konu: {soru.Konu}";
                        infoRun.AppendChild(new WordText(info));
                        ApplyParagraphStyle(infoPara, false, 9);
                    }

                    body.AppendChild(new WordParagraph());
                    soruNo++;
                }

                if (options.AnahtarEkle && sorular.Any())
                {
                    body.AppendChild(new WordParagraph(new WordRun(new WordBreak { Type = WordBreakValues.Page })));

                    var anahtarTitle = body.AppendChild(new WordParagraph());
                    var anahtarRun = anahtarTitle.AppendChild(new WordRun());
                    anahtarRun.AppendChild(new WordText("CEVAP ANAHTARI"));
                    ApplyParagraphStyle(anahtarTitle, true, 16, true);

                    for (int i = 0; i < sorular.Count; i++)
                    {
                        var cevapPara = body.AppendChild(new WordParagraph());
                        var cevapRun = cevapPara.AppendChild(new WordRun());
                        cevapRun.AppendChild(new WordText($"{i + 1}. {sorular[i].DogruCevapSikki}"));
                        ApplyParagraphStyle(cevapPara, false, 11);
                    }
                }

                if (!string.IsNullOrEmpty(options.FooterMetni))
                {
                    var footerPara = body.AppendChild(new WordParagraph());
                    var footerRun = footerPara.AppendChild(new WordRun());
                    footerRun.AppendChild(new WordText(options.FooterMetni));
                    ApplyParagraphStyle(footerPara, false, 10);
                }

                mainPart.Document.Save();
                wordDoc.Clone();

                return ms.ToArray();
            });
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
    }

    public class PdfHeaderFooter : PdfPageEventHelper
    {
        public string? HeaderText { get; set; }
        public string? FooterText { get; set; }

        public override void OnEndPage(PdfWriter writer, Document document)
        {
            var font = FontFactory.GetFont(FontFactory.HELVETICA, 8);

            if (!string.IsNullOrEmpty(HeaderText))
            {
                var headerTable = new PdfPTable(1) { TotalWidth = document.PageSize.Width - 72 };
                var headerCell = new PdfPCell(new Phrase(HeaderText, font))
                {
                    Border = 0,
                    HorizontalAlignment = Element.ALIGN_CENTER
                };
                headerTable.AddCell(headerCell);
                headerTable.WriteSelectedRows(0, -1, 36, document.PageSize.Height - 20, writer.DirectContent);
            }

            if (!string.IsNullOrEmpty(FooterText))
            {
                var footerTable = new PdfPTable(1) { TotalWidth = document.PageSize.Width - 72 };
                var footerCell = new PdfPCell(new Phrase($"{FooterText} - Sayfa {writer.PageNumber}", font))
                {
                    Border = 0,
                    HorizontalAlignment = Element.ALIGN_CENTER
                };
                footerTable.AddCell(footerCell);
                footerTable.WriteSelectedRows(0, -1, 36, 30, writer.DirectContent);
            }
        }
    }
}