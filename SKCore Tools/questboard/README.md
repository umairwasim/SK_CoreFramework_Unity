# QuestBoard

Indie oyun geliştiricileri için yerel öncelikli, hafif pano. Jira’nın sprint töreni yok; görev, milestone ve derleme var.

## Çalıştır

```bash
npm install
npm run dev
```

Veri tarayıcıda gerçek SQLite’tır (`sql.js`). Dosya IndexedDB’ye yazılır, sayfa yenilense de durur. Ağ gerekmez.

## Bilerek dışarıda bırakılanlar

Git, ATS, OmniProfiler, Discord ve Slack bu çekirdekte yok. Çağrı noktaları `src/integrations.ts` içinde boş duruyor. OmniProfiler tek tıkla görev açacaksa `useQuest.getState().createTask(...)` kullanılabilir.

## Electron

Masaüstü kabuk `electron/main.cjs`. Önce `npm install electron`, sonra geliştirme sunucusu açıkken:

```bash
QUESTBOARD_DEV=1 npx electron electron/main.cjs
```

Paketlemek için `npm run build` sonrası aynı dosya `dist/index.html` yükler. Vite `base` değerini `./` yapmak gerekir.
