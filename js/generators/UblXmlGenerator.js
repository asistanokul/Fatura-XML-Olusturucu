/**
 * UblXmlGenerator.js
 * UBL-TR 2.1 formatında e-Fatura XML dosyası üreten modül.
 *
 * Orijinal Türk Telekom XML'inin yapısını (namespace'ler, etiket sırası,
 * hiyerarşi) birebir koruyarak, dinamik verilerle doldurur.
 *
 * ds:Signature bloğu, XSLT şablonu ve cac:Signature referansı çıkarılmıştır.
 * MEBBİS OTM sistemi bu blokları yeni XML'de aramaz.
 */

class UblXmlGenerator {

    /**
     * Fatura verisinden UBL-TR XML string'i üretir.
     * @param {object} data - TelefonFaturasiParser.parse() çıktısı
     * @returns {string} Geçerli UBL-TR XML string'i
     */
    generate(data) {
        const n = NumberUtils.toXmlAmount.bind(NumberUtils);

        // Yardımcı: XML özel karakterlerini escape et
        const esc = (str) => {
            if (!str) return '';
            return String(str)
                .replace(/&/g, '&amp;')
                .replace(/</g, '&lt;')
                .replace(/>/g, '&gt;')
                .replace(/"/g, '&quot;')
                .replace(/'/g, '&apos;');
        };

        // UUID (ETTN) yoksa yeni bir tane üret
        const uuid = data.ettn || this._generateUUID();
        
        // Tarihler boşsa MEBBİS'in 'String was not recognized as a valid DateTime' hatası vermemesi için bugünü kullan
        const today = DateUtils.today();
        const fTarih = data.faturaTarihi || today;
        const sOdeme = data.sonOdemeTarihi || today;
        const dBaslangic = data.donemBaslangic || today;
        const dBitis = data.donemBitis || today;

        return `<?xml version="1.0" encoding="UTF-8"?>
<Invoice xmlns="urn:oasis:names:specification:ubl:schema:xsd:Invoice-2" xmlns:cac="urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2" xmlns:cbc="urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2" xmlns:ds="http://www.w3.org/2000/09/xmldsig#" xmlns:ext="urn:oasis:names:specification:ubl:schema:xsd:CommonExtensionComponents-2" xmlns:xades="http://uri.etsi.org/01903/v1.3.2#" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:schemaLocation="urn:oasis:names:specification:ubl:schema:xsd:Invoice-2 ..\\xsd\\maindoc\\UBL-Invoice-2.1.xsd">
<ext:UBLExtensions>
<ext:UBLExtension>
<ext:ExtensionContent>
</ext:ExtensionContent>
</ext:UBLExtension>
</ext:UBLExtensions>
<cbc:UBLVersionID>2.1</cbc:UBLVersionID>
<cbc:CustomizationID>TR1.2</cbc:CustomizationID>
<cbc:ProfileID>${esc(data.profilID || 'TEMELFATURA')}</cbc:ProfileID>
<cbc:ID>${esc(data.faturaNo)}</cbc:ID>
<cbc:CopyIndicator>false</cbc:CopyIndicator>
<cbc:UUID>${esc(uuid)}</cbc:UUID>
<cbc:IssueDate>${esc(fTarih)}</cbc:IssueDate>
<cbc:InvoiceTypeCode>${esc(data.faturaTipiKodu || 'SATIS')}</cbc:InvoiceTypeCode>
${this._buildNotes(data, esc, n, dBaslangic, dBitis)}
<cbc:DocumentCurrencyCode>TRY</cbc:DocumentCurrencyCode>
<cbc:LineCountNumeric>1</cbc:LineCountNumeric>
<cac:InvoicePeriod>
<cbc:StartDate>${esc(dBaslangic)}</cbc:StartDate>
<cbc:EndDate>${esc(dBitis)}</cbc:EndDate>
</cac:InvoicePeriod>
${this._buildSupplierParty(data, esc)}
${this._buildCustomerParty(data, esc)}
${this._buildBuyerCustomerParty(data, esc)}
${this._buildPaymentMeans(data, esc, sOdeme)}
<cac:PaymentTerms>
<cbc:Note>Bir Sonraki Son Ödeme Tarihi : ${esc(data.birSonrakiSOT)}</cbc:Note>
</cac:PaymentTerms>
${this._buildTaxTotal(data, n)}
${this._buildLegalMonetaryTotal(data, n)}
${this._buildInvoiceLine(data, esc, n)}
</Invoice>`;
    }

    // ═══════════════════════════════════════════════════════════
    //  PRİVATE — XML Bölüm Üreticileri
    // ═══════════════════════════════════════════════════════════

    _buildNotes(data, esc, n, dBaslangic, dBitis) {
        const matrah = n(data.matrah);
        const odenecek = n(data.odenecekTutar);
        const toplamVergi = n(data.toplamVergi);
        const tarifeAdi = esc(data.tarifeAdi || 'Is Telefonu Her Yöne 250 (PSTN)');

        const notes = [];
        notes.push(`<cbc:Note>GONDERIMTURU:e-Fatura</cbc:Note>`);
        notes.push(`<cbc:Note>MusteriTip-T</cbc:Note>`);
        notes.push(`<cbc:Note>YAZI-${esc(data.yaziIleTutar || `Yalniz ${odenecek} TL`)}</cbc:Note>`);
        const formatTrDate = (iso) => {
            if (!iso) return '';
            const parts = String(iso).split('-');
            if (parts.length === 3) return `${parts[2]}-${parts[1]}-${parts[0]}`;
            return iso;
        };
        
        if (data.faturaTuru === 'Elektrik') {
            notes.push(`<cbc:Note>Fatura Türü : Elektrik Tüketim Faturasi</cbc:Note>`);
            notes.push(`<cbc:Note>Hesap No:${esc(data.hizmetNo)}</cbc:Note>`);
            notes.push(`<cbc:Note>Ilk Okuma Tarihi:${formatTrDate(dBaslangic)}</cbc:Note>`);
            notes.push(`<cbc:Note>Son Okuma Tarihi:${formatTrDate(dBitis)}</cbc:Note>`);
            notes.push(`<cbc:Note>Aktif Tüketim:${esc(data.tuketimMiktari)}</cbc:Note>`);
            notes.push(`<cbc:Note>Tesisat No:${esc(data.hizmetNo)}</cbc:Note>`);
        } else if (data.faturaTuru === 'Doğalgaz') {
            notes.push(`<cbc:Note languageID="T">***DOĞALGAZ FATURASI***</cbc:Note>`);
            notes.push(`<cbc:Note languageID="T">TESİSAT NO:${esc(data.hizmetNo)}</cbc:Note>`);
            notes.push(`<cbc:Note languageID="T">SÖZLEŞME HESABI:${esc(data.hizmetNo)}</cbc:Note>`);
            notes.push(`<cbc:Note languageID="T">Düzeltilmiş Tüketim Miktari:${esc(data.tuketimMiktari)}</cbc:Note>`);
            notes.push(`<cbc:Note languageID="T">İLKOKUMATARİHİ:${formatTrDate(dBaslangic)};SONOKUMATARİHİ:${formatTrDate(dBitis)}</cbc:Note>`);
        } else {
            notes.push(`<cbc:Note>TARIFENIZ: ${tarifeAdi}</cbc:Note>`);
            notes.push(`<cbc:Note>Önceki-Önceki Aydan Devir                                                              ${n(data.oncekiDevir)}</cbc:Note>`);
            notes.push(`<cbc:Note>Gelecek-Gelecek Aya Devir (-)                                                           ${n(data.gelecekDevir)}</cbc:Note>`);
            notes.push(`<cbc:Note>Vergi-Ödeyeceginiz vergiler dahil ${odenecek} TL'nin ${toplamVergi} TL'si sizin adiniza devlete vergi olarak iletilecektir. </cbc:Note>`);
            notes.push(`<cbc:Note>Cdr-Fatura bilgilerinize vergiler dahil degildir. Tarife bilgilerinize vergiler dahildir.</cbc:Note>`);
            notes.push(`<cbc:Note>Cdr-Faturanizda yuvarlama yapilmistir. Yuvarlamadan kaynaklanan tutar bir sonraki faturaniza yansitilacaktir.</cbc:Note>`);
            notes.push(`<cbc:Note>BirSonrakiFKT- ${esc(data.birSonrakiFKT)}</cbc:Note>`);
            notes.push(`<cbc:Note>HESAPNO${esc(data.hizmetNo)}</cbc:Note>`);
        }

        return notes.join('\n');
    }

    _buildSupplierParty(data, esc) {
        if (data.faturaTuru === 'Elektrik') {
            return `<cac:AccountingSupplierParty>
<cac:Party>
<cbc:WebsiteURI>www.ckbogazici.com.tr</cbc:WebsiteURI>
<cac:PartyIdentification><cbc:ID schemeID="VKN">1790617537</cbc:ID></cac:PartyIdentification>
<cac:PartyIdentification><cbc:ID schemeID="MERSISNO">0179061753700017</cbc:ID></cac:PartyIdentification>
<cac:PartyName><cbc:Name>CK BOĞAZİÇİ ELEKTRİK PERAKENDE SATIŞ A.Ş.</cbc:Name></cac:PartyName>
<cac:PostalAddress>
<cbc:StreetName>Hürriyet Mah. Dr. Cemil Bengü Cad No:1</cbc:StreetName>
<cbc:CitySubdivisionName>Kağıthane</cbc:CitySubdivisionName>
<cbc:CityName>İstanbul</cbc:CityName>
<cac:Country><cbc:Name>TÜRKİYE</cbc:Name></cac:Country>
</cac:PostalAddress>
<cac:PartyTaxScheme>
<cac:TaxScheme><cbc:Name>KAĞITHANE V.D.</cbc:Name></cac:TaxScheme>
</cac:PartyTaxScheme>
<cac:Contact>
<cbc:Telephone>444 6 255</cbc:Telephone>
<cbc:ElectronicMail>info@ckbogazici.com.tr</cbc:ElectronicMail>
</cac:Contact>
</cac:Party>
</cac:AccountingSupplierParty>`;
        }

        // Türk Telekom bilgileri — SABİT
        return `<cac:AccountingSupplierParty>
<cac:Party>
<cbc:WebsiteURI>www.turktelekom.com.tr</cbc:WebsiteURI>
<cac:PartyIdentification>
<cbc:ID schemeID="VKN">8760052205</cbc:ID>
</cac:PartyIdentification>
<cac:PartyIdentification>
<cbc:ID schemeID="MERSISNO">0876005220500084</cbc:ID>
</cac:PartyIdentification>
<cac:PartyName>
<cbc:Name>Türk Telekomünikasyon A.S</cbc:Name>
</cac:PartyName>
<cac:PostalAddress>
<cbc:StreetName>Turgut Özal Bulvari Samsun Yolu Kavsagi</cbc:StreetName>
<cbc:BuildingNumber/>
<cbc:CitySubdivisionName>Aydinlikevler</cbc:CitySubdivisionName>
<cbc:CityName>Ankara</cbc:CityName>
<cbc:PostalZone>06103</cbc:PostalZone>
<cac:Country>
<cbc:Name>TÜRKİYE</cbc:Name>
</cac:Country>
</cac:PostalAddress>
<cac:PartyTaxScheme>
<cac:TaxScheme>
<cbc:Name>Ankara Kurumlar V.D.</cbc:Name>
</cac:TaxScheme>
</cac:PartyTaxScheme>
<cac:Contact>
<cbc:Telephone>444 5 444</cbc:Telephone>
<cbc:Telefax>(312) 306 07 32</cbc:Telefax>
<cbc:ElectronicMail>iletisim@turktelekom.com.tr</cbc:ElectronicMail>
</cac:Contact>
</cac:Party>
</cac:AccountingSupplierParty>`;
    }

    _buildCustomerParty(data, esc) {
        const adres = esc(data.aliciAdres);
        // Orijinal XML'de CitySubdivisionName adresle aynı değeri taşıyor
        const ilce = adres;

        return `<cac:AccountingCustomerParty>
<cac:Party>
<cbc:WebsiteURI/>
<cac:PartyIdentification>
<cbc:ID schemeID="VKN">${esc(data.aliciVkn)}</cbc:ID>
</cac:PartyIdentification>
<cac:PartyIdentification>
<cbc:ID schemeID="HIZMETNO">${esc(data.aliciHizmetNo)}</cbc:ID>
</cac:PartyIdentification>
<cac:PartyName>
<cbc:Name>${esc(data.aliciUnvan)}</cbc:Name>
</cac:PartyName>
<cac:PostalAddress>
<cbc:ID/>
<cbc:Room/>
<cbc:StreetName>${adres}</cbc:StreetName>
<cbc:BuildingNumber/>
<cbc:CitySubdivisionName>${ilce}</cbc:CitySubdivisionName>
<cbc:CityName>${esc(data.aliciSehir || 'Istanbul')}</cbc:CityName>
<cbc:PostalZone>${esc(data.aliciPostaKodu || '34104')}</cbc:PostalZone>
<cac:Country>
<cbc:Name>${esc(data.aliciUlke || 'TÜRKİYE')}</cbc:Name>
</cac:Country>
 </cac:PostalAddress>
<cac:PartyTaxScheme>
<cac:TaxScheme>
<cbc:Name>${esc(data.aliciVergiDairesi)}</cbc:Name>
</cac:TaxScheme>
</cac:PartyTaxScheme>
<cac:Contact>
<cbc:ElectronicMail/>
</cac:Contact>
</cac:Party>
</cac:AccountingCustomerParty>`;
    }

    _buildBuyerCustomerParty(data, esc) {
        const adres = esc(data.aliciAdres);
        const ilce = adres;

        return `<cac:BuyerCustomerParty>
<cac:Party>
<cac:PartyIdentification>
<cbc:ID schemeID="VKN">${esc(data.aliciVkn)}</cbc:ID>
</cac:PartyIdentification>
<cac:PartyName>
<cbc:Name>${esc(data.aliciUnvan)}</cbc:Name>
</cac:PartyName>
<cac:PostalAddress>
<cbc:ID/>
<cbc:Room/>
<cbc:StreetName>${adres}</cbc:StreetName>
<cbc:BuildingNumber/>
<cbc:CitySubdivisionName>${ilce}</cbc:CitySubdivisionName>
<cbc:CityName>${esc(data.aliciSehir || 'Istanbul')}</cbc:CityName>
<cbc:PostalZone>${esc(data.aliciPostaKodu || '34104')}</cbc:PostalZone>
<cac:Country>
<cbc:Name>${esc(data.aliciUlke || 'TÜRKİYE')}</cbc:Name>
</cac:Country>
 </cac:PostalAddress>
</cac:Party>
</cac:BuyerCustomerParty>`;
    }

    _buildPaymentMeans(data, esc, sOdeme) {
        return `<cac:PaymentMeans>
<cbc:PaymentMeansCode>1</cbc:PaymentMeansCode> 
<cbc:PaymentDueDate>${esc(sOdeme)}</cbc:PaymentDueDate>
<cbc:InstructionNote>Ödenmemis faturaniz bulunmamaktadir. Fatura ödemeleriniz için tesekkür ederiz.</cbc:InstructionNote>
<cac:PayeeFinancialAccount>
<cbc:ID>TR790001002793377119337287</cbc:ID>
<cbc:CurrencyCode>TRY</cbc:CurrencyCode>
<cbc:PaymentNote>Ödeme</cbc:PaymentNote>
</cac:PayeeFinancialAccount>
</cac:PaymentMeans>`;
    }

    _buildTaxTotal(data, n) {
        const isElektrik = data.faturaTuru === 'Elektrik';
        const ikinciVergiIsmi = isElektrik ? 'BTV' : 'ÖZEL ILETISIM VERGISI';
        const ikinciVergiKodu = isElektrik ? '8005' : '4080';

        return `<cac:TaxTotal>
<cbc:TaxAmount currencyID="TRY">${n(data.toplamVergi)}</cbc:TaxAmount>
<cac:TaxSubtotal>
<cbc:TaxableAmount currencyID="TRY">${n(data.matrah)}</cbc:TaxableAmount>
<cbc:TaxAmount currencyID="TRY">${n(data.kdvTutar)}</cbc:TaxAmount>
<cbc:Percent>${data.kdvOran || 20}</cbc:Percent>
<cac:TaxCategory>
<cac:TaxScheme>
<cbc:Name>KDV</cbc:Name>
<cbc:TaxTypeCode>0015</cbc:TaxTypeCode>
</cac:TaxScheme>
</cac:TaxCategory>
</cac:TaxSubtotal>
<cac:TaxSubtotal>
<cbc:TaxableAmount currencyID="TRY">${n(data.matrah)}</cbc:TaxableAmount>
<cbc:TaxAmount currencyID="TRY">${n(data.oivTutar)}</cbc:TaxAmount>
<cbc:Percent>${data.oivOran || (isElektrik ? 0 : 10)}</cbc:Percent>
<cac:TaxCategory>
<cac:TaxScheme>
<cbc:Name>${ikinciVergiIsmi}</cbc:Name>
<cbc:TaxTypeCode>${ikinciVergiKodu}</cbc:TaxTypeCode>
</cac:TaxScheme>
</cac:TaxCategory>
</cac:TaxSubtotal>
</cac:TaxTotal>`;
    }

    _buildLegalMonetaryTotal(data, n) {
        return `<cac:LegalMonetaryTotal>
<cbc:LineExtensionAmount currencyID="TRY">${n(data.matrah)}</cbc:LineExtensionAmount>
<cbc:TaxExclusiveAmount currencyID="TRY">${n(data.matrah)}</cbc:TaxExclusiveAmount>
<cbc:TaxInclusiveAmount currencyID="TRY">${n(data.faturaTutari)}</cbc:TaxInclusiveAmount>
<cbc:AllowanceTotalAmount currencyID="TRY">0.00</cbc:AllowanceTotalAmount>
<cbc:ChargeTotalAmount currencyID="TRY">${n(data.oncekiDevir)}</cbc:ChargeTotalAmount>
<cbc:PayableRoundingAmount currencyID="TRY">${n(data.gelecekDevir)}</cbc:PayableRoundingAmount>
 <cbc:PayableAmount currencyID="TRY">${n(data.odenecekTutar)}</cbc:PayableAmount>
</cac:LegalMonetaryTotal>`;
    }

    _buildInvoiceLine(data, esc, n) {
        const isEnerji = data.faturaTuru === 'Elektrik' || data.faturaTuru === 'Doğalgaz';
        const unitCode = isEnerji ? 'KWH' : 'C62';
        const quantity = isEnerji && data.tuketimMiktari ? esc(data.tuketimMiktari) : '1';
        const itemName = data.faturaTuru === 'Doğalgaz' ? 'Toplam Tüketim Bedeli' : (isEnerji ? 'Enerji Bedeli' : 'AYLIK ÜCRETLER');

        return `<cac:InvoiceLine>
<cbc:ID>1</cbc:ID>
<cbc:Note>${itemName}</cbc:Note>
<cbc:InvoicedQuantity unitCode="${unitCode}">${quantity}</cbc:InvoicedQuantity>
<cbc:LineExtensionAmount currencyID="TRY">${n(data.matrah)}</cbc:LineExtensionAmount>
<cac:Item>
<cbc:Name>${itemName}</cbc:Name>
<cac:OriginCountry>
<cbc:IdentificationCode>TR</cbc:IdentificationCode>
<cbc:Name>Turkey</cbc:Name>
</cac:OriginCountry>
</cac:Item>
<cac:Price>
<cbc:PriceAmount currencyID="TRY">${isEnerji ? '' : n(data.matrah)}</cbc:PriceAmount>
</cac:Price>
</cac:InvoiceLine>`;
    }

    /**
     * Basit UUID v4 üreteci.
     * @returns {string} UUID formatında string
     */
    _generateUUID() {
        return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
            const r = Math.random() * 16 | 0;
            const v = c === 'x' ? r : (r & 0x3 | 0x8);
            return v.toString(16);
        });
    }
}
