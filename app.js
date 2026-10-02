import {
  PARTS, PART_BY_WIRE, buildSysex, parseSysex, getReg, setReg,
  setActivePart, setTempo, setFx, getFx, selectPreset, commitPreset,
  looper, setKey, setScale, setQuantize, setHaptics, setSpeaker,
  setMetronome, setMidiMode, setPitchBend, GETS, getPresetName,
  getQuantize, bleWrapMidiPackets, BleMidiSysexParser, decodeAscii
} from './protocol.js?v=1.3';

const $ = (s, root=document) => root.querySelector(s);
const $$ = (s, root=document) => [...root.querySelectorAll(s)];
const sleep = ms => new Promise(r => setTimeout(r, ms));

const SCALE_NAMES = ['Major','Natural Minor','Harmonic Minor','Melodic Minor','Major Pentatonic','Minor Pentatonic','Dorian','Phrygian','Lydian','Mixolydian','Locrian'];
const KEY_NAMES = ['C','C♯/D♭','D','D♯/E♭','E','F','F♯/G♭','G','G♯/A♭','A','A♯/B♭','B'];
const PART_ORDER = ['drum','bass','chord','lead'];

const state = {
  connected: false,
  transport: null,
  midiAccess: null,
  midiIn: null,
  midiOut: null,
  bleDevice: null,
  bleChar: null,
  mode: localStorage.getItem('orbaLabMode') || 'simple',
  view: localStorage.getItem('orbaLabView') || 'performance',
  activePart: 'drum',
  battery: null,
  batteryAt: null,
  received: new Set(),
  speaker: null,
  haptics: null,
  midiMode: 0,
  pitchBend: 0,
  tempo: 120,
  key: 0,
  scale: 0,
  metronome: false,
  hasLoop: null,
  transportState: null,
  presets: {drum:'',bass:'',chord:'',lead:''},
  selectedPresetFiles: {drum:'',bass:'',chord:'',lead:''},
  fx: Object.fromEntries(PART_ORDER.map(p => [p,{volume:null,pan:null,reverb:null,delay:null,quantize:null}])),
  presetLibrary: {drum:[],bass:[],chord:[],lead:[]},
  tapTimes: [],
  log: [],
  baseline: null,
  baselineCapturedAt: null,
  baselineRestoreBusy: false,
};

function log(...args) {
  const line = `[${new Date().toLocaleTimeString()}] ${args.map(a => typeof a === 'string' ? a : JSON.stringify(a)).join(' ')}`;
  state.log.push(line);
  if (state.log.length > 250) state.log.splice(0, state.log.length - 250);
  $('#logBox').textContent = state.log.join('\n');
  $('#logBox').scrollTop = $('#logBox').scrollHeight;
}

let toastTimer;
function toast(text) {
  const el = $('#toast');
  el.textContent = text;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 2300);
}

function hex(bytes) {
  return Array.from(bytes).map(b => b.toString(16).padStart(2,'0')).join(' ');
}

function setMode(mode) {
  state.mode = mode;
  localStorage.setItem('orbaLabMode', mode);
  document.body.classList.toggle('simple', mode === 'simple');
  $$('.mode-btn').forEach(b => b.classList.toggle('active', b.dataset.mode === mode));
}

function setView(view) {
  state.view = view;document.body.dataset.view=view;document.getElementById('sampleStudio')?.contentWindow.postMessage({type:'studio-visibility',visible:view==='sample'},location.origin);
  localStorage.setItem('orbaLabView', view);
  $$('.view-tab').forEach(b => b.classList.toggle('active', b.dataset.viewTarget === view));
  $$('.view-pane').forEach(p => p.classList.toggle('active', p.dataset.view === view));
}

function webMidiContextOk(){
  const proto = location.protocol;
  return proto === 'https:' || location.hostname === 'localhost' || location.hostname === '127.0.0.1';
}

let lastLogoConnection=false,connectionNoticeTimer;
function updateConnectionUi() {
 const online=state.connected;$('#connectionLogo').classList.toggle('connected',online);
 if(online!==lastLogoConnection){lastLogoConnection=online;const notice=$('#connectionNotice');notice.textContent=online?'Połączono':'Rozłączono';notice.classList.add('show');clearTimeout(connectionNoticeTimer);connectionNoticeTimer=setTimeout(()=>notice.classList.remove('show'),2200);}
  $('#statusDot').classList.toggle('online', state.connected);
  $('#connectionStatus').textContent = state.connected ? `Połączono · ${state.transport}` : 'Niepołączono';
  $('#connectionDetail').textContent = state.connected
    ? (state.transport === 'USB' ? (state.midiOut?.name || 'Web MIDI') : (state.bleDevice?.name || 'Web Bluetooth'))
    : (webMidiContextOk() ? 'Podłącz Orba 2 przez USB lub Bluetooth' : 'Lokalny plik: USB MIDI może być blokowane');
  $('#refreshState').disabled = !state.connected;
  $('#restoreBaselineBtn').disabled = !state.connected || !state.baseline || state.baselineRestoreBusy;
  $('#batteryBadge').textContent = state.battery == null ? 'Bateria: —' : 'Bateria: '+state.battery+'%';
  $('#batteryBadge').title=state.batteryAt ? 'Odczyt: '+new Date(state.batteryAt).toLocaleTimeString() : 'Brak poprawnego odczytu';
  $('#disconnectBtn').disabled=!state.connected;
  $('#enableSpeakerBtn').disabled=!state.connected;
  $('#speakerStatus').textContent='Stan głośnika: '+(state.speaker==null?'nieodczytany':state.speaker?'włączony':'wyłączony');
  $('#secureBadge').textContent=webMidiContextOk()?'HTTPS':'Plik lokalny';
  const bs = $('#baselineStatus');
  if (bs) bs.textContent = state.baseline ? `Punkt startowy: ${new Date(state.baselineCapturedAt).toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'})}` : 'Punkt startowy: brak';
}


