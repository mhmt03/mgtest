/**
 * EXPORT İŞLEMLERİ MODÜLÜ
 * Gelişmiş PDF (Yerel Yazdırma) ve Word (Sunucu OpenXML) çıktıları için servis köprüsü.
 * Açıklamalar ve yorumlar eklenmiştir.
 */

// Sayfa yüklendiğinde modal nesnesini hazırla
let exportSettingsModalObj = null;

document.addEventListener('DOMContentLoaded', () => {
    const modalEl = document.getElementById('exportSettingsModal');
    if (modalEl) {
        exportSettingsModalObj = new bootstrap.Modal(modalEl);
    }

    // Toggle Optimization visibility
    const groupCountSelect = document.getElementById('exportGroupCount');
    const optContainer = document.getElementById('exportOptimizationContainer');
    if (groupCountSelect && optContainer) {
        groupCountSelect.addEventListener('change', () => {
            if (groupCountSelect.value === '1') {
                optContainer.classList.remove('d-none');
            } else {
                optContainer.classList.add('d-none');
            }
        });
        // Initial state
        if (groupCountSelect.value !== '1') optContainer.classList.add('d-none');
    }
});

/**
 * Seçili soruları checkbox'lardan filtreleyerek döner
 */
function getSeciliSorular() {
    const checkboxes = document.querySelectorAll('.soru-sec:checked');
    const indices = Array.from(checkboxes).map(cb => parseInt(cb.getAttribute('data-index')));
    const src = window.sorular || (typeof sorular !== 'undefined' ? sorular : (window.sepetSorular || (typeof sepetSorular !== 'undefined' ? sepetSorular : [])));
    return indices.map(idx => src[idx]).filter(s => s !== undefined);
}

/**
 * Dışa aktarma ayarları modalını açar
 * @param {string} format - Varsayılan format ('pdf' veya 'word')
 */
function exportModalAc(format = 'pdf') {
    if (!exportSettingsModalObj) {
        const modalEl = document.getElementById('exportSettingsModal');
        if (modalEl) exportSettingsModalObj = new bootstrap.Modal(modalEl);
    }

    // Arayüzdeki genel başlık ve alt bilgileri al ve modal içine aktar
    const genelBaslik = document.getElementById('pdfBaslik')?.value || '';
    const genelAltBilgi = document.getElementById('pdfAltBilgi')?.value || '';
    
    const headerInput = document.getElementById('exportHeader');
    const footerInput = document.getElementById('exportFooter');
    if (headerInput && genelBaslik) headerInput.value = genelBaslik;
    if (footerInput && genelAltBilgi) footerInput.value = genelAltBilgi;

    // Seçilen formatı radyoda işaretle
    if (format === 'pdf') {
        const pdfRadio = document.getElementById('formatPdf');
        if (pdfRadio) pdfRadio.checked = true;
    } else {
        const wordRadio = document.getElementById('formatWord');
        if (wordRadio) wordRadio.checked = true;
    }

    // Seçili soru var ise soru kaynağını otomatik 'secili' yap, yoksa 'tum' yap
    const seciliSayisi = getSeciliSorular().length;
    const sourceSelect = document.getElementById('exportSource');
    if (sourceSelect) {
        if (seciliSayisi > 0) {
            sourceSelect.value = 'secili';
            // Option etiketini güncelle
            sourceSelect.options[1].text = `Sadece Seçilen Sorular (${seciliSayisi} Soru)`;
        } else {
            sourceSelect.value = 'tum';
            sourceSelect.options[1].text = `Sadece Seçilen Sorular (Seçim yok)`;
        }
    }

    exportSettingsModalObj.show();
}

/**
 * Modal onaylandığında çalışan ana tetikleyici fonksiyon
 */
