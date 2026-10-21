// Jednorázový skript (2026-10-21): přiřadí skutečná jména a telefony 13 stávajícím řidičům tras PNS
// a přidá 2 nové trasy (20013, 20018) i s jejich řidiči. Spuštění (s proměnnými z Vercelu):
//   node scripts/add-drivers-2026-10.js
// PINy nových řidičů (20013, 20018) se vygenerují náhodně a vypíšou se jen do konzole — v databázi
// jsou jen jako otisk, stejně jako u ostatních. Skript je bezpečné pustit znovu: existující trasy
// přeskočí, jen řidiče/telefony u stávajících 13 tras vždy přepíše na hodnoty níže.
const crypto = require('crypto');
const { db } = require('../api/_lib/db');
const { otisk } = require('../api/_lib/auth');

// id řidiče → trasa, jméno, telefon (id 1–13 = pořadí v TRASY ze scripts/seed.js, musí se shodovat)
const STAVAJICI = [
  { id: '1',  trasa: '20001', jmeno: 'Pavel Fikota',      telefon: '+420 734 351 944' },
  { id: '2',  trasa: '20004', jmeno: 'Max Yermolenko',    telefon: '+420 728 299 691' },
  { id: '3',  trasa: '20011', jmeno: 'Pavel Korvas',      telefon: '+420 605 468 622' },
  { id: '4',  trasa: '20016', jmeno: 'Jano Križanský',    telefon: '+420 722 900 226' },
  { id: '5',  trasa: '20041', jmeno: 'Petr Řežábek',      telefon: '+420 602 753 069' },
  { id: '6',  trasa: '20042', jmeno: 'Romana Jakubcová',  telefon: '+420 774 090 580' },
  { id: '7',  trasa: '20043', jmeno: 'Miloš Valovič',     telefon: '+420 774 270 361' },
  { id: '8',  trasa: '20044', jmeno: 'Kateřina Veselá',   telefon: '+420 704 116 535' },
  { id: '9',  trasa: '20045', jmeno: 'Petr Vondrášek',    telefon: '+420 721 460 120' },
  { id: '10', trasa: '20058', jmeno: 'Robert Čepička',    telefon: '+420 722 921 805' },
  { id: '11', trasa: '20063', jmeno: 'Pavel Sarauer',     telefon: '+420 724 921 945' },
  { id: '12', trasa: '20064', jmeno: 'Pavel Honing',      telefon: '+420 724 607 945' },
  { id: '13', trasa: '20066', jmeno: 'Václav Pitra',      telefon: '+420 722 900 226' }
];
// nové trasy — id pokračuje na konci (14, 15), ať se nikdy nekříží se stávajícími
const NOVE = [
  { id: '14', trasa: '20013', jmeno: 'Vítěslav Antoš', telefon: '+420 739 759 451' },
  { id: '15', trasa: '20018', jmeno: 'Aleš Vejsada',   telefon: '+420 602 560 366' }
];

function nahodnyPin(pouzite) {
  for (;;) {
    const p = String(crypto.randomInt(1000, 10000));
    const d = p.split('').map(Number);
    const rada = d.every((x, i) => i === 0 || x === d[i - 1] + 1) || d.every((x, i) => i === 0 || x === d[i - 1] - 1);
    if (new Set(d).size < 4 || rada || /^(19|20)\d\d$/.test(p)) continue;
    if (pouzite.has(p)) continue;
    return p;
  }
}

