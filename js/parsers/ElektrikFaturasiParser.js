/**
 * ElektrikFaturasiParser.js
 * CK Boğaziçi ve genel Elektrik faturalarını ayrıştıran parser.
 * BaseFaturaParser'dan türetilmiş olup, Elektrik formatına özel regex kurallarını içerir.
 */

class ElektrikFaturasiParser extends BaseFaturaParser {

    constructor() {
        super();
    }

    getParserName() {
        return 'Elektrik Faturası (CK Boğaziçi)';
    }

    getParserDescription() {
        return 'Elektrik tüketim faturalarını ayrıştırır. Ek olarak tüketim miktarı ve okuma tarihlerini çeker.';
    }

    /**
     * PDF metnini ayrıştırarak fatura verisine dönüştürür.
     */
    parse(pdfText) {
        this.pdfText = pdfText;
        const data = this.getEmptyData();

        // ─── Fatura Başlık Bilgileri ───────────────────────────
        data.faturaTuru = 'Elektrik'; // Özel belirteç (UblXmlGenerator vb. yerlerde kullanılacak)
        data.faturaNo = this._extractFaturaNo();
        data.ettn = this._extractETTN();
        data.faturaTarihi = this._extractFaturaTarihi();
        
        const donem = this._extractDonem();
        data.donemBaslangic = donem.baslangic;
        data.donemBitis = donem.bitis;
        data.sonOdemeTarihi = this._extractSonOdemeTarihi();

        // ─── Taraf Bilgileri ───────────────────────────────────
        const alici = this._extractAliciBilgileri();
        data.aliciUnvan = alici.unvan;
        data.aliciVkn = alici.vkn;
        data.aliciVergiDairesi = alici.vergiDairesi;
        data.aliciAdres = alici.adres;
        data.aliciSehir = alici.sehir;
        data.hizmetNo = alici.hizmetNo; // Hesap/Tesisat no

        // ─── Elektrik Spesifik Alanlar ─────────────────────────
        data.tuketimMiktari = this._extractTuketimMiktari();
        data.ilkOkumaTarihi = this._extractIlkOkumaTarihi();
        data.sonOkumaTarihi = this._extractSonOkumaTarihi();

        // ─── Finansal Bilgiler ─────────────────────────────────
        data.odenecekTutar = this._extractOdenecekTutar();
        data.matrah = this._extractMatrah(); // KDV matrahı (toplam vergisiz tutar)
        
        // KDV
        const kdv = this._extractKDV();
        data.kdvOrani = kdv.oran;
        data.kdvTutari = kdv.tutar;
        
        // Elektrik Tüketim Vergisi (BTV / ETHTV) vb diğer vergiler toplamı (ÖİV gibi)
        const oiv = this._extractOIV();
        data.oivOrani = oiv.oran;
        data.oivTutari = oiv.tutar;

        return data;
    }

    // ═══════════════════════════════════════════════════════════
    // ÇIKARIM YARDIMCI METOTLARI (REGEX'LER)
    // ═══════════════════════════════════════════════════════════

    _extractFaturaNo() {
        return this.extractField(/Fatura\s+Sıra\s+No\s*:\s*([A-Za-z0-9]+)/i) || '';
    }

    _extractETTN() {
        return this.extractField(/ETTN\s*:\s*([0-9a-fA-F\-]{36})/i) || '';
    }

    _extractFaturaTarihi() {
        let tarih = this.extractField(/Son[\s\n]*Okuma[\s\n]*Tarihi[\s\n]*:?[\s\n]*([0-9]{2}[\-\/\.][0-9]{2}[\-\/\.][0-9]{4})/i) 
                 || this.extractField(/Fatura[\s\n]*Tarihi[\s\n]*:?[\s\n]*([0-9]{2}[\-\/\.][0-9]{2}[\-\/\.][0-9]{4})/i);
        
        if (!tarih) {
            const match = this.pdfText.match(/Okuma\s+Günü[\s\n]*([0-9]{2}[\-\/\.][0-9]{2}[\-\/\.][0-9]{4})[\s\n]*([0-9]{2}[\-\/\.][0-9]{2}[\-\/\.][0-9]{4})/i);
            if (match) tarih = match[2];
        }
        return tarih ? this.parseDate(tarih) : '';
    }

    _extractDonem() {
        const raw = this.extractField(/Fatura[\s\n]*Dönemi[\s\n]*:?[\s\n]*(.+)/i);
        if (raw) {
             const ilkOkuma = this._extractIlkOkumaTarihi();
             const sonOkuma = this._extractSonOkumaTarihi();
             if (ilkOkuma && sonOkuma) {
                 return { baslangic: ilkOkuma, bitis: sonOkuma };
             }
        }
        return { baslangic: '', bitis: '' };
    }

