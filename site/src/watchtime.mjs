/* WATCHTIME HELPERS BEGIN */
const MAX_WATCH_MINUTES = 600000;
function watchDurationIssue(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return 'Неправильное время просмотра';
  if (value.mode !== 'episodes' && value.mode !== 'total') return 'Выбери способ расчёта времени';
  if (value.basis !== 'catalog' && value.basis !== 'manual') return 'Неправильный источник времени';
  if (value.mode === 'episodes') {
    if (!Number.isSafeInteger(value.episodes) || value.episodes < 1 || value.episodes > 10000) return 'Укажи от 1 до 10000 серий';
    if (!Number.isSafeInteger(value.episodeMinutes) || value.episodeMinutes < 1 || value.episodeMinutes > 1440) return 'Укажи от 1 до 1440 минут на серию';
    if (value.episodes * value.episodeMinutes > MAX_WATCH_MINUTES) return 'Слишком большое время просмотра';
  } else if (!Number.isSafeInteger(value.minutes) || value.minutes < 0 || value.minutes > MAX_WATCH_MINUTES) return 'Укажи время от 0 до 10000 часов';
  for (const [key, limit] of [['sourceTitle',240],['scopeLabel',160],['note',400]]) {
    if (value[key] !== undefined && (typeof value[key] !== 'string' || value[key].length > limit)) return 'Неправильное описание времени';
  }
  if (value.sourceUrl !== undefined) {
    if (typeof value.sourceUrl !== 'string' || value.sourceUrl.length > 600) return 'Неправильная ссылка на источник';
    try { const url = new URL(value.sourceUrl); if (url.protocol !== 'https:' || url.username || url.password) return 'Источнику нужна HTTPS-ссылка'; }
    catch { return 'Неправильная ссылка на источник'; }
  }
  if (value.basis === 'catalog' && !value.sourceUrl) return 'Для каталожного времени нужен источник';
  return null;
}
function normalizeWatchDuration(value) {
  if (watchDurationIssue(value)) return null;
  const result = {mode:value.mode,basis:value.basis};
  if (value.mode === 'episodes') { result.episodes=value.episodes; result.episodeMinutes=value.episodeMinutes; }
  else result.minutes=value.minutes;
  for (const key of ['sourceUrl','sourceTitle','scopeLabel','note']) if (typeof value[key] === 'string' && value[key]) result[key]=value[key];
  return result;
}
function watchMinutes(record) {
  const d=normalizeWatchDuration(record?.duration);
  return d ? (d.mode==='episodes' ? d.episodes*d.episodeMinutes : d.minutes) : null;
}
function watchPlural(n,forms) {
  return forms[n%100>=11&&n%100<=14?2:n%10===1?0:n%10>=2&&n%10<=4?1:2];
}
function formatWatchTime(minutes,short=false) {
  if (!Number.isSafeInteger(minutes) || minutes<0) return 'Время не указано';
  const h=Math.floor(minutes/60),m=minutes%60;
  if (short) return h ? `${h} ч${m?' '+m+' мин':''}` : `${m} мин`;
  return [h?`${h} ${watchPlural(h,['час','часа','часов'])}`:'',m||!h?`${m} ${watchPlural(m,['минута','минуты','минут'])}`:''].filter(Boolean).join(' ');
}
function sumWatchTime(records) {
  const result={minutes:0,known:0,unknown:0,catalog:0,manual:0,estimated:0,total:records.length};
  for (const record of records) {
    const minutes=watchMinutes(record);
    if (minutes===null) { result.unknown++; continue; }
    result.minutes+=minutes; result.known++;
    result[record.duration.basis==='catalog'?'catalog':'manual']++;
    if(record.duration.basis==='catalog'||record.duration.mode==='episodes')result.estimated++;
  }
  return result;
}
function collectionWatchTime(st) {
  const items=(st?.tiers||[]).flatMap(t=>t.items||[]), result={...sumWatchTime([]),completeItems:0,partialItems:0,unknownItems:0,items:items.length};
  for (const item of items) {
    const time=itemWatchTime(item);
    for (const key of ['minutes','known','unknown','catalog','manual','estimated','total']) result[key]+=time[key];
    if (time.total && !time.unknown) result.completeItems++;
    else if (time.known) result.partialItems++;
    else result.unknownItems++;
  }
  return result;
}
function itemWatchTime(item) {
  if (normalizeWatchDuration(item?.watchTotal)) return {...sumWatchTime([{duration:item.watchTotal}]),override:true};
  const records=typeof item?.watched==='string' ? (item.watched.trim()?[{date:item.watched}]:[]) :
    Array.isArray(item?.watched)?item.watched.filter(w=>w&&typeof w.date==='string'&&w.date.trim()):[];
  return {...sumWatchTime(records),override:false};
}
/* WATCHTIME HELPERS END */
export { MAX_WATCH_MINUTES, watchDurationIssue, normalizeWatchDuration, watchMinutes, formatWatchTime, sumWatchTime, itemWatchTime, collectionWatchTime };
