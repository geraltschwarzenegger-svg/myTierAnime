/* Navigation icons: Tabler Icons 3.35.0
MIT License

Copyright (c) 2020-2025 Paweł Kuna

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.

*/
/* Astral Studio. No network, dependencies, collection writes, eval or HTML from imports. */
(() => {
 'use strict';
 if (window.AstralStudio) return;
 if (!document.querySelector('.site-nav') || typeof applyBg !== 'function' || typeof bg === 'undefined') {
  console.warn('Astral Studio: expected the myTierAnime application.'); return;
 }
 const KEY='anime-tierlist-astral-appearance-v1',FX_KEY='anime-tierlist-fx';
 const WORLDS={
  midnight:['Полночь','Лунный свет · звёздная пыль','#6278be'],ember:['Жар','Угли · медное послесвечение','#d68153'],
  abyss:['Бездна','Глубокий синий · биолюминесценция','#4a81ba'],sakura:['Сакура','Розовый сад · лепестки','#c67f9f'],
  shibuya:['Дождь','Сибуя · световые нити','#5888a8'],midori:['Мидори','Чайный сад · светлячки','#74a97b'],
  hinode:['Хинодэ','Рассвет · золотая пыль','#d9a46b'],storm:['Гроза','Аметист · мягкие зарницы','#8e78bb'],snow:['Снег','Полярная ночь · снежинки','#adcede']
 };
 const SKINS={midnight:['Полночь','#142238'],velvet:['Вельвет','#4b2e47'],jade:['Нефрит','#1c5146'],pearl:['Жемчуг','#eee8dc']};
 const SIGILS={elements:'Новые стихии',crystal:'Гранёный кристалл',halo:'Рунное гало',rune:'Знак ранга',off:'Без сигила'};
 const FRAMES={auto:'Коллекция · разные рамки',palace:'Палатиум · золото и лавр',gem:'Сокровищница · самоцветы',botanic:'Флорес · цветы и лоза',kintsugi:'Кинцуги · золотые швы',foil:'Аврора · голографическая фольга',sumi:'Суми-э · тушь и печать',tech:'Контур · световые схемы',constellation:'Астеризм · созвездия',none:'Без новых рамок'};
 const FRAME_KEYS=['palace','gem','botanic','kintsugi','foil','sumi','tech','constellation'];
 const SCENES={ember:'ember',abyss:'abyss',sakura:'sakura'};
 const FORMS=['sun','tide','eclipse','grove'],NAMES=['Солнечный престол','Кристаллический прилив','Чернильное затмение','Живая крона'];
 const DEFAULT={atm:'midnight',skin:'midnight',sigil:'elements',frame:'auto',layer:'blend',intensity:.72,followTier:false,daylight:false,focus:false,particles:true};
 const plain=x=>x!==null&&typeof x==='object'&&!Array.isArray(x);
 const read=(key)=>{try{const v=JSON.parse(localStorage.getItem(key));return plain(v)?v:null;}catch{return null;}};
 const own=(obj,key)=>Object.prototype.hasOwnProperty.call(obj,key);
 const allowed=(value,values,fallback)=>typeof value==='string'&&own(values,value)?value:fallback;
 function normalize(input) {
  const x=plain(input)?input:{};
  const n={...DEFAULT,atm:allowed(x.atm,WORLDS,DEFAULT.atm),skin:allowed(x.skin,SKINS,DEFAULT.skin),sigil:allowed(x.sigil,SIGILS,DEFAULT.sigil),frame:allowed(x.frame,FRAMES,DEFAULT.frame),layer:['blend','new','original'].includes(x.layer)?x.layer:DEFAULT.layer};
  if(typeof x.intensity==='number'&&Number.isFinite(x.intensity))n.intensity=Math.round(Math.max(0,Math.min(1,x.intensity))*100)/100;
  for(const key of ['followTier','daylight','focus','particles'])if(typeof x[key]==='boolean')n[key]=x[key];
  return n;
 }
 const saved=read(KEY),legacy=read(FX_KEY)||{};
 let cfg=normalize(saved?.settings||{...DEFAULT,atm:legacy.atm||SCENES[bg.scene]||'midnight',particles:typeof legacy['fx-particles']==='boolean'?legacy['fx-particles']:true});
 if(new URL(location.href).searchParams.get('overview')==='1')cfg.focus=false;
 let personal=saved?.personal?normalize(saved.personal):null,storageOK=true,syncingParticles=false,activeTier=0,lastScene=bg.scene,effective='',skin='',captureDepth=0;
 let drawFrame=0,clockTimer=0,scrollFrame=0,lastPaint=0,particles=[],width=1,height=1,phase=0,serial=0;
 const body=document.body,root=document.documentElement,abort=new AbortController(),on=(target,event,fn,options={})=>target.addEventListener(event,fn,{...options,signal:abort.signal});
 const originalApplyBg=applyBg,hasNativeGate=!!document.getElementById('asNativeAmbientGate');
 const nativeCanvas=document.getElementById('fx');
 const el=(tag,cls,text)=>{const n=document.createElement(tag);if(cls)n.className=cls;if(text!==undefined)n.textContent=text;return n;};
 const put=(key,value)=>{try{localStorage.setItem(key,JSON.stringify(value));return true;}catch{return false;}};
 function mirrorLegacy() {
  const fx=read(FX_KEY)||{};fx.atm=cfg.atm;storageOK=put(FX_KEY,fx)&&storageOK;
 }
 function persist() {storageOK=put(KEY,{schema:1,settings:cfg,personal});mirrorLegacy();}
 const overlay=el('div');overlay.id='asAtmosphere';overlay.setAttribute('aria-hidden','true');body.prepend(overlay);
 const canvas=el('canvas');canvas.id='asWeather';canvas.setAttribute('aria-hidden','true');overlay.after(canvas);
 const ctx=canvas.getContext('2d',{alpha:true});
 body.classList.add('as-enabled');
 const heroTitle=document.getElementById('heroTitle');if(heroTitle)heroTitle.innerHTML='Истории,<br><em>достойные вечности.</em>';
 const heroEyebrow=document.querySelector('.masthead .jp');if(heroEyebrow)heroEyebrow.textContent='ЛИЧНЫЙ АРХИВ · ASTRAL STUDIO';
 const edition=document.querySelector('.hero-edition');if(edition)edition.textContent='THE ASTRAL CHAPTER · V5';
 const signature=document.querySelector('.sig');if(signature)signature.textContent='Каждая история — часть твоей вселенной.';
 const logoMark=document.querySelector('.site-logo-mark');
 if(logoMark)logoMark.innerHTML='<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 40" width="30" height="30" aria-hidden="true"><path d="M20 3 36 35l-12-7-4 5-4-5-12 7Z" fill="#213646"/><path d="m20 3 4 25 12 7Z" fill="#f9ead0"/><path d="m20 13 5 9-5 7-5-7Z" fill="#a5e5df"/></svg>';
 const oldWorldGrid=document.querySelector('[data-seg="atm"]');
 if(oldWorldGrid)for(const key of ['midori','hinode','storm','snow'])if(!oldWorldGrid.querySelector(`[data-v="${key}"]`)){const b=el('button','',WORLDS[key][0]);b.type='button';b.dataset.v=key;oldWorldGrid.append(b);}

 /* UI is assembled with textContent. Imported profile values never enter innerHTML. */
 const opener=el('button','','Студия');opener.id='asOpen';opener.type='button';opener.setAttribute('aria-haspopup','dialog');opener.setAttribute('aria-controls','asStudio');
 const icon=el('span');icon.setAttribute('aria-hidden','true');icon.textContent='◇';opener.prepend(icon);document.querySelector('.site-nav').append(opener);
 const dialog=el('dialog');dialog.id='asStudio';dialog.setAttribute('aria-labelledby','asStudioTitle');dialog.setAttribute('data-html2canvas-ignore','true');
 const head=el('header','as-studio-head'),heading=el('div'),kicker=el('span','as-kicker','ASTRAL STUDIO · ОФОРМЛЕНИЕ');
 const title=el('h2','','Собери свою атмосферу');title.id='asStudioTitle';heading.append(kicker,title);
 const close=el('button','as-close','×');close.type='button';close.setAttribute('aria-label','Закрыть студию');head.append(heading,close);
 const content=el('div','as-studio-body'),status=el('p','as-status');status.id='asStatus';status.setAttribute('role','status');status.setAttribute('aria-live','polite');dialog.append(head,content,status);body.append(dialog);
 function section(name,note,wide=false) {const n=el('section','as-section'+(wide?' wide':''));n.append(el('h3','',name));if(note)n.append(el('p','',note));content.append(n);return n;}
 function button(label,fn,cls='as-action') {const b=el('button',cls,label);b.type='button';on(b,'click',fn);return b;}
 function select(parent,label,values,key) {const row=el('label','as-field',label),s=el('select');s.dataset.asKey=key;
  for(const [value,text] of Object.entries(values)){const opt=el('option','',text);opt.value=value;s.append(opt);}row.append(s);parent.append(row);on(s,'change',()=>set({[key]:s.value}));return s;
 }
 function toggle(parent,label,note,key) {const row=el('label','as-toggle'),input=el('input');input.type='checkbox';input.dataset.asKey=key;const text=el('span','',label);text.append(el('small','',note));row.append(input,text);parent.append(row);on(input,'change',()=>set({[key]:input.checked}));}
 const worldSection=section('Атмосфера · девять миров','Фон и погода выбираются независимо. Смена картинки не сбрасывает мир.',true),worldGrid=el('div','as-worlds');worldSection.append(worldGrid);
 for(const [key,[name,note,color]] of Object.entries(WORLDS)){const b=button('',()=>set({atm:key,followTier:false}),'as-world');b.dataset.world=key;b.style.setProperty('--world-swatch',color+'42');b.append(el('b','',name),el('small','',note));worldGrid.append(b);}
 const skinSection=section('Оформление','Четыре палитры интерфейса. Цвета тиров остаются своими.'),skinGrid=el('div','as-skins');skinSection.append(skinGrid);
 for(const [key,[name,color]] of Object.entries(SKINS)){const b=button(name,()=>set({skin:key,daylight:false}),'as-skin');b.dataset.skin=key;b.style.setProperty('--skin-swatch',color);skinGrid.append(b);}
 toggle(skinSection,'Свет по времени суток','С 07:00 до 18:59 — «Жемчуг», вечером — выбранная тёмная тема. Часы твоего устройства.','daylight');
 const sculptureSection=section('Скульптуры тиров · 3D','Четыре отдельных силуэта вместо повторяющихся пластин.');
 select(sculptureSection,'Объект за буквой',SIGILS,'sigil');const demos=el('div','as-preview-row');sculptureSection.append(demos);
 const motion=select(sculptureSection,'Движение',{auto:'Как настроено на устройстве',on:'Анимации',off:'Без движения'},'motion');
 on(motion,'change',()=>document.querySelector(`[data-seg="motion"] [data-v="${motion.value}"]`)?.click());
 const framesSection=section('Новая коллекция рамок','Восемь моделей с цветом своего тира. «Коллекция» распределяет их по постерам.');
 select(framesSection,'Обрамление',FRAMES,'frame');select(framesSection,'Совместимость с прежними 50 рамками',{blend:'Сочетать с прежними',new:'Показывать только новые',original:'Оставить только прежние'},'layer');
 const intensityLabel=el('label','as-field','Сила орнамента '),intensityOut=el('output');intensityOut.id='asIntensityValue';const intensity=el('input');intensity.id='asIntensity';intensity.type='range';intensity.min='0';intensity.max='100';intensity.step='1';intensityLabel.append(intensityOut,intensity);framesSection.append(intensityLabel);
 let intensityOrigin=null;on(intensity,'input',()=>{if(!intensityOrigin)intensityOrigin={...cfg};set({intensity:Number(intensity.value)/100},false);});on(intensity,'change',()=>{if(intensityOrigin&&intensityOrigin.intensity!==cfg.intensity)remember(intensityOrigin);intensityOrigin=null;persist();});
 const autoSection=section('Новые механики','Автоматизация меняет только оформление, а не твои записи.');
 toggle(autoSection,'Световая партитура','Атмосфера следует за тиром в центре экрана: S — рассвет, A — Мидори, B — гроза, C — сакура. Ручной выбор мира выключает этот режим.','followTier');
 toggle(autoSection,'Режим галереи','Скрыть вступление и сводки, оставить коллекцию в центре внимания.','focus');
 toggle(autoSection,'Частицы и погода','До 56 частиц на компьютере и 28 на телефоне. В «Лёгком», без движения, при экспорте и в фоновой вкладке цикл остановлен.','particles');
 const presetSection=section('Сценарии оформления','Готовые сочетания и собственный набор. Можно переносить между браузерами.');
 const presets={garden:{skin:'jade',atm:'midori',sigil:'elements',frame:'botanic',layer:'new'},palace:{skin:'velvet',atm:'hinode',sigil:'crystal',frame:'palace',layer:'new'},rain:{skin:'midnight',atm:'shibuya',sigil:'rune',frame:'sumi',layer:'new'},morning:{skin:'pearl',atm:'sakura',sigil:'elements',frame:'kintsugi',layer:'new'}};
 const presetRow=el('div','as-presets');for(const [key,label] of [['garden','Чайный сад'],['palace','Имперский зал'],['rain','Тихий дождь'],['morning','Утренний архив']])presetRow.append(button(label,()=>set({...presets[key],followTier:false,daylight:false})));
 presetSection.append(presetRow);const actions=el('div','as-actions');
 const fileInput=el('input');fileInput.type='file';fileInput.accept='application/json,.json';fileInput.hidden=true;
 actions.append(button('Сохранить мой набор',()=>{personal={...cfg};persist();announce('Твой набор сохранён в этом браузере.');}),button('Мой набор',()=>personal?set(personal):announce('Сначала сохрани свой набор.')),button('Экспорт оформления',exportProfile),button('Импорт',()=>fileInput.click()));presetSection.append(actions,fileInput);
 on(fileInput,'change',async()=>{const f=fileInput.files?.[0];fileInput.value='';if(!f)return;try{if(f.size>65536)throw Error('Файл слишком большой.');const data=JSON.parse(await f.text());if(!plain(data)||data.application!=='myTierAnime.appearance'||data.schema!==1||!plain(data.settings))throw Error('Нужен экспорт оформления Astral Studio.');set(data.settings);announce('Оформление перенесено. Коллекция не затронута.');}catch(e){announce(e.message==='Файл слишком большой.'?e.message:'Не удалось импортировать. Выбери JSON оформления, а не коллекции.');}});
 const historySection=section('История оформления','Можно отменить последние 12 изменений этой сессии. Коллекция и даты не затрагиваются.',true);
 const undoStack=[],redoStack=[],historyActions=el('div','as-actions');
 const undoButton=button('← Отменить оформление',()=>travel(undoStack,redoStack));undoButton.id='asUndo';
 const redoButton=button('Повторить →',()=>travel(redoStack,undoStack));redoButton.id='asRedo';
 historyActions.append(undoButton,redoButton);historySection.append(historyActions);
 function syncHistory(){undoButton.disabled=!undoStack.length;redoButton.disabled=!redoStack.length;}
 function remember(prior){undoStack.push({...prior});if(undoStack.length>12)undoStack.shift();redoStack.length=0;syncHistory();}
 function travel(from,to){if(!from.length)return;to.push({...cfg});cfg=from.pop();syncNativeParticles();persist();apply(true);syncHistory();}
 function syncNativeParticles(){if(body.classList.contains('fx-particles')===cfg.particles)return;syncingParticles=true;try{document.querySelector('[data-fx="fx-particles"]')?.click();}finally{syncingParticles=false;}}
 const bottom=section('Быстрые действия','',true),quick=el('div','as-quick');quick.append(el('p','as-subnote','Рамки, анимация и погода сохраняются отдельно от аниме.'),button('Вернуть начальное оформление',()=>{set({...DEFAULT});announce('Настройки студии сброшены. Аниме и прежние рамки не изменены.');}));bottom.append(quick);

 /* V5 workspace: persistent navigation, cinematic opening, and a compact overview. */
 const shellIcons={"layout-grid":"<svg\n  xmlns=\"http://www.w3.org/2000/svg\"\n  width=\"24\"\n  height=\"24\"\n  viewBox=\"0 0 24 24\"\n  fill=\"none\"\n  stroke=\"currentColor\"\n  stroke-width=\"2\"\n  stroke-linecap=\"round\"\n  stroke-linejoin=\"round\"\n  class=\"icon icon-tabler icons-tabler-outline icon-tabler-layout-grid\"\n>\n  <path stroke=\"none\" d=\"M0 0h24v24H0z\" fill=\"none\"/>\n  <path d=\"M4 4m0 1a1 1 0 0 1 1 -1h4a1 1 0 0 1 1 1v4a1 1 0 0 1 -1 1h-4a1 1 0 0 1 -1 -1z\" />\n  <path d=\"M14 4m0 1a1 1 0 0 1 1 -1h4a1 1 0 0 1 1 1v4a1 1 0 0 1 -1 1h-4a1 1 0 0 1 -1 -1z\" />\n  <path d=\"M4 14m0 1a1 1 0 0 1 1 -1h4a1 1 0 0 1 1 1v4a1 1 0 0 1 -1 1h-4a1 1 0 0 1 -1 -1z\" />\n  <path d=\"M14 14m0 1a1 1 0 0 1 1 -1h4a1 1 0 0 1 1 1v4a1 1 0 0 1 -1 1h-4a1 1 0 0 1 -1 -1z\" />\n</svg>","calendar-month":"<svg\n  xmlns=\"http://www.w3.org/2000/svg\"\n  width=\"24\"\n  height=\"24\"\n  viewBox=\"0 0 24 24\"\n  fill=\"none\"\n  stroke=\"currentColor\"\n  stroke-width=\"2\"\n  stroke-linecap=\"round\"\n  stroke-linejoin=\"round\"\n  class=\"icon icon-tabler icons-tabler-outline icon-tabler-calendar-month\"\n>\n  <path stroke=\"none\" d=\"M0 0h24v24H0z\" fill=\"none\"/>\n  <path d=\"M4 7a2 2 0 0 1 2 -2h12a2 2 0 0 1 2 2v12a2 2 0 0 1 -2 2h-12a2 2 0 0 1 -2 -2v-12z\" />\n  <path d=\"M16 3v4\" />\n  <path d=\"M8 3v4\" />\n  <path d=\"M4 11h16\" />\n  <path d=\"M8 14v4\" />\n  <path d=\"M12 14v4\" />\n  <path d=\"M16 14v4\" />\n</svg>","photo":"<svg\n  xmlns=\"http://www.w3.org/2000/svg\"\n  width=\"24\"\n  height=\"24\"\n  viewBox=\"0 0 24 24\"\n  fill=\"none\"\n  stroke=\"currentColor\"\n  stroke-width=\"2\"\n  stroke-linecap=\"round\"\n  stroke-linejoin=\"round\"\n  class=\"icon icon-tabler icons-tabler-outline icon-tabler-photo\"\n>\n  <path stroke=\"none\" d=\"M0 0h24v24H0z\" fill=\"none\"/>\n  <path d=\"M15 8h.01\" />\n  <path d=\"M3 6a3 3 0 0 1 3 -3h12a3 3 0 0 1 3 3v12a3 3 0 0 1 -3 3h-12a3 3 0 0 1 -3 -3v-12z\" />\n  <path d=\"M3 16l5 -5c.928 -.893 2.072 -.893 3 0l5 5\" />\n  <path d=\"M14 14l1 -1c.928 -.893 2.072 -.893 3 0l3 3\" />\n</svg>","spiral":"<svg\n  xmlns=\"http://www.w3.org/2000/svg\"\n  width=\"24\"\n  height=\"24\"\n  viewBox=\"0 0 24 24\"\n  fill=\"none\"\n  stroke=\"currentColor\"\n  stroke-width=\"2\"\n  stroke-linecap=\"round\"\n  stroke-linejoin=\"round\"\n  class=\"icon icon-tabler icons-tabler-outline icon-tabler-spiral\"\n>\n  <path stroke=\"none\" d=\"M0 0h24v24H0z\" fill=\"none\"/>\n  <path d=\"M10 12.057a1.9 1.9 0 0 0 .614 .743c1.06 .713 2.472 .112 3.043 -.919c.839 -1.513 -.022 -3.368 -1.525 -4.08c-2 -.95 -4.371 .154 -5.24 2.086c-1.095 2.432 .29 5.248 2.71 6.246c2.931 1.208 6.283 -.418 7.438 -3.255c1.36 -3.343 -.557 -7.134 -3.896 -8.41c-3.855 -1.474 -8.2 .68 -9.636 4.422c-1.63 4.253 .823 9.024 5.082 10.576c4.778 1.74 10.118 -.941 11.833 -5.59a9.354 9.354 0 0 0 .577 -2.813\" />\n</svg>","archive":"<svg\n  xmlns=\"http://www.w3.org/2000/svg\"\n  width=\"24\"\n  height=\"24\"\n  viewBox=\"0 0 24 24\"\n  fill=\"none\"\n  stroke=\"currentColor\"\n  stroke-width=\"2\"\n  stroke-linecap=\"round\"\n  stroke-linejoin=\"round\"\n  class=\"icon icon-tabler icons-tabler-outline icon-tabler-archive\"\n>\n  <path stroke=\"none\" d=\"M0 0h24v24H0z\" fill=\"none\"/>\n  <path d=\"M3 4m0 2a2 2 0 0 1 2 -2h14a2 2 0 0 1 2 2v0a2 2 0 0 1 -2 2h-14a2 2 0 0 1 -2 -2z\" />\n  <path d=\"M5 8v10a2 2 0 0 0 2 2h10a2 2 0 0 0 2 -2v-10\" />\n  <path d=\"M10 12l4 0\" />\n</svg>","adjustments-horizontal":"<svg\n  xmlns=\"http://www.w3.org/2000/svg\"\n  width=\"24\"\n  height=\"24\"\n  viewBox=\"0 0 24 24\"\n  fill=\"none\"\n  stroke=\"currentColor\"\n  stroke-width=\"2\"\n  stroke-linecap=\"round\"\n  stroke-linejoin=\"round\"\n  class=\"icon icon-tabler icons-tabler-outline icon-tabler-adjustments-horizontal\"\n>\n  <path stroke=\"none\" d=\"M0 0h24v24H0z\" fill=\"none\"/>\n  <path d=\"M14 6m-2 0a2 2 0 1 0 4 0a2 2 0 1 0 -4 0\" />\n  <path d=\"M4 6l8 0\" />\n  <path d=\"M16 6l4 0\" />\n  <path d=\"M8 12m-2 0a2 2 0 1 0 4 0a2 2 0 1 0 -4 0\" />\n  <path d=\"M4 12l2 0\" />\n  <path d=\"M10 12l10 0\" />\n  <path d=\"M17 18m-2 0a2 2 0 1 0 4 0a2 2 0 1 0 -4 0\" />\n  <path d=\"M4 18l11 0\" />\n  <path d=\"M19 18l1 0\" />\n</svg>","sparkles":"<svg\n  xmlns=\"http://www.w3.org/2000/svg\"\n  width=\"24\"\n  height=\"24\"\n  viewBox=\"0 0 24 24\"\n  fill=\"none\"\n  stroke=\"currentColor\"\n  stroke-width=\"2\"\n  stroke-linecap=\"round\"\n  stroke-linejoin=\"round\"\n  class=\"icon icon-tabler icons-tabler-outline icon-tabler-sparkles\"\n>\n  <path stroke=\"none\" d=\"M0 0h24v24H0z\" fill=\"none\"/>\n  <path d=\"M16 18a2 2 0 0 1 2 2a2 2 0 0 1 2 -2a2 2 0 0 1 -2 -2a2 2 0 0 1 -2 2zm0 -12a2 2 0 0 1 2 2a2 2 0 0 1 2 -2a2 2 0 0 1 -2 -2a2 2 0 0 1 -2 2zm-7 12a6 6 0 0 1 6 -6a6 6 0 0 1 -6 -6a6 6 0 0 1 -6 6a6 6 0 0 1 6 6z\" />\n</svg>"};
 function iconFor(name){const box=el('span','as-nav-icon');box.setAttribute('aria-hidden','true');box.innerHTML=shellIcons[name];return box;}
 const navigation=document.querySelector('.site-nav'),nav=navigation.querySelector('nav');
 const home=el('a','','Обзор');home.href='#top';home.prepend(iconFor('sparkles'));nav.prepend(home);
 for(const [selector,name] of [['a[href="#collection"]','layout-grid'],['#navHistory','calendar-month'],['a[href="#sAlbumTitle"]','photo']])nav.querySelector(selector)?.prepend(iconFor(name));
 const helixNav=button('Спираль памяти',()=>document.getElementById('memoryHelixOpen')?.click(),'as-rail-button');helixNav.id='asHelixNav';helixNav.prepend(iconFor('spiral'));nav.append(helixNav);
 const markLabel=el('p','as-rail-kicker','ЛИЧНЫЙ АРХИВ АНИМЕ');navigation.querySelector('.site-logo').after(markLabel);
 const railSummary=el('div','as-rail-summary');railSummary.append(el('span','as-kicker','ТВОЯ ВСЕЛЕННАЯ'),el('strong','','Истории остаются.'),el('small','','Сохраняй моменты. Возвращайся к любимым мирам.'));nav.after(railSummary);
 const storage=navigation.querySelector('.nav-storage');storage.prepend(iconFor('archive'));opener.querySelector('span')?.remove();opener.prepend(iconFor('adjustments-horizontal'));
 const page=document.querySelector('main.page'),appbar=el('div','as-appbar'),breadcrumb=el('div','as-breadcrumb');breadcrumb.append(el('span','as-kicker','ASTRAVA / ЛИЧНЫЙ КАНОН'),el('b','','Обзор коллекции'));
 const quickFind=button('Найти историю',()=>{document.getElementById('collection')?.scrollIntoView({block:'start',behavior:typeof reduceMotion!=='undefined'&&reduceMotion?'instant':'smooth'});document.getElementById('searchInput')?.focus({preventScroll:true});},'as-find');quickFind.id='asFind';quickFind.append(el('kbd','','Ctrl K'));appbar.append(breadcrumb,quickFind);page.prepend(appbar);
 const hero=document.querySelector('.masthead'),stats=hero?.querySelector('.stats');if(stats){stats.classList.add('as-overview-stats');hero.after(stats);}
 const dashboard=el('div','as-dashboard');stats?.after(dashboard);for(const selector of ['.watchtime-summary','.recent-section']){const n=document.querySelector(selector);if(n)dashboard.append(n);}
 on(document,'keydown',e=>{if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='k'&&!document.querySelector('dialog[open]')&&!e.target.closest('input,textarea,select,[contenteditable="true"]')){e.preventDefault();quickFind.click();}});
 nav.querySelectorAll('a,button').forEach(n=>on(n,'click',()=>{nav.querySelectorAll('[aria-current]').forEach(x=>x.removeAttribute('aria-current'));n.setAttribute('aria-current','page');}));home.setAttribute('aria-current','page');
 function showOverview(){if(cfg.focus)set({focus:false});nav.querySelectorAll('[aria-current]').forEach(n=>n.removeAttribute('aria-current'));home.setAttribute('aria-current','page');}
 on(home,'click',showOverview);on(navigation.querySelector('.site-logo'),'click',showOverview);

 function announce(text) {status.textContent=text;}
 function exportProfile() {const data={application:'myTierAnime.appearance',schema:1,settings:{...cfg}},url=URL.createObjectURL(new Blob([JSON.stringify(data,null,2)],{type:'application/json'})),a=el('a');a.href=url;a.download='anime-appearance.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);announce('Экспортировано только оформление, без аниме и личных дат.');}
 function set(patch,save=true) {
  if(!plain(patch))return;
  const prior=cfg;cfg=normalize({...cfg,...patch});
  if(patch.daylight===true&&cfg.skin==='pearl')cfg.skin='midnight';
  if(save&&JSON.stringify(prior)!==JSON.stringify(cfg))remember(prior);
  syncNativeParticles();
  if(cfg.followTier&&!prior.followTier)updateActiveTier();
  if(save)persist();apply(cfg.frame!==prior.frame||cfg.sigil!==prior.sigil);
 }
 function syncUI() {
  syncHistory();
  worldGrid.querySelectorAll('button').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.world===effective)));
  skinGrid.querySelectorAll('button').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.skin===skin)));
  dialog.querySelectorAll('[data-as-key]').forEach(n=>{const key=n.dataset.asKey;if(key==='motion'){n.value=typeof motionChoice==='string'?motionChoice:'auto';return;}if(n.type==='checkbox')n.checked=cfg[key];else n.value=cfg[key];});
  intensity.value=String(Math.round(cfg.intensity*100));intensityOut.value=intensity.value+'%';
  document.querySelectorAll('[data-seg="atm"] button').forEach(b=>{const is=b.dataset.v===effective;b.classList.toggle('on',is);b.setAttribute('aria-pressed',String(is));});
  const lite=body.classList.contains('performance-lite'),still=typeof reduceMotion!=='undefined'&&reduceMotion;
  body.classList.toggle('as-still',!!still);body.classList.toggle('as-lite',lite);
  const setting=cfg.followTier?' · партитура тира':'';
  announce(`${WORLDS[effective][0]} · ${SKINS[skin][0]}${setting}. `+(still?'Движение выключено. ':lite?'Лёгкий режим: частицы и сигилы остановлены. ':'')+(storageOK?'Настройки сохранены в браузере.':'Браузер не разрешил сохранение; оформление действует до закрытия страницы.'));
 }
 function apply(rebuild=false) {
  const world=cfg.followTier?['hinode','midori','storm','sakura'][activeTier%4]:cfg.atm;
  const hour=new Date().getHours(),nextSkin=cfg.daylight&&hour>=7&&hour<19?'pearl':cfg.skin;
  const changed=effective!==world;effective=world;skin=nextSkin;
  for(const cls of [...body.classList])if(cls.startsWith('atm-'))body.classList.remove(cls);
  body.classList.add('atm-'+effective);body.dataset.asWorld=effective;body.dataset.asSkin=skin;body.dataset.asSigil=cfg.sigil;body.dataset.asFrame=cfg.frame;body.dataset.asLayer=cfg.layer;body.dataset.asFocus=String(cfg.focus);
  root.style.setProperty('--as-aura',String(cfg.intensity));body.style.setProperty('--as-aura',String(cfg.intensity));
  if(rebuild)decorate();syncUI();if(changed){seedParticles();dispatchEvent(new CustomEvent('astral-atmosphere-change',{detail:{atmosphere:effective}}));}wake();
 }

 /* One canonical selection; old controls are inputs, never a second atmosphere store. */
 applyBg=async function(...args) {
  const scene=bg.scene;
  if(scene!==lastScene){lastScene=scene;if(SCENES[scene]){cfg={...cfg,atm:SCENES[scene],followTier:false};persist();}}
  const pending=originalApplyBg.apply(this,args);apply();await pending;apply();
 };
 on(document,'click',e=>{
  const world=e.target.closest?.('[data-seg="atm"] button');
  if(world&&own(WORLDS,world.dataset.v)){e.preventDefault();e.stopImmediatePropagation();set({atm:world.dataset.v,followTier:false});return;}
  const emblem=e.target.closest?.('[data-seg="emblems"] button');
  if(emblem){const next={elements:'elements',orbits:'halo',classic:'off'}[emblem.dataset.v];if(next){cfg={...cfg,sigil:next};persist();queueMicrotask(()=>apply(true));}}
  if(!syncingParticles&&e.target.closest?.('[data-fx="fx-particles"]')){cfg={...cfg,particles:!body.classList.contains('fx-particles')};persist();}
 },{capture:true});
 on(window,'fx-change',()=>{apply();queueMicrotask(mirrorLegacy);});
 on(window,'quality-change',()=>{resizeCanvas();apply();});on(window,'motion-change',()=>apply());
 on(window,'storage',e=>{if(e.key===KEY){const next=read(KEY);if(next?.settings){cfg=normalize(next.settings);personal=next.personal?normalize(next.personal):null;undoStack.length=0;redoStack.length=0;syncNativeParticles();apply(true);}}});
 on(opener,'click',()=>{if(document.querySelector('dialog[open]'))return;dialog.showModal();stopDrawing();close.focus();});
 on(close,'click',()=>dialog.close());on(dialog,'click',e=>{if(e.target!==dialog)return;const r=dialog.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)dialog.close();});
 on(document,'close',()=>{if(!body.classList.contains('exporting'))captureDepth=0;wake();},{capture:true});on(dialog,'close',()=>{opener.focus();wake();});
 on(window,'capture-start',()=>{captureDepth=1;if(dialog.open)dialog.close();stopDrawing();});
 /* Export ends by removing body.exporting. Observe that one attribute only; never rerender on hover. */
 let wasExporting=body.classList.contains('exporting');
 const lifecycleObserver=new MutationObserver(()=>{const now=body.classList.contains('exporting');if(now!==wasExporting){wasExporting=now;if(!now)captureDepth=0;wake();}});
 lifecycleObserver.observe(body,{attributes:true,attributeFilter:['class']});
 on(document,'visibilitychange',()=>{clearTimeout(clockTimer);if(document.hidden)stopDrawing();else{apply();scheduleClock();}});
 function scheduleClock(){clearTimeout(clockTimer);if(!document.hidden)clockTimer=setTimeout(()=>{if(cfg.daylight)apply();scheduleClock();},60000);}
 function updateActiveTier(){const nodes=[...document.querySelectorAll('.tier')];let best=Infinity,index=activeTier;nodes.forEach((n,i)=>{const r=n.getBoundingClientRect();if(r.bottom<=120||r.top>=innerHeight)return;const d=Math.abs(r.top-160);if(d<best){best=d;index=i;}});const changed=index!==activeTier;activeTier=index;if(changed&&cfg.followTier)apply();}
 on(window,'scroll',()=>{if(!cfg.followTier||document.hidden||scrollFrame)return;scrollFrame=requestAnimationFrame(()=>{scrollFrame=0;updateActiveTier();});},{passive:true});

 /* SVG sculptures use fixed paths and bounded numeric geometry, with no external assets. */
 function svg(content,viewBox='0 0 180 180') {return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${viewBox}" aria-hidden="true" focusable="false">${content}</svg>`;}
 function gem(x,y,size=9){return `<path d="M${x} ${y-size}l${size*.65} ${size}L${x} ${y+size}l${-size*.65} ${-size}Z" fill="currentColor" stroke="#fff1c0" stroke-opacity=".7"/><path d="M${x} ${y-size}v${size*2}l${-size*.65} ${-size}Z" fill="#fff" opacity=".3"/>`;}
 function flower(x,y,r=8,color='currentColor'){let p='';for(let i=0;i<5;i++){const a=i*72;p+=`<ellipse cx="${x}" cy="${y-r*.65}" rx="${r*.47}" ry="${r*.73}" fill="${color}" fill-opacity=".8" stroke="currentColor" stroke-width=".8" transform="rotate(${a} ${x} ${y})"/>`;}return p+`<circle cx="${x}" cy="${y}" r="${r*.25}" fill="#f9dea0"/>`;}
 function sculpture(index,mode){
  if(mode==='rune')return `<span class="as-emblem-rune">${['優','秀','佳','良'][index%4]}</span>`;
  if(mode==='crystal')return svg('<path d="M90 9 146 48v84l-56 39-56-39V48Z" fill="currentColor" fill-opacity=".14" stroke="currentColor"/><path d="m90 9 24 45v72l-24 45-24-45V54Z" fill="currentColor" fill-opacity=".3" stroke="#fff" stroke-opacity=".5"/><path d="m34 48 56 24 56-24M34 132l56-24 56 24M90 72v36" fill="none" stroke="currentColor"/><path d="m90 9 24 45-24 18-24-18Z" fill="#fff" opacity=".25"/>');
  if(mode==='halo')return svg('<g fill="none" stroke="currentColor"><ellipse cx="90" cy="90" rx="76" ry="43" transform="rotate(-32 90 90)"/><ellipse cx="90" cy="90" rx="72" ry="38" transform="rotate(45 90 90)" stroke-dasharray="12 5 2 5"/><path d="m90 14 5 9-5 9-5-9ZM90 148l5 9-5 9-5-9Z"/></g>'+gem(150,59,6));
  if(index%4===0){let rays='';for(let a=0;a<360;a+=30)rays+=`<path d="m90 5 6 33-6 13-6-13Z" transform="rotate(${a} 90 90)" fill="currentColor" fill-opacity=".24" stroke="currentColor" stroke-opacity=".65"/>`;return svg(rays+'<path d="m90 30 43 17 17 43-17 43-43 17-43-17-17-43 17-43Z" fill="none" stroke="currentColor" stroke-width="2"/><path d="m58 40-9-22 28 12 13-24 13 24 28-12-9 22Z" fill="currentColor" fill-opacity=".75" stroke="#fff4d1"/>'+gem(90,42,7)+gem(90,155,10));}
  if(index%4===1)return svg('<path d="M90 6 134 55l-17 84-27 33-27-33-17-84Z" fill="currentColor" fill-opacity=".15" stroke="currentColor"/><path d="m90 6 6 60 38-11-44 117-44-117 38 11Z" fill="currentColor" fill-opacity=".25" stroke="#e4ffff" stroke-opacity=".65"/><path d="M15 115q34-53 68 0t82-12M18 131q35-38 73 0t73-8" fill="none" stroke="currentColor" stroke-width="3"/>'+gem(37,75,10)+gem(143,123,8));
  if(index%4===2)return svg('<path d="M125 13C37-2-13 93 48 147c36 32 80 19 112-8-62 19-108-7-108-50 0-34 29-62 73-76Z" fill="currentColor" fill-opacity=".25" stroke="currentColor"/><path d="M30 156Q-4 59 112 20M148 37q47 58-11 115" fill="none" stroke="currentColor" stroke-width="6" stroke-linecap="round" stroke-dasharray="96 14 6 9"/><path d="m133 10 5 13 13 5-13 5-5 13-5-13-13-5 13-5Z" fill="currentColor"/>');
  let leaves='';for(let i=0;i<7;i++){const a=i*45-140;leaves+=`<path d="M90 90q-27-35 0-72 27 37 0 72Z" transform="rotate(${a} 90 90)" fill="currentColor" fill-opacity=".15" stroke="currentColor" stroke-opacity=".7"/>`;}
  return svg(leaves+'<path d="M43 156q17-64 89-105M31 133q59 39 110-3" fill="none" stroke="currentColor" stroke-width="2"/>'+flower(136,49,12)+flower(42,134,10));
 }
 function buildEmblem(index){const mark=el('div','as-emblem');mark.dataset.form=FORMS[index%4];mark.setAttribute('aria-hidden','true');for(const back of [true,false]){const plane=el('span','as-emblem-plane'+(back?' back':''));plane.innerHTML=sculpture(index,cfg.sigil);mark.append(plane);}return mark;}
 function frameArt(model){
  const edge='<rect x="4" y="4" width="192" height="292" rx="13" fill="none" stroke="currentColor" stroke-width="1.25"/>';
  if(model==='palace'){let leaves='';for(const x of [10,190])for(let y=43;y<116;y+=15)leaves+=`<ellipse cx="${x}" cy="${y}" rx="3.5" ry="9" fill="currentColor" transform="rotate(${x===10?28:-28} ${x} ${y})"/>`;return edge+leaves+'<path d="M13 27Q45 4 88 14M112 14q43-10 75 13M13 280q40 9 66-5M121 275q26 14 66 5" fill="none" stroke="currentColor" stroke-width="2"/>'+gem(100,15,10)+gem(100,288,7);}
  if(model==='gem')return edge+[gem(14,20,12),gem(186,20,12),gem(14,279,10),gem(186,279,10)].join('')+'<path d="M28 12h35M137 12h35M11 42v24M189 42v24" stroke="currentColor" fill="none" stroke-width="2"/>';
  if(model==='botanic')return edge+'<path d="M8 106C36 57-8 27 47 8M192 194c-27 50 11 77-39 99" stroke="currentColor" fill="none" stroke-width="1.8"/>'+flower(18,27,13,'#e6b6c7')+flower(38,13,8,'#efdfbc')+flower(182,274,13,'#d7bef0')+flower(161,290,8,'#e4d5bc')+'<path d="M10 77q24-19 15-30-20 2-15 30M190 226q-24 19-15 30 20-2 15-30Z" fill="#8eae92" fill-opacity=".7"/>';
  if(model==='kintsugi')return edge+'<path d="m13 4 12 22-14 16 15 14-16 32M4 207l18 13-7 18 17 18-4 40M196 42l-17 21 9 12-15 24 17 19M196 248l-17 9 7 19-21 20M25 26l19-8M179 63l-17-4M22 220l18-7" fill="none" stroke="#e8c779" stroke-width="2.5" stroke-linejoin="round"/>';
  if(model==='sumi')return '<path d="M8 44 4 15 23 6 76 9M125 6l56 2 14 17-5 58M195 224l-3 58-15 13-57-5M69 294l-55-6-9-28 4-39" fill="none" stroke="currentColor" stroke-width="5" stroke-linecap="square"/><rect x="168" y="265" width="19" height="23" rx="1" fill="#9d3445"/><path d="m173 270 9 10m-9-4h9m-5-6v13" stroke="#ffe5ca" stroke-width="1.5"/>';
  if(model==='tech')return edge+'<path d="m8 72 6-7V24h27l7-8h29M192 228l-6 7v41h-27l-7 8h-29M8 174v-41m184-7v41" fill="none" stroke="currentColor" stroke-width="2"/><g fill="currentColor"><circle cx="77" cy="16" r="3"/><circle cx="123" cy="284" r="3"/><rect x="5" y="146" width="6" height="15"/><rect x="189" y="139" width="6" height="15"/></g>';
  if(model==='constellation')return edge+'<path d="m15 74 11-33 25-16 31-10m36 270 31-10 25-16 11-33" fill="none" stroke="currentColor" stroke-opacity=".7"/>'+[[15,74],[26,41],[51,25],[82,15],[118,285],[149,275],[174,259],[185,226]].map(([x,y])=>gem(x,y,3)).join('');
  return '';
 }
 function attachFrame(node,uid){let f=node.querySelector(':scope > .as-frame');const key=cfg.frame==='auto'?FRAME_KEYS[Math.abs(Number(uid)||0)%FRAME_KEYS.length]:cfg.frame;if(f&&f.dataset.frame===key)return;if(f)f.remove();f=el('span','as-frame');f.dataset.frame=key;f.setAttribute('aria-hidden','true');if(key!=='foil'&&key!=='none')f.innerHTML=svg(frameArt(key),'0 0 200 300');node.append(f);}
 function decorate(){
  document.querySelectorAll('.tier,.fx-demo-seal').forEach((tier,i)=>{const stage=tier.querySelector('.lstage');if(!stage)return;stage.querySelector('.as-emblem')?.remove();const rank=Number(tier.dataset.rank)||i+1;stage.prepend(buildEmblem(rank-1));const caption=tier.querySelector('.caption-elements');if(caption)caption.textContent=NAMES[(rank-1)%4];});
  document.querySelectorAll('.card').forEach(n=>attachFrame(n,n.dataset.uid));
  demos.replaceChildren();['S','A','B','C'].forEach((name,i)=>{const demo=el('div','as-demo');demo.style.setProperty('--t',['#e9c67d','#75d6d8','#c09bef','#94d8b5'][i]);demo.style.setProperty('--tg',['#e9c67d55','#75d6d855','#c09bef55','#94d8b555'][i]);demo.append(buildEmblem(i),el('span','as-demo-letter',name));demos.append(demo);});
  decoratePreview();
 }
 function decoratePreview(){const n=document.querySelector('#preview .preview-imgwrap');if(!n)return;const selected=document.querySelector('.card[aria-expanded="true"],.chip[aria-expanded="true"]');attachFrame(n,selected?.dataset.uid||0);}
 on(window,'collection-rendered',()=>{decorate();updateActiveTier();apply();});
 const preview=document.getElementById('preview'),previewObserver=new MutationObserver(decoratePreview);
 if(preview)previewObserver.observe(preview,{childList:true,subtree:true,attributes:true,attributeFilter:['class']});
 const effectDemo=document.getElementById('fxDemo'),demoObserver=new MutationObserver(()=>{
  effectDemo.querySelectorAll('.fx-demo-seal').forEach((n,i)=>{const stage=n.querySelector('.lstage');if(stage&&!stage.querySelector('.as-emblem'))stage.prepend(buildEmblem(i));});
 });
 if(effectDemo)demoObserver.observe(effectDemo,{childList:true});

 /* A single bounded particle renderer. The installer pauses the old ambient renderer. */
 function resizeCanvas(){width=Math.max(1,innerWidth);height=Math.max(1,innerHeight);const dpr=Math.min(devicePixelRatio||1,1.25);canvas.width=Math.round(width*dpr);canvas.height=Math.round(height*dpr);ctx?.setTransform(dpr,0,0,dpr,0,0);seedParticles();wake();}
 function seedParticles(){const total=innerWidth<720?28:56;particles=Array.from({length:total},(_,i)=>({x:Math.random()*width,y:Math.random()*height,size:.7+Math.random()*2.6,speed:12+Math.random()*27,phase:i*2.399,turn:Math.random()*6.28}));}
 function canDraw(){return !!ctx&&cfg.particles&&!document.hidden&&!captureDepth&&!body.classList.contains('exporting')&&!body.classList.contains('performance-lite')&&!body.classList.contains('motion-calm')&&!document.querySelector('dialog[open]');}
 function stopDrawing(){cancelAnimationFrame(drawFrame);drawFrame=0;lastPaint=0;ctx?.clearRect(0,0,width,height);}
 function wake(){if(!canDraw()){stopDrawing();return;}if(!drawFrame)drawFrame=requestAnimationFrame(draw);}
 function draw(now){drawFrame=0;if(!canDraw()){stopDrawing();return;}drawFrame=requestAnimationFrame(draw);if(lastPaint&&now-lastPaint<40)return;const dt=lastPaint?Math.min(.08,(now-lastPaint)/1000):.04;lastPaint=now;phase+=dt;ctx.clearRect(0,0,width,height);
  const color=WORLDS[effective][2];ctx.strokeStyle=color;ctx.fillStyle=color;
  for(const p of particles){const rain=effective==='shibuya'||effective==='storm',snow=effective==='snow',petal=effective==='sakura'&&body.classList.contains('fx-petals');p.y+=dt*(rain?p.speed*8:snow?p.speed*.8:petal?p.speed:p.speed*-.35);p.x+=Math.sin(phase*.6+p.phase)*dt*(rain?14:8);if(p.y>height+20)p.y=-20;if(p.y< -20)p.y=height+20;if(p.x< -20)p.x=width+20;if(p.x>width+20)p.x=-20;
   ctx.globalAlpha=rain?.28:.25+(.5+.5*Math.sin(phase+p.phase))*.45;ctx.beginPath();
   if(rain){ctx.lineWidth=effective==='storm'?1:.7;ctx.moveTo(p.x,p.y);ctx.lineTo(p.x-4,p.y-14);ctx.stroke();}
   else if(petal){ctx.save();ctx.translate(p.x,p.y);ctx.rotate(p.turn+phase*.2);ctx.ellipse(0,0,p.size*1.1,p.size*2.1,0,0,Math.PI*2);ctx.fill();ctx.restore();}
   else{ctx.arc(p.x,p.y,snow?p.size:p.size*.7,0,Math.PI*2);ctx.fill();if(effective==='midori'&&p.size>2){ctx.globalAlpha=.08;ctx.beginPath();ctx.arc(p.x,p.y,p.size*3,0,Math.PI*2);ctx.fill();}}
  }
  // Soft, slow illumination; no rapid or full-white flash.
  if(effective==='storm'){const light=Math.max(0,Math.sin(phase*.3))**18*.08;ctx.globalAlpha=light;ctx.fillStyle='#c7b5ee';ctx.fillRect(0,0,width,height);}ctx.globalAlpha=1;
 }
 on(window,'resize',resizeCanvas,{passive:true});
 window.AstralStudio=Object.freeze({ownsAmbient:hasNativeGate,settings:()=>({...cfg}),effective:()=>({atmosphere:effective,skin,particles:particles.length,running:!!drawFrame}),set,reset:()=>set({...DEFAULT}),exportProfile,open:()=>opener.click(),normalize});
 if(hasNativeGate&&nativeCanvas)nativeCanvas.style.display='none';
 else {canvas.hidden=true;cfg.particles=false;console.warn('Astral Studio: use install.py to enable the weather renderer and update CSP safely.');}
 syncNativeParticles();
 persist();resizeCanvas();apply(true);scheduleClock();
 // Appearance remains independent from collection snapshots and watch records.
})();
