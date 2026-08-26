/**
 * TelefonFaturasiParser.js
 * Türk Telekom telefon faturası PDF'ini ayrıştıran parser.
 * BaseFaturaParser'dan türetilmiş olup, Türk Telekom formatına özel
 * regex kurallarını içerir.
 *
 * İleride yeni bir kurum formatı geldiğinde (ör: Vodafone, Turkcell),
 * bu sınıf klonlanarak sadece regex kuralları değiştirilir.
 */

class TelefonFaturasiParser extends BaseFaturaParser {

    constructor() {
        super();
    }

    getParserName() {
        return 'Türk Telekom Telefon Faturası';
    }

    getParserDescription() {
        return 'Türk Telekomünikasyon A.Ş. tarafından düzenlenen sabit hat telefon faturalarını ayrıştırır.';
    }

    /**
     * PDF metnini ayrıştırarak fatura verisine dönüştürür.
     * @param {string} pdfText - PDF'ten çıkarılan ham metin
     * @returns {object} Ayrıştırılmış fatura verisi
     */
    parse(pdfText) {
        this.pdfText = pdfText;
        const data = this.getEmptyData();

        // ─── Fatura Başlık Bilgileri ───────────────────────────
        data.faturaNo = this._extractFaturaNo();
        data.ettn = this._extractETTN();
        data.faturaTarihi = this._extractFaturaTarihi();

        // ─── Dönem Bilgileri ───────────────────────────────────
        const donem = this._extractDonem();
        data.donemBaslangic = donem.baslangic;
        data.donemBitis = donem.bitis;

        // ─── Son Ödeme Tarihi ──────────────────────────────────
        data.sonOdemeTarihi = this._extractSonOdemeTarihi();

        // ─── Alıcı Bilgileri ───────────────────────────────────
        const alici = this._extractAliciBilgileri();
        data.aliciUnvan = alici.unvan;
        data.aliciVkn = alici.vkn;
        data.aliciVergiDairesi = alici.vergiDairesi;
        data.aliciAdres = alici.adres;
        data.aliciSehir = alici.sehir;
        data.aliciHizmetNo = alici.hizmetNo;

        // ─── Mali Bilgiler ─────────────────────────────────────
        const mali = this._extractMaliBilgiler();
        data.matrah = mali.matrah;
        data.kdvOran = mali.kdvOran;
        data.kdvTutar = mali.kdvTutar;
        data.oivOran = mali.oivOran;
        data.oivTutar = mali.oivTutar;
        data.toplamVergi = mali.toplamVergi;
        data.faturaTutari = mali.faturaTutari;
        data.oncekiDevir = mali.oncekiDevir;
        data.gelecekDevir = mali.gelecekDevir;
        data.odenecekTutar = mali.odenecekTutar;

        // ─── Diğer Bilgiler ────────────────────────────────────
        data.hesapNo = this._extractHesapNo();
        data.birSonrakiFKT = this._extractBirSonrakiFKT();
        data.birSonrakiSOT = this._extractBirSonrakiSOT();
        data.yaziIleTutar = this._extractYaziIleTutar();
        data.tarifeAdi = this._extractTarifeAdi();

        // ─── Kullanım/İndirim Detayları ────────────────────────
        data.kullanimUcretleri = this._extractDetayTutar('KULLANIM ÜCRETLERİ');
        data.digerUcretler = this._extractDetayTutar('DİĞER ÜCRETLER');
        data.indirimler = this._extractDetayTutar('İNDİRİMLER');

        return data;
    }

    // ═══════════════════════════════════════════════════════════
    //  PRİVATE METOTLAR — Regex Kuralları
    // ═══════════════════════════════════════════════════════════

    _extractFaturaNo() {
        return this.extractField(/Fatura\s+ID\s*:\s*([A-Za-z0-9]+)/i) || '';
    }

    _extractETTN() {
        return this.extractField(/ETTN\s*:\s*([0-9a-fA-F\-]{36})/i) || '';
    }

    _extractFaturaTarihi() {
        // İki formata da uyması için daha genel bir regex
        // "Fatura Tarihi : 31-07-2026" veya "Fatura Tarihi \n : 31 Temmuz 2026 23:59"
        const raw = this.extractField(/Fatura\s+Tarihi\s*:?\s*([0-9]{1,2}[\s\-\/\.a-zA-ZçÇğĞıİöÖşŞüÜ]+[0-9]{4})/i);
        return raw ? this.parseDate(raw) : '';
    }

