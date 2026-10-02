// Orba Lab V1 — minimal protocol implementation based on the public
// reverse-engineered Artiphon Orba protocol specification by holofermes.
// https://github.com/holofermes/orba-protocol

export const PARTS = {
  lead:  { wire: 0, channel: 1,  fxBase: 0x00, presetAddr: 0x0029, nameAddr: 0x0019, quantAddr: 0x0003 },
  chord: { wire: 1, channel: 16, fxBase: 0x08, presetAddr: 0x0028, nameAddr: 0x001a, quantAddr: 0x0004 },
  bass:  { wire: 2, channel: 9,  fxBase: 0x10, presetAddr: 0x0027, nameAddr: 0x001b, quantAddr: 0x0005 },
  drum:  { wire: 3, channel: 10, fxBase: 0x18, presetAddr: 0x0026, nameAddr: 0x001c, quantAddr: 0x0006 },
};

export const PART_BY_WIRE = ['lead', 'chord', 'bass', 'drum'];
export const FX_OFFSETS = { volume: 0, pan: 1, reverb: 2, delay: 3 };

let messageId = 0x40;
function nextMessageId() {
  messageId = (messageId + 1) & 0x7f;
  if (messageId === 0) messageId = 1;
  return messageId;
}

export function crc16(bytes) {
  let crc = 0;
  for (const b of bytes) {
    crc ^= b;
    for (let i = 0; i < 8; i++) {
      crc = (crc & 1) ? ((crc >>> 1) ^ 0xA001) : (crc >>> 1);
    }
  }
  return crc & 0xffff;
}

export function encode7(bytes) {
  const out = [];
  let acc = 0;
  let bits = 0;
  for (const b of bytes) {
    acc |= (b & 0xff) << bits;
    bits += 8;
    while (bits >= 7) {
      out.push(acc & 0x7f);
      acc >>>= 7;
      bits -= 7;
    }
  }
  if (bits > 0) out.push(acc & 0x7f);
  return out;
}

export function decode7(bytes) {
  const out = [];
  let acc = 0;
  let bits = 0;
  for (const b of bytes) {
    acc |= (b & 0x7f) << bits;
    bits += 7;
    while (bits >= 8) {
      out.push(acc & 0xff);
      acc >>>= 8;
      bits -= 8;
    }
  }
  return out;
}

export function buildSysex(payload, id = nextMessageId()) {
  const len = payload.length;
  const head = [0x82, 0x01, id, (len >>> 8) & 0xff, len & 0xff, ...payload];
  const crc = crc16(head);
  const packet = [...head, (crc >>> 8) & 0xff, crc & 0xff];
  const wire = [0x00, ...encode7(packet)];
  return new Uint8Array([0xF0, ...wire, 0xF7]);
}

export function parseSysex(midiBytes) {
  const bytes = Array.from(midiBytes);
  if (bytes[0] !== 0xF0 || bytes[bytes.length - 1] !== 0xF7) return null;
  const body = bytes.slice(1, -1);
  if (body[0] !== 0x00) return null;
  const packet = decode7(body.slice(1));
  if (packet.length < 7 || packet[0] !== 0x82 || packet[1] !== 0x01) return null;
  const id = packet[2];
  const len = (packet[3] << 8) | packet[4];
  const payloadStart = 5;
  const payloadEnd = payloadStart + len;
  if (packet.length < payloadEnd + 2) return null;
  const payload = packet.slice(payloadStart, payloadEnd);
  const expected = ((packet[payloadEnd] << 8) | packet[payloadEnd + 1]) & 0xffff;
  const actual = crc16(packet.slice(0, payloadEnd));
  return { id, payload, crcOk: expected === actual, rawPacket: packet };
}

export function getReg(domain, addr) {
  return [0x02, domain, (addr >>> 8) & 0xff, addr & 0xff];
}

export function setReg(domain, addr, values = []) {
  return [0x03, domain, (addr >>> 8) & 0xff, addr & 0xff, ...values];
}

export function setActivePart(part) {
  return setReg(0x01, 0x0003, [PARTS[part].wire]);
}

export function setTempo(bpm) {
  const value = Math.max(1000, Math.min(40000, Math.round(Number(bpm) * 100)));
  return setReg(0x07, 0x0007, [(value >>> 8) & 0xff, value & 0xff]);
}

export function setFx(part, effect, percent) {
  const base = PARTS[part].fxBase;
  const offset = FX_OFFSETS[effect];
  const value = Math.max(0, Math.min(255, Math.round(Number(percent) * 2.55)));
  return [0x03, 0x02, 0x50, (base + offset) & 0xff, value, 0x00, 0x01, 0x04];
}