function partLabel(p){ return p.toUpperCase(); }

function updatePartsUi() {
  $$('.part-card').forEach(card => card.classList.toggle('active', card.dataset.part === state.activePart));
  for (const p of PART_ORDER) {
    $(`[data-preset-current="${p}"]`).textContent = state.presets[p] || '—';
    const fx = state.fx[p];
    $(`[data-part-vol="${p}"]`).textContent = `Vol ${fx.volume == null ? '--' : Math.round(fx.volume)}%`;
    $(`[data-part-rev="${p}"]`).textContent = `Rev ${fx.reverb == null ? '--' : Math.round(fx.reverb)}%`;
    $(`[data-part-del="${p}"]`).textContent = `Del ${fx.delay == null ? '--' : Math.round(fx.delay)}%`;
  }
  $('#mixerTitle').textContent = partLabel(state.activePart);
  const a = state.fx[state.activePart];
  syncSlider('#volSlider','#volOut',a.volume ?? 70);
  syncSlider('#panSlider','#panOut',a.pan ?? 50);
  syncSlider('#revSlider','#revOut',a.reverb ?? 0);
  syncSlider('#delSlider','#delOut',a.delay ?? 0);
  $('#quantSelect').value = String(a.quantize ?? 0);
}

function syncSlider(sel,outSel,val){
  if($(sel).dataset.dragging==='true')return;
  $(sel).value = Math.round(val);
  $(outSel).textContent = `${Math.round(val)}%`; paintKnob($(sel));
}

function updateDeviceUi(){
  
  $('#hapticsToggle').checked = !!state.haptics;
  if ($('#speakerToggle')) $('#speakerToggle').checked = !!state.speaker;
  $('#midiModeSelect').value = String(state.midiMode ?? 0);
  $('#pitchBendSelect').value = String(state.pitchBend ?? 0);
  $('#bpmInput').value = Number(state.tempo || 120).toFixed(2).replace(/\.00$/,'');
  $('#keySelect').value = String(((state.key % 12)+12)%12);
  $('#scaleSelect').value = String(state.scale ?? 0);
  $('#metronomeToggle').checked = !!state.metronome;
  $('#loopFlag').textContent = `Loop: ${state.hasLoop == null ? '—' : state.hasLoop ? 'jest' : 'pusty'}`;
  $('#transportBadge').textContent=state.transportState==null?'Looper: brak odczytu':'Looper: kod '+state.transportState;
  $('#transportBadge').title='Surowy stan loopera. Znaczenie kodów wymaga potwierdzenia na urządzeniu.';
}

function updateAllUi(){ updateConnectionUi(); updatePartsUi(); updateDeviceUi(); }

function cloneFx(){
  return Object.fromEntries(PART_ORDER.map(p => [p, {...state.fx[p]}]));
}

function resolvePresetFilename(part, displayName){
  const list = state.presetLibrary[part] || [];
  const norm = v => String(v||'').toLowerCase().replace(/\.artipreset$/,'').replace(/[_\-]+/g,' ').replace(/\s+/g,' ').trim();
  const target = norm(displayName);
  if (!target) return state.selectedPresetFiles[part] || '';
  return state.selectedPresetFiles[part]
    || list.find(x => norm(x.name) === target)?.filename
    || list.find(x => norm(x.filename) === target)?.filename
    || list.find(x => norm(x.name).includes(target) || target.includes(norm(x.name)))?.filename
    || '';
}

function captureBaseline(manual=false){
  if (!state.connected) { if (manual) toast('Najpierw połącz Orbę'); return; }
  const required=['1:3','3:29','3:13','3:14','7:7','3:18','3:19','3:32'];
  if(!required.every(k=>state.received.has(k))||PART_ORDER.some(p=>Object.values(state.fx[p]).some(v=>v==null))){if(manual)toast('Najpierw wykonaj pełny Odczyt. Brakuje danych.');return;}
  state.baseline = {
    activePart: state.activePart,
    haptics: state.haptics,
    midiMode: state.midiMode,
    pitchBend: state.pitchBend,
    tempo: state.tempo,
    key: state.key,
    scale: state.scale,
    metronome: state.metronome,
    fx: cloneFx(),
    presets: Object.fromEntries(PART_ORDER.map(p => [p,{name:state.presets[p], filename:resolvePresetFilename(p,state.presets[p])}]))
  };
  state.baselineCapturedAt = Date.now();
  updateConnectionUi();
  if (manual) toast('Zapisano nowy punkt startowy');
  log('Baseline captured', state.baseline);
}

async function restoreBaseline(){
  if (!state.connected || !state.baseline || state.baselineRestoreBusy) return;
  if (!confirm('Przywrócić ustawienia z chwili połączenia? Loopy i sample nie zostaną zmienione.')) return;
  state.baselineRestoreBusy = true; updateConnectionUi();
  const b = state.baseline;
  const pace = () => sleep(state.transport === 'BLE' ? 65 : 15);
  try{
    const settings = [];
    if (typeof b.haptics === 'boolean') settings.push(setHaptics(b.haptics));
    if (Number.isFinite(b.midiMode)) settings.push(setMidiMode(b.midiMode));
    if (Number.isFinite(b.pitchBend)) settings.push(setPitchBend(b.pitchBend));
    if (Number.isFinite(b.tempo)) settings.push(setTempo(b.tempo));
    if (Number.isFinite(b.key)) settings.push(setKey(b.key));
    if (Number.isFinite(b.scale)) settings.push(setScale(b.scale));
    if (typeof b.metronome === 'boolean') settings.push(setMetronome(b.metronome));
    for (const payload of settings){ await sendPayload(payload,{quiet:true}); await pace(); }
    for (const p of PART_ORDER){
      const fx=b.fx?.[p]||{};
      for (const eff of ['volume','pan','reverb','delay']) if (Number.isFinite(fx[eff])) { await sendPayload(setFx(p,eff,fx[eff]),{quiet:true}); await pace(); }
      if (Number.isFinite(fx.quantize)) { await sendPayload(setQuantize(p,fx.quantize),{quiet:true}); await pace(); }
      const filename=b.presets?.[p]?.filename || resolvePresetFilename(p,b.presets?.[p]?.name);
      if(filename){ await sendPayload(selectPreset(p,filename),{quiet:true}); await pace(); await sendPayload(commitPreset(),{quiet:true}); await pace(); }
    }
    if (b.activePart) { await sendPayload(setActivePart(b.activePart),{quiet:true}); await pace(); }
    toast('Przywrócono punkt startowy');
    await refreshState(true); await sleep(state.transport==='BLE'?550:180);
  } catch(e){ log('RESTORE ERROR',e.message); toast(`Przywracanie: ${e.message}`); }
  finally { state.baselineRestoreBusy=false; updateConnectionUi(); }
}