    _extractDonem() {
        // "Fatura Dönemi : 29/06/2026 - 29/07/2026" veya "Fatura Dönemi : 29 Haziran 2026 - 29 Temmuz 2026"
        const match = this.pdfText.match(
            /Fatura\s+Dönemi\s*:?\s*([0-9]{1,2}[\s\-\/\.a-zA-ZçÇğĞıİöÖşŞüÜ]+[0-9]{4})\s*-\s*([0-9]{1,2}[\s\-\/\.a-zA-ZçÇğĞıİöÖşŞüÜ]+[0-9]{4})/i
        );
        if (match) {
            return {
                baslangic: this.parseDate(match[1]),
                bitis: this.parseDate(match[2])
            };
        }
        return { baslangic: '', bitis: '' };
    }

    _extractSonOdemeTarihi() {
        const raw = this.extractField(/SON\s+ÖDEME\s+TARİHİ\s*:\s*(\d{2}\/\d{2}\/\d{4})/i);
        return raw ? this.parseDate(raw) : '';
    }

    _extractAliciBilgileri() {
        const result = {
            unvan: '',
            vkn: '',
            vergiDairesi: '',
            adres: '',
            sehir: '',
            hizmetNo: ''
        };

        // Hizmet No
        const hizmetNo = this.extractField(/HİZMET\s+NO\s*:\s*(.+)/i);
        if (hizmetNo) result.hizmetNo = hizmetNo.trim();

        // Vergi Dairesi ve VKN
        const vergiMatch = this.pdfText.match(
            /Vergi\s+Dairesi\/No(?:\/TCKN)?\s*:\s*([A-ZÜÖŞİÇĞa-züöşiçğ\s\.]+?)\s*\/\s*(\d+)/i
        );
        if (vergiMatch) {
            result.vergiDairesi = vergiMatch[1].replace(/\s+/g, ' ').trim();
            result.vkn = vergiMatch[2].trim();
        }

        // Unvan ve Adres çıkarma (Çoklu Strateji)
        const lines = this.pdfText.split('\n').map(l => l.trim()).filter(l => l.length > 0);
        let aliciLines = [];

        // Yöntem 1: Yeni Format -> "İLETİŞİM HİZMET FATURASI" ile "Türk Telekomünikasyon A.Ş." arası
        const iletisimIndex = lines.findIndex(l => l.includes('İLETİŞİM HİZMET FATURASI') || l.includes('ILETISIM HIZMET FATURASI'));
        const ttIndex = lines.findIndex(l => l.includes('Türk Telekomünikasyon') || l.includes('Turk Telekomunikasyon'));

        if (iletisimIndex >= 0 && ttIndex > iletisimIndex && (ttIndex - iletisimIndex) < 10) {
            aliciLines = lines.slice(iletisimIndex + 1, ttIndex).filter(l => !l.includes('e-Arşiv') && !l.includes('e-Fatura'));
        }

        // Yöntem 2: Eski Format -> "Fax:" ile "ETTN:" (veya e-Fatura) arası
        if (aliciLines.length === 0) {
            // Son fax satırını bul (birden fazla olabilir)
            const faxIndex = lines.findLastIndex(l => /^Faks?:/i.test(l) || /Fax:/i.test(l) || l.includes('www.turktelekom.com.tr'));
            const ettnIndex = lines.findIndex(l => /^ETTN:/i.test(l) || l.includes('e-Fatura') || /^Fatura\s+ID:/i.test(l));

            // Eğer aradaki mesafe kısaysa ve içinde Hizmet No vs yoksa, burası adrestir.
            if (faxIndex >= 0 && ettnIndex > faxIndex && (ettnIndex - faxIndex) < 8) {
                const aradakiSatirlar = lines.slice(faxIndex + 1, ettnIndex);
                const isInvalid = aradakiSatirlar.some(l => l.includes('HİZMET NO') || l.includes('Hesap No') || l.includes('Fatura Dönemi'));
                
                if (!isInvalid) {
                    aliciLines = aradakiSatirlar;
                }
            }
        }

        // Yöntem 3: Okul/Kurum isminden yakalama (Fallback)
        if (aliciLines.length === 0) {
             const okulIndex = lines.findIndex(l => /LİSESİ|LISESI|İLKOKULU|ILKOKULU|ORTAOKULU|MÜDÜRLÜĞÜ|MUDURLUGU|ANAOKULU|MERKEZİ|KURUMU/i.test(l) && !l.includes('Fatura') && !l.includes('Telekom'));
             if (okulIndex >= 0) {
                 aliciLines = lines.slice(okulIndex, okulIndex + 3);
                 const cutIndex = aliciLines.findIndex(l => l.includes('HİZMET NO') || l.includes('ETTN') || l.includes('e-Fatura') || l.includes('Türk Telekom'));
                 if (cutIndex > 0) {
                     aliciLines = aliciLines.slice(0, cutIndex);
                 }
             }
        }

        // Sonuçları Ayrıştırma
        if (aliciLines.length > 0) {
            result.unvan = aliciLines[0];

            if (aliciLines.length >= 2) {
                const adresSatirlari = aliciLines.slice(1);
                result.adres = adresSatirlari.join(' ').trim();

                const sonSatir = adresSatirlari[adresSatirlari.length - 1];
                const iller = "ADANA|ADIYAMAN|AFYONKARAHISAR|AGRI|AMASYA|ANKARA|ANTALYA|ARTVIN|AYDIN|BALIKESIR|BILECIK|BINGOL|BITLIS|BOLU|BURDUR|BURSA|CANAKKALE|CANKIRI|CORUM|DENIZLI|DIYARBAKIR|EDIRNE|ELAZIG|ERZINCAN|ERZURUM|ESKISEHIR|GAZIANTEP|GIRESUN|GUMUSHANE|HAKKARI|HATAY|ISPARTA|MERSIN|ISTANBUL|IZMIR|KARS|KASTAMONU|KAYSERI|KIRKLARELI|KIRSEHIR|KOCAELI|KONYA|KUTAHYA|MALATYA|MANISA|KAHRAMANMARAS|MARDIN|MUGLA|MUS|NEVSEHIR|NIGDE|ORDU|RIZE|SAKARYA|SAMSUN|SIIRT|SINOP|SIVAS|TEKIRDAG|TOKAT|TRABZON|TUNCELI|SANLIURFA|USAK|VAN|YOZGAT|ZONGULDAK|AKSARAY|BAYBURT|KARAMAN|KIRIKKALE|BATMAN|SIRNAK|BARTIN|ARDAHAN|IGDIR|YALOVA|KARABUK|KILIS|OSMANIYE|DUZCE|SULTANGAZI|GAZİOSMANPAŞA|KÜÇÜKKÖY";

                const sehirRegex = new RegExp(`\\b(${iller})\\b`, 'i');
                const cleanAdres = result.adres.replace(/i/g, 'İ').replace(/ı/g, 'I').toUpperCase();
                const sehirMatch = cleanAdres.match(sehirRegex);

                if (sehirMatch) {
                    result.sehir = sehirMatch[1];
                } else if (/^[A-ZÜÖŞİÇĞ\s]+$/.test(sonSatir.trim())) {
                    result.sehir = sonSatir.trim();
                }
            }
        }

        if (!result.sehir) {
            if (result.adres.toUpperCase().includes('İSTANBUL') || result.adres.toUpperCase().includes('ISTANBUL')) result.sehir = 'İSTANBUL';
            else result.sehir = 'İSTANBUL';
        }

        return result;
    }

