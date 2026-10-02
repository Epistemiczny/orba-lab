import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import assert from 'node:assert/strict';

const protocolSource=await readFile(new URL('./protocol.js',import.meta.url),'utf8');
const protocol=await import('data:text/javascript;base64,'+Buffer.from(protocolSource).toString('base64'));
const source=(await readFile(new URL('./app.js',import.meta.url),'utf8')).replace(/^import[\s\S]*?from '\.\/protocol.js\?v=1.3';/,'').replace(/\ninit\(\);\s*$/,'');
const node={textContent:'',classList:{toggle(){},add(){},remove(){}},style:{setProperty(){}},dataset:{},closest(){return null;}};
const context=vm.createContext({...protocol,console,setTimeout,clearTimeout,Uint8Array,TextEncoder,TextDecoder,Date,localStorage:{getItem(){return null},setItem(){}},document:{querySelector(){return node},querySelectorAll(){return []},body:node},location:{protocol:'https:',hostname:'test'},navigator:{},confirm(){return true}});
vm.runInContext(source,context);
const run=code=>vm.runInContext(code,context);
run('updateAllUi=()=>{};');

// Invalid/missing battery data cannot manufacture a reading.
run('handleReply([2,3,0,15]);');assert.equal(run('state.battery'),null);
run('handleReply([2,3,0,15,255]);');assert.equal(run('state.battery'),null);
run('handleReply([2,3,0,15,80]);');assert.equal(run('state.battery'),80);
const corrupt=protocol.buildSysex([2,3,0,15,100]);corrupt[5]^=1;
context.corrupt=corrupt;run('onMidiBytes(corrupt);');assert.equal(run('state.battery'),80);
run('resetDeviceReadings();');assert.equal(run('state.battery'),null);assert.equal(run('state.baseline'),null);

// A passive USB connection must transmit no commands.
context.port={name:'Orba 2',state:'connected',send(){throw Error('Unexpected TX during connect')},async close(){}};
run('navigator.requestMIDIAccess=async()=>({sysexEnabled:true,inputs:new Map([[1,port]]),outputs:new Map([[1,port]])});');
await run('connectUsb();');assert.equal(run('state.connected'),true);
assert.equal(run('state.log.some(l=>l.includes("TX"))'),true); // status message explicitly says no TX
assert.equal(run('state.log.some(l=>/TX f0/.test(l))'),false);

// BLE chunks of simultaneous messages must never interleave.
const chunks=[];context.capture=bytes=>chunks.push(Array.from(bytes));
run("state.transport='BLE';state.bleChar={writeValueWithoutResponse:async bytes=>capture(bytes)};");
const one=[2,3,0,15],two=[2,3,0,12];
await run('Promise.all([sendPayload([2,3,0,15]),sendPayload([2,3,0,12])]);');
const decoded=[];const parser=new protocol.BleMidiSysexParser(bytes=>decoded.push(protocol.parseSysex(bytes)));
chunks.forEach(p=>parser.feed(new Uint8Array(p)));
assert.equal(decoded.length,2);assert.ok(decoded.every(p=>p.crcOk));assert.deepEqual(decoded.map(p=>p.payload),[one,two]);
console.log('PASS: battery validation, CRC rejection, session reset, passive USB connection, serialized BLE');
