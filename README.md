# 🃏 Planning Poker

Agilní plánovací poker pro váš tým. Real-time hlasování až pro **20 hráčů** s Fibonacciho bodováním.

![Bílá a žlutá tema](https://img.shields.io/badge/téma-bílá%20%2B%20žlutá-FFD600?style=flat-square)
![Node.js](https://img.shields.io/badge/Node.js-%3E%3D16-339933?style=flat-square&logo=node.js)
![Socket.io](https://img.shields.io/badge/Socket.io-4.x-010101?style=flat-square&logo=socket.io)

---

## ✨ Funkce

| Funkce | Popis |
|--------|-------|
| 🎮 Místnosti | Vytvořte místnost a sdílejte 6místný kód s týmem |
| 👥 Až 20 hráčů | Podpora až 20 aktivních hráčů v jedné místnosti |
| 👁 Pozorovací mód | Kdokoliv se může přepnout na pozorovatele – vidí výsledky, ale nehlasuje |
| 🃏 Fibonacciho karty | `1 · 2 · 3 · 5 · 8 · 13 · ? · ☕` |
| 📊 Statistiky | Průměr, nejčastější hodnota, rozsah, shoda týmu |
| 📋 Historie | Posledních 10 kol s výsledky |
| 🔗 Sdílení | Odkaz s kódem místnosti pro okamžité připojení |
| 📱 Responzivní | Funguje na mobilu i desktopu |

---

## 🚀 Spuštění lokálně

```bash
# 1. Klonujte repozitář
git clone <url>
cd planning-poker

# 2. Nainstalujte závislosti
npm install

# 3. Spusťte server
npm start
# → http://localhost:3000

# Vývoj (auto-restart)
npm run dev
```

---

## ☁️ Nasazení (deploy)

### Render.com (zdarma)
1. Vytvořte účet na [render.com](https://render.com)
2. New → Web Service → propojte GitHub repo
3. Build: `npm install` · Start: `node server.js`
4. Deploy ✓

### Railway.app (zdarma)
1. [railway.app](https://railway.app) → New Project → Deploy from GitHub
2. Proměnná `PORT` se nastaví automaticky
3. Deploy ✓

### Heroku
```bash
heroku create nazev-aplikace
git push heroku main
```

### Docker
```dockerfile
FROM node:20-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --production
COPY . .
EXPOSE 3000
CMD ["node", "server.js"]
```

---

## 🎯 Jak hrát

1. **Vedoucí** (Scrum Master / facilitátor) vytvoří místnost
2. Sdílí **kód místnosti** (nebo odkaz) s týmem
3. Hráči se připojí a zadají své jméno
4. Vedoucí zadá název **příběhu / úkolu**
5. Všichni vyberou kartu – ostatní vidí jen ✓/…, ne hodnotu
6. Po kliknutí **Odhalit hlasy** se zobrazí všechny hodnoty a statistiky
7. Tým diskutuje a klikne **Nové kolo** pro další příběh

### Pozorovací mód
Přepínač *Pozorovatel* umožní komukoli sledovat hlasování bez účasti.
Vhodné pro Scrum Mastery, stakeholdery nebo lidi mimo tým.

---

## 🏗 Architektura

```
planning-poker/
├── server.js          # Node.js + Express + Socket.io backend
├── public/
│   ├── index.html     # SPA – landing + herní obrazovka
│   ├── style.css      # Design systém (bílá + žlutá)
│   └── app.js         # Klient – Socket.io + UI logika
├── package.json
└── Procfile           # Heroku
```

**Stack:** Node.js · Express · Socket.io · Vanilla JS · CSS Custom Properties

---

## 📜 Licence

MIT – volně použitelné a upravitelné.
