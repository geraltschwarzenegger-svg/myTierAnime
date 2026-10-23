/* MEMORY HELIX MODEL BEGIN */
function helixEntries(st) {
  const seen=new Set(),entries=[];
  for(const tier of st?.tiers||[])for(const item of tier.items||[]){
    if(!Number.isSafeInteger(item.uid)||item.uid<1||seen.has(item.uid))continue;
    seen.add(item.uid);entries.push({uid:item.uid,item,tier});
  }
  return entries;
}
function helixWindow(length,position,lite=false) {
  const center=Math.max(0,Math.min(Math.max(0,length-1),Math.round(Number.isFinite(position)?position:0)));
  const reach=lite?4:8;
  return {start:Math.max(0,center-reach),end:Math.min(length,center+reach+1),center};
}
function helixPose(index,position,width,lite=false) {
  const relative=index-position,angle=relative*.57;
  const radius=Math.max(96,Math.min(340,width*.29));
  return {x:Math.sin(angle)*radius,y:relative*(width<560?29:36),z:Math.cos(angle)*radius-radius*.65,
    yaw:-Math.sin(angle)*32,opacity:Math.max(.22,1-Math.abs(relative)*(lite?.13:.085))};
}
/* MEMORY HELIX MODEL END */
export {helixEntries,helixWindow,helixPose};
