import { writeFile,rename,mkdir } from 'node:fs/promises';
import { resolve,dirname } from 'node:path';
import { scanCatalog } from './catalog-scan.js';

const output=resolve(process.argv[2]||'catalog-analysis.json');
await mkdir(dirname(output),{recursive:true});
const save=async result=>{await writeFile(output+'.tmp',JSON.stringify(result,null,2));await rename(output+'.tmp',output);};
try{
  const result=await scanCatalog(process.env.GIFT_SATELLITE_API_KEY,{onCollection:async(row,result)=>{
    await save(result);console.log(`${result.collections.length}: ${row.complete?'complete':'incomplete'}`);
  }});
  await save(result);
  console.log(`Collections: ${result.collections.length}; complete: ${result.complete}; writes: 0`);
  if(!result.complete)process.exitCode=2;
}catch{console.error('Scan could not finish. Check API access; any saved result remains incomplete.');process.exitCode=1;}
