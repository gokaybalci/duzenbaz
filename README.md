# Düzenbaz — okul ders programı hazırlayıcı

Windows ve Linux için hızlı bir masaüstü ders programı hazırlama uygulaması. Sınıfları, öğretmenleri ve dersleri girersiniz; **hiçbir sınıf gününde boş saat olmayan**
(MEB kuralı), çakışmasız bir haftalık program çıkar. Sınıf ve öğretmen çizelgeleri, tüm sınıfların toplu
görünümü ("çarşaf liste") ve günlük planlar yazdırılabilir.

## Masaüstü uygulaması (gerçek okul verileri için önerilir)

Düzenbaz, [Tauri](https://tauri.app) ile yapılmış küçük, yerel bir masaüstü uygulamasıdır. İşletim sisteminin
kendi web motorunu kullanır, içinde ayrı bir tarayıcı taşımaz: kurulum dosyaları birkaç MB'dır, boştayken
işlemci kullanımı neredeyse sıfırdır.

**Verileriniz bilgisayardan hiç çıkmaz:**
- arayüzün tamamı programın içine derlenmiştir; internetten hiçbir şey yüklenmez,
- katı bir içerik güvenlik politikası (CSP) her türlü ağ bağlantısını yasaklar,
- sayfa diske kendi başına erişemez; dosyalar yalnızca uygulamanın kendi Rust komutlarıyla
  (`src-tauri/src/lib.rs`) ve her zaman kullanıcının onayladığı yerel bir Aç/Kaydet penceresinden sonra
  okunur ve yazılır,
- çalışma kopyası kullanıcının kendi profil klasöründe tutulur
  (Windows: `%LOCALAPPDATA%\com.duzenbaz.desktop`, Linux: `~/.local/share/com.duzenbaz.desktop`),
- kayıtlar atomiktir (geçici dosya + yeniden adlandırma), bu yüzden elektrik kesintisi projeyi bozamaz.

| Platform | Paket | Notlar |
| --- | --- | --- |
| Windows 10 / 11 (64 bit) | `Duzenbaz_x.y.z_x64-setup.exe` | Kullanıcıya özel kurulur, yönetici yetkisi gerekmez. Microsoft Edge WebView2 kullanır; Windows 11'de ve güncel Windows 10'da zaten vardır, yoksa kurulum programı bir kez indirir. |
| Linux (çoğu dağıtım) | `Duzenbaz_x.y.z_amd64.AppImage` | `chmod +x` ile çalıştırılabilir yapıp açın. Ubuntu 22.04 (glibc 2.35) üzerinde derlenir; Ubuntu 22.04+, Debian 12+, Fedora, Mint 21+ vb. üzerinde çalışır. |
| Debian/Ubuntu, Fedora/openSUSE | `.deb`, `.rpm` | Tercih ederseniz yerel paketler. |

**Windows 8 / 8.1 ve 7 desteklenmez.** Microsoft, bu tür uygulamaların kullandığı web motoru WebView2'yi
Windows 7, 8 ve 8.1'de Ocak 2023'te 109. sürümde durdurdu; güncel Rust da artık bu sistemler için derleme
yapmıyor. Bu sistemler için bir sürüm, resmi olmayan bir kaynaktan gelen, desteği bitmiş ve güvenlik
güncellemesi almayan bir motor gerektirirdi; bu, öğrenci verileri için kabul edilemez.

Arayüz **Türkçedir** (her ekran, düğme, çıktı ve Windows kurulum programı için varsayılan). Kenar çubuğunun
sol altında İngilizceye geçiş düğmesi vardır.

### Paketleri derlemek

Yalnızca Docker gerekir; geri kalan her şey (Rust, Node, Windows çapraz derleyicisi, NSIS) derleme
imajının içindedir.

```bash
packaging/build.sh           # Linux + Windows, sonuçlar release/ klasörüne
packaging/build.sh linux     # yalnızca AppImage/deb/rpm
packaging/build.sh windows   # yalnızca Windows kurulum programı
```

### Geliştirme

```bash
npm install
npm run dev        # tarayıcıda http://localhost:5173 (tarayıcı depolamasını kullanır, yalnızca geliştirme için)
```

## Kullanım

Ekranlar soldaki menünün sırasını izler:

1. **Okul ve zaman çizelgesi** – okul adı, **Okul türü** (İlkokul, Ortaokul, Lise; *Dosya → Yeni proje*
   ile de sorulur; türün zorunlu dersleri – İlkokul için 13, Ortaokul için 12, Lise için 15 – Dersler
   bölümüne eklenir; aynı adla ya da yaygın bir başka adla zaten var olanlar atlanır, örneğin Yabancı Dil
   yerine İngilizce; hiçbir ders silinmez), günler, saatleriyle ders saatleri (ya da başlangıç saati, ders,
   teneffüs ve öğle arası sürelerinden otomatik oluşturma), okul genelinde kapalı saatler ve **Kurallar**:
   - *Sınıf programlarında boş saat olmasın (MEB kuralı)* – varsayılan olarak açık, aşağıya bakın.
   - *Derslik kullan* – varsayılan olarak kapalı, çünkü çoğu okulda sınıfların sabit derslikleri vardır.
     Yalnızca laboratuvar ya da spor salonu gibi ortak kullanılan özel derslikler için açın; açılana kadar
     derslikle ilgili her ekran, alan ve çıktı gizlenir.
2. **Dersler, Öğretmenler, Sınıflar** (derslikler açıksa **Derslikler** de) – Enter ile hızlı ekleme,
   Excel'den liste yapıştırma, renkler ve ada, kısa ada ya da toplam saate göre sıralanabilen listeler
   (sütun başlığına tıklayın). Her birinin bir uygunluk tablosu (*koşul*) vardır: saatleri kapatmak için
   tıklayın ya da sürükleyin, bütün günü kapatmak için güne tıklayın. Yalnızca pazartesi ve salı gelen bir
   öğretmenin diğer günleri kapatılır ve dersleri asla oraya konmaz. Öğretmenlere günlük en çok ders saati,
   haftalık en çok gün ve günlük en çok boş saat sınırı da verilebilir. Sınıflar gruplara ayrılabilir
   (seçmeli dersler, dil grupları). Dersliklerin bir adedi vardır (örneğin Spor Salonu × 2).
3. **Tanımlı dersler** – bir öğretmen seçin, bir ders seçin ve bu dersi verdiği
   sınıfları (ya da grupları) işaretleyin; işaretlemek dersi ekler, işareti kaldırmak siler, başka bir
   öğretmenin girdiği sınıflarda o öğretmenin adı görünür. Birden çok sınıfın ya da öğretmenin birlikte
   girdiği dersler alttaki formla eklenir. Haftalık saatler bloklara bölünür (`2+2+1` = iki çift ders ve
   bir tek ders, her biri ayrı günde). Aynı *eş zamanlı bağ*a sahip dersler her zaman aynı saatte yapılır
   (örneğin iki seçmeli ders grubu). Listedeki dersleri işaretleyip (ya da *Hepsini seç*) diğer sınıflara
   **Kopyala**yabilir ya da hepsini birlikte **Sil**ebilirsiniz.
4. **Dağıt** – 8'e kadar aramayı aynı anda çalıştırır ve en iyisini tutar. Dağıtımdan önceki denetimler
   imkânsız kurulumları durdurur: açık saatlerden fazla ders saati, yerleşebileceği hiçbir saat olmayan
   bloklar ve açık saatlerden **az** ders saati olan sınıflar (bunlarda boş saat kalırdı).
   **Mevcudu iyileştir** mevcut programdan devam eder.
5. **Ders programı** – blokları (fare ya da dokunmatik ile) anlık yeşil / sarı / kırmızı geri bildirimle
   sürükleyin, yer değiştirmek için aynı uzunluktaki bir bloğun üstüne bırakın, blokları kilitleyin (L),
   kaldırın (Delete), geri alın/yineleyin (Ctrl+Z / Ctrl+Y). Kilitli bloklar yeniden dağıtımda yerinde
   kalır. Sınıf programındaki her boş saat kırmızıyla işaretlenir.
6. **Yazdır ve paylaş** – her sınıf / öğretmen için bir çizelge (çift dersler birleşik, ders listesi,
   isteğe bağlı müdür imzası), tüm sınıflar ve tüm öğretmenler toplu görünümü, günlük planlar. Yazdırın ya
   da PDF olarak kaydedin, tek başına açılan bir HTML dosyası kaydedin ya da Excel için CSV dışa aktarın.

**Görünüm** (sol alt) renk temasını (Açık, Krem, Yeşil, Lacivert, Yüksek kontrast, Koyu), yazı tipini
(Standart, Okunaklı, Ofis, Sade, Klasik — Windows ve Linux'ta zaten bulunan yazı tipleri) ve yazı boyutunu
(Normal, Büyük, Çok büyük) ayarlar. **Örnek okulu dene**, seçtiğiniz sınıf ve öğretmen sayısıyla, her sınıfı
haftada tam 35 saat olan örnek bir ortaokul oluşturur.

## Dağıtım nasıl çalışır

`src/solver/engine.ts`. Her ders bloğu, önceden hesaplanmış bir *alana* sahip bir karttır: okulun, dersin,
her öğretmenin, dersliğin ve sınıfın uygun olduğu başlangıç saatleri. Bu yüzden uygunluk koşulları asla
çiğnenemez. Bağlı dersler tek bir kartta birleştirilir. Arama:

* önce en zor kartları yerleştirir (en az seçeneği olan, en uzun bloklar),
* ardından taşıma, aynı uzunlukta bir kartla yer değiştirme, çakışan kartları çıkarıp yeniden yerleştirme
  ve en iyi konum hamleleriyle benzetimli tavlama (simulated annealing) çalıştırır; maliyetler kaynak ve gün
  bazında güncellenir,
* sıkışık okulları da çözebilmek için çakışmaları uyarlamalı olarak ağırlıklandırır ve en iyi çözümden
  yeniden başlar,
* çözümleri (zorunlu sorunlar, yumuşak ceza) sırasına göre değerlendirir. Zorunlu: çift rezervasyonlar,
  bir dersin iki bloğunun aynı günde olması, öğretmen sınırları ve — MEB kuralı açıkken — ilk açık saatte
  başlamayan ya da dersler arasında boş saat bulunan her sınıf günü (okul genelindeki öğle arası gibi
  kapalı saatler sayılmaz). Yumuşak: öğretmen boş saatleri ve bir dersin bloklarının art arda günlere
  düşmesi.

Ölçümler, hepsi tek iş parçacığıyla (`npm run bench -- <ms> <sınıf> [öğretmen]`, `npm run bench:dprg`):
4, 12 ve 20 sınıf için, ayrıca örnek okulun izin verdiği en az öğretmen sayısıyla da 28 sınıf için yaklaşık
5–7 saniyede, 0 sorun ve 0 boş sınıf saatiyle tam 35 saatlik haftalar. "Zor" olanlar dahil tüm `.dprg`
örnek projeleri çakışmasız çözülür.
