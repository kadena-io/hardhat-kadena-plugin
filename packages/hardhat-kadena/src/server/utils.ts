import { Origin } from '../utils';

// TODO: use config for base url
// /chain/${trgChain}/spv/chain/${origin.chain}/height/${origin.height}/transaction/${origin.txIdx}/event/${origin.eventIdx}
export const parseSpvProofRequest = (url: string) => {
  const parts = url.split('/');
  const targetChain = parseInt(parts[2]);
  const origin: Omit<Origin, 'originContractAddress'> = {
    chain: BigInt(parts[5]),
    height: BigInt(parts[7]),
    txIdx: BigInt(parts[9]),
    eventIdx: BigInt(parts[11]),
  };
  return { targetChain, origin };
};

export const mapChainIdToRoute = (id: number): string => {
  return `/chain/${id}`;
};
