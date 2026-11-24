import { send as enqueue } from '@vercel/queue';
import { dailyResearch } from '../daily-research.js';
import { runtime, sameSecret } from '../runtime.js';

export default async function handler(req,res){
 if(req.method!=='GET')return res.status(405).end();
 if(!process.env.CRON_SECRET||!sameSecret(req.headers.authorization,`Bearer ${process.env.CRON_SECRET}`))return res.status(401).end();
 try{
  const result=await dailyResearch({...runtime(),key:process.env.GIFT_SATELLITE_API_KEY,enqueue});
  console.info('catalog research schedule', result.status);
  return res.status(200).json({ok:true,...result});
 }catch(error){
  const code = typeof error?.message === 'string' && /^[A-Z_]{3,60}$/.test(error.message)
   ? error.message : 'UNEXPECTED_ERROR';
  console.error('catalog research start failed', code);
  return res.status(503).json({ok:false,status:'research_start_failed'});
 }
}