async function requestBatteryWithRetry(){
  if(!state.connected) return;
  for(let i=0;i<3 && state.battery==null;i++){
    await sendPayload(GETS.battery,{quiet:true});
    await sleep(state.transport==='BLE'?250:90);
  }
  updateConnectionUi();
}

async function syncAndMaybeCaptureBaseline(){
  await refreshState(true);
  await sleep(state.transport==='BLE'?700:220);
  await requestBatteryWithRetry();
  if(!state.baseline) captureBaseline(false);
}

// ---------- Protocol transport ----------
let sendQueue=Promise.resolve();
let connectionGeneration=0;
function sendPayload(payload,options={}) {
 const generation=connectionGeneration;
 const next=sendQueue.then(()=>generation===connectionGeneration?sendPayloadNow(payload,options):false);
 sendQueue=next.catch(()=>false); return next;
}
async function sendPayloadNow(payload, {quiet=false}={}) {
  if (!state.connected) { if (!quiet) toast('Najpierw połącz Orbę'); return false; }
  const msg = buildSysex(payload);
  log('TX', hex(msg));
  try {
    if (state.transport === 'USB') {
      state.midiOut.send(msg);
    } else if (state.transport === 'BLE') {
      for (const packet of bleWrapMidiPackets(msg)) {
        const v = new Uint8Array(packet);
        if (state.bleChar.writeValueWithoutResponse) await state.bleChar.writeValueWithoutResponse(v);
        else await state.bleChar.writeValue(v);
        await sleep(5);
      }
    }
    return true;
  } catch (e) {
    log('SEND ERROR', e.message);
    toast(`Błąd wysyłania: ${e.message}`);
    return false;
  }
}

function onMidiBytes(data) {
  const bytes = Array.from(data);
  if (!bytes.length) return;
  if (bytes[0] === 0xF0) {
    const parsed = parseSysex(bytes);
    if (!parsed) {log('RX: niepoprawna ramka');return;}
    if(!parsed.crcOk){log('RX: odrzucono błędne CRC',hex(bytes));return;}
    log('RX', hex(bytes));
    handleReply(parsed.payload);
    return;
  }
  const status = bytes[0] & 0xF0;
  if (status === 0xC0) scheduleRefresh();
}

let refreshTimer;
function scheduleRefresh(){
  clearTimeout(refreshTimer);
  refreshTimer = setTimeout(() => refreshState(true), 180);
}

function u8ToSigned(v){ return v > 127 ? v - 256 : v; }
function valToPercent(v){ return Math.round((v / 255) * 1000) / 10; }

function handleReply(payload) {
  if (!payload?.length) return;
  if (payload[0] !== 0x02 || payload.length < 4) return; // GET reply
  const domain = payload[1];
  const addr = (payload[2] << 8) | payload[3];
  const data = payload.slice(4);
  if(!data.length){log("RX: pusta odpowiedź",domain,addr);return;}
  state.received.add(`${domain}:${addr}`);
  if (domain === 0x01 && addr === 0x0003 && data.length) state.activePart = PART_BY_WIRE[data[0]] || state.activePart;
  else if (domain === 0x03 && addr === 0x000c) state.speaker = !!data[0];
  else if (domain === 0x03 && addr === 0x000f) {if(data.length===1 && data[0]<=100){state.battery=data[0];state.batteryAt=Date.now();}else log('BATTERY: nieznany format',data);}
  else if (domain === 0x03 && addr === 0x001d) state.haptics = !!data[0];
  else if (domain === 0x03 && addr === 0x000d) state.midiMode = data[0];
  else if (domain === 0x03 && addr === 0x000e) state.pitchBend = data[0];
  else if (domain === 0x07 && addr === 0x0007 && data.length >= 2) state.tempo = ((data[0] << 8) | data[1]) / 100;
  else if (domain === 0x03 && addr === 0x0012 && data.length) state.key = u8ToSigned(data[0]);
  else if (domain === 0x03 && addr === 0x0013 && data.length) state.scale = data[0];
  else if (domain === 0x03 && addr === 0x0020 && data.length) state.metronome = data[0] !== 0;
  else if (domain === 0x07 && addr === 0x0001 && data.length) state.transportState = data[0];
  else if (domain === 0x07 && addr === 0x0008 && data.length) state.hasLoop = data[0] !== 0;
  else if (domain === 0x03 && addr >= 0x0019 && addr <= 0x001c) {
    const map = {0x0019:'lead',0x001a:'chord',0x001b:'bass',0x001c:'drum'};
    const p = map[addr];
    const s = decodeAscii(data);
    if (s) state.presets[p] = s;
  }
  else if (domain === 0x02 && (addr & 0xff00) === 0x5000 && data.length) {
    const param = addr & 0xff;
    for (const [p, cfg] of Object.entries(PARTS)) {
      const off = param - cfg.fxBase;
      const eff = ['volume','pan','reverb','delay'][off];
      if (eff) state.fx[p][eff] = valToPercent(data[0]);
    }
  }
  else if (domain === 0x07 && addr >= 0x0003 && addr <= 0x0006 && data.length) {
    const part = ['lead','chord','bass','drum'][addr - 3];
    state.fx[part].quantize = data[0];
  }
  updateAllUi();
}

