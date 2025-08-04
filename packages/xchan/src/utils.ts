import {
  getNumber,
  getBigInt,
  BigNumberish,
  BytesLike,
  getBytes,
  encodeRlp,
  toBeHex
} from 'ethers';

/* *************************************************************************** */
/* Base64Url encoding/decoding */

export function decodeBase64Url(base64Url: string): Uint8Array {
  return Uint8Array.from(Buffer.from(base64Url, 'base64url'));
}

export function encodeBase64Url(bytes: BytesLike): string {
  const buf = getBytes(bytes);
  const base64 = Buffer.from(buf).toString('base64url');
  return base64;
}

/* *************************************************************************** */
/* RLP encoding */

export function rlpEncodeBytes(value: Uint8Array): Uint8Array {
  return getBytes(encodeRlp(value));
}

export function rlpEncodeInt(value: bigint): Uint8Array {
  if (value == 0n) {
    return getBytes(encodeRlp(new Uint8Array([])));
  }
  return getBytes(encodeRlp(toBeHex(value)));
}

/* *************************************************************************** */
/* deserialize BigInt */

export function uint16Le(value: BigNumberish) {
  return uint16(value, true);
}

export function uint16Be(value: BigNumberish) {
  return uint16(value, false);
}

export function uint64Le(value: BigNumberish) {
  return uint64(value, true);
}

export function uint64Be(value: BigNumberish) {
  return uint64(value, false);
}

export function uint32Le(value: BigNumberish) {
  return uint32(value, true);
}

export function uint32Be(value: BigNumberish) {
  return uint32(value, false);
}

export function uint16(value: BigNumberish, littleEndian: boolean = true): Uint8Array {
  const value_ = getNumber(value, 'value');
  const buf = new ArrayBuffer(2);
  const view = new DataView(buf);
  view.setUint16(0, value_, littleEndian);
  return new Uint8Array(buf);
}

export function uint32(value: BigNumberish, littleEndian: boolean = true): Uint8Array {
  const value_ = getNumber(value, 'value');
  const buf = new ArrayBuffer(4);
  const view = new DataView(buf);
  view.setUint32(0, value_, littleEndian);
  return new Uint8Array(buf);
}

export function uint64(value: BigNumberish, littleEndian: boolean): Uint8Array {
  const value_ = getBigInt(value, 'value');
  const buf = new ArrayBuffer(8);
  const view = new DataView(buf);
  view.setBigUint64(0, value_, littleEndian);
  return new Uint8Array(buf);
}

/* *************************************************************************** */
/* Serialize BigInt */

export function toUint16Le(value: BytesLike): number {
  return toUint16(value, true);
}

export function toUint16Be(value: BytesLike): number {
  return toUint16(value, false);
}

export function toUint32Le(value: BytesLike): number {
  return toUint32(value, true);
}

export function toUint32Be(value: BytesLike): number {
  return toUint32(value, false);
}

export function toUint64Le(value: BytesLike): bigint {
  return toUint64(value, true);
}

export function toUint64Be(value: BytesLike): bigint {
  return toUint64(value, false);
}

export function toUint16(value: BytesLike, littleEndian: boolean): number {
  const bytes = getBytes(value);
  if (bytes.length !== 2) {
    throw new Error(`toUint16: invalid byte length ${bytes.length}`);
  }
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.length);
  return view.getUint16(0, littleEndian);
}

export function toUint32(value: BytesLike, littleEndian: boolean): number {
  const bytes = getBytes(value);
  if (bytes.length !== 4) {
    throw new Error(`toUint32: invalid byte length ${bytes.length}`);
  }
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.length);
  return view.getUint32(0, littleEndian);
}

export function toUint64(value: BytesLike, littleEndian: boolean): bigint {
  const bytes = getBytes(value);
  if (bytes.length !== 8) {
    throw new Error(`toUint64: invalid byte length ${bytes.length}`);
  }
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.length);
  return view.getBigUint64(0, littleEndian);
}