    _extractIlkOkumaTarihi() {
        let tarih = this.extractField(/İlk[\s\n]*Okuma[\s\n]*Tarihi[\s\n]*:?[\s\n]*([0-9]{2}[\-\/\.][0-9]{2}[\-\/\.][0-9]{4})/i);
        if (!tarih) {
            const match = this.pdfText.match(/Okuma\s+Günü[\s\n]*([0-9]{2}[\-\/\.][0-9]{2}[\-\/\.][0-9]{4})/i);
            if (match) tarih = match[1];
        }
        return tarih ? this.parseDate(tarih) : '';
    }

    _extractSonOkumaTarihi() {
        let tarih = this.extractField(/Son[\s\n]*Okuma[\s\n]*Tarihi[\s\n]*:?[\s\n]*([0-9]{2}[\-\/\.][0-9]{2}[\-\/\.][0-9]{4})/i);
        if (!tarih) {
            const match = this.pdfText.match(/Okuma\s+Günü[\s\n]*([0-9]{2}[\-\/\.][0-9]{2}[\-\/\.][0-9]{4})[\s\n]*([0-9]{2}[\-\/\.][0-9]{2}[\-\/\.][0-9]{4})/i);
            if (match) tarih = match[2];
        }
        return tarih ? this.parseDate(tarih) : '';
    }

    _extractTuketimMiktari() {
        // 1. Aynı satırda veya ardışık düzende olma ihtimali
        const tekZamanliMatch = this.pdfText.match(/Tek[\s\n]+Zamanlı[\s\n]+([\d.,]+)[\s\n]+([\d.,]+)[\s\n]+([\d.,]+)/i);
        if (tekZamanliMatch) {
            return this.parseAmount(tekZamanliMatch[3]).toString();
        }
        
        // 2. Aktif Tüketim Notu
        const aktifTuketim = this.extractField(/Aktif[\s\n]+Tüketim[\s\n]*:?[\s\n]*([\d.,]+)/i);
        if (aktifTuketim) {
            return this.parseAmount(aktifTuketim).toString();
        }
        
        // 3. Enerji Bedeli SKTT
        const enerjiBedeliMatch = this.pdfText.match(/Enerji[\s\n]+Bedeli[\s\n]+SKTT[\s\n]+([\d.,]+)/i);
        if (enerjiBedeliMatch) {
            return this.parseAmount(enerjiBedeliMatch[1]).toString();
        }

        return "0";
    }

    _extractSonOdemeTarihi() {
        let raw = this.extractField(/Son[\s\n]+[ÖOöo]deme[\s\n]+Tarihi[\s\n]*:?[\s\n]*([0-9]{2}[\s\-\/\.a-zA-ZçÇğĞıİöÖşŞüÜ]+[0-9]{4})/i);
        
        if (!raw) {
            const lines = this.pdfText.split('\n').map(l => l.trim());
            const idx = lines.findIndex(l => /Son\s*[ÖOöo]deme/i.test(l));
            if (idx >= 0) {
                 for (let i = idx; i <= idx + 5 && i < lines.length; i++) {
                     const match = lines[i].match(/([0-9]{2}[\s\-\/\.a-zA-ZçÇğĞıİöÖşŞüÜ]+[0-9]{4})/);
                     if (match) {
                         raw = match[1];
                         break;
                     }
                 }
            }
        }
        
        return raw ? this.parseDate(raw) : '';
    }

