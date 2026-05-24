/**
 * Web Crypto API kullanarak AES-GCM Şifreleme/Çözme Modülü
 * Bu modül, SQLite veritabanı dosyasının (.mg) tamamını şifrelemek ve çözmek için kullanılır.
 */

const CryptoService = {
    /**
     * Kullanıcının şifresinden AES-GCM için uygun bir anahtar türetir.
     * @param {string} password - Kullanıcının VeriTabanSifresi
     * @param {string} salt - Uygulama genelinde kullanılan sabit bir tuz (salt)
     * @returns {Promise<CryptoKey>}
     */
    deriveKey: async function(password, salt = "mg_sorubank_salt") {
        const enc = new TextEncoder();
        const keyMaterial = await window.crypto.subtle.importKey(
            "raw",
            enc.encode(password),
            { name: "PBKDF2" },
            false,
            ["deriveBits", "deriveKey"]
        );

        return window.crypto.subtle.deriveKey(
            {
                name: "PBKDF2",
                salt: enc.encode(salt),
                iterations: 100000,
                hash: "SHA-256"
            },
            keyMaterial,
            { name: "AES-GCM", length: 256 },
            true,
            ["encrypt", "decrypt"]
        );
    },

    /**
     * Veriyi (ArrayBuffer) şifreler.
     * @param {ArrayBuffer} data - Şifrelenecek SQLite veritabanı buffer'ı
     * @param {string} password - Şifre
     * @returns {Promise<ArrayBuffer>} - [IV (12 byte)] + [Şifreli Veri]
     */
    encryptFile: async function(data, password) {
        const key = await this.deriveKey(password);
        
        // AES-GCM için 12 byte Initialization Vector (IV) önerilir
        const iv = window.crypto.getRandomValues(new Uint8Array(12));
        
        const encryptedContent = await window.crypto.subtle.encrypt(
            {
                name: "AES-GCM",
                iv: iv
            },
            key,
            data
        );

        // Sonucu birleştir: IV (12 byte) + Encrypted Data
        const encryptedBuffer = new Uint8Array(iv.length + encryptedContent.byteLength);
        encryptedBuffer.set(iv, 0);
        encryptedBuffer.set(new Uint8Array(encryptedContent), iv.length);

        return encryptedBuffer.buffer;
    },

    /**
     * Şifreli veriyi çözer.
     * @param {ArrayBuffer} encryptedData - Şifreli dosya içeriği
     * @param {string} password - Şifre
     * @returns {Promise<ArrayBuffer>} - Çözülmüş SQLite veritabanı buffer'ı
     */
    decryptFile: async function(encryptedData, password) {
        const key = await this.deriveKey(password);
        
        const encryptedArray = new Uint8Array(encryptedData);
        
        // İlk 12 byte IV'dir
        const iv = encryptedArray.slice(0, 12);
        const data = encryptedArray.slice(12);
        
        try {
            const decryptedContent = await window.crypto.subtle.decrypt(
                {
                    name: "AES-GCM",
                    iv: iv
                },
                key,
                data
            );
            return decryptedContent;
        } catch (e) {
            console.error("Şifre çözme hatası:", e);
            throw new Error("Veritabanı şifresi çözülemedi. Lütfen yetkiniz olduğunu kontrol edin.");
        }
    }
};

window.CryptoService = CryptoService;
