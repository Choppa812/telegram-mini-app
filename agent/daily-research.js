import { researchText, startResearch } from './portfolio-research.js';

const moscowDay = date => new Intl.DateTimeFormat('en-CA',{
 timeZone:'Europe/Moscow',year:'numeric',month:'2-digit',day:'2-digit',
}).format(date);

export async function dailyResearchStatus(store, now = new Date()) {
 const day = moscowDay(now);
 const [run, paused, daily, active] = await Promise.all([
  store.getResearchRun(), store.isPaused(), store.getDayReport(day), store.getActiveResearchPlan(),
 ]);
 const lines = [researchText(run)];
 if(paused) lines.push('Автонастройка на паузе. Плановый поиск приостановлен.');
 else if(active?.status === 'blocked') lines.push('Применение плана остановлено. /applystatus — состояние, /positions — фактические слоты.');
 else if(active?.status === 'applying') lines.push('Идёт применение подтверждённого плана. /applystatus — состояние.');
 else if(run?.scheduledDay !== day && daily?.status !== 'completed') {
  lines.push('Сегодняшний поиск ждёт успешной штатной проверки Vercel.');
 }
 if(run?.progressAt && ['running','discovering'].includes(run.status)) {
  lines.push(`Последний сохранённый шаг: ${new Date(run.progressAt).toISOString()}.`);
 }
 return lines.join('\n');
}

// Discovery proposes a new composition; it never publishes or applies orders.
export async function dailyResearch({store,key,send,enqueue,now=new Date(),start=startResearch}){
 if(await store.isPaused())return {status:'paused'};
 if(!key)throw Error('SATELLITE_CONFIGURATION_MISSING');
 const day=moscowDay(now);
 const daily=await store.getDayReport(day);
 if(daily?.status!=='completed')return {status:'waiting_for_daily_check'};
 const result=await start({store,key,send,enqueue,all:true,scheduledDay:day});
 return typeof result==='string'?{status:'running'}:result;
}
