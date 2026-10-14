import type express from 'express';
import {isIP} from 'node:net';
export function access(req:express.Request){const p=req.auth?.permissions??[];return {steam:p.includes('field.steam.view'),ip:p.includes('field.ip.view'),geo:p.includes('field.geography.view'),region:p.includes('field.region.view'),coordinates:p.includes('field.coordinates.view'),raw:p.includes('log.raw.view'),export:p.includes('log.export')};}
export function serialize(value:any,req:express.Request):any {
 const a=access(req);
 const visit=(v:any,key=''):any=>{
  if(Array.isArray(v))return v.map(x=>visit(x));
  if(v&&typeof v==='object')return Object.fromEntries(Object.entries(v).filter(([k])=>{
   if(!a.ip&&/^(ip|ip_address|ipaddress|remote_ip)$/i.test(k))return false;
   if(!a.geo&&/^(ip_location|ip_geography|geography)$/i.test(k))return false;
   if(!a.region&&/^(?:region|area|\w+_(?:region|area))$/i.test(k))return false;
   if(!a.coordinates&&!/^(ip_location|ip_geography|geography)$/i.test(k)&&/^(?:x|y|z|location|serverlocation|clientlocation|coordinates|position|\w+_(?:location|coordinates|position))$/i.test(k))return false;
   if(k==='raw'&&(!a.raw||!a.ip||!a.geo||!a.region||!a.coordinates||!a.steam))return false;
   // Raw derivatives/JSON companion can contain unlabeled coordinates and identities.
   if(['details','json_companion','owner_token'].includes(k)&&(!a.raw||!a.ip||!a.geo||!a.region||!a.coordinates||!a.steam))return false;
   return true;
  }).map(([k,x])=>[k,visit(x,k)]));
  if(typeof v==='string'){
   if(key==='message'&&(!a.ip||!a.geo||!a.region||!a.coordinates))return null;
   let s=v;if(!a.ip){s=s.replace(/(?<![\d.])(?:\d{1,3}\.){3}\d{1,3}(?![\d.])/g,x=>isIP(x)?'[地址已隐藏]':x).replace(/(?:[\da-f]{0,4}:){2,}[\da-f]{0,4}/gi,x=>isIP(x)?'[地址已隐藏]':x);}
   if(!a.steam)s=s.replace(/\b\d{16,17}\b/g,x=>x.slice(0,6)+'***');
   return s;
  }if(typeof v==='number'&&!a.steam&&/^\d{16,17}$/.test(String(v)))return String(v).slice(0,6)+'***';return v;
 };
 const result=visit(value);if(value&&Object.hasOwn(value,'raw')&&!Object.hasOwn(result,'raw'))result.raw=null;return result;
}
