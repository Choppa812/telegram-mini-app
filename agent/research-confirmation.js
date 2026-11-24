import {createHash} from 'node:crypto';
import {menuKeyboard} from './bot-menu.js';

export function researchToken(run){
 return createHash('sha256').update(JSON.stringify({id:run.id,scope:run.scope,
  caps:run.collectionCaps,selected:run.selected.map(r=>[r.collection,r.model,r.backdrop,r.ceiling])})).digest('hex').slice(0,16);
}
export function confirmationText(run,now=Date.now()){
 if(!run||run.status!=='completed'||run.selected?.length!==28)return 'Подбор ещё не готов: /researchstatus — состояние. Дождитесь завершённого плана из 28 сочетаний.';
 if(!Number.isFinite(run.finishedAt)||now-run.finishedAt>86400000||run.finishedAt>now)return 'Подбор устарел. Дождитесь нового ежедневного анализа. Слоты не менялись.';
 return `Проверить основания: /researchdetails 0–3.\nПодтвердить этот план и выставить автобай:\n/confirmplan ${researchToken(run)}\nПеред применением рынок и баланс проверяются заново. Цены могут быть ниже указанных потолков; слабые сочетания не включаются.`;
}
export function confirmationKeyboard(run){
 return menuKeyboard(researchToken(run));
}