let refreshBusy=false;
async function refreshState(quiet=false){
  if(!state.connected||refreshBusy)return;
  refreshBusy=true; const generation=connectionGeneration;
  try {
  const requests = [
    ...Object.values(GETS),
    ...PART_ORDER.map(getPresetName),
    ...PART_ORDER.flatMap(p => ['volume','pan','reverb','delay'].map(e => getFx(p,e))),
    ...PART_ORDER.map(getQuantize),
  ];
  for (const p of requests) {
    if(!state.connected||generation!==connectionGeneration)break;
    await sendPayload(p,{quiet});
    await sleep(state.transport==='BLE'?100:35);
  }
  } finally {refreshBusy=false;}
}

async function connectUsb(){
  if(state.connected)await disconnectDevice();
  if (!navigator.requestMIDIAccess) { toast('Ta przeglądarka nie ma Web MIDI'); return; }
  if (!webMidiContextOk()) {
    $('#contextWarning').hidden = false;
    toast('USB MIDI: otwórz aplikację przez HTTPS, nie jako content:// / lokalny plik');
    log('USB BLOCKED: non-HTTPS/local content context', location.href);
    return;
  }
  try {
    try{
      if(navigator.permissions?.query){
        const perm=await navigator.permissions.query({name:'midi',sysex:true});
        log('MIDI permission',perm.state);
      }
    }catch(_){}
    const access = await navigator.requestMIDIAccess({sysex:true});
    if(access.sysexEnabled === false) throw new Error('SysEx nie został dozwolony');
    state.midiAccess = access;
    const outputs = [...access.outputs.values()];
    const inputs = [...access.inputs.values()];
    const score = p => {
      const n=(p.name||'').toLowerCase();
      return (n.includes('orba')?10:0)+(n.includes('lead')?5:0)+(n.includes('artiphon')?2:0);
    };
    outputs.sort((a,b)=>score(b)-score(a)); inputs.sort((a,b)=>score(b)-score(a));
    const out=outputs.find(p=>score(p)>=10);
    const input=inputs.find(p=>score(p)>=10);
    if (!out || !input) throw new Error('Nie znaleziono portów MIDI Orby');
    resetDeviceReadings();
    state.midiOut=out;state.midiIn=input;
    access.onstatechange=()=>{if(out.state==='disconnected'||input.state==='disconnected')disconnectDevice();};
    input.onmidimessage = e => onMidiBytes(e.data);
    state.connected = true; state.transport = 'USB';
    log('USB connected', out.name, '/', input.name);
    updateAllUi();
    log('Połączono pasywnie. Brak TX. Kliknij Odczyt.');
  } catch(e){
    log('USB ERROR', e.name, e.message);
    const msg = e?.name === 'NotAllowedError' ? 'Brak zgody na Web MIDI/SysEx. Użyj wersji HTTPS i zezwól stronie na MIDI.' : e.message;
    toast(`USB: ${msg}`);
  }
}


const BLE_SERVICE = '03b80e5a-ede8-4b33-a751-6ce34ec4c700';
const BLE_CHAR = '7772e5db-3868-4112-a1a9-f2669d106bf3';
const bleParser = new BleMidiSysexParser(onMidiBytes);

async function connectBle(){
  if(state.connected)await disconnectDevice();
  if (!navigator.bluetooth) { toast('Web Bluetooth niedostępny — użyj Chrome/Chromium'); return; }
  try {
    const device = await navigator.bluetooth.requestDevice({filters:[{services:[BLE_SERVICE]}],optionalServices:[BLE_SERVICE]});
    const server = await device.gatt.connect();
    const service = await server.getPrimaryService(BLE_SERVICE);
    const char = await service.getCharacteristic(BLE_CHAR);
    await char.startNotifications();
    char.addEventListener('characteristicvaluechanged', e => bleParser.feed(new Uint8Array(e.target.value.buffer.slice(0))));
    device.addEventListener('gattserverdisconnected', () => {
      if(state.bleDevice===device)disconnectDevice();
    });
    resetDeviceReadings();state.bleDevice=device;state.bleChar=char;state.connected=true;state.transport='BLE';
    log('BLE connected', device.name || device.id);
    updateAllUi();
    log('Połączono pasywnie. Brak TX. Kliknij Odczyt.');
  } catch(e){ log('BLE ERROR', e.message); toast(`Bluetooth: ${e.message}`); }
}

// ---------- preset library ----------
const PRESET_URL = 'https://holofermes.github.io/orba-console/orba-library.json';
function extractPresetLibrary(json){
  const out={drum:[],bass:[],chord:[],lead:[]};
  const seen=new Set();
  function walk(node,path=[]){
    if(Array.isArray(node)){ node.forEach(v=>walk(v,path)); return; }
    if(!node || typeof node!=='object') return;
    if(typeof node.filename==='string' && node.filename.endsWith('.artipreset')){
      const key=[...path].reverse().find(x=>PART_ORDER.includes(String(x).toLowerCase()));
      const p=key ? String(key).toLowerCase() : null;
      if(p && !seen.has(`${p}|${node.filename}`)){
        seen.add(`${p}|${node.filename}`); out[p].push({filename:node.filename,name:node.name||node.filename.replace(/_.*/, '')});
      }
    }
    for(const [k,v] of Object.entries(node)) walk(v,[...path,k]);
  }
  walk(json,[]);
  for(const p of PART_ORDER) out[p].sort((a,b)=>a.name.localeCompare(b.name));
  return out;
}

