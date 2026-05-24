/**
 * EXPORT İŞLEMLERİ MODÜLÜ
 * PDF ve Word çıktıları için fonksiyonlar
 */

function getSeciliSorular() {
    const checkboxes = document.querySelectorAll('.soru-sec:checked');
    const indices = Array.from(checkboxes).map(cb => parseInt(cb.getAttribute('data-index')));
    const src = window.sorular || (typeof sorular !== 'undefined' ? sorular : []);
    return indices.map(idx => src[idx]).filter(s => s !== undefined);
}

// ============================================
// PDF OLUŞTURMA FONKSİYONU
// ============================================

async function pdfOlustur(kaynak, anahtarli) {
    const sutun = prompt("Kaç sütunlu PDF oluşturmak istersiniz?\n(1, 2 veya 3 girin)", "2");
    const sutunSayisi = parseInt(sutun);
    if (![1, 2, 3].includes(sutunSayisi)) return;
    
    const baslik = document.getElementById('pdfBaslik')?.value || 'SINAV';
    const altBilgi = document.getElementById('pdfAltBilgi')?.value || '';
    const liste = kaynak === 'secili' ? getSeciliSorular() : (window.sorular || (typeof sorular !== 'undefined' ? sorular : []));
    
    if (!liste || liste.length === 0) return;
    
    const htmlContent = generatePdfHtml(liste, { baslik, altBilgi, sutunSayisi, anahtarli });
    
    try {
        const opt = {
            margin: [10, 10, 10, 10],
            filename: `${baslik.replace(/[^a-z0-9]/gi, '_')}.pdf`,
            image: { type: 'jpeg', quality: 0.98 },
            html2canvas: { scale: 2, useCORS: true },
            jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' },
            pagebreak: { mode: ['avoid-all', 'css', 'legacy'] }
        };
        const element = document.createElement('div');
        element.style.width = '190mm';
        element.innerHTML = htmlContent;
        await html2pdf().set(opt).from(element).save();
    } catch (error) { console.error('PDF Error:', error); }
}

function generatePdfHtml(sorular, options) {
    const { baslik, altBilgi, sutunSayisi, anahtarli } = options;
    const styles = `<style>
        .pdf-container { font-family: Arial, sans-serif; }
        .header { text-align: center; border-bottom: 2px solid #000; margin-bottom: 15px; }
        .student-info { border: 1px solid #000; padding: 8px; margin-bottom: 15px; font-size: 10pt; }
        .questions-grid { column-count: ${sutunSayisi}; column-gap: 20px; column-rule: 1px solid #eee; }
        .q-item { break-inside: avoid; margin-bottom: 20px; }
        .q-img { max-width: 100%; height: auto; display: block; margin: 5px 0; }
        .choices { margin-top: 5px; font-size: 10pt; }
    </style>`;
    let html = `<html><head>${styles}</head><body><div class="pdf-container">`;
    html += `<div class="header"><h2>${baslik}</h2><p>${altBilgi}</p></div>`;
    html += `<div class="student-info"><b>Ad Soyad:</b> ____________________ &nbsp;&nbsp; <b>No:</b> ________</div>`;
    html += `<div class="questions-grid">`;
    sorular.forEach((s, i) => {
        html += `<div class="q-item">
            <b>${i + 1}.</b> ${(s.soruMetniAyriMi && s.soruMetni) ? s.soruMetni : ''}<br>
            ${s.soruResmi ? `<img src="${s.soruResmi}" class="q-img">` : ''}
            <div class="choices">
                ${['A', 'B', 'C', 'D', 'E'].map(h => {
                    const t = (s.sikkarAyriMi && s.siklar) ? s.siklar[h] : '';
                    if (!s.sikkarAyriMi && !t) return '';
                    return `<div><b>${h})</b> ${t || '________________'}</div>`;
                }).join('')}
            </div>
        </div>`;
    });
    html += `</div>`;
    if (anahtarli) {
        html += `<div style="page-break-before:always;"><h3>CEVAP ANAHTARI</h3>`;
        sorular.forEach((s, i) => { html += `<b>${i + 1}:</b> ${s.dogruSik || 'A'} &nbsp; `; });
        html += `</div>`;
    }
    html += `</div></body></html>`;
    return html;
}

// ============================================
// WORD OLUŞTURMA FONKSİYONU (TEMPLATE DESTEKLİ)
// ============================================

