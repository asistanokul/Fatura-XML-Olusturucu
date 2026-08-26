/**
 * app.js — Ana Uygulama Kontrolcüsü
 *
 * PDF dosya yükleme, pdf.js ile metin çıkarma, doğru parser'ı seçme,
 * verileri forma yansıtma, kullanıcı düzenlemesi ve XML indirme
 * akışını yönetir.
 */

const App = {

    // Modül referansları
    parser: null,
    generator: new UblXmlGenerator(),
    currentData: null,

    /**
     * Uygulamayı başlatır. DOM yüklendikten sonra çağrılır.
     */
    init() {
        this._setupUploadZone();
        this._setupButtons();
        this._setupAutoCalc();
        console.log('✅ MEBBİS XML Oluşturucu başlatıldı.');
        // Alıcı bilgilerini kaydetmek için listener'lar
        const customerFields = ['aliciUnvan', 'aliciVkn', 'aliciVergiDairesi', 'aliciAdres', 'aliciIlce', 'aliciSehir'];
        customerFields.forEach(id => {
            const el = document.getElementById(id);
            if (el) el.addEventListener('input', () => this._saveCustomerInfo());
        });

        // Finansal bilgiler (özellikle odenecekTutar manual giriş) için listener
        const odenecekEl = document.getElementById('odenecekTutar');
        if (odenecekEl) {
            odenecekEl.addEventListener('input', () => this._handleManualFinancialInput());
        }

        // Tüketim için manuel listener
        const tuketimEl = document.getElementById('tuketimMiktari');
        if (tuketimEl) {
            tuketimEl.addEventListener('input', () => {
                if (this.isManualMode) this._setField('tuketimMiktari', tuketimEl.value);
            });
        }

        this._loadCustomerInfo();
    },

    // ═══════════════════════════════════════════════════════════
    //  DOSYA YÜKLEME
    // ═══════════════════════════════════════════════════════════

    _setupUploadZone() {
        const zone = document.getElementById('uploadZone');
        const fileInput = document.getElementById('pdfFileInput');

        // Sürükle-bırak
        zone.addEventListener('dragover', (e) => {
            e.preventDefault();
            zone.classList.add('dragover');
        });

        zone.addEventListener('dragleave', () => {
            zone.classList.remove('dragover');
        });

        zone.addEventListener('drop', (e) => {
            e.preventDefault();
            zone.classList.remove('dragover');
            const files = e.dataTransfer.files;
            if (files.length > 0 && files[0].type === 'application/pdf') {
                this._handleFile(files[0]);
            } else {
                this._showStatus('Lütfen bir PDF dosyası yükleyin.', 'error');
            }
        });

        // Dosya seçme
        fileInput.addEventListener('change', (e) => {
            if (e.target.files.length > 0) {
                this._handleFile(e.target.files[0]);
            }
        });
    },

    /**
     * Yüklenen PDF dosyasını işler.
     * @param {File} file
     */
    async _handleFile(file) {
        const zone = document.getElementById('uploadZone');
        const fileName = document.getElementById('fileName');

        // Durum güncelle
        zone.classList.add('has-file');
        fileName.textContent = `✅ ${file.name}`;
        try {
            this._showStatus('PDF analiz ediliyor, lütfen bekleyin...', 'info');

            // 1. PDF'den metin çıkar
            const text = await this._extractTextFromPDF(file);

            if (!text || text.trim().length < 50) {
                throw new Error("PDF içinden metin çıkarılamadı. Dosyayı kontrol edin.");
            }

            // Fatura türünü algıla
            const faturaType = this._detectFaturaType(text);

            if (faturaType === 'bilinmeyen') {
                throw new Error("Bu PDF formatı tanınamadı.");
            }

            // Parser seç
            this.parser = this._getParser(faturaType);
            this.currentData = this.parser.parse(text);

            // ETTN (UUID) okunamazsa otomatik üret
            if (!this.currentData.ettn) {
                this.currentData.ettn = this.generator._generateUUID();
            }

            // Verileri doğrula
            const validation = this.parser.validate(this.currentData);

            // Form'a yansıt
            this._populateForm(this.currentData);

            // Parsed içeriği göster (Highlight'tan önce görünür olmalı ki offsetParent çalışsın)
            document.getElementById('parsedContent').classList.add('visible');

            // Arayüz görünürlük ayarları (Elektrik vs Telefon)
            this._updateUIVisibility(faturaType);

            // Okunamayan kısımları (boş zorunlu alanları) kırmızı ile işaretle
            let hasMissing = false;
            document.querySelectorAll('#parsedContent input').forEach(el => {
                const optionalIds = ['ettn', 'oncekiDevir', 'gelecekDevir', 'aliciUnvan', 'aliciVkn', 'aliciVergiDairesi', 'aliciAdres', 'aliciIlce', 'aliciSehir'];
                if (optionalIds.includes(el.id)) return;
                
                // Eğer alan görünürse ve boşsa
                if (!el.value.trim() && el.offsetParent !== null) {
                    el.style.backgroundColor = 'rgba(231, 76, 60, 0.15)';
                    el.style.border = '2px solid var(--danger)';
                    el.style.boxShadow = '0 0 8px rgba(231, 76, 60, 0.6)';
                    hasMissing = true;
                } else {
                    el.style.backgroundColor = '';
                    el.style.border = '';
                    el.style.boxShadow = '';
                }
                
                // Kullanıcı veri girince kırmızılığı kaldır
                el.addEventListener('input', function() {
                    if(this.value.trim()) {
                        this.style.backgroundColor = '';
                        this.style.border = '';
                        this.style.boxShadow = '';
                    }
                });
            });

            // Durum mesajı
            if (validation.valid && !hasMissing) {
                this._showStatus(
                    `${this.parser.getParserName()} başarıyla ayrıştırıldı. Verileri kontrol edip "XML İndir" butonuna tıklayın.`,
                    'success'
                );
            }
            if (hasMissing) {
                this._showStatus(`PDF okundu ancak bazı zorunlu alanlar (kırmızı ile işaretli) bulunamadı. Lütfen eksik bilgileri tamamlayın.`, 'warning');
            } else if (!validation.valid) {
                const msgs = [...validation.errors, ...validation.warnings];
                this._showStatus(
                    `Ayrıştırma tamamlandı ama sorunlar var: ${msgs.join(' | ')}`,
                    'warning'
                );
            }

            // XML İndir butonunu aktifle
            document.getElementById('btnDownloadXml').disabled = false;

        } catch (err) {
            console.error('PDF işleme hatası:', err);
            this._showStatus(`pdf okunamadı yeniden deneyin yada manuel fatura girişini deneyin`, 'error');
            
            // Kullanıcıyı manuel butonlara yönlendirmek için upload alanını gizle
            document.getElementById('uploadZone').style.display = 'none';
            const manualActions = document.querySelector('.manual-entry-actions');
            if (manualActions) {
                manualActions.style.display = 'block';
                manualActions.style.padding = '20px';
                manualActions.style.borderRadius = '8px';
                
                // Güçlü bir "yanıp sönen animasyon" (Web Animations API ile)
                manualActions.animate([
                    { backgroundColor: 'transparent', transform: 'scale(1)' },
                    { backgroundColor: 'rgba(231, 76, 60, 0.3)', transform: 'scale(1.05)' },
                    { backgroundColor: 'transparent', transform: 'scale(1)' }
                ], {
                    duration: 600,
                    iterations: 5,
                    easing: 'ease-in-out'
                });
            }
        }
    },

    /**
     * pdf.js ile PDF dosyasından metin çıkarır.
     * @param {File} file
     * @returns {Promise<string>}
     */
    async _extractTextFromPDF(file) {
        const arrayBuffer = await file.arrayBuffer();

        // pdf.js yükleme
        const loadingTask = pdfjsLib.getDocument({ data: arrayBuffer });
        const pdf = await loadingTask.promise;

        let fullText = '';

        for (let i = 1; i <= pdf.numPages; i++) {
            const page = await pdf.getPage(i);
            const textContent = await page.getTextContent();
            const pageText = textContent.items.map(item => item.str).join('\n');
            fullText += pageText + '\n';
        }

        return fullText;
    },

    /**
     * PDF metninden fatura türünü algılar.
     * @param {string} text
     * @returns {string} 'telefon' | 'elektrik' | 'dogalgaz' | 'bilinmeyen'
     */
    _detectFaturaType(text) {
        const lower = text.toLowerCase();
        if (lower.includes('boğaziçi elektrik') || lower.includes('elektrik tüketim') || lower.includes('enerjisa') || lower.includes('edaş')) {
            return 'elektrik';
        }

        if (/telefon|telekom/i.test(text)) {
            return 'telefon';
        }

        if (/igdas|igdaş|gaz dağıtım|düzeltilmiş tüketim|sayaçtan ölçülen/i.test(text)) {
            return 'dogalgaz';
        }
        return 'bilinmeyen';
    },

    /**
     * Fatura türüne göre uygun parser'ı döndürür.
     * @param {string} type
     * @returns {BaseFaturaParser}
     */
    _getParser(type) {
        switch (type) {
            case 'telefon': return new TelefonFaturasiParser();
            case 'elektrik': return new ElektrikFaturasiParser();
            case 'dogalgaz': return new DogalgazFaturasiParser();
            default: throw new Error(`Desteklenmeyen fatura türü: ${type}`);
        }
    },

    // ═══════════════════════════════════════════════════════════
    //  FORM İŞLEMLERİ
    // ═══════════════════════════════════════════════════════════

    /**
     * Ayrıştırılmış verileri form alanlarına yansıtır.
     */
    _populateForm(data) {
        // Fatura bilgileri
        this._setField('faturaNo', data.faturaNo);
        this._setField('ettn', data.ettn);
        this._setField('faturaTarihi', data.faturaTarihi);
        this._setField('sonOdemeTarihi', data.sonOdemeTarihi);
        this._setField('donemBaslangic', data.donemBaslangic);
        this._setField('donemBitis', data.donemBitis);
        this._setField('tuketimMiktari', data.tuketimMiktari);

        // Mali bilgiler
        this._setField('matrah', NumberUtils.toXmlAmount(data.matrah));
        this._setField('kdvOran', data.kdvOran);
        this._setField('kdvTutar', NumberUtils.toXmlAmount(data.kdvTutar));
        this._setField('oivOran', data.oivOran);
        this._setField('oivTutar', NumberUtils.toXmlAmount(data.oivTutar));
        this._setField('toplamVergi', NumberUtils.toXmlAmount(data.toplamVergi));
        this._setField('faturaTutari', NumberUtils.toXmlAmount(data.faturaTutari));
        this._setField('oncekiDevir', NumberUtils.toXmlAmount(data.oncekiDevir));
        this._setField('gelecekDevir', NumberUtils.toXmlAmount(data.gelecekDevir));
        this._setField('odenecekTutar', NumberUtils.toXmlAmount(data.odenecekTutar));

        // Alıcı bilgileri
        this._setField('aliciUnvan', data.aliciUnvan);
        this._setField('aliciVkn', data.aliciVkn);
        this._setField('aliciVergiDairesi', data.aliciVergiDairesi);
        this._setField('aliciHizmetNo', data.aliciHizmetNo);
        this._setField('aliciAdres', data.aliciAdres);
        this._setField('aliciSehir', data.aliciSehir);
    },

    _setField(id, value) {
        const el = document.getElementById(id);
        if (el) {
            el.value = (value !== undefined && value !== null && value !== '') ? value : '';
        }
    },

    _getField(id) {
        const el = document.getElementById(id);
        return el ? el.value.trim() : '';
    },

    /**
     * Formdan güncel verileri okuyarak data nesnesini günceller.
     */
    _readFormData() {
        if (!this.currentData) this.currentData = new BaseFaturaParser().getEmptyData ? {} : {};

        this.currentData.faturaNo = this._getField('faturaNo');
        this.currentData.ettn = this._getField('ettn');
        this.currentData.faturaTarihi = this._getField('faturaTarihi');
        this.currentData.sonOdemeTarihi = this._getField('sonOdemeTarihi');
        this.currentData.donemBaslangic = this._getField('donemBaslangic');
        this.currentData.donemBitis = this._getField('donemBitis');
        
        if (this._getField('tuketimMiktari')) {
            this.currentData.tuketimMiktari = NumberUtils.parseAmount(this._getField('tuketimMiktari'));
        }

        this.currentData.matrah = NumberUtils.parseAmount(this._getField('matrah'));
        this.currentData.kdvOran = parseInt(this._getField('kdvOran'), 10) || 20;
        this.currentData.kdvTutar = NumberUtils.parseAmount(this._getField('kdvTutar'));
        this.currentData.oivOran = parseInt(this._getField('oivOran'), 10) || 10;
        this.currentData.oivTutar = NumberUtils.parseAmount(this._getField('oivTutar'));
        this.currentData.toplamVergi = NumberUtils.parseAmount(this._getField('toplamVergi'));
        this.currentData.faturaTutari = NumberUtils.parseAmount(this._getField('faturaTutari'));
        this.currentData.oncekiDevir = NumberUtils.parseAmount(this._getField('oncekiDevir'));
        this.currentData.gelecekDevir = NumberUtils.parseAmount(this._getField('gelecekDevir'));
        this.currentData.odenecekTutar = NumberUtils.parseAmount(this._getField('odenecekTutar'));

        this.currentData.aliciUnvan = this._getField('aliciUnvan');
        this.currentData.aliciVkn = this._getField('aliciVkn');
        this.currentData.aliciVergiDairesi = this._getField('aliciVergiDairesi');
        this.currentData.aliciHizmetNo = this._getField('aliciHizmetNo');
        this.currentData.hizmetNo = this.currentData.aliciHizmetNo; // XML üreticisi hizmetNo'yu bekliyor

        this.currentData.aliciAdres = this._getField('aliciAdres');
        this.currentData.aliciSehir = this._getField('aliciSehir');
    },

    // ═══════════════════════════════════════════════════════════
    //  OTOMATİK HESAPLAMA
    // ═══════════════════════════════════════════════════════════

    _setupAutoCalc() {
        // Matrah, KDV veya ÖİV değiştiğinde toplamları yeniden hesapla
        const triggerFields = ['matrah', 'kdvOran', 'kdvTutar', 'oivOran', 'oivTutar', 'oncekiDevir', 'gelecekDevir'];

        triggerFields.forEach(id => {
            const el = document.getElementById(id);
            if (el) {
                el.addEventListener('input', () => this._recalculate());
            }
        });
    },

    _recalculate() {
        const matrah = NumberUtils.parseAmount(this._getField('matrah'));
        const kdvTutar = NumberUtils.parseAmount(this._getField('kdvTutar'));
        const oivTutar = NumberUtils.parseAmount(this._getField('oivTutar'));
        const onceki = NumberUtils.parseAmount(this._getField('oncekiDevir'));
        const gelecek = NumberUtils.parseAmount(this._getField('gelecekDevir'));

        const toplamVergi = kdvTutar + oivTutar;
        const faturaTutari = matrah + toplamVergi;
        const odenecek = faturaTutari + onceki - gelecek;

        this._setField('toplamVergi', NumberUtils.toXmlAmount(toplamVergi));
        this._setField('faturaTutari', NumberUtils.toXmlAmount(faturaTutari));
        if (!this.isManualMode) {
            this._setField('odenecekTutar', NumberUtils.toXmlAmount(odenecek));
        }
    },

    /**
     * Manuel giriş modunda sadece ödenecek tutar girildiğinde ters hesaplama yapar.
     */
    _handleManualFinancialInput() {
        if (!this.isManualMode) return;
        
        let valStr = document.getElementById('odenecekTutar').value;
        if (!valStr) return;
        
        // Türkçe virgülü noktaya çevir
        valStr = valStr.replace(/\./g, '').replace(',', '.');
        const odenecekTutar = parseFloat(valStr) || 0;
        
        const kdvOran = parseFloat(document.getElementById('kdvOran').value) || 20;
        const oivOran = parseFloat(document.getElementById('oivOran').value) || 10;
        
        const oranToplami = 1 + (kdvOran / 100) + (oivOran / 100);
        const matrah = odenecekTutar / oranToplami;
        
        const kdvTutar = matrah * (kdvOran / 100);
        const oivTutar = matrah * (oivOran / 100);
        
        this.currentData.matrah = NumberUtils.toXmlAmount(matrah);
        this.currentData.kdvTutar = NumberUtils.toXmlAmount(kdvTutar);
        this.currentData.oivTutar = NumberUtils.toXmlAmount(oivTutar);
        this.currentData.toplamVergi = NumberUtils.toXmlAmount(kdvTutar + oivTutar);
        this.currentData.faturaTutari = NumberUtils.toXmlAmount(matrah + kdvTutar + oivTutar);
        this.currentData.odenecekTutar = NumberUtils.toXmlAmount(odenecekTutar);
        this.currentData.kdvOran = kdvOran;
        this.currentData.oivOran = oivOran;
    },

    // ═══════════════════════════════════════════════════════════
    //  BUTONLAR
    // ═══════════════════════════════════════════════════════════

    _setupButtons() {
        document.getElementById('btnDownloadXml').addEventListener('click', () => {
            this._downloadXml();
        });

        document.getElementById('btnReset').addEventListener('click', () => {
            this._reset();
        });

        this._setupManualActions();
    },

    _setupManualActions() {
        const btnManualElektrik = document.getElementById('btnManualElektrik');
        const btnManualDogalgaz = document.getElementById('btnManualDogalgaz');
        const btnManualTelefon = document.getElementById('btnManualTelefon');

        if (btnManualElektrik) {
            btnManualElektrik.addEventListener('click', () => this._startManualMode('elektrik'));
        }
        if (btnManualDogalgaz) {
            btnManualDogalgaz.addEventListener('click', () => this._startManualMode('dogalgaz'));
        }
        if (btnManualTelefon) {
            btnManualTelefon.addEventListener('click', () => this._startManualMode('telefon'));
        }
    },

    _updateUIVisibility(type) {
        const tuketimGroup = document.getElementById('tuketimGroup');
        const isElektrikOrDogalgaz = type === 'elektrik' || type === 'dogalgaz';
        
        if (tuketimGroup) {
            tuketimGroup.style.display = isElektrikOrDogalgaz ? 'block' : 'none';
        }

        // Elektrik ve Doğalgaz faturasında gizlenecek alanlar
        const elektrikGizlenecekler = ['aliciHizmetNo', 'aliciAdres', 'aliciIlce', 'aliciSehir'];
        elektrikGizlenecekler.forEach(id => {
            const el = document.getElementById(id);
            const group = el ? el.closest('.form-group') : null;
            if (group) {
                group.style.display = isElektrikOrDogalgaz ? 'none' : 'block';
            }
        });
    },

    /**
     * Manuel giriş modunu başlatır.
     * @param {string} type 'elektrik' veya 'telefon'
     */
    _startManualMode(type) {
        this.isManualMode = true;
        // Uygun parser'ı seç
        this.parser = this._getParser(type);
        // Boş taslak al
        this.currentData = this.parser.getEmptyData();
        
        let turu = 'Telefon';
        if (type === 'elektrik') turu = 'Elektrik';
        if (type === 'dogalgaz') turu = 'Doğalgaz';
        this.currentData.faturaTuru = turu;
        
        this.currentData.ettn = this.generator._generateUUID(); // Otomatik ETTN ata
        
        this._populateForm(this.currentData);
        this._loadCustomerInfo(); // Formu doldurduktan sonra kaydedilmiş alıcı bilgilerini tekrar yükle

        // Arayüz görünürlük ayarları (Elektrik vs Telefon)
        this._updateUIVisibility(type);

        // Manuel modda mali detay kısımlarını gizle (sadece ödenecekTutar kalsın)
        document.querySelectorAll('.calc-group').forEach(el => {
            el.style.display = 'none';
        });

        // Form alanını görünür yap
        document.getElementById('parsedContent').classList.add('visible');
        document.getElementById('btnDownloadXml').disabled = false;

        this._showStatus(`${this.currentData.faturaTuru} faturası için manuel giriş modu aktif. Lütfen faturadaki bilgileri doldurup XML indirebilirsiniz.`, 'info');
    },


    /**
     * Formdaki verileri okuyup XML dosyası olarak indirir.
     */
    _downloadXml() {
        try {
            this._readFormData();
            const xmlString = this.generator.generate(this.currentData);

            // Dosya adını fatura numarasından oluştur
            const fileName = `${this.currentData.faturaNo || 'fatura'}.xml`;

            // Blob oluştur ve indir
            const blob = new Blob([xmlString], { type: 'application/xml; charset=utf-8' });
            const url = URL.createObjectURL(blob);

            const a = document.createElement('a');
            a.href = url;
            a.download = fileName;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);

            this._showStatus(`"${fileName}" başarıyla indirildi! MEBBİS'e yükleyebilirsiniz.`, 'success');
        } catch (err) {
            console.error('XML üretim hatası:', err);
            this._showStatus(`XML üretilirken hata: ${err.message}`, 'error');
        }
    },

    /**
     * Formu ve uygulamayı sıfırlar.
     */
    _reset() {
        this.currentData = null;
        this.parser = null;
        this.isManualMode = false;

        // Form alanlarını temizle
        document.querySelectorAll('#parsedContent input').forEach(el => {
            el.value = '';
        });

        // Upload zone sıfırla
        const zone = document.getElementById('uploadZone');
        zone.classList.remove('has-file');
        zone.style.display = 'flex'; // Geri getir
        document.getElementById('fileName').textContent = 'PDF dosyasını sürükleyip bırakın veya tıklayarak seçin';
        document.getElementById('pdfFileInput').value = '';

        // Manuel actions resetle
        const manualActions = document.querySelector('.manual-entry-actions');
        if (manualActions) {
            manualActions.style.border = 'none';
            manualActions.style.padding = '0';
            manualActions.style.backgroundColor = 'transparent';
        }

        // Parsed content gizle
        document.getElementById('parsedContent').classList.remove('visible');

        // Butonu deaktif et
        document.getElementById('btnDownloadXml').disabled = true;

        this._showStatus('', '');

        // Formu sıfırladıktan sonra gizli alanları geri getir
        document.querySelectorAll('.calc-group').forEach(el => {
            el.style.display = 'block'; 
        });

        this._hideStatus();
    },

    // ═══════════════════════════════════════════════════════════
    //  DURUM MESAJLARI
    // ═══════════════════════════════════════════════════════════

    _showStatus(message, type = 'info') {
        const bar = document.getElementById('statusBar');
        bar.className = `status-bar visible ${type}`;

        const icons = { info: '⏳', success: '✅', warning: '⚠️', error: '❌' };
        bar.innerHTML = `<span>${icons[type] || ''}</span> ${message}`;
    },

    _hideStatus() {
        const bar = document.getElementById('statusBar');
        bar.className = 'status-bar';
        bar.innerHTML = '';
    },

    // ═══════════════════════════════════════════════════════════
    //  LOCALSTORAGE MANTIĞI
    // ═══════════════════════════════════════════════════════════

    _saveCustomerInfo() {
        if (!this.currentData || !this.currentData.faturaTuru) return;
        const type = this.currentData.faturaTuru; // 'Elektrik' veya 'Telefon'
        
        const info = {
            aliciUnvan: document.getElementById('aliciUnvan')?.value || '',
            aliciVkn: document.getElementById('aliciVkn')?.value || '',
            aliciVergiDairesi: document.getElementById('aliciVergiDairesi')?.value || '',
            aliciAdres: document.getElementById('aliciAdres')?.value || '',
            aliciIlce: document.getElementById('aliciIlce')?.value || '',
            aliciSehir: document.getElementById('aliciSehir')?.value || ''
        };
        localStorage.setItem(`mebbisCustomerInfo_${type}`, JSON.stringify(info));
    },

    _loadCustomerInfo() {
        if (!this.currentData || !this.currentData.faturaTuru) return;
        const type = this.currentData.faturaTuru; // 'Elektrik' veya 'Telefon'
        
        const saved = localStorage.getItem(`mebbisCustomerInfo_${type}`);
        if (saved) {
            try {
                const info = JSON.parse(saved);
                if (info.aliciUnvan) this._setField('aliciUnvan', info.aliciUnvan);
                if (info.aliciVkn) this._setField('aliciVkn', info.aliciVkn);
                if (info.aliciVergiDairesi) this._setField('aliciVergiDairesi', info.aliciVergiDairesi);
                if (info.aliciAdres) this._setField('aliciAdres', info.aliciAdres);
                if (info.aliciIlce) this._setField('aliciIlce', info.aliciIlce);
                if (info.aliciSehir) this._setField('aliciSehir', info.aliciSehir);
            } catch (e) {
                console.error("LocalStorage okunurken hata", e);
            }
        }
    }
};

// ─── Başlat ────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => App.init());
