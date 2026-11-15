# Kahvehane — Sosyal Lobi (Sıfırdan Yeniden Yazım) Tasarımı

Tarih: 2026-11-15 · Durum: taslak, onay bekliyor

## 1. Niyet ve neden

Mevcut proje ("Kahvehane 3D", ~35k satır) 101 Okey merkezli bir oyundu; yan oyunlar
eklenmişti. Sahibi sonuçtan memnun değil:

- Okey dışındaki oyunlar **baştan savma** hissettiriyordu.
- **3D modeller kötüydü** (kodla üretilmiş kutular).
- Ortam **hiç cozy değildi**.

Yeni proje bir oyun değil, **arkadaşların takıldığı sıcak bir sanal mekân**. Ana oyun
yok. İnsanlar bir masaya oturup istediği oyunu oynar, TV'de maç / canlı yayın /
Yeşilçam izler, müzik dinler. Bunlar aynı anda olabilir. **Başarı ölçüsü:** sahibi ve
arkadaşları içeri girdiğinde "evimdeyim" hissetmeli, kalıp takılmak istemeli.

Kod sıfırdan yazılır; eski koddan dosya kopyalanmaz. Oyun kurallarının **mantığı**
(özellikle 101 Okey) eski projenin güncel sürümünden referans alınır.

## 2. Hedefler

1. **Mekân:** tek, ortak, gerçekçi ve sıcak bir iç mekân (sobalı/şömineli yayla evi
   ile kahvehane karışımı). Kedi(ler), soba ateşi, çaydanlık buharı, pencerede
   kar/yağmur, kilim, sıcak lamba ışığı.
2. **Kişiler:** 10–15 kişi aynı anda. Linki bilen girer. Hesap yok: isim + görünüm
   seç, gir.
3. **Avatarlar:** herkes salonda serbest dolaşır; masaya, kanepeye, soba başına
   oturabilir.
4. **Dört oyun, ilk günden eksiksiz:** 101 Okey, Batak, Pişti, Papaz Kaçtı. Her biri:
   tam kurallar, iyi bot, gerçek kayıt sesleri, masada 3D kart/taş animasyonu, el sonu
   skor ekranı. Boş koltuklara bot oturur.
5. **TV:** (a) desteklenen linkler için herkeste senkron oynatma — YouTube, Twitch,
   Kick, doğrudan `.m3u8`/`.mp4`; durdur/ileri sar herkese yansır. (b) Diğer her şey
   için **ekran paylaşımı**: bir kişi tarayıcı sekmesini TV'ye yansıtır.
6. **Müzik:** ortak müzik çalar (link/kuyruk), TV'den bağımsız ses seviyesi.
7. **Sesli sohbet (isteğe bağlı):** mesafeye bağlı ses (yaklaştıkça duyulur),
   gürültü engelleme (Krisp benzeri). Varsayılan kapalı; grup normalde Discord kullanıyor.
8. **Masaüstü + telefon:** telefonda dokunmatik joystick; kart/taş oyunları yatay ekran.

## 3. Hedef olmayanlar (ilk sürüm)

- Satranç, UNO-benzeri, Tabu-benzeri vb. yeni oyunlar → sonraki sürümler (mimari
  yeni oyun eklemeyi kolaylaştırmalı). UNO/Tabu marka adıyla değil, kendi adımızla.
- Poker, bilardo, tavla → ilk sürümde yok.
- Hesap sistemi, kalıcı istatistik, herkese açık lobi/eşleştirme, birden çok oda.
- Sipariş menüsü, kedi sevme gibi mini etkileşimler → ilk sürümde zorunlu değil (bkz. §9).

## 4. Anti-hedefler (teknik olarak çalışsa bile başarısızlık sayılır)

