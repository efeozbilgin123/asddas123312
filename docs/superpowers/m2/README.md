# Kilometre taşı 2 — Çok oyunculu salon

## Neler var

- Linke giren isim yazıp bir renk seçer ("İçeri gir"); en fazla 15 kişi aynı salonda.
- Herkes birbirini yürürken ve otururken görür; isimler başların üstünde.
- Koltuklar paylaşımlı: biri oturduysa başkası oturamaz ("Bu koltuk dolu").
- Yazılı sohbet (Enter ile aç, Esc ile kapat) ve 6 emoji (👋 😂 ☕ 👍 ❤️ 👏); konuşma balonları.
- Kedi herkes için aynı kedi (sunucu yönetiyor).
- Bağlantı koparsa 10 sn "(uzakta)" görünür, sonra salondan çıkar.
- Sunucuya ulaşılamazsa oyun yine açılır: "Çevrimdışı — tek başına geziyorsun".
- Link parametreleri: `?name=Efe&look=hardal` giriş ekranını atlar; `?server=wss://…` başka sunucuya bağlanır.

## Yerelde çalıştırma

```bash
npm install
npm run build
npm start          # http://localhost:2567
```

Geliştirirken: `npm run dev` (sunucu :2567 + Vite :5173, Vite istemcisini `?server=ws://localhost:2567` ile aç).

## Yayına alma (ücretsiz)

**Render (en kolay):** Render hesabında "New → Blueprint" ile bu repoyu seç; `render.yaml`
tek bir ücretsiz web servisi kurar. Ücretsiz planda kimse yokken ~15 dk sonra uyur; ilk giren
~1 dk bekler, açık oyunlar sıfırlanır.

**Oracle Cloud (uyumayan):** VM'de Node 20 kur, repoyu çek, `npm install && npm run build`,
`PORT=80 npm start` (veya nginx arkasında). TV/ekran paylaşımı aşamasında LiveKit de aynı
makineye gelecek.

## Testler

- `npm test` — birim + oda testleri (shared, server, client)
- `npm run smoke` — tek kişilik salon (çevrimdışı yol)
- `npm run smoke:multi` — iki tarayıcıyla çok oyunculu uçtan uca test