async function wordOlustur(kaynak, anahtarli) {
    const sutun = prompt("Kaç sütunlu Word belgesi oluşturmak istersiniz?\n(1, 2 veya 3 girin)", "2");
    const sutunSayisi = parseInt(sutun);
    if (![1, 2, 3].includes(sutunSayisi)) return;

    const liste = kaynak === 'secili' ? getSeciliSorular() : (window.sorular || (typeof sorular !== 'undefined' ? sorular : []));
    if (!liste || liste.length === 0) return;

    if (typeof showNotification === 'function') showNotification('Şablon yükleniyor...', 'info');

    try {
        // 1. Şablon dosyasını fetch et (User puts them in /templates/1.docx etc)
        const templatePath = `/templates/${sutunSayisi}.docx`;
        const response = await fetch(templatePath);
        
        if (!response.ok) {
            throw new Error(`Şablon dosyası bulunamadı: ${templatePath}. Lütfen şablonu hazırlayıp templates klasörüne atın.`);
        }

        const arrayBuffer = await response.arrayBuffer();

        // 2. Mammoth ile şablonu HTML'e çevir
        const mammothResult = await mammoth.convertToHtml({ arrayBuffer: arrayBuffer });
        let templateHtml = mammothResult.value;

        // 3. Sorular tablosunu oluştur
        const questionsTable = generateWordQuestionsTable(liste, sutunSayisi);
        
        // Cevap anahtarı
        let answerKeyHtml = '';
        if (anahtarli) {
            answerKeyHtml = `<div style="page-break-before:always; border-top:2px solid #000; padding-top:20px;">
                <h3>CEVAP ANAHTARI</h3>
                ${liste.map((s, i) => `<b>${i+1}:</b> ${s.dogruSik||'A'}`).join(' &nbsp; ')}
            </div>`;
        }

        // 4. Şablon içindeki {SORULAR} işaretini bul ve değiştir
        const placeholder = "{SORULAR}";
        let finalHtml = "";
        
        if (templateHtml.includes(placeholder)) {
            finalHtml = templateHtml.replace(placeholder, questionsTable + answerKeyHtml);
        } else {
            // İşaret yoksa en sona ekle
            finalHtml = templateHtml + questionsTable + answerKeyHtml;
        }

        // Wrap in full HTML document for conversion
        const fullHtml = `
            <html>
            <head><meta charset="utf-8"></head>
            <body style="font-family: Arial;">
                ${finalHtml}
            </body>
            </html>
        `;

        // 5. html-docx-js ile tekrar Word'e çevir (resimler burada işlenir)
        const convertedDoc = htmlDocx.asBlob(fullHtml);
        
        // 6. İndir
        const fileName = `Sinav_${sutunSayisi}Sutun_${new Date().getTime()}.docx`;
        saveAs(convertedDoc, fileName);

        if (typeof showNotification === 'function') showNotification('Word belgesi başarıyla oluşturuldu!', 'success');

    } catch (error) {
        console.error('Word Export Error:', error);
        alert('Word Hatası: ' + error.message);
    }
}

/**
 * Soruları "Down First" mantığında tabloya dizer
 */
function generateWordQuestionsTable(sorular, sutunSayisi) {
    const perColumn = Math.ceil(sorular.length / sutunSayisi);
    let html = '<table style="width:100%; border-collapse:collapse; border:none; margin-top:20px;"><tr>';
    
    for (let c = 0; c < sutunSayisi; c++) {
        html += `<td style="width:${100/sutunSayisi}%; vertical-align:top; padding:10px; border:none;">`;
        for (let r = 0; r < perColumn; r++) {
            const idx = c * perColumn + r;
            if (sorular[idx]) {
                html += renderWordQuestion(sorular[idx], idx);
            }
        }
        html += '</td>';
    }
    
    html += '</tr></table>';
    return html;
}

function renderWordQuestion(s, i) {
    return `
        <div style="font-family: Arial; font-size: 11pt; margin-bottom:25px;">
            <b>${i + 1}.</b> ${s.soruMetni || ''}<br>
            ${s.soruResmi ? `<img src="${s.soruResmi}" style="max-width:100%; margin:10px 0;"><br>` : ''}
            <div style="margin-top:5px;">
                ${['A', 'B', 'C', 'D', 'E'].map(h => {
                    const t = (s.sikkarAyriMi && s.siklar) ? s.siklar[h] : '';
                    if (!s.sikkarAyriMi && !t) return '';
                    return `<b>${h})</b> ${t || '___________'}`;
                }).join('<br>')}
            </div>
        </div>
    `;
}

window.pdfOlustur = pdfOlustur;
window.wordOlustur = wordOlustur;