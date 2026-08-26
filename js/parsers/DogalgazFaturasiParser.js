/**
 * DogalgazFaturasiParser.js
 * İGDAŞ ve genel Doğalgaz faturalarını ayrıştıran parser.
 */
class DogalgazFaturasiParser extends BaseFaturaParser {
    getParserName() {
        return 'İGDAŞ Doğalgaz Faturası';
    }

    getParserDescription() {
        return 'İGDAŞ e-Fatura PDF belgelerini destekler.';
    }

    parse(pdfText) {
        this.pdfText = pdfText;
        const data = this.getEmptyData();

        data.faturaTuru = 'Doğalgaz';
        data.ettn = this._extractEttn();
        data.faturaNo = this._extractFaturaNo();
        
        // Alıcı Bilgileri
        data.aliciUnvan = this._extractAliciUnvan();
        data.aliciVkn = this._extractAliciVkn();
        data.aliciVergiDairesi = this._extractAliciVergiDairesi();
        
        const fTarih = this._extractFaturaTarihi();
        data.faturaTarihi = fTarih;
        data.faturaSaati = '00:00:00'; // Sabit veya regex eklenebilir

        data.sonOdemeTarihi = this._extractSonOdemeTarihi();
        data.donemBaslangic = this._extractDonemBaslangic();
        data.donemBitis = this._extractDonemBitis();

        data.hizmetNo = this._extractHizmetNo(); // Tesisat No veya Sözleşme Hesap
        data.tuketimMiktari = this._extractTuketimMiktari();

        // Mali bilgiler
        data.odenecekTutar = this._extractOdenecekTutar();
        data.matrah = this._extractMatrah();
        data.kdvTutar = this._extractKdvTutar();
        
        // KDV oranını varsayılan %20 olarak belirle
        data.kdvOran = 20; 
        
        data.oivTutar = 0; // Doğalgazda ÖİV genellikle yoktur
        data.oivOran = 0;

        data.toplamVergi = data.kdvTutar;
        data.faturaTutari = data.odenecekTutar;

        return data;
    }

    getEmptyData() {
        return {
            faturaTuru: 'Doğalgaz',
            faturaNo: '',
            ettn: '',
            faturaTarihi: '',
            faturaSaati: '00:00:00',
            hizmetNo: '',
            tuketimMiktari: 0,
            sonOdemeTarihi: '',
            donemBaslangic: '',
            donemBitis: '',
            odenecekTutar: 0,
            matrah: 0,
            kdvOran: 20,
            kdvTutar: 0,
            oivOran: 0,
            oivTutar: 0,
            toplamVergi: 0,
            faturaTutari: 0,
            oncekiDevir: 0,
            gelecekDevir: 0
        };
    }

    // ─── Regex Metotları ──────────────────────────────────────────

    _extractEttn() {
        return this.extractField(/ETTN\s*:\s*([A-Fa-f0-9\-]{36})/i) ||
               this.extractField(/([A-Fa-f0-9]{8}-[A-Fa-f0-9]{4}-[A-Fa-f0-9]{4}-[A-Fa-f0-9]{4}-[A-Fa-f0-9]{12})/i);
    }

    _extractFaturaNo() {
        // ES0 ile başlayan seri no veya FATURA NO: xxx
        return this.extractField(/Fatura\s+No\s*:\s*([A-Z0-9]{16})/i) || 
               this.extractField(/Fatura\s+No\s*:\s*([A-Z0-9]{12})/i) ||
               this.extractField(/Seri\/Sıra\s+No\s*:\s*([A-Z0-9]{16})/i) ||
               '';
    }

    _extractFaturaTarihi() {
        const val = this.extractField(/Fatura\s+Tarihi\s*[:\n]\s*([\d]{2}[\.\/\-][\d]{2}[\.\/\-][\d]{4})/i);
        return val ? DateUtils.toISODate(val) : '';
    }

    _extractSonOdemeTarihi() {
        const val = this.extractField(/Son\s+Ödeme\s+Tarihi\s*[:\n]\s*([\d]{2}[\.\/\-][\d]{2}[\.\/\-][\d]{4})/i) ||
                    this.extractField(/Son\s+Öd\.\s+Ta\.\s*[:\n]\s*([\d]{2}[\.\/\-][\d]{2}[\.\/\-][\d]{4})/i);
        return val ? DateUtils.toISODate(val) : '';
    }

