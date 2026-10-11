import { dailyReport } from '../control.js';
import { runtime, sameSecret } from '../runtime.js';
import { applyBlackPlan } from '../trading.js';

export default async function handler(req,res) {
  if(req.method!=='POST')return res.status(405).end();
  if(!process.env.VPS_SIGNAL_SECRET||!sameSecret(req.headers.authorization,`Bearer ${process.env.VPS_SIGNAL_SECRET}`))return res.status(401).end();
  const body=req.body;
  const timestamp=Date.parse(body?.snapshotAt||'');
  if(body?.source!=='vps'||!Number.isFinite(timestamp)||Math.abs(Date.now()-timestamp)>15*60*1000||!/^[a-f0-9]{64}$/i.test(body?.sha256||''))return res.status(400).json({ok:false,reason:'invalid_snapshot'});
  try {
    const result=await dailyReport({ ...runtime(), run:process.env.GIFT_SATELLITE_API_KEY ? async({beforeWrite})=>({status:'completed',...await applyBlackPlan(process.env.GIFT_SATELLITE_API_KEY,{beforeWrite})}) : undefined });
    return res.status(200).json({ok:true,status:result.status,duplicate:Boolean(result.duplicate)});
  } catch {return res.status(503).json({ok:false});}
}
