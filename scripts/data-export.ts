// CSV tables -> data/atlas.xlsx (editing view).
import { readTables } from './lib/tables.ts';
import { writeWorkbook, WORKBOOK } from './lib/workbook.ts';

await writeWorkbook(readTables());
console.log(`Wrote ${WORKBOOK}`);
