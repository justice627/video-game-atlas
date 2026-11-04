// Research helper. Coordinates in data/places.csv must come from a Wikidata or GeoNames record, never from memory.
//   npm run place:lookup -- "Monteriggioni" "Soccer City"   -> candidate items to pick from
//   npm run place:lookup -- Q2044 Q641                      -> label, coordinates and type for each item
import { searchEntities, placeRecords } from './lib/wikidata.ts';

const args = process.argv.slice(2);
if (!args.length) { console.error('Give place names or Wikidata ids (Q...).'); process.exit(1); }
const ids = args.filter((a) => /^Q\d+$/.test(a));
for (const name of args.filter((a) => !/^Q\d+$/.test(a))) {
  console.log(`\n"${name}":`);
  for (const h of await searchEntities(name)) console.log(`  ${h.qid.padEnd(11)} ${h.label}${h.description ? ` (${h.description})` : ''}`);
}
if (ids.length) {
  console.log('\nqid,label,lat,lon,instance_of,description');
  for (const r of await placeRecords(ids)) console.log([r.qid, r.label, r.lat ?? 'NO-COORDS', r.lon ?? '', `"${r.instanceOf.join('; ')}"`, `"${r.description ?? ''}"`].join(','));
}