function populatePresetSelects(){
  for(const p of PART_ORDER){
    const sel=$(`[data-preset-select="${p}"]`);
    const list=state.presetLibrary[p];
    sel.innerHTML='<option value="">Wybierz preset…</option>'+list.map(x=>`<option value="${escapeHtml(x.filename)}">${escapeHtml(x.name)}</option>`).join('');
  }
  const count=PART_ORDER.reduce((n,p)=>n+state.presetLibrary[p].length,0);
  $('#presetLibraryStatus').textContent = count ? `${count} presetów` : 'brak';
}
function escapeHtml(s){ return String(s).replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c])); }

async function loadPresetLibrary(){
  $('#presetLibraryStatus').textContent='loading…';
  try{
    const r=await fetch(PRESET_URL,{cache:'no-store'});
    if(!r.ok) throw new Error(`HTTP ${r.status}`);
    state.presetLibrary=extractPresetLibrary(await r.json());
    populatePresetSelects();
    if(state.baseline?.presets){
      for(const p of PART_ORDER) if(!state.baseline.presets[p].filename) state.baseline.presets[p].filename=resolvePresetFilename(p,state.baseline.presets[p].name);
    }
    log('Preset library loaded');
  }catch(e){
    $('#presetLibraryStatus').textContent='offline / import JSON';
    log('Preset library error',e.message);
  }
}

async function applyPreset(part, filename){
  if(!filename) return;
  const item=state.presetLibrary[part].find(x=>x.filename===filename);
  state.selectedPresetFiles[part]=filename;
  if(item) state.presets[part]=item.name;
  updatePartsUi();
  if(!state.connected){ toast('Preset wybrany lokalnie — połącz Orbę, aby wysłać'); return; }
  await sendPayload(selectPreset(part,filename));
  await sleep(state.transport==='BLE'?120:35);
  await sendPayload(commitPreset());
  toast(`${partLabel(part)}: ${item?.name||filename}`);
  setTimeout(()=>refreshState(true),250);
}

// ---------- samples / audio ----------
let audioCtx;
let sampleBuffer=null;
let sampleSourceName='';
let sampleWindow=5;
let sampleSelection={start:0,duration:0};
let currentRecorder=null;
let recChunks=[];

function getAudioCtx(){ return audioCtx ||= new (window.AudioContext||window.webkitAudioContext)(); }

async function decodeBlob(blob,name='sample'){
  const ab=await blob.arrayBuffer();
  const buf=await getAudioCtx().decodeAudioData(ab.slice(0));
  sampleBuffer=buf; sampleSourceName=name; sampleSelection.start=0;
  sampleWindow=Math.min(sampleWindow,Math.max(.05,buf.duration));
  sampleSelection.duration=Math.min(sampleWindow,buf.duration);
  $('#sampleStartSlider').min=0; $('#sampleStartSlider').max=Math.max(0,buf.duration-sampleSelection.duration); $('#sampleStartSlider').value=0;
  $('#sampleNameInput').value=(name||'sample').replace(/\.[^.]+$/,'').slice(0,50);
  enableSampleButtons(true); drawWave(); updateSelectionInfo();
}

function enableSampleButtons(on){ $('#samplePreviewBtn').disabled=!on; $('#sampleSaveBtn').disabled=!on; $('#sampleDownloadBtn').disabled=!on; }

function drawWave(){
  const c=$('#waveCanvas'), ctx=c.getContext('2d');
  const W=c.width,H=c.height; ctx.clearRect(0,0,W,H);
  ctx.fillStyle='#0b0e13';ctx.fillRect(0,0,W,H);
  ctx.strokeStyle='#242b35';ctx.lineWidth=1;ctx.beginPath();ctx.moveTo(0,H/2);ctx.lineTo(W,H/2);ctx.stroke();
  if(!sampleBuffer){ ctx.fillStyle='#687280';ctx.font='26px system-ui';ctx.textAlign='center';ctx.fillText('Nagraj lub dodaj plik audio',W/2,H/2+8);return; }
  const data=sampleBuffer.getChannelData(0); const step=Math.max(1,Math.floor(data.length/W));
  ctx.strokeStyle='#9bc9da';ctx.lineWidth=1.2;ctx.beginPath();
  for(let x=0;x<W;x++){
    let min=1,max=-1;const from=x*step,to=Math.min(data.length,from+step);
    for(let i=from;i<to;i++){const v=data[i];if(v<min)min=v;if(v>max)max=v;}
    const y1=(1-max)*H/2,y2=(1-min)*H/2;ctx.moveTo(x,y1);ctx.lineTo(x,y2);
  }ctx.stroke();
  const startX=(sampleSelection.start/sampleBuffer.duration)*W;
  const endX=((sampleSelection.start+sampleSelection.duration)/sampleBuffer.duration)*W;
  ctx.fillStyle='rgba(0,0,0,.52)';ctx.fillRect(0,0,startX,H);ctx.fillRect(endX,0,W-endX,H);
  ctx.strokeStyle='#e8f8ff';ctx.lineWidth=3;ctx.strokeRect(startX+1,2,Math.max(2,endX-startX-2),H-4);
}

function updateSelectionInfo(){
  if(!sampleBuffer){ $('#selectionInfo').textContent='Brak próbki';return; }
  $('#selectionInfo').textContent=`${sampleSelection.start.toFixed(2)}–${(sampleSelection.start+sampleSelection.duration).toFixed(2)} s · ${sampleSelection.duration.toFixed(2)} s / ${sampleBuffer.duration.toFixed(2)} s`;
}

