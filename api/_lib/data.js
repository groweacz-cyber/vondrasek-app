// Sdílené definice: které kolekce se synchronizují a co smí který uživatel číst a psát.
const KOLEKCE = ['jizdy', 'tankovani', 'vozidla', 'ridici', 'zakazky', 'malaDoprava', 'pnsRouteConfig', 'hlaseniObjizdek'];
const RIDIC_PISE = ['jizdy', 'tankovani', 'hlaseniObjizdek']; // řidič zapisuje jen svoje jízdy, tankování a hlášení objížděk
const MAX_ZAZNAM = 100000;                  // max. velikost jednoho záznamu (JSON bez fotky účtenky)
const MAX_FOTKA = 700000;                   // max. velikost fotky účtenky (base64)

// Co dostane řidič: nikdy finance jízd, u řidičů jen jméno (žádný telefon, karty ani PINy)
function projekceProRidice(coll, data) {
  if (!data) return data;
  if (coll === 'ridici') return { id: data.id, jmeno: data.jmeno };
  if (coll === 'jizdy') { const { financni, ...zbytek } = data; return zbytek; }
  return data;
}

const jeObjekt = (x) => x && typeof x === 'object' && !Array.isArray(x);

module.exports = { KOLEKCE, RIDIC_PISE, MAX_ZAZNAM, MAX_FOTKA, projekceProRidice, jeObjekt };