async function main() {
  const q = await db();

  console.log('Stávající řidiči — jméno a telefon:');
  for (const r of STAVAJICI) {
    const rows = await q(`SELECT data FROM vnd_records WHERE coll = 'ridici' AND id = $1 AND deleted = false`, [r.id]);
    if (!rows.length) { console.log(`  ✗ id ${r.id} (trasa ${r.trasa}) v databázi neexistuje, přeskakuji`); continue; }
    const data = { ...rows[0].data, jmeno: r.jmeno, telefon: r.telefon };
    await q(`UPDATE vnd_records SET data = $2::jsonb, seq = nextval('vnd_rev'), updated_by = 'migrace', updated_at = now() WHERE coll = 'ridici' AND id = $1`, [r.id, JSON.stringify(data)]);
    const cfgRows = await q(`SELECT data FROM vnd_records WHERE coll = 'pnsRouteConfig' AND id = $1 AND deleted = false`, [r.trasa]);
    if (cfgRows.length) {
      const cfg = { ...cfgRows[0].data, stalyRidic: r.jmeno };
      await q(`UPDATE vnd_records SET data = $2::jsonb, seq = nextval('vnd_rev'), updated_by = 'migrace', updated_at = now() WHERE coll = 'pnsRouteConfig' AND id = $1`, [r.trasa, JSON.stringify(cfg)]);
    }
    console.log(`  ✓ trasa ${r.trasa}: ${r.jmeno} (${r.telefon})`);
  }

  console.log('\nNové trasy a jejich řidiči:');
  const pouziteOtisky = new Set(); // jen pro tenhle běh, skutečná unikátnost se ověří v DB (ON CONFLICT / unique index)
  const noveViny = [];
  for (const r of NOVE) {
    const exRidic = await q(`SELECT 1 FROM vnd_records WHERE coll = 'ridici' AND id = $1 AND deleted = false`, [r.id]);
    if (!exRidic.length) {
      const data = { id: +r.id, jmeno: r.jmeno, telefon: r.telefon, skupina: '—', kartaRidice: '', profesniPrukaz: '', posledniStazeniKarty: null };
      await q(`INSERT INTO vnd_records (coll, id, data, deleted, seq, updated_by) VALUES ('ridici', $1, $2::jsonb, false, nextval('vnd_rev'), 'migrace')`, [r.id, JSON.stringify(data)]);
    } else {
      const data = { ...exRidic[0].data, jmeno: r.jmeno, telefon: r.telefon };
      await q(`UPDATE vnd_records SET data = $2::jsonb, seq = nextval('vnd_rev'), updated_by = 'migrace', updated_at = now() WHERE coll = 'ridici' AND id = $1`, [r.id, JSON.stringify(data)]);
    }
    const exCfg = await q(`SELECT 1 FROM vnd_records WHERE coll = 'pnsRouteConfig' AND id = $1 AND deleted = false`, [r.trasa]);
    if (!exCfg.length) {
      const data = { cenovyModel: 'km', cenaZaKm: 0, kmZaDen: 0, pausalZaDen: 0, odhadNakladuZaDen: 0, stalyRidic: r.jmeno };
      await q(`INSERT INTO vnd_records (coll, id, data, deleted, seq, updated_by) VALUES ('pnsRouteConfig', $1, $2::jsonb, false, nextval('vnd_rev'), 'migrace')`, [r.trasa, JSON.stringify(data)]);
    } else {
      const cfg = { ...exCfg[0].data, stalyRidic: r.jmeno };
      await q(`UPDATE vnd_records SET data = $2::jsonb, seq = nextval('vnd_rev'), updated_by = 'migrace', updated_at = now() WHERE coll = 'pnsRouteConfig' AND id = $1`, [r.trasa, JSON.stringify(cfg)]);
    }
    const maPin = await q('SELECT 1 FROM vnd_access WHERE subject = $1', ['driver:' + r.id]);
    if (!maPin.length) {
      let pin, ulozeno = false;
      while (!ulozeno) {
        pin = nahodnyPin(pouziteOtisky);
        try {
          await q(`INSERT INTO vnd_access (subject, pin_fp, ver, must_change) VALUES ($1, $2, 1, false)`, ['driver:' + r.id, otisk(pin)]);
          ulozeno = true;
        } catch (e) {
          if (e && (e.code === '23505' || /unique|duplicate/i.test(String(e.message)))) continue; // PIN kolidoval, zkus jiný
          throw e;
        }
      }
      pouziteOtisky.add(pin);
      noveViny.push([r.trasa, r.jmeno, pin]);
    }
    console.log(`  ✓ trasa ${r.trasa}: ${r.jmeno} (${r.telefon})`);
  }

  if (noveViny.length) {
    console.log('\nPINy nových řidičů (zapiš si je, znovu se nezobrazí):');
    noveViny.forEach(([t, j, p]) => console.log(`  trasa ${t} — ${j}: ${p}`));
  } else {
    console.log('\nNoví řidiči už měli PINy nastavené — beze změny.');
  }
}

module.exports = main;
if (require.main === module) main().then(() => process.exit(0)).catch(e => { console.error(e.message || e); process.exit(1); });
