export interface DecoderState{carry:string;text:string;lineNo:number}
export class Utf16Lines{
 state:DecoderState;
 constructor(state?:DecoderState){this.state=state??{carry:'',text:'',lineNo:0};}
 push(chunk:Buffer){let bytes=Buffer.concat([Buffer.from(this.state.carry,'base64'),chunk]);let end=bytes.length-bytes.length%2;
 // Retain a trailing high surrogate as well as an odd byte, so astral names survive splits.
 if(end>=2){const c=bytes.readUInt16LE(end-2);if(c>=0xD800&&c<=0xDBFF)end-=2;}
 this.state.carry=bytes.subarray(end).toString('base64');this.state.text+=bytes.subarray(0,end).toString('utf16le');
 if(!this.state.lineNo)this.state.text=this.state.text.replace(/^\uFEFF/,'');
 const lines:{raw:string;no:number}[]=[];let n:number;while((n=this.state.text.indexOf('\n'))>=0){const raw=this.state.text.slice(0,n).replace(/\r$/,'');this.state.text=this.state.text.slice(n+1);lines.push({raw,no:++this.state.lineNo});}return lines;
 }
}
