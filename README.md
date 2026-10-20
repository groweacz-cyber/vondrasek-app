# Vondrášek — Provozní systém

Interní provozní systém pro Autodoprava Vondrášek, s.r.o.
Statická appka (HTML/CSS/JS bez buildu) + serverové funkce na Vercelu + databáze Neon Postgres.
Majitel vidí a spravuje **všechna** data, řidič vidí jen svoje jízdy a tankování.

## Struktura

```
├── index.html        → app shell (přihlášení, menu, horní lišta)
├── styles.css        → Growea design system (dark, purple/blue)
├── app.js            → obrazovky a logika (dashboard, jízdy, tankování, vozidla, řidiči, zakázky, malá doprava, reporty)
├── sync.js           → přihlášení, pracovní kopie dat a synchronizace se serverem
├── sw.js             → service worker (offline shell appky)
├── api/              → serverové funkce (Vercel)
│   ├── login.js      → POST přihlášení PINem
│   ├── sync.js       → GET změny / POST uložení změn (s kontrolou oprávnění)
│   ├── pin.js        → POST změna PINu (jen majitel)
│   ├── receipt.js    → GET fotka účtenky
│   ├── logout.js     → POST smaže cookie relace
│   └── _lib/         → databáze, podepisování relací, oprávnění
├── scripts/seed.js   → jednorázové naplnění databáze (13 řidičů tras PNS + PINy), nenasazuje se
├── package.json      → jediná závislost: @neondatabase/serverless
└── vercel.json       → konfigurace nasazení (region fra1)
```

## Jak to funguje

- **Data jsou na serveru** (tabulka `vnd_records`: kolekce `jizdy`, `tankovani`, `vozidla`, `ridici`, `zakazky`,
  `malaDoprava`, `pnsRouteConfig`, `hlaseniObjizdek`). Prohlížeč má jen pracovní kopii.
- **Synchronizace** (`sync.js`): každá změna se hned odešle, nové změny od ostatních se stahují každých 15 s
  (a při návratu na kartu). Bez připojení se změny drží a odešlou po obnovení sítě. Při souběžné úpravě téhož
  záznamu vyhrává poslední zápis.
- **Role a oprávnění** (vynucuje server, ne jen menu):
  - majitel čte i zapisuje všechno,
  - řidič dostane jen své jízdy a tankování (bez financí), vozidla a jména kolegů; zapisuje jen své jízdy
    a tankování. Malá doprava (PNS), zakázky, finance a řidiči (kontakty, karty) jsou jen pro majitele.
- **PINy**: 4 číslice, na serveru jen jako HMAC otisk (`PIN_PEPPER`), nikdy v kódu ani v datech. Majitel je mění
  v appce (Řidiči → PIN majitele / Upravit řidiče). Po změně PINu přestanou platit staré relace. Po 5 špatných
  pokusech z jedné adresy se přihlášení na 5 min zamkne (pak 10, 20, … max. 60 min).
- **Fotky účtenek** se ukládají na serveru zvlášť (`vnd_receipts`) a načítají přes `/api/receipt` (cookie relace).
- **Hlášení objížděk**: řidič má na dashboardu tlačítko „📣 Objížďka" — nahlásí km navíc na své trase (server si
  trasu ověří podle toho, kde je vedený jako stálý řidič) a km se hned promítnou majiteli do Malé dopravy u daného
  dne a trasy (jen ta jedna výjimka, zbytek dne zůstane beze změny). Majitel hlášení vidí na dashboardu, klik na
  něj otevře ten den v Malé dopravě a označí hlášení za přečtené.
- **Vícenáklady z objížděk k fakturaci**: v Malé dopravě je karta se souhrnem za zobrazený měsíc — po trasách km
  navíc (ne základní km trasy), cena za km a vícenáklad v Kč, s řádkem CELKEM a exportem do CSV
  (`objizdky-vicenaklady-RRRR-MM.csv`). Paušálové trasy nemají Kč/km, takže se u nich vícenáklad nepočítá (km se
  jen sečtou pro přehled).
- **Velká doprava (CZ / EU)**: dvě samostatné stránky v menu majitele nad stejnou evidencí jízd (`jizdy`) — každá
  jízda nese `typ: 'cz' | 'eu'`, zvolený ve formuláři nové jízdy (předvyplněný podle toho, ze které stránky se
  otevřel). Každá stránka má vlastní ziskovost, filtr/měsíc a export CSV s financemi
  (`velka-doprava-cz-RRRR-MM.csv` / `-eu-`). Evidence jízd dál ukazuje obě kategorie pohromadě se štítkem CZ/EU
  u trasy. Obě stránky jsou jen pro majitele (stejně jako Malá doprava).

## Nastavení na Vercelu (jednorázově)

1. **Databáze**: Neon přes Vercel Marketplace (`vercel integration add neon`) — doplní `DATABASE_URL` do projektu.
2. **Proměnné prostředí** (Production): `SESSION_SECRET` (dlouhý náhodný text, min. 24 znaků) a `PIN_PEPPER`
   (jiný dlouhý náhodný text). Po jejich změně se všichni musí znovu přihlásit, resp. přestanou platit PINy.
3. **Naplnění databáze**: s `DATABASE_URL`, `SESSION_SECRET` a `PIN_PEPPER` v prostředí spusť
   `OWNER_PIN=1234 node scripts/seed.js` (volitelně `OWNER_MUST_CHANGE=1` zapne v appce upozornění na změnu PINu).
   Vypíše náhodné PINy řidičů tras PNS — zapiš si je, znovu se nezobrazí (pak je lze jen resetovat v appce).
4. Další `git push` na `main` nasadí novou verzi automaticky.

## Subdoména

`app.autodoprava-vondrasek.eu` (CNAME ve Forpsi → Vercel).

## Stav

- [x] Dashboard s metrikami, evidence jízd, tankování (s fotkou účtenky), vozidla, řidiči, zakázky
- [x] Malá doprava (PNS) — 13 tras, kalendář výjimek, ziskovost, export k fakturaci
- [x] Reporty a podklady k fakturaci
- [x] Ostrý provoz od 2026-10-20 — bez zkušebních dat
- [x] Sdílená data na serveru: majitel vidí všechno, co zapíšou řidiči
- [x] Přihlášení PINem ověřované serverem (majitel + řidiči), změna PINů v appce
- [x] Řidič nahlásí objížďku z dashboardu — promítne se do Malé dopravy a majitel ji vidí
- [x] Měsíční souhrn vícenákladů z objížděk po trasách + export k fakturaci platci
- [x] Dashboard řidiče ukazuje jeho vlastní trasu PNS (nikdy trasy ostatních řidičů)
- [x] Velká doprava (CZ – vnitro) a Velká doprava EU (zahraničí) — vlastní stránky, ziskovost, export k fakturaci
- [ ] Skutečné účty (e-mail + heslo) místo PINů, historie změn (audit)
- [ ] Náborový chatbot (rule-based)
- [ ] Fáze 2 sekce (správce poptávek, marketing)
- [ ] Fáze 3 sekce (dispečink, kalkulace, WhatsApp, hlas)

---
Web & marketing: **Growea** · growea.eu
