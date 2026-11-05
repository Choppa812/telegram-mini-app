import { fetchReadWithRetry } from './read-retry.js';

const BASE='https://gift-satellite.dev/api';
const summary=rows=>{
  const prices=rows.map(r=>Number(r.normalizedPrice)).sort((a,b)=>a-b);
  return {count:rows.length,q1:prices.length?prices[Math.floor((prices.length-1)*.25)]:null,
    median:prices.length?prices[Math.floor((prices.length-1)*.5)]:null};
};

// Read-only inventory and sales discovery. A scan is not a trading plan.
export async function scanCatalog(key,{fetcher=fetch,pause=ms=>new Promise(r=>setTimeout(r,ms)),
  now=Date.now(),maxPages=10000,onCollection=async()=>{},offset=0,limit=Infinity,backdrop}={}) {
  if(!key)throw new Error('API_KEY_MISSING');
  const request=async(path,body)=>{
    await pause(1500);
    const response=await fetchReadWithRetry(new URL(BASE+path),{
      method:body?'POST':'GET',redirect:'error',headers:{Authorization:`Token ${key}`,
      Accept:'application/json',...(body?{'Content-Type':'application/json'}:{})},
      ...(body?{body:JSON.stringify(body)}:{})},fetcher,pause);
    if(!response.ok)throw new Error(`READ_HTTP_${response.status}`);
    return response.json();
  };
  const catalog=await request('/gift/collections');
  if(!Array.isArray(catalog)||catalog.some(c=>typeof c?.name!=='string'))throw new Error('INVALID_CATALOG');
  if(!Number.isInteger(offset)||offset<0||!(limit===Infinity||Number.isInteger(limit)&&limit>0))throw new Error('INVALID_SCAN_RANGE');
  const result={startedAt:new Date(now).toISOString(),catalogTotal:catalog.length,offset,collections:[],complete:false,writesPerformed:0};
  for(const collection of catalog.slice(offset,offset+limit)){
    const row={collection:collection.name,complete:false,models:[],backdrops:[],combinations:[],pages:0};
    try{
      const detail=await request('/gift/collection/'+encodeURIComponent(collection.name));
      if(!Array.isArray(detail.models)||!Array.isArray(detail.backdrops))throw new Error('INVALID_ATTRIBUTES');
      row.models=detail.models.map(m=>({name:m.name,day:summary([]),week:summary([])}));
      row.backdrops=detail.backdrops.map(b=>b.name);
      const sales=[],seen=new Set();let oldest=Infinity;
      for(let page=0;page<maxPages;page++){
        const data=await request('/history/'+encodeURIComponent(collection.name),{page,pageSize:20,sortBy:'date',...(backdrop?{backdrops:[backdrop]}:{})});
        if(!Array.isArray(data?.content))throw new Error('INVALID_HISTORY');
        const times=data.content.map(s=>Date.parse(s.soldAt));
        if(times.some(t=>!Number.isFinite(t))||times.some((t,i)=>i&&t>times[i-1])||
          (times.length&&times[0]>oldest))throw new Error('UNSORTED_HISTORY');
        row.pages++;
        for(let i=0;i<data.content.length;i++){
          const sale=data.content[i],id=sale._id;
          if(typeof id!=='string')throw new Error('MISSING_SALE_ID');
          if(seen.has(id))continue;seen.add(id);
          if(times[i]<=now&&times[i]>=now-7*86400000&&Number(sale.normalizedPrice)>0&&(!backdrop||sale.backdropName===backdrop))sales.push(sale);
        }
        oldest=times.at(-1)??oldest;
        if(data.content.length<20||oldest<now-7*86400000){row.complete=true;break;}
      }
      for(const model of row.models){const matching=sales.filter(s=>s.modelName===model.name);
        model.week=summary(matching);model.day=summary(matching.filter(s=>Date.parse(s.soldAt)>=now-86400000));}
      const groups=new Map();
      for(const sale of sales){const k=JSON.stringify([sale.modelName,sale.backdropName]);
        if(!groups.has(k))groups.set(k,[]);groups.get(k).push(sale);}
      row.combinations=[...groups].map(([k,items])=>({model:JSON.parse(k)[0],backdrop:JSON.parse(k)[1],
        week:summary(items),day:summary(items.filter(s=>Date.parse(s.soldAt)>=now-86400000))}));
      row.observedSales=sales.length;
      if(!row.complete)row.error='PAGE_LIMIT_REACHED';
    }catch(error){row.complete=false;row.error=/^(READ_HTTP_\d{3}|INVALID_ATTRIBUTES|INVALID_HISTORY|UNSORTED_HISTORY|MISSING_SALE_ID)$/.test(error.message)?error.message:'READ_FAILED';}
    result.collections.push(row);await onCollection(row,result);
  }
  result.complete=result.collections.every(c=>c.complete);
  result.nextOffset=offset+result.collections.length<catalog.length?offset+result.collections.length:null;
  result.catalogComplete=offset===0&&result.nextOffset===null&&result.complete;
  return result;
}