function setSampleWindow(sec){
  sampleWindow=sec;
  $$('#durationPills button').forEach(b=>b.classList.toggle('active',Number(b.dataset.sec)===sec));
  if(!sampleBuffer) return;
  sampleSelection.duration=Math.min(sec,sampleBuffer.duration);
  sampleSelection.start=Math.min(sampleSelection.start,Math.max(0,sampleBuffer.duration-sampleSelection.duration));
  const s=$('#sampleStartSlider');s.max=Math.max(0,sampleBuffer.duration-sampleSelection.duration);s.value=sampleSelection.start;
  drawWave();updateSelectionInfo();
}

function selectedChannels(){
  if(!sampleBuffer) return null;
  const sr=sampleBuffer.sampleRate;
  const start=Math.floor(sampleSelection.start*sr);
  const frames=Math.max(1,Math.floor(sampleSelection.duration*sr));
  const channels=[]; let peak=0;
  for(let ch=0;ch<sampleBuffer.numberOfChannels;ch++){
    const src=sampleBuffer.getChannelData(ch);const arr=new Float32Array(frames);
    for(let i=0;i<frames;i++){const v=src[start+i]||0;arr[i]=v;peak=Math.max(peak,Math.abs(v));}
    channels.push(arr);
  }
  if($('#normalizeToggle').checked && peak>0){const gain=.95/peak;channels.forEach(a=>{for(let i=0;i<a.length;i++)a[i]*=gain;});}
  return {channels,sampleRate:sr,frames};
}

function wavBlobFromSelection(){
  const s=selectedChannels();if(!s)return null;
  const numChannels=Math.min(2,s.channels.length); const bytesPerSample=2; const blockAlign=numChannels*bytesPerSample;
  const dataSize=s.frames*blockAlign; const buf=new ArrayBuffer(44+dataSize); const v=new DataView(buf);
  const ws=(o,str)=>{for(let i=0;i<str.length;i++)v.setUint8(o+i,str.charCodeAt(i));};
  ws(0,'RIFF');v.setUint32(4,36+dataSize,true);ws(8,'WAVE');ws(12,'fmt ');v.setUint32(16,16,true);v.setUint16(20,1,true);v.setUint16(22,numChannels,true);v.setUint32(24,s.sampleRate,true);v.setUint32(28,s.sampleRate*blockAlign,true);v.setUint16(32,blockAlign,true);v.setUint16(34,16,true);ws(36,'data');v.setUint32(40,dataSize,true);
  let o=44;for(let i=0;i<s.frames;i++){for(let ch=0;ch<numChannels;ch++){let x=Math.max(-1,Math.min(1,s.channels[ch][i]||0));v.setInt16(o,x<0?x*0x8000:x*0x7fff,true);o+=2;}}
  return new Blob([buf],{type:'audio/wav'});
}

async function previewSample(){
  const s=selectedChannels();if(!s)return;const ctx=getAudioCtx();
  const b=ctx.createBuffer(s.channels.length,s.frames,s.sampleRate);s.channels.forEach((a,i)=>b.copyToChannel(a,i));
  const src=ctx.createBufferSource();src.buffer=b;src.connect(ctx.destination);src.start();
}

const DB='orbaLabSamples', STORE='samples';
function openDb(){return new Promise((res,rej)=>{const q=indexedDB.open(DB,1);q.onupgradeneeded=()=>{if(!q.result.objectStoreNames.contains(STORE))q.result.createObjectStore(STORE,{keyPath:'id'});};q.onsuccess=()=>res(q.result);q.onerror=()=>rej(q.error);});}
async function dbPut(item){const db=await openDb();return new Promise((res,rej)=>{const tx=db.transaction(STORE,'readwrite');tx.objectStore(STORE).put(item);tx.oncomplete=res;tx.onerror=()=>rej(tx.error);});}
async function dbAll(){const db=await openDb();return new Promise((res,rej)=>{const q=db.transaction(STORE).objectStore(STORE).getAll();q.onsuccess=()=>res(q.result||[]);q.onerror=()=>rej(q.error);});}
async function dbDelete(id){const db=await openDb();return new Promise((res,rej)=>{const tx=db.transaction(STORE,'readwrite');tx.objectStore(STORE).delete(id);tx.oncomplete=res;tx.onerror=()=>rej(tx.error);});}

async function saveCurrentSample(){
  const blob=wavBlobFromSelection();if(!blob)return;
  const item={id:crypto.randomUUID(),name:$('#sampleNameInput').value.trim()||'Sample',target:$('#sampleTarget').value,slot:Number($('#sampleSlot').value),duration:sampleSelection.duration,created:Date.now(),blob};
  await dbPut(item);toast('Sample zapisany lokalnie');await renderSampleLibrary();
}
function dlBlob(blob,name){const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000);}
async function renderSampleLibrary(){
  const list=(await dbAll()).sort((a,b)=>b.created-a.created);$('#sampleCount').textContent=list.length;
  const root=$('#sampleLibrary');if(!list.length){root.innerHTML='<div class="empty">Jeszcze nic tu nie ma.</div>';return;}
  root.innerHTML='';for(const item of list){
    const d=document.createElement('div');d.className='sample-item';
    d.innerHTML=`<div class="sample-item-top"><div><div class="sample-item-name">${escapeHtml(item.name)}</div><div class="sample-item-meta">${item.duration.toFixed(2)} s · ${item.target.toUpperCase()} · ${new Date(item.created).toLocaleDateString()}</div></div><span class="tag">S${item.slot}</span></div><div class="sample-item-actions"><button data-play>▶</button><button data-download>WAV</button><button data-delete>×</button></div>`;
    $('[data-play]',d).onclick=async()=>{const url=URL.createObjectURL(item.blob);const a=new Audio(url);a.onended=()=>URL.revokeObjectURL(url);a.play();};
    $('[data-download]',d).onclick=()=>dlBlob(item.blob,`${item.name}.wav`);
    $('[data-delete]',d).onclick=async()=>{await dbDelete(item.id);await renderSampleLibrary();};
    root.appendChild(d);
  }
}

