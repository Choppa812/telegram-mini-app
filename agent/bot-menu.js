const buttons = {
 status:'Статус и баланс',
 start:'Запустить анализ',
 plan:'Посмотреть план',
 confirm:'Подтвердить этот план',
 pause:'Пауза',
 resume:'Продолжить',
};

export function menuKeyboard(token) {
 const keyboard = [[buttons.status,buttons.start],[buttons.plan],[buttons.pause,buttons.resume]];
 if(token) {
  keyboard.splice(2,0,['Основания 1','Основания 2','Основания 3','Основания 4'],
   [`${buttons.confirm} · ${token}`]);
 }
 return {keyboard:keyboard.map(row=>row.map(text=>({text}))),resize_keyboard:true,is_persistent:true};
}

export function menuCommand(text) {
 const commands = {
  [buttons.status]:'/dashboard', [buttons.start]:'/researchall', [buttons.plan]:'/plan',
  [buttons.pause]:'/pause', [buttons.resume]:'/resume',
 };
 if(Object.hasOwn(commands,text)) return commands[text];
 const page = /^Основания ([1-4])$/.exec(text);
 if(page) return `/researchdetails ${Number(page[1])-1}`;
 const confirmation = /^Подтвердить этот план · ([a-f0-9]{16})$/.exec(text);
 return confirmation ? `/confirmplan ${confirmation[1]}` : text;
}
