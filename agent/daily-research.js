import { startResearch } from './portfolio-research.js';

// Discovery proposes a new composition; it never publishes or applies orders.
export async function dailyResearch({store,key,send,enqueue,now=new Date(),start=startResearch}){
 if(await store.isPaused())return {status:'paused'};
 if(!key)throw Error('SATELLITE_CONFIGURATION_MISSING');
 const day=new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Moscow',year:'numeric',month:'2-digit',day:'2-digit'}).format(now);
 const daily=await store.getDayReport(day);
 if(daily?.status!=='completed')return {status:'waiting_for_daily_check'};
 const result=await start({store,key,send,enqueue,all:true,scheduledDay:day});
 return typeof result==='string'?{status:'running'}:result;
}
