# Kilometre taşı 1 — Salon (önizleme notları)

## Neler denenebilir

- **Bilgisayar:** WASD / ok tuşları ile yürü, Shift ile koş, fareyle sürükleyerek etrafa bak,
  tekerlekle yakınlaş. Bir koltuğa, kanepeye, sallanan sandalyeye ya da masa sandalyesine
  yaklaşınca **E** (veya "Otur" düğmesi) ile otur, tekrar **E** ile kalk.
- **Telefon (yatay):** sol alttaki joystick ile yürü, ekranın sağ tarafında sürükleyerek bak,
  "Otur / Kalk" düğmesi sağ altta.
- **Ayarlar** (sağ üst): görüntü kalitesi Düşük / Orta / Yüksek (sayfa yeniden yüklenir).

## Bilinen eksikler (bilerek)

- **Karakter geçici:** şu anki avatar three.js örneklerindeki "Soldier" modeli (zırhlı, cozy
  değil) — sadece yürüme/oturma sistemini göstermek için. Gerçekçi, ücretsiz ve girişsiz
  indirilebilen, animasyonlu bir insan modeli bulunamadı. Önerilen yol: **Mixamo**
  (ücretsiz Adobe girişi) — gündelik giyimli bir karakter seçip *Idle*, *Walking*,
  *Sitting Idle* animasyonlarını "FBX, With Skin" olarak indirmek. Dosyaları verdiğinde
  GLB'ye çevirip gerçek oturma animasyonuyla bağlarım (kod buna hazır).
- **Kedi yok:** aynı sebeple. Kedi beyni (uyuma, dolaşma, soba başında yatma, avatardan
  kaçma) hazır ve test edildi; bir model dosyası `client/public/assets/models/cat/cat.glb`
  olarak eklenince salonda dolaşmaya başlar. Adaylar:
  - Meshy "Walking Cat" (CC0): https://www.meshy.ai/3d-models/Walking-Cat-v2-0194c0ff-fd5e-7586-97b7-7cdfb7f39c71
  - Sketchfab "cat Rigged" (lisansı sayfada kontrol edilmeli): https://sketchfab.com/3d-models/cat-rigged-eccebebd5a60484eaa49036f8a4b6ed7
  - BlendSwap "Rigged and animated Cat" (CC-BY, .blend): https://blendswap.com/blend/18519
- **Ses yok:** bu kilometre taşının kapsamında değil.
- **Bilardo alanı boş:** sağ ön köşe 6. kilometre taşına ayrıldı.
- **Yüksek kalite** şimdilik 1k dokularla çalışıyor (2k dokular indirildi, sonra bağlanacak).

## Performans

Başsız (headless) test ortamı yazılım tabanlı GPU kullandığı için FPS ölçümü anlamlı değil;
gerçek telefonda "Orta" kalitede ölçülmeli. İlk yükleme ≈ 13 MB (1k), geri kalan eşyalar ilk
görüntüden sonra arka planda yüklenir.

## Ekran görüntüleri

- `desktop.png` — masaüstü, salona giriş
- `desktop-sitting.png` — kanepede oturma
- `mobile.png` — telefon (yatay), joystick ve "Otur" düğmesi