async function exportYap() {
    const format = document.querySelector('input[name="exportFormat"]:checked')?.value || 'pdf';
    const kaynak = document.getElementById('exportSource')?.value || 'tum';
    const sutunSayisi = parseInt(document.getElementById('exportColumns')?.value || '2');
    const baslik = document.getElementById('exportHeader')?.value || 'SINAV';
    const altBilgi = document.getElementById('exportFooter')?.value || '';
    const anahtarli = document.getElementById('exportAnswerKey')?.checked ?? true;
    const detayliCevapAnahtari = document.getElementById('exportDetailKey')?.checked ?? false;
    const grupSayisi = parseInt(document.getElementById('exportGroupCount')?.value || '1');
    const grupYapilsinMi = grupSayisi > 1;
    const optimizasyonOlsunMu = document.getElementById('exportOptimization')?.checked ?? false;
    const hizalama = document.getElementById('exportAlignment')?.value || 'left';
    const resimBoyutu = document.getElementById('exportImageWidth')?.value || 'optimize';
    const gosterOgrenciBilgi = document.getElementById('exportOgrenciBilgi')?.checked ?? true;
    const gosterSayfaNo = document.getElementById('exportSayfaNo')?.checked ?? true;
    const gosterUstAltBilgi = document.getElementById('exportUstAltBilgi')?.checked ?? true;

    // Soruları kaynağına göre al
    let liste = [];
    if (kaynak === 'secili') {
        liste = getSeciliSorular();
        if (liste.length === 0) {
            alert('Lütfen listeden en az bir soru seçin veya "Tüm Sorular" seçeneğini kullanın.');
            return;
        }
    } else {
        liste = window.sorular || (typeof sorular !== 'undefined' ? sorular : (window.sepetSorular || (typeof sepetSorular !== 'undefined' ? sepetSorular : [])));
        if (liste.length === 0) {
            alert('Dışa aktarılacak hiç soru bulunamadı.');
            return;
        }
    }

    // Modalı kapat
    if (exportSettingsModalObj) exportSettingsModalObj.hide();

    // Fisher-Yates Shuffle Algorithm
    function shuffleArray(array) {
        const arr = [...array];
        for (let i = arr.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [arr[i], arr[j]] = [arr[j], arr[i]];
        }
        return arr;
    }

    const harfler = ['A', 'B', 'C', 'D'];

    if (grupYapilsinMi) {
        let pdfKitapciklar = [];
        for (let g = 0; g < grupSayisi; g++) {
            const grupLetter = harfler[g];
            const grupBaslik = `${baslik} - ${grupLetter} KİTAPÇIĞI`;
            const karistirilmisSorular = shuffleArray(liste);

            if (format === 'pdf') {
                pdfKitapciklar.push({ sorular: karistirilmisSorular, baslik: grupBaslik });
            } else {
                await wordSunucuOlustur(karistirilmisSorular, { baslik: grupBaslik, altBilgi, sutunSayisi, anahtarli, detayliCevapAnahtari, gosterOgrenciBilgi, gosterSayfaNo, gosterUstAltBilgi }, grupLetter);
            }

            // sequential downloads delay to prevent browser blocks
            if (format === 'word' && g < grupSayisi - 1) {
                await new Promise(resolve => setTimeout(resolve, 1200));
            }
        }
        
        if (format === 'pdf') {
            pdfYazdir(pdfKitapciklar, { baslik, altBilgi, sutunSayisi, anahtarli, hizalama, resimBoyutu, detayliCevapAnahtari, optimizasyonOlsunMu: false });
        }
    } else {
        if (format === 'pdf') {
            pdfYazdir([{ sorular: liste, baslik }], { baslik, altBilgi, sutunSayisi, anahtarli, hizalama, resimBoyutu, detayliCevapAnahtari, optimizasyonOlsunMu, gosterOgrenciBilgi, gosterSayfaNo, gosterUstAltBilgi });
        } else {
            await wordSunucuOlustur(liste, { baslik, altBilgi, sutunSayisi, anahtarli, detayliCevapAnahtari, gosterOgrenciBilgi, gosterSayfaNo, gosterUstAltBilgi });
        }
    }
}

