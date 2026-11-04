import { waitUntil } from '@vercel/functions';
import { randomUUID } from 'node:crypto';
import { runtime,sameSecret } from '../runtime.js';
import { scanCatalog } from '../catalog-scan.js';

const URL='https://gift-price-controller.vercel.app/api/catalog-worker';
export default async function handler(req,res){
  if(req.method!=='POST')return res.status(405).end();
  if(!sameSecret(req.headers.authorization,'Bearer '+process.env.CRON_SECRET)||!process.env.CRON_SECRET)return res.status(401).end();
  const {store,send}=runtime();
  const body=typeof req.body==='string'?JSON.parse(req.body):req.body||{};
  let run=await store.getCatalogRun();
  if(!body.run){
    if(run?.status==='running')return res.status(202).json({status:'already_running'});
    run={id:randomUUID(),status:'running',index:0,startedAt:Date.now(),checked:0,incomplete:0};
    await store.saveCatalogRun(run);
  }else if(!run||run.id!==body.run||run.status!=='running'||run.index!==body.index)return res.status(409).end();
  if(!await store.claimCatalogStep(run.id,run.index))return res.status(202).json({status:'duplicate'});
  waitUntil((async()=>{
    try{
      const r=await scanCatalog(process.env.GIFT_SATELLITE_API_KEY,{offset:run.index,limit:1,maxPages:60,
        now:run.startedAt,onCollection:row=>store.saveCatalogCollection(run.index,{...row,runId:run.id})});
      if(!r.collections.length)throw new Error('EMPTY_COLLECTION');
      run.checked++;if(!r.complete)run.incomplete++;
      run.total=r.catalogTotal;run.index=r.nextOffset;
      run.status=r.nextOffset===null?'completed':'running';
      await store.saveCatalogRun(run);
      if(run.status==='running'){
        try{
          await send(`Сбор каталога: running; обработано ${run.checked}/${run.total}; неполных ${run.incomplete}; полностью проверено ${run.checked-run.incomplete}.\nКоллекция: ${r.collections[0].collection}. Итог придёт после завершения. Слоты не меняются.`);
        }catch{
          // A notification failure must not stop the read-only scan.
          run.notificationFailures=(run.notificationFailures||0)+1;
          await store.saveCatalogRun(run);
        }
      }
      if(run.status==='completed')await send(`Обход каталога завершён: ${run.checked}/${run.total}. Неполная история: ${run.incomplete}. Данные сохранены в закрытом хранилище. Это история продаж; текущие предложения и торговый план требуют отдельной проверки. Слоты не менялись.`);
      else{
        const next=await fetch(URL,{method:'POST',headers:{Authorization:'Bearer '+process.env.CRON_SECRET,'Content-Type':'application/json'},
          body:JSON.stringify({run:run.id,index:run.index}),signal:AbortSignal.timeout(15000)});
        if(!next.ok)throw new Error('CONTINUATION_FAILED');
      }
    }catch{
      run.status='error';await store.saveCatalogRun(run);
      await send(`Сбор каталога остановлен: обработано ${run.checked}, следующий индекс ${run.index}. Слоты не менялись.`);
    }
  })());
  return res.status(202).json({status:'running'});
}
