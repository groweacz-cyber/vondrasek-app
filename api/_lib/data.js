// Sdílené definice: které kolekce se synchronizují a co smí který uživatel číst a psát.
const KOLEKCE = ['jizdy', 'tankovani', 'vozidla', 'ridici', 'zakazky', 'malaDoprava', 'pnsRouteConfig', 'hlaseniObjizdek', 'eonDny', 'terminy', 'linky', 'incidenty'];
const RIDIC_PISE = ['jizdy', 'tankovani', 'hlaseniObjizdek']; // řidič zapisuje jen svoje jízdy, tankování a hlášení objížděk
const MAX_ZAZNAM = 100000;                  // max. velikost jednoho záznamu (JSON bez fotky účtenky)
const MAX_FOTKA = 700000;                   // max. velikost fotky účtenky (base64)

// Co dostane řidič: nikdy finance jízd, u řidičů jen jméno (žádný telefon, karty ani PINy)
// sazby nákladů vozidla (amortizace, mýto) jsou jen pro majitele
function bezNakladuVozidla(data) { const { amortizaceKm, mytoKm, servisKm, fixniMesicne, ...zbytek } = data; return zbytek; }

function projekceProRidice(coll, data) {
  if (!data) return data;
  if (coll === 'vozidla') return bezNakladuVozidla(data);
  if (coll === 'ridici') return { id: data.id, jmeno: data.jmeno, malaDoprava: !!data.malaDoprava, velkaDoprava: !!data.velkaDoprava };
  if (coll === 'jizdy') { const { financni, ...zbytek } = data; return zbytek; }
  return data;
}

// Co dostane vedoucí dopravy (role "dispecer"): nikdy finance jízd, ale celé karty řidičů (jméno,
// telefon, platnosti karet) — potřebuje kontaktovat řidiče a vědět o kartách, bez ceníků a nákladů.
function projekceProDispecera(coll, data) {
  if (!data) return data;
  if (coll === 'vozidla') return bezNakladuVozidla(data);
  if (coll === 'ridici') { const { denniNakladRidice, mesicniMzda, ...zbytek } = data; return zbytek; }   // mzdy kolegů vidí jen majitel
  if (coll === 'jizdy') { const { financni, ...zbytek } = data; return zbytek; }
  return data;
}

const jeObjekt = (x) => x && typeof x === 'object' && !Array.isArray(x);

module.exports = { KOLEKCE, RIDIC_PISE, MAX_ZAZNAM, MAX_FOTKA, projekceProRidice, projekceProDispecera, jeObjekt };
