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

**Oracle Cloud (uyumayan, otomatik güncellenen):** VM'ye SSH ile bağlan ve tek komut çalıştır:

```bash
curl -fsSL https://raw.githubusercontent.com/efeozbilgin123/asddas123312/claude/hopeful-keller-hzfh29/deploy/oracle/install.sh | sudo bash
```

Betik (`deploy/oracle/install.sh`) Node 20 + Caddy kurar, oyunu derleyip servis olarak başlatır,
`https://<ip-tireli>.sslip.io` adresinde otomatik sertifikayla açar ve her 2 dakikada bir
GitHub'daki dala bakan bir zamanlayıcı kurar: yeni commit → çek, derle, yeniden başlat; açılmazsa
eski sürüme döner ve o commit'i tekrar denemez. Eski Minecraft sunucusunu bulup raporlar
(`--stop-minecraft` ile kapatır). Bir kerelik elle yapılacak tek şey: Oracle konsolunda
VCN → Security List'te TCP 80 ve 443'ü açmak.

## Testler

- `npm test` — birim + oda testleri (shared, server, client)
- `npm run smoke` — tek kişilik salon (çevrimdışı yol)
- `npm run smoke:multi` — iki tarayıcıyla çok oyunculu uçtan uca test
