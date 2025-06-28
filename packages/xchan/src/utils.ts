import { getNumber, getBigInt, BigNumberish } from 'ethers';

export function uint16Le(value: BigNumberish) {
  const value_ = getNumber(value, 'value');
  const buf = new ArrayBuffer(2);
  const view = new DataView(buf);
  view.setUint16(0, value_, true);
  return new Uint8Array(buf);
}
export function uint32Le(value: BigNumberish) {
  const value_ = getNumber(value, 'value');
  const buf = new ArrayBuffer(4);
  const view = new DataView(buf);
  view.setUint32(0, value_, true);
  return new Uint8Array(buf);
}

export function uint64Le(value: BigNumberish) {
  const value_ = getBigInt(value, 'value');
  const buf = new ArrayBuffer(8);
  const view = new DataView(buf);
  view.setBigUint64(0, value_, true);
  return new Uint8Array(buf);
}