    _extractDonemBaslangic() {
        const val = this.extractField(/İlk\s+Okuma\s+Tarihi[\s\S]*?:\s*([\d]{2}[\.\/\-][\d]{2}[\.\/\-][\d]{4})/i) ||
                    this.extractField(/İlk\s+Endeks[\s\S]*?:\s*[\d\.,]+\s*([\d]{2}[\.\/\-][\d]{2}[\.\/\-][\d]{4})/i);
        return val ? DateUtils.toISODate(val) : '';
    }

    _extractDonemBitis() {
        const val = this.extractField(/İlk\s+Okuma\s+Tarihi[\s\S]*?:\s*[\d]{2}[\.\/\-][\d]{2}[\.\/\-][\d]{4}\s*-\s*([\d]{2}[\.\/\-][\d]{2}[\.\/\-][\d]{4})/i) ||
                    this.extractField(/Son\s+Okuma\s+Tarihi[\s\S]*?:\s*([\d]{2}[\.\/\-][\d]{2}[\.\/\-][\d]{4})/i) ||
                    this.extractField(/Son\s+Endeks[\s\S]*?:\s*[\d\.,]+\s*([\d]{2}[\.\/\-][\d]{2}[\.\/\-][\d]{4})/i);
        return val ? DateUtils.toISODate(val) : '';
    }

    _extractHizmetNo() {
        return this.extractField(/Tesisat\s+No\s*:\s*([\d]+)/i) || 
               this.extractField(/Sözleşme\s+Hesabı\s*:\s*([\d]+)/i) || 
               '';
    }

    _extractTuketimMiktari() {
        // MEBBİS doğalgaz faturasında tüketim miktarı olarak KWH cinsinden Toplam Tüketim Bedeli değerini bekliyor
        const val = this.extractField(/Toplam\s+Tüketim\s+Bedeli[\s\S]*?([\d\.,]+)\s*KWH/i) ||
                    this.extractField(/Düzeltilmiş\s+Tüketim[\s\S]*?:\s*([\d\.,]+)/i) || 
                    this.extractField(/Sayaçtan\s+Ölçülen\s+Hacim[\s\S]*?:\s*([\d\.,]+)/i) || 
                    this.extractField(/Tüketim\s+Miktarı[\s\S]*?:\s*([\d\.,]+)/i);
        return val ? NumberUtils.parseAmount(val) : 0;
    }

    _extractOdenecekTutar() {
        const val = this.extractField(/ÖDENECEK\s+TUTAR\s*[:\n]\s*([\d\.,]+)/i) || 
                    this.extractField(/Fatura\s+Tutarı\s*[:\n]\s*([\d\.,]+)/i) ||
                    this.extractField(/Genel\s+Toplam\s*[:\n]\s*([\d\.,]+)/i);
        return val ? NumberUtils.parseAmount(val) : 0;
    }

    _extractMatrah() {
        const val = this.extractField(/KDV\s+Matrahı\s*[:\n]\s*([\d\.,]+)/i) || 
                    this.extractField(/Matrah\s*[:\n]\s*([\d\.,]+)/i) ||
                    this.extractField(/Toplam\s+Tutar\s*[:\n]\s*([\d\.,]+)/i); // Vergiler hariç toplam
        return val ? NumberUtils.parseAmount(val) : 0;
    }

    _extractKdvTutar() {
        const val = this.extractField(/Hesaplanan\s+KDV[\s\S]*?:\s*([\d\.,]+)/i) || 
                    this.extractField(/KDV\s+Tutarı[\s\S]*?:\s*([\d\.,]+)/i) ||
                    this.extractField(/KDV\s*\(%20\)[\s\S]*?:\s*([\d\.,]+)/i) ||
                    this.extractField(/KDV\s*\(%18\)[\s\S]*?:\s*([\d\.,]+)/i);
        return val ? NumberUtils.parseAmount(val) : 0;
    }

    _extractAliciUnvan() {
        // SAYIN kelimesinden sonraki satırı al
        const match = this.pdfText.match(/SAYIN\s*\n\s*(.*?)\n/i);
        return match ? match[1].trim() : '';
    }

    _extractAliciVkn() {
        return this.extractField(/VKN\s*:\s*([\d]+)/i) ||
               this.extractField(/TCKN\s*:\s*([\d]+)/i) ||
               this.extractField(/Vergi\s+No\s*:\s*([\d]+)/i) || '';
    }

    _extractAliciVergiDairesi() {
        return this.extractField(/Vergi\s+Dairesi\s*:\s*(.*)/i) || '';
    }
}
