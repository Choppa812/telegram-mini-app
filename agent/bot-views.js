import { readSatellite } from './satellite.js';
import { readPositions } from './planning.js';
import { assignResearchSlots } from './research-apply.js';
import { confirmationKeyboard, confirmationText } from './research-confirmation.js';
import { researchText, researchDetails } from './portfolio-research.js';

const money = value => value != null && Number.isFinite(Number(value))
 ? `${Number(value).toFixed(2)} TON` : '—';
const dateText = value => new Intl.DateTimeFormat('ru-RU',{
 dateStyle:'short',timeStyle:'short',timeZone:'Europe/Moscow',
}).format(new Date(value))+' МСК';

export async function dashboard({store,key}) {
 const [positions,paused,report,lastSuccess,run,plan] = await Promise.all([
  readPositions(key),store.isPaused(),store.getReport(),store.getLastSuccessfulReport(),
  store.getResearchRun(),store.getActiveResearchPlan(),
 ]);
 const successful = report?.status==='completed' ? report : lastSuccess;
 const research = run?.finishedAt ? `Завершён ${dateText(run.finishedAt)}, подобрано ${run.selected.length}/28.`
  : run ? `В работе, проверено ${run.index}/${run.candidates.length} сочетаний.` : 'Данных о запуске нет.';
 return [
  paused ? 'Автонастройка на паузе.' : 'Автонастройка разрешена.',
  positions.ok ? `Баланс ${money(positions.balance)}. Ставки включены в ${positions.rows.filter(row=>row.active).length} из ${positions.rows.length} слотов.` : 'Баланс и слоты сейчас недоступны.',
  positions.ok ? `Глобальная автопокупка Gift Satellite ${positions.autobuyEnabled===true?'включена':positions.autobuyEnabled===false?'выключена':'не определена'}.` : null,
  successful?.date ? `Последний успешный пересчёт: ${dateText(successful.date)}.` : 'Данных о последнем успешном пересчёте нет.',
  report?.status==='error' ? `Последний сбой пересчёта: ${report.reason||'причина неизвестна'}.` : null,
  plan?.status==='blocked' ? `Применение остановлено на слоте №${plan.failedSlot??'?'}. Проверьте новый план.` : null,
  `Анализ Black. ${research}`,
 ].filter(Boolean).join('\n');
}

export async function planView({store,key,page,reader=readSatellite,now=Date.now()}) {
 const run = await store.getResearchRun();
 const canConfirm = run?.scope==='Black' && run.status==='completed' && run.selected?.length===28 &&
  Number.isFinite(run.finishedAt) && run.finishedAt<=now && now-run.finishedAt<=86400000;
 const options = canConfirm ? {reply_markup:confirmationKeyboard(run)} : {};
 if(page!==undefined) return {text:researchDetails(run,page),options};
 if(!canConfirm) return {text:researchText(run),options};
 const current = await reader('/user/subscriptions',{},key,'token');
 if(!current.ok||!Array.isArray(current.data)||current.data.length!==28) {
  return {text:'Не удалось сверить текущие слоты. Попробуйте открыть план ещё раз.',options:{}};
 }
 const rows = assignResearchSlots(run.selected,current.data);
 const lines = rows.map(row=>{
  const slot = current.data[row.slot-1];
  const before = `${slot.collectionName} / ${slot.modelNames?.join(', ')||'любая модель'} / ${slot.backdropNames?.join(', ')||'любой фон'}`;
  const after = `${row.collection} / ${row.model} / ${row.backdrop}`;
  const previous = slot.portalsAutobuy ? money(slot.portalsAutobuyMaxPrice) : 'выкл.';
  return `${row.slot}. ${before===after?after:`${before} → ${after}`}. ${previous} → потолок ${money(row.ceiling)}.`;
 });
 const date = dateText(run.finishedAt);
 return {text:[`План Black на 28 слотов. Анализ завершён ${date}.`,...lines,confirmationText(run,now)].join('\n'),options};
}
