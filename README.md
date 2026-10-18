<p align="center"><img src="public/logo.svg" alt="Düzenbaz logosu" width="160"></p>

# Düzenbaz — okul ders programı hazırlayıcı

Windows ve Linux için hızlı bir masaüstü ders programı hazırlama uygulaması. Sınıfları, öğretmenleri ve dersleri girersiniz; **hiçbir sınıf gününde boş saat olmayan**
(MEB kuralı), çakışmasız bir haftalık program çıkar. Sınıf ve öğretmen çizelgeleri, tüm sınıfların toplu
görünümü ("çarşaf liste") ve günlük planlar yazdırılabilir.

## Nöbet Modülü

Kenar çubuğunun altındaki **Nöbet Modülü** düğmesiyle açılır; ders programıyla aynı öğretmen listesini kullanır.

- **Öğretmenler:** görev durumu (Nöbet tutar, İdareci, Nöbetçi İdareci, Okul Öncesi, Nöbet tutmaz), nöbet
  tutabileceği günler (ders programından gelir, elle değiştirilebilir), nöbet tercihi ve arka arkaya nöbet
  izni. Öğretmen adına tıklayınca aylık nöbet istatistikleri açılır; önceki aylar elle girilebilir.
- **Nöbet Yerleri** ve her yere günde kaç öğretmen gerektiği.
- **Özel Günler:** bayram ve tatillerde nöbet verilmez.
- **Nöbet Dağıt:** aylık çizelge. Herkese olabildiğince eşit sayıda nöbet ve her yerde eşit sayıda görev
  verilir; sayımlar önceki aylardan devam eder. Hücreler elle değiştirilebilir, değiştirilenler sabitlenir.
- **Yazdır ve Paylaş:** PDF, Excel (.xlsx) ve CSV çıktısı, nöbet sayaçlarıyla birlikte.

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


## Lisans

Düzenbaz, [GNU Genel Kamu Lisansı v3.0](LICENSE) (GPL-3.0) ile lisanslanmıştır.
