/**
 * dateUtils.js
 * Tarih format dönüşüm yardımcıları.
 * PDF'teki çeşitli tarih formatlarını XML'in beklediği YYYY-MM-DD'ye dönüştürür.
 */

const DateUtils = {

    /**
     * Çeşitli formatlardaki tarih string'ini YYYY-MM-DD formatına çevirir.
     * Desteklenen formatlar:
     *   DD-MM-YYYY, DD/MM/YYYY, DD.MM.YYYY
     *   YYYY-MM-DD (zaten doğru formatta)
     *
     * @param {string} dateStr - Kaynak tarih string'i
     * @returns {string} YYYY-MM-DD formatında tarih
     */
    toISODate(dateStr) {
        if (!dateStr || typeof dateStr !== 'string') return '';

        const trimmed = dateStr.trim();

        // Zaten YYYY-MM-DD formatındaysa doğrudan döndür
        if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
            return trimmed;
        }

        // 31 Temmuz 2026 veya 31 Temmuz 2026 23:59 gibi metinli aylar
        const aylar = {
            'ocak': '01', 'şubat': '02', 'subat': '02', 'mart': '03', 'nisan': '04',
            'mayıs': '05', 'mayis': '05', 'haziran': '06', 'temmuz': '07', 'ağustos': '08',
            'agustos': '08', 'eylül': '09', 'eylul': '09', 'ekim': '10', 'kasım': '11',
            'kasim': '11', 'aralık': '12', 'aralik': '12'
        };

        // Eğer içinde harf varsa (ay ismi)
        if (/[a-zA-ZçÇğĞıİöÖşŞüÜ]/.test(trimmed)) {
            const matchText = trimmed.match(/(\d{1,2})\s+([a-zA-ZçÇğĞıİöÖşŞüÜ]+)\s+(\d{4})/);
            if (matchText) {
                const day = matchText[1].padStart(2, '0');
                const monthName = matchText[2].toLowerCase();
                const year = matchText[3];
                const month = aylar[monthName] || '01'; // Bulamazsa 01
                return `${year}-${month}-${day}`;
            }
        }

        // DD-MM-YYYY, DD/MM/YYYY veya DD.MM.YYYY formatı
        // Boşlukları temizle (ör: "10 - 08 - 2026" -> "10-08-2026")
        const cleanDate = trimmed.replace(/\s+/g, '');
        const match = cleanDate.match(/^(\d{2})[\/\-.](\d{2})[\/\-.](\d{4})$/);
        if (match) {
            const [, day, month, year] = match;
            return `${year}-${month}-${day}`;
        }

        // DD-MM-YYYY HH:MM formatı (saat kısmını at)
        const matchWithTime = trimmed.match(/^(\d{2})[\/\-.](\d{2})[\/\-.](\d{4})\s+\d{2}:\d{2}/);
        if (matchWithTime) {
            const [, day, month, year] = matchWithTime;
            return `${year}-${month}-${day}`;
        }

        console.warn(`[DateUtils] Tanınmayan tarih formatı: "${dateStr}"`);
        return cleanDate;
    },

    /**
     * YYYY-MM-DD formatındaki tarihten ay bilgisini döndürür (1-12).
     * @param {string} isoDate - YYYY-MM-DD formatında tarih
     * @returns {number} Ay numarası (1-12)
     */
    getMonth(isoDate) {
        if (!isoDate) return 0;
        const parts = isoDate.split('-');
        return parts.length >= 2 ? parseInt(parts[1], 10) : 0;
    },

    /**
     * YYYY-MM-DD formatındaki tarihten yıl bilgisini döndürür.
     * @param {string} isoDate - YYYY-MM-DD formatında tarih
     * @returns {number} Yıl
     */
    getYear(isoDate) {
        if (!isoDate) return 0;
        const parts = isoDate.split('-');
        return parts.length >= 1 ? parseInt(parts[0], 10) : 0;
    },

    /**
     * ISO tarihini DD/MM/YYYY formatına çevirir (görüntüleme için).
     * @param {string} isoDate - YYYY-MM-DD formatında tarih
     * @returns {string} DD/MM/YYYY formatında tarih
     */
    toDisplayDate(isoDate) {
        if (!isoDate) return '';
        const parts = isoDate.split('-');
        if (parts.length !== 3) return isoDate;
        return `${parts[2]}/${parts[1]}/${parts[0]}`;
    },

    /**
     * Bugünün tarihini YYYY-MM-DD formatında döndürür.
     * @returns {string}
     */
    today() {
        const d = new Date();
        const year = d.getFullYear();
        const month = String(d.getMonth() + 1).padStart(2, '0');
        const day = String(d.getDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
    }
};
