/**
 * numberUtils.js
 * Sayı format dönüşüm yardımcıları.
 * PDF'teki Türkçe sayı formatını (virgül ayırıcılı) XML'in beklediği
 * ondalık noktalı formata dönüştürür.
 */

const NumberUtils = {

    /**
     * Türkçe formatlı sayı string'ini JavaScript number'a çevirir.
     * "267,47" → 267.47
     * "1.267,47" → 1267.47
     * "267.47" → 267.47 (zaten noktalı ise)
     *
     * @param {string} str - Kaynak sayı string'i
     * @returns {number} Sayısal değer
     */
    parseAmount(str) {
        if (str === null || str === undefined) return 0;
        if (typeof str === 'number') return str;

        let cleaned = String(str).trim();

        // TL, TRY gibi para birimi ifadelerini temizle
        cleaned = cleaned.replace(/\s*(TL|TRY)\s*/gi, '').trim();

        // Boş string kontrolü
        if (cleaned === '' || cleaned === '-') return 0;

        // Binlik nokta + ondalık virgül (Türkçe format): 1.267,47
        if (cleaned.includes(',') && cleaned.includes('.')) {
            // Noktaları kaldır (binlik ayırıcı), virgülü noktaya çevir
            cleaned = cleaned.replace(/\./g, '').replace(',', '.');
        }
        // Sadece virgül var (Türkçe ondalık): 267,47
        else if (cleaned.includes(',')) {
            cleaned = cleaned.replace(',', '.');
        }
        // Sadece nokta var: zaten doğru format veya binlik ayırıcı
        // 267.47 → doğru, 1.267 → binlik olabilir ama bağlamda genelde ondalık

        const result = parseFloat(cleaned);
        return isNaN(result) ? 0 : result;
    },

    /**
     * Sayıyı XML formatına çevirir (noktalı, 2 ondalık basamak).
     * 267.47 → "267.47"
     * 0 → "0.00"
     *
     * @param {number|string} value - Sayısal değer
     * @param {number} decimals - Ondalık basamak sayısı (varsayılan: 2)
     * @returns {string} XML-uyumlu sayı string'i
     */
    toXmlAmount(value, decimals = 2) {
        const num = typeof value === 'number' ? value : this.parseAmount(value);
        return num.toFixed(decimals);
    },

    /**
     * Sayıyı Türkçe görüntüleme formatına çevirir.
     * 267.47 → "267,47"
     * 1267.47 → "1.267,47"
     *
     * @param {number|string} value - Sayısal değer
     * @returns {string} Türkçe formatlı sayı
     */
    toDisplayAmount(value) {
        const num = typeof value === 'number' ? value : this.parseAmount(value);
        return num.toLocaleString('tr-TR', {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2
        });
    },

    /**
     * İki ondalıklı sayının eşitliğini kontrol eder (kayan nokta hataları için).
     * @param {number} a
     * @param {number} b
     * @param {number} tolerance - Tolerans (varsayılan: 0.01)
     * @returns {boolean}
     */
    isEqual(a, b, tolerance = 0.01) {
        return Math.abs(a - b) < tolerance;
    }
};
