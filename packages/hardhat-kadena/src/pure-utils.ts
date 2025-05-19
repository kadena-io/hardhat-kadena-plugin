import { ethers } from 'ethers';

export const getNetworkStem = (chainwebName: string) =>
  `chainweb_${chainwebName}`;

export interface Origin {
  chain: bigint;
  originContractAddress: string;
  height: bigint;
  txIdx: bigint;
  eventIdx: bigint;
}

export function computeOriginHash(origin: Origin) {
  // Create a proper ABI encoding matching Solidity struct layout
  const abiEncoded = ethers.AbiCoder.defaultAbiCoder().encode(
    ['tuple(uint32,address,uint64,uint64,uint64)'],
    [
      [
        origin.chain, // uint32 originChainId
        origin.originContractAddress, // address originContractAddress
        origin.height, // uint64 originBlockHeight
        origin.txIdx, // uint64 originTransactionIndex
        origin.eventIdx, // uint64 originEventIndex
      ],
    ],
  );

  // Hash it using keccak256
  return ethers.keccak256(abiEncoded);
}
