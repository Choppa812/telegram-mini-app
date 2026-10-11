import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';

const { MARKET_DATA_FILE, VPS_SIGNAL_URL, VPS_SIGNAL_SECRET } = process.env;
if (!MARKET_DATA_FILE || !VPS_SIGNAL_URL || !VPS_SIGNAL_SECRET) throw new Error('SIGNAL_CONFIGURATION_MISSING');
const url = new URL(VPS_SIGNAL_URL);
if(url.protocol!=='https:'||url.hostname!=='gift-price-controller.vercel.app'||url.pathname!=='/api/signal')throw new Error('INVALID_SIGNAL_URL');
const raw=await readFile(MARKET_DATA_FILE);
if(raw.length>2_000_000)throw new Error('SNAPSHOT_TOO_LARGE');
const snapshot=JSON.parse(raw.toString('utf8'));
const snapshotAt=snapshot.generatedAt||snapshot.timestamp||snapshot.asOf;
const time=Date.parse(snapshotAt||'');
if(!Number.isFinite(time)||Math.abs(Date.now()-time)>15*60*1000)throw new Error('SNAPSHOT_STALE');
const sha256=createHash('sha256').update(raw).digest('hex');
const response=await fetch(url,{method:'POST',headers:{Authorization:`Bearer ${VPS_SIGNAL_SECRET}`,'Content-Type':'application/json'},body:JSON.stringify({source:'vps',snapshotAt:new Date(time).toISOString(),sha256}),signal:AbortSignal.timeout(20000)});
if(!response.ok)throw new Error(`SIGNAL_HTTP_${response.status}`);
const result=await response.json();
if(!result.ok)throw new Error('SIGNAL_REJECTED');
console.log(JSON.stringify({status:result.status,duplicate:result.duplicate,sha256}));
