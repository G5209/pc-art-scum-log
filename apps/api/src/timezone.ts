const formatters=new Map<string,Intl.DateTimeFormat>();
function formatter(zone:string){let f=formatters.get(zone);if(!f){f=new Intl.DateTimeFormat('en-CA',{timeZone:zone,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'});if(formatters.size>=64)formatters.delete(formatters.keys().next().value!);formatters.set(zone,f);}return f;}
export function timeZone(value:unknown='UTC'):string {
 const zone=String(value??'UTC');try{formatter(zone);return zone;}catch{throw new Error('日期时区无效');}
}
export function parts(ms:number,zone:string){
 const p=Object.fromEntries(formatter(zone).formatToParts(ms).map(p=>[p.type,p.value]));
 return {day:`${p.year}-${p.month}-${p.day}`,hour:Number(p.hour),minute:Number(p.minute),second:Number(p.second),year:Number(p.year),month:Number(p.month),date:Number(p.day)};
}
export function nextDay(day:string){return new Date(Date.parse(day+'T00:00:00Z')+86400000).toISOString().slice(0,10);}
export function dayStart(day:string,zone:string){
 if(!/^\d{4}-\d{2}-\d{2}$/.test(day)||!Number.isFinite(Date.parse(day+'T00:00:00Z'))||new Date(day+'T00:00:00Z').toISOString().slice(0,10)!==day)throw new Error('日期格式无效');
 const target=Date.parse(day+'T00:00:00Z');let result=target;
 for(let i=0;i<6;i++){const p=parts(result,zone),wall=Date.UTC(p.year,p.month-1,p.date,p.hour,p.minute,p.second),difference=target-wall;if(!difference)break;result+=difference;}
 // A midnight skipped by DST uses the earliest valid instant of this civil day.
 if(parts(result,zone).day!==day)throw new Error('日期在所选时区不存在');
 return result;
}
export function hourStart(ms:number,zone:string){const start=dayStart(parts(ms,zone).day,zone);return start+Math.floor((ms-start)/3600000)*3600000;}

/** Reuse civil-day boundaries for ordered events; keep DST and fractional offsets. */
export function orderedBucket(zone:string,bucket:'hour'|'day'){
 let start=NaN,end=NaN,key='';
 return (ms:number)=>{
  if(!(ms>=start&&ms<end)){
   const day=parts(ms,zone).day,dayEnd=dayStart(nextDay(day),zone);
   start=bucket==='hour'?hourStart(ms,zone):dayStart(day,zone);
   end=bucket==='hour'?Math.min(start+3600000,dayEnd):dayEnd;
   key=bucket==='hour'?new Date(start).toISOString():day;
  }
  return {key,start};
 };
}