async function toggleMicRecord(){
  if(currentRecorder){ currentRecorder.stop(); return; }
  try{
    const stream=await navigator.mediaDevices.getUserMedia({audio:{echoCancellation:false,noiseSuppression:false,autoGainControl:false}});
    recChunks=[];currentRecorder=new MediaRecorder(stream);
    currentRecorder.ondataavailable=e=>{if(e.data.size)recChunks.push(e.data);};
    currentRecorder.onstop=async()=>{const blob=new Blob(recChunks,{type:currentRecorder.mimeType});stream.getTracks().forEach(t=>t.stop());currentRecorder=null;$('#micRecordBtn').textContent='🎙 Nagraj z telefonu';await decodeBlob(blob,'Nagranie');toast('Nagranie gotowe');};
    currentRecorder.start();$('#micRecordBtn').textContent='■ Zatrzymaj nagrywanie';toast('Nagrywanie…');
  }catch(e){toast(`Mikrofon: ${e.message}`);}
}

// ---------- events ----------
function bindEvents(){
  $$('.mode-btn').forEach(b=>b.onclick=()=>setMode(b.dataset.mode));
  $$('.view-tab').forEach(b=>b.onclick=()=>setView(b.dataset.viewTarget));
  $('#usbConnect').onclick=connectUsb; $('#bleConnect').onclick=connectBle; $('#refreshState').onclick=async()=>{await refreshState(false);await requestBatteryWithRetry();captureBaseline(false);toast('Odczyt zakończony');};
  $('#disconnectBtn').onclick=disconnectDevice;
  $('#enableSpeakerBtn').onclick=async()=>{if(confirm('Włączyć wewnętrzny głośnik Orby?')){await sendPayload(setSpeaker(true));await sleep(180);await sendPayload(GETS.speaker);}};
  $('#downloadLog').onclick=()=>dlBlob(new Blob(['Orba Lab V1.3\n'+navigator.userAgent+'\n'+state.log.join('\n')],{type:'text/plain'}),'orba-lab-diagnostics.txt');
  $('#restoreBaselineBtn').onclick=restoreBaseline;
  $('#saveBaselineBtn').onclick=()=>captureBaseline(true);
  $$('.part-card').forEach(card=>card.addEventListener('click',e=>{if(e.target.closest('select'))return;const p=card.dataset.part;state.activePart=p;updatePartsUi();sendPayload(setActivePart(p));setTimeout(()=>refreshState(true),120);}));
  $$('[data-preset-select]').forEach(sel=>sel.onchange=()=>applyPreset(sel.dataset.presetSelect,sel.value));
  $('#recordBtn').onclick=()=>sendPayload(looper('record'));
  $('#playBtn').onclick=()=>sendPayload(looper('play'));
  $('#pauseBtn').onclick=()=>sendPayload(looper('pause'));
  $('#clearTrackBtn').onclick=()=>{if(confirm(`Wyczyścić loop części ${state.activePart.toUpperCase()}?`))sendPayload(looper('eraseTrack')).then(()=>setTimeout(()=>refreshState(true),150));};
  $('#clearAllBtn').onclick=()=>{if(confirm('Wyczyścić CAŁY loop ze wszystkich 4 części?'))sendPayload(looper('eraseSong')).then(()=>setTimeout(()=>refreshState(true),150));};
  $('#bpmInput').onchange=()=>{const bpm=Math.max(10,Math.min(400,Number($('#bpmInput').value)||120));state.tempo=bpm;sendPayload(setTempo(bpm));updateDeviceUi();};
  $('#tapTempoBtn').onclick=()=>{const now=performance.now();state.tapTimes.push(now);state.tapTimes=state.tapTimes.filter(t=>now-t<3500).slice(-6);if(state.tapTimes.length>=2){const ds=[];for(let i=1;i<state.tapTimes.length;i++)ds.push(state.tapTimes[i]-state.tapTimes[i-1]);const avg=ds.reduce((a,b)=>a+b,0)/ds.length;const bpm=Math.max(10,Math.min(400,60000/avg));state.tempo=bpm;$('#bpmInput').value=bpm.toFixed(1);sendPayload(setTempo(bpm),{quiet:true});}};
  $('#metronomeToggle').onchange=()=>{state.metronome=$('#metronomeToggle').checked;sendPayload(setMetronome(state.metronome));};
  $('#mixerRefresh').onclick=()=>PART_ORDER.includes(state.activePart)&&['volume','pan','reverb','delay'].forEach(e=>sendPayload(getFx(state.activePart,e),{quiet:true}));
  const sliders=[['volSlider','volOut','volume'],['panSlider','panOut','pan'],['revSlider','revOut','reverb'],['delSlider','delOut','delay']];
  sliders.forEach(([id,out,effect])=>{let t;$('#'+id).oninput=()=>{$('#'+out).textContent=`${$('#'+id).value}%`;paintKnob($('#'+id));clearTimeout(t);const part=state.activePart,v=Number($('#'+id).value);t=setTimeout(()=>{state.fx[part][effect]=v;sendPayload(setFx(part,effect,v),{quiet:true});updatePartsUi();},55);};});
  $('#hapticsToggle').onchange=()=>{state.haptics=$('#hapticsToggle').checked;sendPayload(setHaptics(state.haptics));};
  if ($('#speakerToggle')) $('#speakerToggle').onchange=()=>{state.speaker=$('#speakerToggle').checked;sendPayload(setSpeaker(state.speaker));};
  $('#midiModeSelect').onchange=()=>{state.midiMode=Number($('#midiModeSelect').value);sendPayload(setMidiMode(state.midiMode));};
  $('#pitchBendSelect').onchange=()=>{state.pitchBend=Number($('#pitchBendSelect').value);sendPayload(setPitchBend(state.pitchBend));};
  $('#keySelect').onchange=()=>{state.key=Number($('#keySelect').value);sendPayload(setKey(state.key));};
  $('#scaleSelect').onchange=()=>{state.scale=Number($('#scaleSelect').value);sendPayload(setScale(state.scale));};
  $('#quantSelect').onchange=()=>{const v=Number($('#quantSelect').value);state.fx[state.activePart].quantize=v;sendPayload(setQuantize(state.activePart,v));};
  $('#reloadPresetLibrary').onclick=loadPresetLibrary;
  $('#presetLibraryInput').onchange=async e=>{try{const j=JSON.parse(await e.target.files[0].text());state.presetLibrary=extractPresetLibrary(j);populatePresetSelects();toast('Biblioteka zaimportowana');}catch(err){toast('Błędny plik JSON');}};
  $('#clearLog').onclick=()=>{state.log=[];$('#logBox').textContent='';};

  $('#micRecordBtn').onclick=toggleMicRecord;
  $('#audioFileInput').onchange=async e=>{const f=e.target.files[0];if(f)try{await decodeBlob(f,f.name);}catch(err){toast(`Nie mogę odczytać audio: ${err.message}`);}e.target.value='';};
  $('#sampleClearBtn').onclick=()=>{sampleBuffer=null;sampleSourceName='';enableSampleButtons(false);drawWave();updateSelectionInfo();};
  $$('#durationPills button').forEach(b=>b.onclick=()=>setSampleWindow(Number(b.dataset.sec)));
  $('#sampleStartSlider').oninput=()=>{sampleSelection.start=Number($('#sampleStartSlider').value);drawWave();updateSelectionInfo();};
  $('#samplePreviewBtn').onclick=previewSample;
  $('#sampleSaveBtn').onclick=saveCurrentSample;
  $('#sampleDownloadBtn').onclick=()=>{const b=wavBlobFromSelection();if(b)dlBlob(b,`${$('#sampleNameInput').value.trim()||'sample'}.wav`);};
  $('#sampleSendBtn').onclick=()=>toast('Transfer sampli do Orby: V2 po bezpiecznym odtworzeniu protokołu plikowego');
  $('#waveCanvas').addEventListener('pointerdown',e=>{if(!sampleBuffer)return;const r=e.currentTarget.getBoundingClientRect();const x=(e.clientX-r.left)/r.width;sampleSelection.start=Math.max(0,Math.min(sampleBuffer.duration-sampleSelection.duration,x*sampleBuffer.duration-sampleSelection.duration/2));$('#sampleStartSlider').value=sampleSelection.start;drawWave();updateSelectionInfo();});
}

