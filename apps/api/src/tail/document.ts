import type {Event} from '@scum/shared';
import {parseDocument} from '@scum/parser/dist/document';
import {isBuildingContribution} from '@scum/parser/dist/families/base_building_destruction';
// Keep only the current logical record/block. Reuse proven document grammars for kill/fame merging.
export interface BlockState{lines:string[];start:number}
export class IncrementalDocument{
 state:BlockState;
 constructor(readonly file:string,state?:BlockState){this.state=state??{lines:[],start:1};}
 push(raw:string,no:number):Event[]{
 const fame=this.file.startsWith('famepoints_');
 const header=/^\d{4}\.\d{2}\.\d{2}-\d{2}\.\d{2}\.\d{2}(?::\d{3})?\s*:/;
 // Fame blocks begin at a timestamped separator; other timestamped records reset the block.
 const jsonCompanion=/^(?:\d{4}\.\d{2}\.\d{2}-\d{2}\.\d{2}\.\d{2}(?::\d{3})?\s*:\s*)?\{/.test(raw.trim());
 const boundary=fame?header.test(raw):this.file.startsWith('base_building_destruction_')?!isBuildingContribution(raw):!this.file.startsWith('kill_')||!jsonCompanion;
 const abandoned=fame&&boundary&&this.state.lines.length?this.parse().filter(e=>e.event_type==='unknown'):[];
 if(boundary&&this.state.lines.length){this.state={lines:[],start:no};}
 if(!this.state.lines.length)this.state.start=no;
 this.state.lines.push(raw);
 if(this.state.lines.length>2048)throw new Error('multiline_block_limit');
 return [...abandoned,...this.parse().filter(e=>!(fame&&e.event_type==='unknown'&&/^\d{4}.*:\s*-{5,}\s*$/.test(e.raw)))];
 }
 private parse(){const result=parseDocument(Buffer.from(this.state.lines.join('\n'),'utf16le'),this.file).events;
 return result.map(e=>({...e,source_line_no:e.source_line_no+this.state.start-1,metadata:{...e.metadata,...(e.family==='base_building_destruction'&&Array.isArray(e.metadata.contributions)?{contributions:(e.metadata.contributions as {source_line_no:number}[]).map(c=>({...c,source_line_no:c.source_line_no+this.state.start-1}))}:{}),source_line_nos:((e.metadata.source_line_nos as number[]|undefined)??[e.source_line_no]).map(n=>n+this.state.start-1)}}));
 }
 preview(raw:string,no:number){const clone=new IncrementalDocument(this.file,structuredClone(this.state));return clone.push(raw.replace(/\r$/,''),no);}
}
