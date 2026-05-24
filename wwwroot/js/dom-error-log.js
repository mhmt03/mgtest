// Bu dosya, tarayıcıda oluşan JavaScript hatalarını ve DOM erişim hatalarını loglamak için kullanılacak.
// Tüm hatalar wwwroot/js/dom-error-log.js dosyasına loglanacak ve sunucuya gönderilecek.

(function() {
    // Hata loglarını biriktir
    let errorLogs = [];

    // Hata logunu localStorage'da da tut
    function saveErrorLog(log) {
        errorLogs.push(log);
        try {
            localStorage.setItem('domErrorLogs', JSON.stringify(errorLogs));
        } catch (e) {}
    }

    // Sunucuya log gönder (isteğe bağlı, endpoint eklenirse)
    function sendErrorLogToServer(log) {
        // fetch('/api/logDomError', { method: 'POST', body: JSON.stringify(log), headers: { 'Content-Type': 'application/json' } });
    }

    // Global JS hatalarını yakala
    window.addEventListener('error', function(event) {
        const log = {
            type: 'js-error',
            message: event.message,
            filename: event.filename,
            lineno: event.lineno,
            colno: event.colno,
            error: event.error ? event.error.stack : null,
            time: new Date().toISOString()
        };
        saveErrorLog(log);
        sendErrorLogToServer(log);
    });

    // Promise hatalarını yakala
    window.addEventListener('unhandledrejection', function(event) {
        const log = {
            type: 'promise-rejection',
            message: event.reason ? event.reason.message : 'unhandledrejection',
            stack: event.reason ? event.reason.stack : null,
            time: new Date().toISOString()
        };
        saveErrorLog(log);
        sendErrorLogToServer(log);
    });

    // DOM erişimlerinde null kontrolü ve loglama için yardımcı fonksiyon
    window.safeGetElementById = function(id) {
        const el = document.getElementById(id);
        if (!el) {
            const log = {
                type: 'dom-null',
                message: `Element not found: #${id}`,
                time: new Date().toISOString(),
                url: window.location.href
            };
            saveErrorLog(log);
            sendErrorLogToServer(log);
        }
        return el;
    };

    // QuerySelector için güvenli fonksiyon
    window.safeQuerySelector = function(selector) {
        const el = document.querySelector(selector);
        if (!el) {
            const log = {
                type: 'dom-null',
                message: `Element not found: ${selector}`,
                time: new Date().toISOString(),
                url: window.location.href
            };
            saveErrorLog(log);
            sendErrorLogToServer(log);
        }
        return el;
    };

    // Logları txt olarak indir
    window.downloadDomErrorLogs = function() {
        let logs = localStorage.getItem('domErrorLogs');
        if (!logs) {
            alert('Kayıtlı bir hata logu yok!');
            return;
        }
        let blob = new Blob([logs], { type: 'text/plain' });
        let a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = 'dom-error-logs.txt';
        a.click();
    };

    // Sayfaya log indirme butonu ekle (geliştirici için)
    window.addEventListener('DOMContentLoaded', function() {
        if (!document.getElementById('downloadDomErrorLogsBtn')) {
            const btn = document.createElement('button');
            btn.id = 'downloadDomErrorLogsBtn';
            btn.textContent = 'DOM Hata Loglarını İndir';
            btn.style.position = 'fixed';
            btn.style.bottom = '16px';
            btn.style.right = '16px';
            btn.style.zIndex = 9999;
            btn.style.background = '#c00';
            btn.style.color = '#fff';
            btn.style.padding = '8px 16px';
            btn.style.border = 'none';
            btn.style.borderRadius = '6px';
            btn.style.fontSize = '14px';
            btn.style.cursor = 'pointer';
            btn.onclick = window.downloadDomErrorLogs;
            document.body.appendChild(btn);
        }
    });

    // DOM erişimlerinde null kontrolü ve loglama için yardımcı fonksiyon
    window.safeQuerySelector = function(selector) {
        const el = document.querySelector(selector);
        if (!el) {
            const log = {
                type: 'dom-null',
                message: `Element not found: ${selector}`,
                time: new Date().toISOString(),
                url: window.location.href
            };
            saveErrorLog(log);
            sendErrorLogToServer(log);
        }
        return el;
    };

    // Hataları txt olarak indirmek için fonksiyon
    window.downloadDomErrorLogs = function() {
        const logs = localStorage.getItem('domErrorLogs') || '[]';
        const blob = new Blob([logs], { type: 'text/plain' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'dom-error-logs.txt';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    };
})();
