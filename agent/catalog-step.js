import { scanCatalog } from './catalog-scan.js';
export async function processCatalogStep(message,{store,send,enqueue,key,scan=scanCatalog}){
 const lease=await store.acquireCatalogLease();if(!lease)throw new Error('SCAN_BUSY');
 try{const run=await store.getCatalogRun();
 if(!run||run.id!==message.run||run.engine!=='queue'||run.status==='completed')return;
 if(run.index===message.index){
 const r=await scan(key,{offset:run.index,limit:1,maxPages:60,now:run.startedAt,onCollection:row=>store.saveCatalogCollection(run.index,{...row,runId:run.id})});
 if(r.collections.length!==1)throw new Error('EMPTY_COLLECTION');
 run.checked++;if(!r.complete)run.incomplete++;run.total=r.catalogTotal;run.index=r.nextOffset;run.status=r.nextOffset===null?'completed':'running';
 await store.saveCatalogRun(run);
 try{await send(`Сбор каталога: ${run.status}; обработано ${run.checked}/${run.total}; неполных ${run.incomplete}; полностью проверено ${run.checked-run.incomplete}.\nКоллекция: ${r.collections[0].collection}. Слоты не меняются.`);}catch{}
 }
 if(run.status==='running')await enqueue('catalog-scan',{run:run.id,index:run.index},{idempotencyKey:run.id+':'+run.index,retentionSeconds:604800});
 }finally{await store.releaseCatalogLease(lease);}
}
