# Vondrášek — Provozní systém

Interní provozní systém pro Autodoprava Vondrášek, s.r.o.
Statický web (HTML/CSS/JS), data v localStorage. Nasazení přes Vercel.

## Struktura

```
├── index.html      → app shell (login, sidebar, topbar)
├── styles.css      → Growea design system (dark, purple/blue)
├── app.js          → logika (router, evidence jízd, tankování, reporty)
├── vercel.json     → konfigurace nasazení
└── README.md
```

## Nasazení

```bash
git remote add origin https://github.com/<tvuj-ucet>/vondrasek-app.git
git push -u origin main
```

Pak na vercel.com → Add New → Project → vyber `vondrasek-app` → Framework: Other → Deploy.

## Subdoména

Doporučená subdoména: `app.autodoprava-vondrasek.cz` (nebo jiná dle výběru).
Nastavení ve Vercel Settings → Domains, DNS záznamy přidáš ve Forpsi.

## Stav

- [x] Dashboard s metrikami
- [x] Evidence jízd (CRUD + filtr + CSV export)
- [x] Tankování (CRUD)
- [x] Vozidla, Řidiči, Zakázky (přehled)
- [x] Reporty (km/řidič, km/vozidlo, spotřeba)
- [x] Podklady k fakturaci
- [x] Přihlašování (demo — majitel vs. řidič)
- [ ] Přidávání vozidel/řidičů/zakázek
- [ ] Napojení na databázi (Neon) + reálné přihlašování
- [ ] Náborový chatbot (rule-based)
- [ ] Fáze 2 sekce (správce poptávek, marketing)
- [ ] Fáze 3 sekce (dispečink, kalkulace, WhatsApp, hlas)

---
Web & marketing: **Growea** · growea.eu
