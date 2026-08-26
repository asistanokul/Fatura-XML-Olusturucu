/**
 * BaseFaturaParser.js
 * Tüm fatura ayrıştırıcılarının (parser) türetilebileceği soyut temel sınıf.
 *
 * İleride ElektrikFaturasiParser, DogalgazFaturasiParser gibi yeni
 * fatura türleri eklendiğinde bu sınıftan türetilecek ve sadece
 * kendi regex kurallarını tanımlayacaklar.
 */

class BaseFaturaParser {

    constructor() {
        if (new.target === BaseFaturaParser) {
            throw new Error('BaseFaturaParser doğrudan kullanılamaz. Bir alt sınıf oluşturun.');
        }
        this.pdfText = '';
    }

    /**
     * PDF metnini ayrıştırarak fatura verisine dönüştürür.
     * Alt sınıflar tarafından override edilmelidir.
     *
     * @param {string} pdfText - PDF'ten çıkarılan ham metin
     * @returns {object} Ayrıştırılmış fatura verisi
     */
    parse(pdfText) {
        throw new Error('parse() metodu alt sınıf tarafından implement edilmelidir.');
    }

    /**
     * Parser'ın adını döndürür. Alt sınıflar override etmelidir.
     * @returns {string}
     */
    getParserName() {
        return 'Bilinmeyen Fatura Türü';
    }

    /**
     * Fatura türünün Türkçe açıklamasını döndürür.
     * @returns {string}
     */
    getParserDescription() {
        return '';
    }

    // ─── Ortak Yardımcı Metotlar ─────────────────────────────────

    /**
     * Verilen regex ile PDF metninden tek bir değer yakalar.
     * @param {RegExp} regex - Yakalama grubu içeren regex
     * @param {number} groupIndex - Yakalama grubu indeksi (varsayılan: 1)
     * @returns {string|null} Yakalanan değer veya null
     */
    extractField(regex, groupIndex = 1) {
        const match = this.pdfText.match(regex);
        if (match && match[groupIndex] !== undefined) {
            return match[groupIndex].trim();
        }
        return null;
    }

    /**
     * Verilen regex ile PDF metninden tüm eşleşmeleri yakalar.
     * @param {RegExp} regex - Global flag'li regex
     * @returns {Array} Tüm eşleşmelerin dizisi
     */
    extractAllFields(regex) {
        const matches = [];
        let match;
        const globalRegex = new RegExp(regex.source, regex.flags.includes('g') ? regex.flags : regex.flags + 'g');
        while ((match = globalRegex.exec(this.pdfText)) !== null) {
            matches.push(match);
        }
        return matches;
    }

    /**
     * Tarih string'ini ISO formatına çevirir (DateUtils wrapper).
     * @param {string} dateStr
     * @returns {string} YYYY-MM-DD
     */
    parseDate(dateStr) {
        return DateUtils.toISODate(dateStr);
    }

    /**
     * Tutar string'ini sayıya çevirir (NumberUtils wrapper).
     * @param {string} amountStr
     * @returns {number}
     */
    parseAmount(amountStr) {
        return NumberUtils.parseAmount(amountStr);
    }

    /**
     * Ayrıştırılmış veriyi doğrular. Alt sınıflar override edebilir.
     * @param {object} data - Ayrıştırılmış fatura verisi
     * @returns {{valid: boolean, errors: string[], warnings: string[]}}
     */
    validate(data) {
        const errors = [];
        const warnings = [];

        // Temel zorunlu alan kontrolleri
        if (!data.faturaNo) errors.push('Fatura numarası bulunamadı.');
        if (!data.ettn) errors.push('ETTN (UUID) bulunamadı.');
        if (!data.faturaTarihi) errors.push('Fatura tarihi bulunamadı.');
        if (!data.odenecekTutar || data.odenecekTutar <= 0) errors.push('Ödenecek tutar bulunamadı veya geçersiz.');

        // Mali tutarlılık kontrolü
        if (data.matrah && data.kdvTutar && data.oivTutar) {
            const hesaplananToplam = data.matrah + data.kdvTutar + data.oivTutar;
            if (!NumberUtils.isEqual(hesaplananToplam, data.faturaTutari || 0, 0.02)) {
                warnings.push(`Mali tutarsızlık: Matrah(${data.matrah}) + KDV(${data.kdvTutar}) + ÖİV(${data.oivTutar}) = ${hesaplananToplam.toFixed(2)}, Fatura Tutarı: ${data.faturaTutari}`);
            }
        }

        return {
            valid: errors.length === 0,
            errors,
            warnings
        };
    }

    /**
     * Boş/varsayılan bir fatura veri nesnesi döndürür.
     * @returns {object}
     */
    getEmptyData() {
        return {
            // Fatura Başlık
            faturaNo: '',
            ettn: '',
            faturaTarihi: '',
            profilID: 'TEMELFATURA',
            faturaTipiKodu: 'SATIS',

            // Dönem
            donemBaslangic: '',
            donemBitis: '',

            // Son Ödeme
            sonOdemeTarihi: '',

            // Alıcı Bilgileri
            aliciUnvan: '',
            aliciVkn: '',
            aliciVergiDairesi: '',
            aliciAdres: '',
            aliciIlce: '',
            aliciSehir: '',
            aliciPostaKodu: '',
            aliciUlke: 'TÜRKİYE',
            aliciHizmetNo: '',

            // Mali Bilgiler
            matrah: 0,
            kdvOran: 20,
            kdvTutar: 0,
            oivOran: 10,
            oivTutar: 0,
            toplamVergi: 0,
            faturaTutari: 0,     // Vergili (TaxInclusiveAmount)
            oncekiDevir: 0,
            gelecekDevir: 0,
            odenecekTutar: 0,    // PayableAmount

            // Diğer
            hesapNo: '',
            birSonrakiFKT: '',
            birSonrakiSOT: '',
            yaziIleTutar: '',
            tarifeAdi: '',

            // Not alanları
            notlar: []
        };
    }
}
