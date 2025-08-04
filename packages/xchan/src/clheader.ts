/* ************************************************************************** */
/* EVM Execution Header */
import consensus from '@kadena/chainwebjs';
import { BigNumberish, BytesLike, getBytes, hexlify } from "ethers";
import { ChainId } from "./xchan";
import { decodeBase64Url, encodeBase64Url, uint64Be, } from './utils';
import { MerkleLeafType, MerkleLogProof, merkleLogRoot, MerkleLogTag } from './merklelog';
import { d4k4ShortestPath } from './graph';

const { header } = consensus;

type BlockHash = Uint8Array;
type PayloadHash = Uint8Array;

// Copy and pasted from chainwebjs (because it does not seem to be exported)
interface IBlockHeader {
  creationTime: number;
  parent: string;
  height: number;
  hash: string;
  chainId: number;
  weight: string;
  featureFlags: number;
  epochStart: number;
  adjacents: { [key: string]: string };
  payloadHash: string;
  chainwebVersion: string;
  target: string;
  nonce: string;
};

enum ChainwebVersion {
  Development = 0x1,
  Mainnet01 = 0x5,
  Testnet04 = 0x7,
  EvmDevelopment = 0xa,
  EvmTestnet = 0xb,
};

function readChainwebVersion(version: string): ChainwebVersion {
  switch (version) {
    case 'development':
      return ChainwebVersion.Development;
    case 'mainnet01':
      return ChainwebVersion.Mainnet01;
    case 'testnet04':
      return ChainwebVersion.Testnet04;
    case 'evm-development':
      return ChainwebVersion.EvmDevelopment;
    case 'evm-testnet':
      return ChainwebVersion.EvmTestnet;
    default:
      throw new Error(`Unknown Chainweb version: ${version}`);
  }
}

export type ClBlockTag = string | number | BlockHash;

export class ClHeader {
  readonly featureFlags: Uint8Array;
  readonly creationTime: number;
  readonly parentHash: BlockHash
  readonly target: Uint8Array;
  readonly payloadHash: PayloadHash;
  readonly chainId: ChainId;
  readonly epochStart: number;
  readonly nonce: Uint8Array;
  readonly chainwebVersion: ChainwebVersion;
  readonly height: number;
  readonly weight: Uint8Array;
  readonly adjacentParents: { [key: ChainId]: BlockHash };

  // Not part of the Merkle tree
  readonly hash: BlockHash;

  private constructor(
    featureFlags: BytesLike,
    creationTime: BigNumberish,
    parentHash: BlockHash,
    target: BytesLike,
    payloadHash: PayloadHash,
    chainId: ChainId,
    epochStart: BigNumberish,
    nonce: BytesLike,
    chainwebVersion: ChainwebVersion,
    height: BigNumberish,
    weight: BytesLike,
    adjacentParents: { [key: ChainId]: BlockHash },
    hash: BlockHash,
  ) {
    this.featureFlags = getBytes(featureFlags);
    this.creationTime = Number(creationTime);
    this.parentHash = parentHash;
    this.target = getBytes(target);
    this.payloadHash = getBytes(payloadHash);
    this.chainId = chainId;
    this.epochStart = Number(epochStart);
    this.nonce = getBytes(nonce);
    this.chainwebVersion = chainwebVersion;
    this.height = Number(height);
    this.weight = getBytes(weight);
    this.adjacentParents = adjacentParents;
    this.hash = this.computeHash();
    if (hash && hexlify(hash) !== hexlify(this.hash)) {
      console.warn(`ClHeader: Provided hash does not match computed hash: ${hexlify(hash)} !== ${hexlify(this.hash)}`);
      console.warn(`ClHeader: provided hash (base64): ${encodeBase64Url(hash)}`);
      console.warn(`ClHeader: computed hash (base64): ${encodeBase64Url(this.hash)}`);
    }
  }

  public asJson(hex: boolean = true): object {
    if (hex) {
      return {
        featureFlags: hexlify(this.featureFlags),
        creationTime: this.creationTime,
        parentHash: hexlify(this.parentHash),
        target: hexlify(this.target),
        payloadHash: hexlify(this.payloadHash),
        chainId: this.chainId,
        epochStart: this.epochStart,
        nonce: hexlify(this.nonce),
        chainwebVersion: this.chainwebVersion,
        height: this.height,
        weight: hexlify(this.weight),
        adjacentParents: Object.fromEntries(
          Object.entries(this.adjacentParents).map(([key, value]) => [key, hexlify(value)])
        ),
        hash: hexlify(this.hash),
      };
    } else {
      return {
        featureFlags: encodeBase64Url(this.featureFlags),
        creationTime: this.creationTime,
        parentHash: encodeBase64Url(this.parentHash),
        target: encodeBase64Url(this.target),
        payloadHash: encodeBase64Url(this.payloadHash),
        chainId: this.chainId,
        epochStart: this.epochStart,
        nonce: encodeBase64Url(this.nonce),
        chainwebVersion: this.chainwebVersion,
        height: this.height,
        weight: encodeBase64Url(this.weight),
        adjacentParents: Object.fromEntries(
          Object.entries(this.adjacentParents).map(([key, value]) => [key, encodeBase64Url(value)])
        ),
        hash: encodeBase64Url(this.hash),
      };
    }
  }