function initSelects(){
  $('#keySelect').innerHTML=KEY_NAMES.map((n,i)=>`<option value="${i}">${n}</option>`).join('');
  $('#scaleSelect').innerHTML=SCALE_NAMES.map((n,i)=>`<option value="${i}">${n}</option>`).join('');
}

async function init(){
  setMode(state.mode);setView(state.view);initSelects();bindEvents();initKnobs();drawWave();updateAllUi();
  $('#contextWarning').hidden = webMidiContextOk();
  $('#secureBadge').textContent=webMidiContextOk()?'HTTPS':'Plik lokalny';
  if(!webMidiContextOk()) log('WARNING: local/non-HTTPS context; Web MIDI SysEx may be blocked.');
  if('serviceWorker' in navigator && window.isSecureContext) navigator.serviceWorker.register('./sw.js').catch(()=>{});
  await renderSampleLibrary();
  loadPresetLibrary();
  log('Orba Lab V1.3 ready · passive connect');
}

function resetDeviceReadings(){
 connectionGeneration++;clearTimeout(refreshTimer);
 state.battery=null;state.batteryAt=null;state.speaker=null;state.haptics=null;
 state.transportState=null;state.hasLoop=null;state.baseline=null;state.baselineCapturedAt=null;state.received.clear();
 state.presets={drum:'',bass:'',chord:'',lead:''};state.selectedPresetFiles={drum:'',bass:'',chord:'',lead:''};
 state.fx=Object.fromEntries(PART_ORDER.map(p=>[p,{volume:null,pan:null,reverb:null,delay:null,quantize:null}]));bleParser.buf=null;
}
async function disconnectDevice(){
 const device=state.bleDevice;state.connected=false;state.transport=null;
 if(state.midiIn){state.midiIn.onmidimessage=null;try{await state.midiIn.close();}catch(_){}}
 if(state.midiOut){try{await state.midiOut.close();}catch(_){}}
 if(state.midiAccess)state.midiAccess.onstatechange=null;
 state.midiIn=null;state.midiOut=null;state.bleDevice=null;state.bleChar=null;
 if(device?.gatt?.connected)device.gatt.disconnect();resetDeviceReadings();updateAllUi();log('Rozłączono');
}
function paintKnob(input){
 const shell=input.closest('.knob-shell');if(!shell)return;
 shell.style.setProperty('--angle',(-135+Number(input.value)*2.7)+'deg');
 shell.style.setProperty('--sweep',(Number(input.value)*2.7)+'deg');
}
function initKnobs(){
 $$('.knob-shell input').forEach(input=>{
  const shell=input.closest('.knob-shell');let drag=null;
  shell.addEventListener('pointerdown',e=>{if(e.button!==0)return;e.preventDefault();input.focus();input.dataset.dragging='true';drag={y:e.clientY,value:Number(input.value)};shell.setPointerCapture(e.pointerId);});
  shell.addEventListener('pointermove',e=>{if(!drag)return;input.value=String(Math.max(0,Math.min(100,Math.round(drag.value+(drag.y-e.clientY)*.65))));input.dispatchEvent(new Event('input',{bubbles:true}));});
  const end=()=>{drag=null;delete input.dataset.dragging;};shell.addEventListener('pointerup',end);shell.addEventListener('pointercancel',end);
  input.addEventListener('input',()=>paintKnob(input));paintKnob(input);
 });
}

init();