    _extractMaliBilgiler() {
        const result = {
            matrah: 0,
            kdvOran: 20,
            kdvTutar: 0,
            oivOran: 10,
            oivTutar: 0,
            toplamVergi: 0,
            faturaTutari: 0,
            oncekiDevir: 0,
            gelecekDevir: 0,
            odenecekTutar: 0
        };

        // Ücretler Toplamı (Matrah)
        const matrahStr = this.extractField(/ÜCRETLER\s+TOPLAMI\s+([\d.,]+)/i);
        if (matrahStr) result.matrah = this.parseAmount(matrahStr);

        // KDV
        const kdvMatch = this.pdfText.match(/KDV\s*%(\d+)\s*\(Matrah\s*([\d.,]+)\s*TL\s*\)\s+([\d.,]+)/i);
        if (kdvMatch) {
            result.kdvOran = parseInt(kdvMatch[1], 10);
            result.kdvTutar = this.parseAmount(kdvMatch[3]);
        }

        // ÖİV
        const oivMatch = this.pdfText.match(/ÖİV\s*%(\d+)\s*\(Matrah\s*([\d.,]+)\s*TL\s*\)\s+([\d.,]+)/i);
        if (oivMatch) {
            result.oivOran = parseInt(oivMatch[1], 10);
            result.oivTutar = this.parseAmount(oivMatch[3]);
        }

        // Vergiler toplamı
        const vergiToplamStr = this.extractField(/VERGİLER\s+TOPLAMI\s+([\d.,]+)/i);
        if (vergiToplamStr) {
            result.toplamVergi = this.parseAmount(vergiToplamStr);
        } else {
            result.toplamVergi = result.kdvTutar + result.oivTutar;
        }

        // Fatura Tutarı (vergili)
        const faturaTutariStr = this.extractField(/FATURA\s+TUTARI\s*\(TL\)\s+([\d.,]+)/i);
        if (faturaTutariStr) {
            result.faturaTutari = this.parseAmount(faturaTutariStr);
        } else {
            result.faturaTutari = result.matrah + result.toplamVergi;
        }

        // Önceki Aydan Devir
        const oncekiStr = this.extractField(/Önceki\s+Aydan\s+Devir\s+([\d.,]+)/i);
        if (oncekiStr) result.oncekiDevir = this.parseAmount(oncekiStr);

        // Gelecek Aya Devir
        const gelecekStr = this.extractField(/Gelecek\s+Aya\s+Devir\s*\(-?\)?\s+([\d.,]+)/i);
        if (gelecekStr) result.gelecekDevir = this.parseAmount(gelecekStr);

        // Ödenecek Tutar
        const odenecekMatch = this.pdfText.match(/ÖDENECEK\s+TUTAR\s*(?:\(TL\))?\s*:?\s*([\d.,]+)/i);
        if (odenecekMatch) {
            result.odenecekTutar = this.parseAmount(odenecekMatch[1]);
        } else {
            result.odenecekTutar = result.faturaTutari + result.oncekiDevir - result.gelecekDevir;
        }

        return result;
    }