export function getFx(part, effect) {
  const param = (PARTS[part].fxBase + FX_OFFSETS[effect]) & 0xff;
  return [0x02, 0x02, 0x50, param];
}

export function selectPreset(part, filename) {
  const enc = new TextEncoder();
  const raw = Array.from(enc.encode(filename)).slice(0, 128);
  while (raw.length < 129) raw.push(0);
  return setReg(0x03, PARTS[part].presetAddr, raw);
}

export function commitPreset() {
  return setReg(0x03, 0x0022, [0]);
}

export function looper(action) {
  const values = { record: 0x01, eraseTrack: 0x02, eraseSong: 0x03, fresh: 0x04, play: 0x05, pause: 0x06 };
  return setReg(0x07, 0x0002, [values[action]]);
}

export function setKey(semitone) {
  const v = ((Number(semitone) % 256) + 256) % 256;
  return setReg(0x03, 0x0012, [v]);
}

export function setScale(index) {
  return setReg(0x03, 0x0013, [Number(index) & 0xff]);
}

export function setQuantize(part, mode) {
  return setReg(0x07, PARTS[part].quantAddr, [Number(mode) & 0xff]);
}

export function setHaptics(on) { return setReg(0x03, 0x001d, [on ? 1 : 0]); }
export function setSpeaker(on) { return setReg(0x03, 0x000c, [on ? 1 : 0]); }
export function setMetronome(on) { return setReg(0x03, 0x0020, [on ? 1 : 0]); }
export function setMidiMode(mode) { return setReg(0x03, 0x000d, [Number(mode) & 0xff]); }
export function setPitchBend(raw) { return setReg(0x03, 0x000e, [Number(raw) & 0xff]); }

export const GETS = {
  activePart: getReg(0x01, 0x0003),
  speaker: getReg(0x03, 0x000c),
  battery: getReg(0x03, 0x000f),
  masterVolume: getReg(0x03, 0x0001),
  haptics: getReg(0x03, 0x001d),
  midiMode: getReg(0x03, 0x000d),
  pitchBend: getReg(0x03, 0x000e),
  tempo: getReg(0x07, 0x0007),
  key: getReg(0x03, 0x0012),
  scale: getReg(0x03, 0x0013),
  metronome: getReg(0x03, 0x0020),
  transport: getReg(0x07, 0x0001),
  hasLoop: getReg(0x07, 0x0008),
};

export function getPresetName(part) { return getReg(0x03, PARTS[part].nameAddr); }
export function getQuantize(part) { return getReg(0x07, PARTS[part].quantAddr); }

// BLE-MIDI wrapping for SysEx control messages.
export function bleWrapMidiPackets(sysex, mtu = 20) {
  const bytes = Array.from(sysex);
  if (bytes[0] !== 0xF0 || bytes[bytes.length - 1] !== 0xF7) throw new Error('Expected SysEx F0…F7');
  const body = bytes.slice(1, -1);
  const packets = [];
  const firstCap = Math.max(1, mtu - 3); // header + timestamp + F0
  const contCap = Math.max(1, mtu - 1);  // header
  let pos = 0;
  packets.push([0x80, 0x80, 0xF0, ...body.slice(0, firstCap)]);
  pos += firstCap;
  while (pos < body.length) {
    packets.push([0x80, ...body.slice(pos, pos + contCap)]);
    pos += contCap;
  }
  packets.push([0x80, 0x80, 0xF7]);
  return packets;
}

export class BleMidiSysexParser {
  constructor(onMessage) {
    this.onMessage = onMessage;
    this.buf = null;
  }
  feed(value) {
    const bytes = Array.from(value instanceof Uint8Array ? value : new Uint8Array(value));
    if (!bytes.length) return;
    let i = 0;
    if (bytes[0] & 0x80) i = 1; // BLE-MIDI header
    for (; i < bytes.length; i++) {
      const b = bytes[i];
      if (b === 0xF0) {
        this.buf = [0xF0];
        continue;
      }
      if (b === 0xF7) {
        if (this.buf) {
          this.buf.push(0xF7);
          this.onMessage?.(new Uint8Array(this.buf));
          this.buf = null;
        }
        continue;
      }
      if (this.buf) {
        if (b & 0x80) continue; // timestamp byte inside BLE-MIDI framing
        this.buf.push(b);
      }
    }
  }
}

export function decodeAscii(data) {
  const clean = Array.from(data).filter((b, i) => !(i === 0 && b === 0));
  const end = clean.indexOf(0);
  const arr = end >= 0 ? clean.slice(0, end) : clean;
  return new TextDecoder().decode(new Uint8Array(arr)).trim();
}