/**
 * Tarayıcı üzerinden yüksek kaliteli 1, 2 veya 3 sütunlu PDF yazdırma ekranını açar.
 */
function pdfYazdir(kitapciklar, options) {
    const htmlContent = generatePrintHtml(kitapciklar, options);
    
    if (typeof showNotification === 'function') {
        showNotification('PDF yerleşimi hesaplanıyor, lütfen bekleyin...', 'info');
    }

    const iframe = document.createElement('iframe');
    iframe.style.position = 'absolute';
    iframe.style.top = '-9999px';
    iframe.style.width = '210mm';
    iframe.style.height = '297mm';
    document.body.appendChild(iframe);

    window.onPdfLayoutReady = function(containerNode) {
        if (typeof showNotification === 'function') {
            showNotification('PDF oluşturuluyor ve indiriliyor...', 'info');
        }
        
        // Klon oluşturarak arka planda html2pdf e veriyoruz
        const opt = {
            margin:       0,
            filename:     `Sinav_Kagidi_${new Date().getTime()}.pdf`,
            image:        { type: 'jpeg', quality: 0.98 },
            html2canvas:  { scale: 2, useCORS: true },
            jsPDF:        { unit: 'mm', format: 'a4', orientation: 'portrait' }
        };
        
        html2pdf().set(opt).from(containerNode).save().then(() => {
            document.body.removeChild(iframe);
            delete window.onPdfLayoutReady;
            if (typeof showNotification === 'function') {
                showNotification('PDF başarıyla indirildi!', 'success');
            }
        }).catch(err => {
            console.error('PDF error:', err);
            document.body.removeChild(iframe);
            delete window.onPdfLayoutReady;
            alert('PDF oluşturulurken bir hata oluştu.');
        });
    };

    iframe.contentWindow.document.open();
    iframe.contentWindow.document.write(htmlContent);
    iframe.contentWindow.document.close();
}

/**
 * Sunucuya soru listesini göndererek OpenXML şablonlarından DOCX üretir ve indirir.
 */
async function wordSunucuOlustur(sorularListesi, options, grupSuffix = "") {
    if (typeof showNotification === 'function') {
        showNotification('Word belgesi sunucuda hazırlanıyor...', 'info');
    }

    // Client modelindeki özellikleri sunucu Soru modeline eşle (Mapping)
    const mappedSorular = sorularListesi.map(s => {
        return {
            id: s.id || 0,
            soruMetni: s.soruMetni || "",
            soruResmi: s.soruResmi || null,
            soruMetniAyriMi: s.soruMetniAyriMi !== undefined ? s.soruMetniAyriMi : true,
            sikkarAyriMi: s.sikkarAyriMi !== undefined ? s.sikkarAyriMi : true,
            dogruCevapSikki: s.dogruSik || s.dogruCevapSikki || "A",
            // Şık metinleri
            aSikkiMetni: s.siklar ? s.siklar.A : (s.aSikkiMetni || ""),
            bSikkiMetni: s.siklar ? s.siklar.B : (s.bSikkiMetni || ""),
            cSikkiMetni: s.siklar ? s.siklar.C : (s.cSikkiMetni || ""),
            dSikkiMetni: s.siklar ? s.siklar.D : (s.dSikkiMetni || ""),
            eSikkiMetni: s.siklar ? s.siklar.E : (s.eSikkiMetni || ""),
            // Şık resimleri
            aSikkiResmi: s.aSikkiResmi || null,
            bSikkiResmi: s.bSikkiResmi || null,
            cSikkiResmi: s.cSikkiResmi || null,
            dSikkiResmi: s.dSikkiResmi || null,
            eSikkiResmi: s.eSikkiResmi || null,
            dersId: parseInt(s.dersId) || 1,
            konuId: parseInt(s.konuId) || 1,
            kazanimId: parseInt(s.kazanimId) || 1,
            Ders: { DersAdi: s.dersAdi || s.ders || "" },
            Konu: { KonuAdi: s.konuAdi || s.konu || "" },
            Kazanim: { KazanimAdi: s.kazanimAdi || s.kazanim || "" }
        };
    });

    const payload = {
        Sorular: mappedSorular,
        Type: 'docx',
        SutunSayisi: options.sutunSayisi,
        Baslik: options.baslik,
        AnahtarEkle: options.anahtarli,
        DetayliCevapAnahtari: options.detayliCevapAnahtari,
        GosterOgrenciBilgi: options.gosterOgrenciBilgi,
        GosterSayfaNo: options.gosterSayfaNo,
        GosterUstAltBilgi: options.gosterUstAltBilgi
    };

    try {
        const response = await fetch('/mgtest/ExportCart', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(payload)
        });

        if (!response.ok) {
            throw new Error(`Sunucu Hatası: ${response.statusText}`);
        }

        // Binary blob olarak al ve dosya olarak indir
        const blob = await response.blob();
        const grupEki = grupSuffix ? `_Grup_${grupSuffix}` : "";
        const fileName = `Sinav_${options.sutunSayisi}Sutun${grupEki}_${new Date().getTime()}.docx`;
        
        if (typeof saveAs === 'function') {
            saveAs(blob, fileName);
        } else {
            const link = document.createElement('a');
            link.href = window.URL.createObjectURL(blob);
            link.download = fileName;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
        }

        if (typeof showNotification === 'function') {
            showNotification('Word belgesi başarıyla indirildi!', 'success');
        }
    } catch (error) {
        console.error('Word Export Error:', error);
        alert('Word Belgesi Oluşturulamadı: ' + error.message);
    }
}

