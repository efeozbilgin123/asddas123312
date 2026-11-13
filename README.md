# Yüzbir 3D — Çok Oyunculu 101 Okey

Tarayıcıda oynanan, Three.js tabanlı 3 boyutlu ve Socket.IO destekli gerçek zamanlı çok oyunculu 101 Okey oyunu.

## Özellikler

- **3D Oyun Masası:** Ceviz çerçeveli, yeşil çuhalı masa; iki katlı ahşap ıstakalar, 106 adet seramik görünümlü 3D taş, gösterge standı, köşe atık alanları ve masa ortasında açılan perler.
- **Gerçek Zamanlı Çok Oyunculu ve Bot Desteği:** Oda kodu veya davet linkiyle 4 kişiye kadar gerçek oyuncu; boş koltuklar için otomatik yapay zekâ botlar.
- **Tam 101 Okey Kuralları:** 101 sayı barajı (ve Katlamalı 101 seçeneği), 5+ çift açma, 12-13-1 seri dönüşü, yandan taş alma zorunluluğu ve geri koyma, yerden Okey çalma, işlek taş (+101) cezası ve el sonu puan tablosu.
- **Hallmark Arayüz Tasarımı:** `Hum` teması temel alınarak karton/kâğıt dokulu, dokunsal düğmeli, tam erişilebilir ve duyarlı arayüz.

## Kurulum ve Çalıştırma

```bash
npm install
npm run dev
```

- İstemci (Vite): `http://localhost:5173`
- Sunucu (Express + Socket.IO): `http://localhost:3001`

### Üretim Derlemesi ve Testler

```bash
npm test
npm run build
npm start
```