  // Read a JSON encoded CL header that is returned by the Chainweb API.
  //
  static readChainwebjsHeader(hdr: IBlockHeader): ClHeader {
    const adjacents: { [key: ChainId]: BlockHash } = {};
    Object.keys(hdr.adjacents).forEach((key) => {
      adjacents[Number(key)] = decodeBase64Url(hdr.adjacents[key]);
    });
    return new ClHeader(
      uint64Be(hdr.featureFlags),
      hdr.creationTime,
      decodeBase64Url(hdr.parent),
      decodeBase64Url(hdr.target),
      decodeBase64Url(hdr.payloadHash),
      hdr.chainId,
      hdr.epochStart,
      uint64Be(hdr.nonce),
      readChainwebVersion(hdr.chainwebVersion),
      hdr.height,
      decodeBase64Url(hdr.weight),
      adjacents,
      decodeBase64Url(hdr.hash),
    );
  }

  static async request(
    chainId: ChainId,
    chainwebVersion: string,
    chainwebHost: string,
    blockTag: ClBlockTag = 'latest',
  ): Promise<ClHeader> {
    let hdr;
    if (typeof blockTag === 'number' && blockTag < 0) {
      hdr = (await header.recent(chainId, 0 - blockTag, 1, chainwebVersion, chainwebHost))[0];
    } else if (typeof blockTag === 'number' && blockTag >= 0) {
      hdr = await header.height(chainId, blockTag, chainwebVersion, chainwebHost);
    } else if (typeof blockTag === 'string' && blockTag === 'latest') {
      hdr = (await header.recent(chainId, 0, 1, chainwebVersion, chainwebHost))[0];
    } else if (blockTag instanceof Uint8Array) {
      hdr = await header.blockHash(chainId, encodeBase64Url(blockTag), chainwebVersion, chainwebHost);
    } else {
      throw new Error(`Invalid block tag: ${blockTag}`);
    }
    if (!hdr) {
      throw new Error(`Header not found for chain ${chainId} and block tag ${blockTag}`);
    }
    const clHeader = ClHeader.readChainwebjsHeader(hdr);
    // console.debug(`Got CL header: ${JSON.stringify(clHeader.asJson(true), null, 2)}`);
    console.debug(`Got CL header. chain: ${clHeader.chainId}, height: ${clHeader.height}, hash: ${hexlify(clHeader.hash)}`);
    return clHeader;
  }

  private computeHash(): BlockHash {
    return merkleLogRoot(this.merkleFields());
  }

  private merkleFields(): [number, MerkleLeafType][] {
    const adjacents = Object.keys(this.adjacentParents).sort((a, b) => Number(a) - Number(b)).map((key) => {
      return [MerkleLogTag.BlockHashTag, this.adjacentParents[Number(key)]] as [number, Uint8Array];
    });
    return [
      [MerkleLogTag.FeatureFlagsTag, this.featureFlags],
      [MerkleLogTag.BlockCreationTimeTag, this.creationTime],
      [MerkleLogTag.BlockHashTag, this.parentHash],
      [MerkleLogTag.HashTargetTag, this.target],
      [MerkleLogTag.BlockPayloadHashTag, this.payloadHash],
      [MerkleLogTag.ChainIdTag, this.chainId],
      [MerkleLogTag.BlockWeightTag, this.weight],
      [MerkleLogTag.BlockHeightTag, this.height],
      [MerkleLogTag.ChainwebVersionTag, this.chainwebVersion],
      [MerkleLogTag.EpochStartTimeTag, this.epochStart],
      [MerkleLogTag.BlockNonceTag, this.nonce],
      ...adjacents,
    ];
  }

  public payloadHashProof(): MerkleLogProof {
    return MerkleLogProof.create(
      this.merkleFields(),
      0x04,
      MerkleLogTag.BlockHashTag,
    );
  }

  public parentProof(): MerkleLogProof {
    return MerkleLogProof.create(
      this.merkleFields(),
      0x02,
      MerkleLogTag.BlockHashTag,
    );
  }

  public adjacentParentsProof(cid: ChainId): MerkleLogProof {
    if (!(cid in this.adjacentParents)) {
      throw new Error(`Adjacent parent for chain ${cid} not found in header`);
    }
    const pos = Object.keys(this.adjacentParents)
      .sort((a, b) => Number(a) - Number(b))
      .indexOf(String(cid));

    return MerkleLogProof.create(
      this.merkleFields(),
      11 + pos,
      MerkleLogTag.BlockHashTag
    );
  }
}

// Returns a MerkleLogProof from src chain to target chain and the src header.
// Typically, the user will use the source header to create and prepend
// a MerkleLogProof for some property of the source header.
//
// FIXME support scenario when source and target are the same chain (return empty proof)
//
export async function createChainwebProof(
  chainwebVersion: string,
  chainwebHost: string,
  src: ChainId,
  trg: ChainId,
  blockTag: ClBlockTag = 'latest',
): Promise<[MerkleLogProof, ClHeader]> {
  const path = d4k4ShortestPath(src, trg);
  let nextBlockTag = blockTag
  const proofs: MerkleLogProof[] = [];
  let hdr: ClHeader;
  let cid: ChainId = path.pop() as ChainId;
  while (path.length > 0) {
    // we traverse the path backwards
    hdr = await ClHeader.request(cid, chainwebVersion, chainwebHost, nextBlockTag);
    // Set cid to adjacent parent (next header)
    cid = path.pop() as ChainId;
    proofs.push(hdr.adjacentParentsProof(cid));
    nextBlockTag = hdr.adjacentParents[cid];
  }
  hdr = await ClHeader.request(cid, chainwebVersion, chainwebHost, nextBlockTag);
  return [MerkleLogProof.concat(proofs.reverse()), hdr];
}