- Kodla üretilmiş kutu/silindir mobilyalar; "blok gibi" görünen sahne.
- Yarım kalmış, "demo" hissi veren oyunlar.
- Tarayıcıda sentezlenmiş "bip" sesler. Tüm sesler HD, gerçek kayıt.
- Soğuk, boş, steril ışık. Sahne her zaman sıcak ve yaşayan hissettirmeli.
- Eski projedeki gibi tek dosyada binlerce satır.

## 5. Kısıtlar

- Tarayıcıda çalışır, kurulum yok, link ile girilir. İlk yükleme makul olmalı
  (hedef: ilk görüntü < ~10 MB, geri kalan arka planda).
- Telefonlarda (orta seviye Android/iPhone) akıcı çalışmalı → kalite ayarı
  (gölge/çözünürlük düşürme) gerekir.
- Barındırma: tek Node sunucusu (Render, eski projeyle aynı). Medya için LiveKit
  (Cloud ücretsiz katmanı veya kendi sunucumuz).
- Birçok site iframe içinde açılmayı engeller; DRM'li içerik (Netflix vb.) ekran
  paylaşımında siyah görünür. Bu bilinen ve kabul edilmiş bir sınırdır.
- Varlık lisansları: yalnızca CC0 / CC-BY (atıf listesi tutulur).

## 6. Yaklaşımlar

| | Yaklaşım | Artı | Eksi |
|---|---|---|---|
| **1 (seçildi)** | Tarayıcı + Three.js + TypeScript, Colyseus oda sunucusu, LiveKit | Link ile anında giriş, telefonda hafif, TV'ye web içeriği gömmek kolay, sunucu otoriter oyun mantığı | Gerçekçi sahne kurmak kodla/araçla yapılır, editör yok |
| 2 | Unity/Godot → WebGL | Görsel editör, gerçekçi sahne kolay | 30–80 MB indirme, telefonda sorunlu, web sayfasını TV'ye gömmek çok zor |
| 3 | Eski yapı (düz JS + Socket.IO) | Tanıdık | Eski dağınıklığı tekrar üretme riski |

Sahibi 1'i seçti. Neden: TV/link özelliği ve telefon desteği kilit; 2 bunları zorlaştırıyor.

## 7. Sahibinin verdiği kararlar

- **Görsel tarz:** gerçekçi. Modeller mümkün olduğunca internetten, hazır ve kaliteli
  (ör. gerçekçi koltuk). B+C taslağı seçilmişti çünkü C taslağı (kutulardan) "blocky"
  durdu; asıl istenen gerçekçi modeller + sıcak ışık. Referans his: döşenmiş, şömineli
  bir Minecraft evi (ladin ahşap, taş, kırmızı halı, kedi) ve küçük sobalı yayla evi
  (mutfak+oturma odası bitişik, bir kanepe, bir TV). Bunların kopyası değil, hissi.