    _extractHesapNo() {
        return this.extractField(/Hesap\s+No\s*:\s*(\d+)/i) || '';
    }

    _extractBirSonrakiFKT() {
        const raw = this.extractField(/Bir\s+Sonraki\s+Fatura\s+Kesim\s+Tarihi\s*:\s*(\d{2}\/\d{2}\/\d{4})/i);
        return raw || '';
    }

    _extractBirSonrakiSOT() {
        const raw = this.extractField(/Bir\s+Sonraki\s+Son\s+Ödeme\s+Tarihi\s*:\s*(\d{2}\/\d{2}\/\d{4})/i);
        return raw || '';
    }

    _extractYaziIleTutar() {
        return this.extractField(/Yalniz\s+(.+)/i) || '';
    }

    _extractTarifeAdi() {
        // Tarife tablosundaki ilk tarife adını çek
        // "Is Telefonu Her Yöne 250 (PSTN)" gibi
        const lines = this.pdfText.split('\n');
        const tarifeBaslikIdx = lines.findIndex(l => /TARİFE\s+BİLGİLERİ/i.test(l));
        if (tarifeBaslikIdx >= 0) {
            // Tarife adı genelde birkaç satır sonra gelir
            for (let i = tarifeBaslikIdx + 1; i < Math.min(tarifeBaslikIdx + 20, lines.length); i++) {
                const line = lines[i].trim();
                // Tarife adı genelde "(PSTN)" veya "(GSM)" ile biter veya "Telefonu" içerir
                if (/\(PSTN\)|\(GSM\)|Telefonu|Tarife/i.test(line) && line.length > 10) {
                    return line;
                }
            }
        }
        // Alternatif: TARİFENİZ alanından
        return this.extractField(/TARİFENİZ:\s*(.+)/i) || 'Is Telefonu Her Yöne 250 (PSTN)';
    }

    _extractDetayTutar(label) {
        const regex = new RegExp(label + '\\s+([\\d.,]+)', 'i');
        const val = this.extractField(regex);
        return val ? this.parseAmount(val) : 0;
    }
}