    _extractAliciBilgileri() {
        const result = { unvan: '', vkn: '', vergiDairesi: '', adres: '', sehir: '', hizmetNo: '' };

        // Sözleşme Hesap No / Tesisat No
        let hesapNo = this.extractField(/Sözleşme\s+Hesap\s+No\s*:\s*([0-9]+)/i);
        if (!hesapNo) hesapNo = this.extractField(/Tekil\s+Kod\/Tesisat\s+No\s*:\s*([0-9]+)/i);
        if (hesapNo) result.hizmetNo = hesapNo.trim();

        // TCKN/VKN
        const vknMatch = this.pdfText.match(/TCKN\/VKN\s*:\s*(\d+)\s*\/\s*(.+)/i);
        if (vknMatch) {
            result.vkn = vknMatch[1].trim();
            result.vergiDairesi = vknMatch[2].trim();
        }

        // Tüketici Bilgisi bloğu
        const lines = this.pdfText.split('\n').map(l => l.trim());
        const tuketiciIndex = lines.findIndex(l => l.includes('Tüketici Bilgisi') || l.includes('Müşteri Bilgileri'));
        const adresIndex = lines.findIndex(l => l.startsWith('Adres'));
        
        if (tuketiciIndex >= 0 && adresIndex > tuketiciIndex) {
            // Tüketici bilgisi başlığı ile Adres etiketi arasındaki satır Unvan'dır
            result.unvan = lines.slice(tuketiciIndex + 1, adresIndex).join(' ').trim();
            
            // Adres satırı
            result.adres = lines[adresIndex].replace(/Adres\s*:\s*/i, '').trim();
            
            // Şehir bulma
            const iller = "ADANA|ADIYAMAN|AFYONKARAHISAR|AGRI|AMASYA|ANKARA|ANTALYA|ARTVIN|AYDIN|BALIKESIR|BILECIK|BINGOL|BITLIS|BOLU|BURDUR|BURSA|CANAKKALE|CANKIRI|CORUM|DENIZLI|DIYARBAKIR|EDIRNE|ELAZIG|ERZINCAN|ERZURUM|ESKISEHIR|GAZIANTEP|GIRESUN|GUMUSHANE|HAKKARI|HATAY|ISPARTA|MERSIN|ISTANBUL|IZMIR|KARS|KASTAMONU|KAYSERI|KIRKLARELI|KIRSEHIR|KOCAELI|KONYA|KUTAHYA|MALATYA|MANISA|KAHRAMANMARAS|MARDIN|MUGLA|MUS|NEVSEHIR|NIGDE|ORDU|RIZE|SAKARYA|SAMSUN|SIIRT|SINOP|SIVAS|TEKIRDAG|TOKAT|TRABZON|TUNCELI|SANLIURFA|USAK|VAN|YOZGAT|ZONGULDAK|AKSARAY|BAYBURT|KARAMAN|KIRIKKALE|BATMAN|SIRNAK|BARTIN|ARDAHAN|IGDIR|YALOVA|KARABUK|KILIS|OSMANIYE|DUZCE|SULTANGAZI|GAZİOSMANPAŞA|KÜÇÜKKÖY";
            const sehirRegex = new RegExp(`\\b(${iller})\\b`, 'i');
            const cleanAdres = result.adres.replace(/i/g, 'İ').replace(/ı/g, 'I').toUpperCase();
            const sehirMatch = cleanAdres.match(sehirRegex);

            if (sehirMatch) {
                result.sehir = sehirMatch[1];
            } else if (cleanAdres.includes('İSTANBUL') || cleanAdres.includes('ISTANBUL')) {
                result.sehir = 'İSTANBUL';
            }
        }
        
        // Temizle
        result.adres = result.adres.replace(/\.,\.,/g, '').replace(/\/BTM,\.,/g, ' ').replace(/\s+/g, ' ').trim();

        return result;
    }

    _extractOdenecekTutar() {
        let tutar = this.extractField(/Ödenecek[\s\n]*Tutar[\s\n]*([\d.,]+)/i);
        if (!tutar) {
            tutar = this.extractField(/Fatura\s+Tutarı\s*([\d.,]+)/i);
        }
        return tutar ? this.parseAmount(tutar) : 0;
    }

    _extractMatrah() {
        const match = this.pdfText.match(/KDV\s*\(Matrah\s*([\d.,]+)\)/i);
        if (match) return this.parseAmount(match[1]);
        
        // Eğer matrah yoksa, Toplam Enerji Bedeli olabilir
        const teb = this.extractField(/Toplam\s+Enerji\s+Bedeli\s*([\d.,]+)/i);
        if (teb) return this.parseAmount(teb);

        return 0;
    }

    _extractKDV() {
        // KDV (Matrah 10.751,40) 2.150,28
        let oran = 20; // Default
        const kdvMatch = this.pdfText.match(/KDV\s*\(Matrah[^\)]+\)[\s\n]*([\d.,]+)/i);
        let tutar = 0;
        
        if (kdvMatch) {
             tutar = this.parseAmount(kdvMatch[1]);
        }
        
        // Oran belirtilmemişse hesapla
        if (tutar > 0) {
            const matrah = this._extractMatrah();
            if (matrah > 0) {
                const calcOran = Math.round((tutar / matrah) * 100);
                if (calcOran === 18 || calcOran === 20 || calcOran === 10 || calcOran === 1) oran = calcOran;
            }
        }

        return { oran, tutar };
    }

    _extractOIV() {
        // Elektrik Faturasında genelde BTV (Elektrik Tüketim Vergisi) olur
        // Elekt Ver. Hvgz Tük. Ver
        // 241,42
        const match = this.pdfText.match(/Elekt\s+Ver\.\s+Hvgz\s+Tük\.\s+Ver[\s\n]*([\d.,]+)/i);
        if (match) {
            return { oran: 0, tutar: this.parseAmount(match[1]), tur: 'BTV' };
        }
        return { oran: 0, tutar: 0 };
    }

}