- **Sesler:** baştan, HD gerçek kayıt.
- **Dokular:** eski projedeki (Gemini yapımı) dokular kullanılabilir veya yenilenebilir.
- **Eski 3D modeller:** kullanılmaz.
- **101 Okey kuralları:** eski projenin **güncel** halindeki kurallar; **12-13-1 seri
  dönüşü yok** (seriler 13'te biter).
- **Oyunlar (ilk sürüm):** Batak, 101 Okey, Pişti, Papaz Kaçtı.
- **TV:** yol 3 — senkron link + ekran paylaşımı.
- **Sesli sohbet:** eklensin, Krisp benzeri gürültü engelleme ile.
- **Kişi sayısı:** 10–15, sahibi ve arkadaşları.
- **Teknoloji:** Yaklaşım 1.

## 8. Tasarım (önerilen yapı)

### 8.1 Mimari

```
client (Vite + TS + Three.js)          server (Node + TS)
 ├─ world/   sahne, ışık, varlık yükleme  ├─ LobbyRoom (Colyseus): oyuncular, konum,
 ├─ avatar/  karakter, animasyon, kontrol │   oturma yerleri, TV/müzik durumu, sohbet
 ├─ tables/  masa 3D görünümü (oyun başına)├─ GameRoom × masa: oyun motoru + botlar
 ├─ ui/      HUD, menüler, oyun arayüzleri │   (sunucu otoriter; istemci sadece niyet yollar)
 ├─ media/   TV oynatıcı, müzik, LiveKit   └─ LiveKit token ucu
 └─ net/     Colyseus istemcisi
shared/  (TS, istemci+sunucu)
 └─ games/<oyun>/  saf kural motoru + bot + testler (UI'dan bağımsız)
```

- **Oyun motorları saf ve test edilebilir:** `state + action → state`. Her oyun
  aynı arayüzü uygular (`init`, `legalActions`, `apply`, `botAction`, `viewFor(seat)`);
  yeni oyun eklemek = yeni klasör.
- **Gizli bilgi:** sunucu her oyuncuya sadece görmesi gerekeni yollar (başkalarının eli yok).
- **Bağlantı kopması:** oyuncunun koltuğu ~60 sn tutulur, bu sürede bot oynar; geri
  gelirse koltuğunu alır.

### 8.2 Mekân

- Tek salon: oturma köşesi (kanepe + TV + soba), 4 oyun masası, küçük mutfak/ocak
  köşesi (çaydanlık), pencereler (dış hava: kar/yağmur), kediler.
- Varlık kaynakları: Poly Haven (CC0; kontrol edildi — `barrel_stove`, `sofa_02/03`,
  `Rockingchair_01`, `round_wooden_table_01/02`, `vintage_oil_lamp`, kitaplık,
  bitkiler vb. mevcut), gerektiğinde diğer CC0/CC-BY kaynaklar (ör. Quaternius,
  Kenney, Sketchfab CC). Atıf listesi `CREDITS.md`.
- Gerçekçilik: PBR malzemeler, HDRI ortam ışığı, sıcak nokta ışıkları (soba titreşimi,
  lamba), önceden hesaplanmış/yumuşak gölgeler, ton eşleme. Modeller sıkıştırılır
  (glTF + Draco/Meshopt + KTX2).
- Kalite seviyeleri: Yüksek / Orta / Düşük (telefon varsayılanı Orta).

### 8.3 Avatarlar

- Hareket: masaüstünde WASD + fare (3. şahıs kamera), telefonda sanal joystick.
  Oturulabilir noktaya yaklaşınca "Otur" düğmesi.
- Oturunca kamera masaya/TV'ye yumuşak geçiş yapar; oyun arayüzü açılır.
- İsim etiketi + konuşurken ses göstergesi.

### 8.4 Oyunlar

**101 Okey** (eski güncel kurallar): 106 taş; gösterge → okey; sahte okey;
101 sayı ile seri açma veya 5+ çift açma; seriler 13'te biter (12-13-1 yok); yandan
alınan taşı o tur kullanma zorunluluğu; işlek taş cezası (+101, seçenek); okey atma
cezası; Katlamalı 101 seçeneği; tekli/eşli; el sonu puanlama (açmayan 202, çiftten
açan ×2, okeyle bitiş ×2 vb.); yazboz (çok elli skor tablosu). Istaka üzerinde
sürükle-bırak, otomatik dizme (seri/çift), canlı "açabilir misin" göstergesi.

**Batak:** 4 kişi, 52 kart, el başına 13 kart. **İhaleli batak** (benim önerim; eski
sürümde koz sabit maça ve basit tahmin vardı): ihale (en yüksek söyleyen kozu seçer),
zorunlu renk/koz çakma/yükseltme kuralları, ihaleyi tutturamayan batar, skor tablosu.
Tekli veya eşli seçeneği.

**Pişti:** 2 veya 4 kişi, standart kurallar: yerdeki kartla aynı değer ya da vale ile
alma; pişti 10 puan, vale ile pişti 20; as/vale 1, ♣2 = 2, ♦10 = 3; en çok kart +3;
hedef skor (ör. 151) ile çok elli maç.

**Papaz Kaçtı:** 2–4 kişi, bir papaz çıkarılmış deste (♠K tek kalır); çiftler atılır;
sırayla soldakinden kapalı kart çekilir; sonunda papaz kimde kalırsa kaybeder. Kart
seçerken karşı tarafın kartları 3D'de yelpaze olarak görünür.

Her oyun için: bot (makul seviyede, "aptal" değil), gerçek ses, 3D kart/taş
hareket animasyonları, oyun sonu ekranı, izleyici modu (masaya oturmadan bakma).

### 8.5 TV ve müzik

- TV'nin kumandası paylaşımlı: herkes link açabilir, durdurabilir (basit, arkadaş
  grubu). Son işlem kimin yaptığı ekranda kısa not olarak görünür.