/**
 * Yazdırma ve PDF için tamamen duyarlı ve profesyonel HTML yapısını oluşturur.
 * A4 sayfaları bazında çalışan, sütun taşmalarını ve sayfa-sayfa akışını kontrol eden algoritma içerir.
 */
function generatePrintHtml(kitapciklar, options) {
    const { baslik, altBilgi, sutunSayisi, anahtarli, hizalama, resimBoyutu, detayliCevapAnahtari, optimizasyonOlsunMu, gosterOgrenciBilgi, gosterSayfaNo, gosterUstAltBilgi } = options;

    let poolHtml = '';
    kitapciklar.forEach((kitapcik, bIdx) => {
        kitapcik.sorular.forEach((s, i) => {
            let questionTextHtml = (s.soruMetniAyriMi && s.soruMetni) ? `<div class="question-text">${s.soruMetni}</div>` : '';
            let questionImageHtml = s.soruResmi ? `<div class="question-img-wrapper"><img src="${s.soruResmi}" class="question-img" /></div>` : '';
            
            let choicesHtml = '';
            if (s.sikkarAyriMi) {
                choicesHtml = `
                    <div class="choices-container">
                        ${['A', 'B', 'C', 'D', 'E'].map(h => {
                            const val = s.siklar ? s.siklar[h] : (s[`${h.toLowerCase()}SikkiMetni`] || '');
                            if (!val) return '';
                            return `
                                <div class="choice-item">
                                    <span class="choice-letter">${h})</span>
                                    <span class="choice-text">${val}</span>
                                </div>
                            `;
                        }).join('')}
                    </div>
                `;
            }

            poolHtml += `
                <div class="question-block" data-booklet="${bIdx}" data-qid="${s.id || i}">
                    <div class="question-header">
                        <span class="question-number"></span>
                        ${questionTextHtml}
                    </div>
                    ${questionImageHtml}
                    ${choicesHtml}
                </div>
            `;
        });
    });

    return `
<!DOCTYPE html>
<html lang="tr">
<head>
    <meta charset="UTF-8">
    <title>${baslik}</title>
    <style>
        @page {
            size: A4;
            margin: 0; /* Sayfa dışı boşluğu sıfırlayıp sayfa içi padding ile yöneteceğiz */
        }
        body {
            font-family: 'Arial', sans-serif;
            color: #333;
            margin: 0;
            padding: 0;
            background-color: #f0f0f0;
        }
        
        /* Sayfa yapısı */
        .page {
            width: 210mm;
            height: 297mm;
            padding: 15mm 12mm;
            box-sizing: border-box;
            page-break-after: always;
            break-after: page;
            position: relative;
            background-color: #fff;
            margin: 10px auto;
            box-shadow: 0 0 10px rgba(0,0,0,0.1);
        }
        
        .exam-header {
            border-bottom: 2px double #333;
            padding-bottom: 8px;
            margin-bottom: 15px;
            text-align: center;
        }
        .exam-title {
            font-size: 15pt;
            font-weight: bold;
            margin: 0 0 4px 0;
            text-transform: uppercase;
        }
        .exam-subtitle {
            font-size: 9.5pt;
            color: #555;
            margin: 0;
        }
        .student-info-box {
            border: 1px solid #333;
            padding: 6px 10px;
            margin-bottom: 15px;
            font-size: 8.5pt;
            display: flex;
            justify-content: space-between;
        }
        .info-field {
            font-weight: bold;
        }
        
        /* Sayfa içi sütun yerleşimi (Explicit Columns) */
        .questions-row {
            display: flex;
            height: calc(100% - 15px); /* Header minus */
            gap: 24px;
        }
        .questions-col {
            flex: 1;
            width: 0; /* Important to keep flex equal */
            display: flex;
            flex-direction: column;
        }
        
        .question-block {
            margin-bottom: 20px;
            padding-bottom: 10px;
            border-bottom: 1px dashed #e0e0e0;
            text-align: ${hizalama === 'center' ? 'center' : 'left'};
        }
        .question-header {
            display: flex;
            align-items: flex-start;
            margin-bottom: 6px;
            justify-content: ${hizalama === 'center' ? 'center' : 'flex-start'};
        }
        .question-number {
            font-weight: bold;
            font-size: 10.5pt;
            margin-right: 5px;
            color: #000;
        }
        .question-text {
            font-size: 10pt;
            font-weight: 500;
            text-align: ${hizalama === 'justify' ? 'justify' : (hizalama === 'center' ? 'center' : 'left')};
        }
        .question-img-wrapper {
            text-align: ${hizalama === 'center' ? 'center' : 'left'};
            margin: 6px 0;
            max-width: 100%;
        }
        .question-img {
            border-radius: 4px;
            object-fit: contain;
            ${resimBoyutu === 'fit' ? 'width: 100%; height: auto; max-height: none;' : 
              (resimBoyutu === 'original' ? 'max-width: none; max-height: none; width: auto; height: auto;' : 
              'max-width: 100%; max-height: 220px; height: auto;')}
        }
        .choices-container {
            margin-top: 6px;
            padding-left: 12px;
            text-align: left; /* Seçenekler okuma kolaylığı için her zaman sola yaslanır */
            display: ${hizalama === 'center' ? 'inline-block' : 'block'};
        }
        .choice-item {
            margin-bottom: 3px;
            display: flex;
            align-items: flex-start;
        }
        .choice-letter {
            font-weight: bold;
            margin-right: 5px;
            min-width: 16px;
        }
        .choice-text {
            font-size: 9pt;
        }
        
        /* Cevap Anahtarı */
        .answer-key-section {
            padding: 20px;
            border-top: 2px solid #333;
            margin-top: 30px;
        }
        .section-title {
            font-size: 13pt;
            font-weight: bold;
            text-align: center;
            margin-bottom: 12px;
        }
        .answer-grid {
            display: grid;
            grid-template-columns: repeat(10, 1fr);
            gap: 8px;
            max-width: 600px;
            margin: 0 auto;
        }
        .answer-item {
            border: 1px solid #ccc;
            padding: 6px;
            text-align: center;
            border-radius: 4px;
            background-color: #fcfcfc;
        }
        .q-num {
            display: block;
            font-size: 7.5pt;
            color: #777;
            margin-bottom: 2px;
        }
        .q-ans {
            font-weight: bold;
            font-size: 11pt;
            color: #222;
        }
        
        @media print {
            body {
                background: none;
                color: #000;
            }
            .page {
                margin: 0;
                box-shadow: none;
                page-break-after: always;
                break-after: page;
            }
            .no-print {
                display: none;
            }
        }
    </style>
</head>
<body>

    <!-- Ham soru listesi (Havuz) - İlk başta gizli olacak ve ölçüm için kullanılacak -->
    <!-- Havuz genişliği sütun genişliğine eşitlenerek resim yükseklikleri doğru hesaplanacak -->
    <div id="pool" style="display: block; position: absolute; top: -9999px; left: -9999px; width: calc((186mm - ((${sutunSayisi} - 1) * 24px)) / ${sutunSayisi});">
        ${poolHtml}
    </div>

    <!-- Dinamik A4 sayfalarının yerleşeceği ana konteyner -->
    <div id="pages-container"></div>

    <script>
        const sutunSayisi = ${sutunSayisi};
        const optimizasyonOlsunMu = ${optimizasyonOlsunMu ? 'true' : 'false'};
        const gosterOgrenciBilgi = ${gosterOgrenciBilgi ? 'true' : 'false'};
        const gosterSayfaNo = ${gosterSayfaNo ? 'true' : 'false'};
        const gosterUstAltBilgi = ${gosterUstAltBilgi ? 'true' : 'false'};

        // Sayfa yerleşim motoru
        window.onload = function() {
            const pool = document.getElementById('pool');
            const container = document.getElementById('pages-container');
            
            // Generate pages for each booklet
            const kitapciklar = ${JSON.stringify(kitapciklar.map(k => ({ baslik: k.baslik, sorular: k.sorular.map(s => ({ dogruSik: s.dogruSik || s.dogruCevapSikki || 'A', dersAdi: s.dersAdi || s.ders || '', konuAdi: s.konuAdi || s.konu || '', kazanimAdi: s.kazanimAdi || s.kazanim || '' })) })))};
            
            kitapciklar.forEach((kitapcik, bIdx) => {
                let bookletPageCount = 0;
                let pageNumInBooklet = 1;
                
                let questions = Array.from(pool.querySelectorAll('.question-block[data-booklet="' + bIdx + '"]'));
                
                let currentPage = createPageStructure(kitapcik.baslik, pageNumInBooklet);
                let currentCols = Array.from(currentPage.querySelectorAll('.questions-col'));
                container.appendChild(currentPage);
                bookletPageCount++;
                
                if (optimizasyonOlsunMu) {
                    // Optimizasyon Algoritması
                    let colIdx = 0;
                    let currentHeightSum = 0;
                    
                    while (questions.length > 0) {
                        // Dinamik olarak tam o anki sütunun içerik alanının (questions-row) yüksekliğini al
                        let limit = currentCols[colIdx].parentElement.clientHeight;
                        let remainingSpace = limit - currentHeightSum;
                        
                        let selectedQIndex = -1;
                        if (currentHeightSum === 0) {
                            let maxH = -1;
                            questions.forEach((q, idx) => {
                                let h = q.offsetHeight + 20; // 20px gap/margin
                                if (h > maxH && h <= remainingSpace) { maxH = h; selectedQIndex = idx; }
                            });
                            // Eğer hiçbiri sığmıyorsa mecbur en kısa olanı veya ilk bulduğumuzu alalım
                            if (selectedQIndex === -1) {
                                let minH = Infinity;
                                questions.forEach((q, idx) => {
                                    let h = q.offsetHeight + 20;
                                    if (h < minH) { minH = h; selectedQIndex = idx; }
                                });
                            }
                        } else {
                            // En iyi dolduran (kalan boşluğa en yakın ama onu aşmayan) soruyu bul
                            let bestDiff = Infinity;
                            questions.forEach((q, idx) => {
                                let h = q.offsetHeight + 20;
                                if (h <= remainingSpace) {
                                    let diff = remainingSpace - h;
                                    if (diff < bestDiff) { bestDiff = diff; selectedQIndex = idx; }
                                }
                            });
                        }
                        
                        if (selectedQIndex !== -1) {
                            let q = questions[selectedQIndex];
                            currentCols[colIdx].appendChild(q);
                            currentHeightSum += q.offsetHeight + 20;
                            questions.splice(selectedQIndex, 1);
                        } else {
                            // Sığacak soru kalmadıysa yandaki sütuna geç
                            colIdx++;
                            currentHeightSum = 0;
                            if (colIdx >= sutunSayisi) {
                                pageNumInBooklet++;
                                currentPage = createPageStructure(kitapcik.baslik, pageNumInBooklet);
                                currentCols = Array.from(currentPage.querySelectorAll('.questions-col'));
                                container.appendChild(currentPage);
                                bookletPageCount++;
                                colIdx = 0;
                            }
                        }
                    }
                } else {
                    // Normal Sıralı Ekleme
                    let colIdx = 0;
                    let currentHeightSum = 0;
                    
                    questions.forEach((q) => {
                        let qHeight = q.offsetHeight + 20; // gap
                        let limit = currentCols[colIdx].parentElement.clientHeight;
                        
                        if (currentHeightSum > 0 && currentHeightSum + qHeight > limit) {
                            colIdx++;
                            currentHeightSum = 0;
                            if (colIdx >= sutunSayisi) {
                                pageNumInBooklet++;
                                currentPage = createPageStructure(kitapcik.baslik, pageNumInBooklet);
                                currentCols = Array.from(currentPage.querySelectorAll('.questions-col'));
                                container.appendChild(currentPage);
                                bookletPageCount++;
                                colIdx = 0;
                            }
                        }
                        
                        // Fallback: If it's a huge question that doesn't even fit an empty column, it will just overflow, but we place it anyway
                        currentCols[colIdx].appendChild(q);
                        currentHeightSum += qHeight;
                    });
                }
                
                // Cevap Anahtarı Sayfası (Eğer istenmişse, Kitapçık bazlı olarak)
                if (${anahtarli ? 'true' : 'false'}) {
                    const answerPage = document.createElement('div');
                    answerPage.className = 'page';
                    
                    let answerContentHtml = '';
                    if (${detayliCevapAnahtari ? 'true' : 'false'}) {
                        const questionsData = kitapcik.sorular.map((s, idx) => {
                            let info = (idx + 1) + '. ' + s.dogruSik;
                            if (s.dersAdi) info += ' | Ders: ' + s.dersAdi;
                            if (s.konuAdi) info += ' | Konu: ' + s.konuAdi;
                            if (s.kazanimAdi) info += ' | Kazanım: ' + s.kazanimAdi;
                            return info;
                        });
                        
                        answerContentHtml = '<div class="answer-key-section" style="border-top: none; margin-top: 0;">' +
                            '<div style="font-size: 11pt; line-height: 1.8; text-align: left; max-width: 600px; margin: 0 auto;">' +
                            questionsData.map(item => '<div style="margin-bottom: 6px; border-bottom: 1px dashed #eee; padding-bottom: 4px;">' + item + '</div>').join('') +
                            '</div></div>';
                    } else {
                        answerContentHtml = '<div class="answer-key-section"><div class="answer-grid">' +
                            kitapcik.sorular.map((s, idx) => {
                                return '<div class="answer-item"><span class="q-num">' + (idx + 1) + '</span><span class="q-ans">' + s.dogruSik + '</span></div>';
                            }).join('') + '</div></div>';
                    }

                    answerPage.innerHTML = '<div class="exam-header"><h1 class="exam-title">' + kitapcik.baslik + '</h1><p class="exam-subtitle">CEVAP ANAHTARI</p></div>' + answerContentHtml;
                    container.appendChild(answerPage);
                    bookletPageCount++;
                }

                // Ensure even number of pages for this booklet if there are multiple booklets
                if (kitapciklar.length > 1 && bookletPageCount % 2 !== 0) {
                    const emptyPage = document.createElement('div');
                    emptyPage.className = 'page';
                    emptyPage.innerHTML = '<div style="display:flex; justify-content:center; align-items:center; height:100%;"><h1 style="color: #ccc; font-weight: 300;">BOŞ SAYFA</h1></div>';
                    container.appendChild(emptyPage);
                }
            });

            // Kitapçık bazlı olarak sayfalardaki soruları sırayla numaralandır (Optimizasyon veya karıştırma sonrası)
            for (let bIdx = 0; bIdx < kitapciklar.length; bIdx++) {
                // Sadece bu kitapçığa ait, .page içindeki soruları seç (Cevap anahtarı hariç)
                const pages = Array.from(container.querySelectorAll('.page'));
                let globalQIndex = 1;
                pages.forEach(page => {
                    const qBlocks = Array.from(page.querySelectorAll('.question-block[data-booklet="' + bIdx + '"]'));
                    qBlocks.forEach(q => {
                        const numSpan = q.querySelector('.question-number');
                        if (numSpan) {
                            numSpan.textContent = globalQIndex + '.';
                        }
                        globalQIndex++;
                    });
                });
            }

            // Havuzu temizle
            pool.remove();

            // Yazdırma ekranını otomatik tetikle veya PDF callback çağır
            setTimeout(() => {
                if (window.parent && typeof window.parent.onPdfLayoutReady === 'function') {
                    window.parent.onPdfLayoutReady(document.getElementById('pages-container'));
                } else {
                    window.focus();
                    window.print();
                }
            }, 300);
        };

        // Yeni bir sayfa şablonu oluşturur
        function createPageStructure(baslik, num) {
            const pageDiv = document.createElement('div');
            pageDiv.className = 'page';
            
            let headerHtml = '';
            
            if (num === 1) {
                // Header ve öğrenci kutusu sadece 1. sayfada gösterilir
                let examHeader = gosterUstAltBilgi ? \`
                    <div class="exam-header">
                        <h1 class="exam-title">\${baslik}</h1>
                        \${'${altBilgi}' ? \`<p class="exam-subtitle">${altBilgi}</p>\` : ''}
                    </div>
                \` : '';
                
                let studentInfo = gosterOgrenciBilgi ? \`
                    <div class="student-info-box">
                        <div><span class="info-field">Adı Soyadı:</span> ___________________________</div>
                        <div><span class="info-field">Sınıfı / Şubesi:</span> ____________</div>
                        <div><span class="info-field">Numarası:</span> __________</div>
                    </div>
                \` : '';
                
                headerHtml = examHeader + studentInfo;
            } else {
                // Diğer sayfalarda minimal üst başlık
                if (gosterUstAltBilgi || gosterSayfaNo) {
                    headerHtml = \`
                        <div class="exam-header" style="margin-bottom: 10px; padding-bottom: 4px;">
                            <span style="font-size: 8.5pt; color: #666; float: left;">\${gosterUstAltBilgi ? baslik : ''}</span>
                            <span style="font-size: 8.5pt; color: #666; float: right;">\${gosterSayfaNo ? 'Sayfa ' + num : ''}</span>
                            <div style="clear: both;"></div>
                        </div>
                    \`;
                }
            }
            
            // Create columns based on sutunSayisi
            let colsHtml = '';
            for(let i = 0; i < ${sutunSayisi}; i++) {
                colsHtml += '<div class="questions-col"></div>';
            }
            
            pageDiv.innerHTML = \`
                \${headerHtml}
                <div class="questions-row">\${colsHtml}</div>
            \`;
            return pageDiv;
        }
    </script>
</body>
</html>
    `;
}

// Global olarak erişilebilir yap
window.exportModalAc = exportModalAc;
window.exportYap = exportYap;