- Senkron oynatma: sunucu `{url, kaynak, oynuyor mu, konum, zaman damgası}` tutar;
  istemciler bu duruma göre kendi oynatıcılarını hizalar.
- Ekran paylaşımı: LiveKit üzerinden; paylaşan kişi sekmesini seçer, görüntü + ses
  TV yüzeyine doku olarak basılır.
- TV sesi mesafeye bağlı (TV'ye yaklaşınca daha net), ayrıca kişisel ses ayarı.
- Müzik: ayrı ortak çalar (YouTube/doğrudan link kuyruğu), salon geneli, kişisel ses ayarı.
- Hazır öneriler: Yeşilçam / lofi / türkü listeleri gibi başlangıç linkleri.

### 8.6 Sesli sohbet

- LiveKit ses odası; mikrofon varsayılan kapalı, "Bas-konuş" veya açık mikrofon.
- Mesafeye göre ses seviyesi (aynı masadakiler net, uzaktakiler kısık/duyulmaz).
- Gürültü engelleme: LiveKit Cloud'un Krisp filtresi (plan izin veriyorsa), değilse
  tarayıcı içi RNNoise (WASM).

### 8.7 Sesler

- Gerçek kayıt CC0/CC-BY kaynaklarından (ör. Freesound CC0, Sonniss GDC paketleri):
  taş koyma/çekme/karıştırma, kart dağıtma/atma/karıştırma, çay kaşığı/bardak,
  soba çıtırtısı, kedi mırlaması, yağmur/rüzgâr, uzaktan kahvehane uğultusu.
- 48 kHz, OGG/Opus + AAC yedek, ses normalizasyonu.

### 8.8 Arayüz

- Sıcak, sade, kâğıt/ahşap hissi; Türkçe. Üstte minimal çubuk (isim, ses, mikrofon,
  ayarlar). Oyun arayüzü yalnızca masada oturunca.
- Hızlı tepkiler/emote ve yazılı sohbet (balon olarak avatarın üstünde).

## 9. Kurucuya bırakılanlar

- Salonun tam yerleşimi ve hangi modellerin seçileceği (§8.2 kaynakları içinde).
- Bot algoritmalarının ayrıntısı (makul ve hızlı olmak şartıyla).
- İçerik sunumu ayrıntıları (kamera geçişleri, animasyon süreleri, UI bileşenleri).
- Karakter modelinin kaynağı; gerçekçi insan modelleri tuhaf görünürse sahibine iki
  seçenek gösterilir.
- Sipariş menüsü, kedi sevme gibi küçük etkileşimler: zaman kalırsa.

## 10. Test ve doğrulama

- Her oyun motoru için birim testleri (kurallar, puanlama, uç durumlar, bot geçerli
  hamle yapar).
- Çok oyunculu entegrasyon testleri (Colyseus oda testleri; gizli bilgi sızmıyor).
- Playwright ile duman testi: giriş, yürüme, oturma, bir eli botlarla bitirme, TV linki açma.
- Telefon görünümünde performans kontrolü (hedef ≥ 30 FPS orta kalite).
