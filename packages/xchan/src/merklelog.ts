import {
  getBytes,
  ethers,
  BytesLike,
  hexlify,
} from 'ethers';

import { sha512_256 } from '@noble/hashes/sha2.js';
import { rlpEncodeBytes, rlpEncodeInt, uint16Be, uint32Le, uint64Le } from './utils';
import { encode, TaggedValue, ToCBOR } from 'cbor2';

/* ************************************************************************** */
/* Chainweb Merkle Log */

// Provide evidence that a field in a EL or CL header is included in the the
// root hash of that or some successor header.
//
// The evidence is established by showing that the value of the field is
// included in the Merkle tree preimage of the root hash, through computing that
// root hash from from the value and auxiliary Merkle nodes.
//
// Creating the proof requires computing the Merkle tree and retaining the
// respective auxiliary nodes. The proof root is purposefully not included in
// the proof, because its computation is what establishes the the evidence.

// Merkle logs are balanced binary trees that are not necessarily full. Leafs
// are hashed from left to right. Node hashes tagged with the Merkle node type
// (leaf node or inner node). In a Chainweb Merkle log the content of leaf nodes
// is additionally tagged with the value type. No leaf content must be included
// into the tree without being tag with a the respective tag value from the 
// Chainweb Merkle Universe.
//
// A special case are leafs that represent subtrees. Those are included in the
// tree directly, which allows to create unbalanced trees.
//
// For EVM EL headers values are hashed in RLP encoding. Some fields have legacy
// status and are set to constant values since Ethereum abandoned PoW and
// switched to PoS.
//
// Chainweb CL headers use a custom binary encoding that is documented in the
// Chainweb-node Github wiki.

// EVM EL header legacy values:
//
// const EMPTY_NODE: BytesLike = "0x56e81f171bcc55a6ff8345e692c0f86e5b48e01b996cadc001622fb5e363b421";
// const KECCAK_EMPTY: BytesLike = "0xc5d2460186f7233c927e7db2dcc703c0e500b653ca82273b7bfad8045d85a470";
//
// Constant EVM EL header values:
// const ommersHash = ethers.keccak256(encodeRlp(""));
// const el_nonce = "0x0000000000000000";
// const el_difficulty = 0;
// const ommersHash_ = "0x1dcc4de8dec75d7aab85b567b6ccd41ad312451b948a7413f0a142fd40d49347";

/* ************************************************************************** */
/* Types */

export type MerkleLogRoot = Uint8Array;
export type MerkleLeafType = Uint8Array | number | bigint;

/* ************************************************************************** */
/* Chainweb Merkle Universe Tags */

export enum MerkleLogTag {

  // Chainweb Consensus Header
  ChainIdTag = 0x0002,
  BlockHeightTag = 0x0003,
  BlockWeightTag = 0x0004,
  BlockPayloadHashTag = 0x0005,
  FeatureFlagsTag = 0x0006,
  BlockCreationTimeTag = 0x0007,
  ChainwebVersionTag = 0x0008,
  PowHashTag = 0x0009,
  BlockHashTag = 0x0010,
  HashTargetTag = 0x0011,
  EpochStartTimeTag = 0x0019,
  BlockNonceTag = 0x0020,

  // Ethereum Execution Layer Header
  EthParentTag = 0x0040,
  EthOmmersTag = 0x0041,
  EthBeneficiaryTag = 0x0042,
  EthStateRootTag = 0x0043,
  EthTransactionsRootTag = 0x0044,
  EthReceiptsRootTag = 0x0045,
  EthBloomTag = 0x0046,
  EthDifficultyTag = 0x0047,
  EthBlockNumberTag = 0x0048,
  EthGasLimitTag = 0x0049,
  EthGasUsedTag = 0x004a,
  EthTimestampTag = 0x004b,
  EthExtraDataTag = 0x004c,
  EthRandaoTag = 0x004d,
  EthNonceTag = 0x004e,
  EthBaseFeePerGasTag = 0x004f,
  EthWithdrawalsRootTag = 0x0050,
  EthBlobGasUsedTag = 0x0051,
  EthExcessBlobGasTag = 0x0052,
  EthParentBeaconBlockRootTag = 0x0053,
  EthRequestsHashTag = 0x0055,
}

function isTreeTag(tag: MerkleLogTag): boolean {
  switch (tag) {
    case MerkleLogTag.BlockHashTag:
    case MerkleLogTag.BlockPayloadHashTag:
      return true;
    default:
      return false;
  }
}

// MerkleLog serialization for hashing of leafs
export function encodeMerkleLogLeaf(tag: MerkleLogTag, leaf: MerkleLeafType): Uint8Array {
  switch (tag) {
    // Consensus Header Tags
    case MerkleLogTag.BlockHashTag:
    case MerkleLogTag.BlockPayloadHashTag:
      return leaf as Uint8Array;
    case MerkleLogTag.ChainIdTag:
    case MerkleLogTag.ChainwebVersionTag:
      return uint32Le(leaf as number);
    case MerkleLogTag.BlockHeightTag:
    case MerkleLogTag.BlockCreationTimeTag:
    case MerkleLogTag.EpochStartTimeTag:
      return uint64Le(leaf as bigint | number);
    case MerkleLogTag.BlockWeightTag:
    case MerkleLogTag.PowHashTag:
    case MerkleLogTag.HashTargetTag:
    case MerkleLogTag.BlockNonceTag:
    case MerkleLogTag.FeatureFlagsTag:
      return getBytes(leaf as Uint8Array);

    // Ethereum Execution Layer Tags
    case MerkleLogTag.EthParentTag:
    case MerkleLogTag.EthOmmersTag:
    case MerkleLogTag.EthBeneficiaryTag:
    case MerkleLogTag.EthStateRootTag:
    case MerkleLogTag.EthTransactionsRootTag:
    case MerkleLogTag.EthReceiptsRootTag:
    case MerkleLogTag.EthBloomTag:
    case MerkleLogTag.EthExtraDataTag:
    case MerkleLogTag.EthRandaoTag:
    case MerkleLogTag.EthNonceTag:
    case MerkleLogTag.EthWithdrawalsRootTag:
    case MerkleLogTag.EthParentBeaconBlockRootTag:
    case MerkleLogTag.EthRequestsHashTag:
      return rlpEncodeBytes(leaf as Uint8Array);
    case MerkleLogTag.EthDifficultyTag:
    case MerkleLogTag.EthBlockNumberTag:
    case MerkleLogTag.EthGasLimitTag:
    case MerkleLogTag.EthGasUsedTag:
    case MerkleLogTag.EthTimestampTag:
    case MerkleLogTag.EthBaseFeePerGasTag:
    case MerkleLogTag.EthBlobGasUsedTag:
    case MerkleLogTag.EthExcessBlobGasTag:
      return rlpEncodeInt(leaf as bigint);
    default:
      throw new Error(`Unknown Merkle Log tag: ${tag}`);
  }
}

/* ************************************************************************** */
/* Merkle Log Tree */

const LEAF_NODE_TAG = 0x00;
const INNER_NODE_TAG = 0x01;

export function merkleLogLeaf(
  tag: MerkleLogTag,
  value: MerkleLeafType,
): Uint8Array {
  if (isTreeTag(tag)) {
    return getBytes(value as Uint8Array);
  } else {
    return sha512_256(getBytes(ethers.concat([
      new Uint8Array([LEAF_NODE_TAG]),
      uint16Be(tag),
      encodeMerkleLogLeaf(tag, value),
    ])));
  }
}

export function merkleLogNode(
  leftNode: BytesLike,
  rightNode: BytesLike,
): Uint8Array {
  return sha512_256(getBytes(ethers.concat([
    new Uint8Array([INNER_NODE_TAG]),
    getBytes(leftNode),
    getBytes(rightNode),
  ])));
}

export function merkleLogRoot(
  fields: [MerkleLogTag, MerkleLeafType][]
): Uint8Array {
  // traverse the fields of the block in order while integrating them into the
  // the Merkle tree.
  const stack: Uint8Array[] = [];
  for (const [i, [tag, leaf]] of fields.entries()) {
    stack.push(merkleLogLeaf(tag, leaf));
    let bits = i;
    // the second disjunct takes care of the last leafs in case that the
    // number of leafs is not a power of two.
    while ((bits % 2 === 1 || i === fields.length - 1) && stack.length > 1) {
      if (stack.length < 2) {
        throw new Error(`Empty stack while computing Merkle root: ${JSON.stringify(stack)}, ${bits}, ${i}`);
      }
      const rightNode = stack.pop() as Uint8Array
      const leftNode = stack.pop() as Uint8Array
      stack.push(merkleLogNode(leftNode, rightNode));
      bits = bits >> 1;
    }
  }
  if (stack.length !== 1) {
    throw new Error("Merkle tree should have exactly one root node");
  }
  return stack[0];
}

/* ************************************************************************** */
/* Merkle Log Proof */

export function merkleLogProof(
  fields: [MerkleLogTag, MerkleLeafType][],
  position: number
): [Uint8Array[], number] {
  const proof = [] as Uint8Array[];
  const stack: Uint8Array[] = [];
  for (const [i, [tag, leaf]] of fields.entries()) {
    stack.push(merkleLogLeaf(tag, leaf));
    // console.debug(`Processing field ${i}: tag=${tag}, node=${hexlify(stack[stack.length - 1])}`);

    let bits = i;
    let posBits = position;

    let level = 0;
    // take care of unbalanced trees
    while (i == fields.length - 1 && bits % 2 == 0 && bits + posBits > 0) {
      // console.debug(`    Last leaf: jump zero bit in trace`);
      bits = bits >> 1;
      posBits = posBits >> 1;
      level++;
    }
    if ((bits ^ posBits) == 1) {
      // console.debug(`    ==> trgBit: ${posBits}, bits: ${bits}, i: ${i}`);
      proof[level] = stack[stack.length - 1];
    }

    // the second disjunct takes care of the last leafs in case that the 
    // number of leafs is not a power of two.
    while ((bits % 2 === 1 || i === fields.length - 1) && stack.length > 1) {
      if (stack.length < 2) {
        throw new Error(`Empty stack while computing Merkle root: ${JSON.stringify(stack)}, ${bits}, ${i}`);
      }
      const rightNode = stack.pop() as Uint8Array;
      const leftNode = stack.pop() as Uint8Array;
      stack.push(merkleLogNode(leftNode, rightNode));
      // console.debug(`    Inner node: bits: ${bits}, trgBit: ${posBits}, stack size: ${hexlify(stack[stack.length - 1])}`);

      bits = bits >> 1;
      posBits = posBits >> 1;
      level++;
      // take care of unbalanced trees
      while (i == fields.length - 1 && bits % 2 == 0 && bits + posBits > 0) {
        // continue shifting bits until the last bit is 1
        bits = bits >> 1;
        posBits = posBits >> 1;
        level++;
      }
      if ((bits ^ posBits) == 1) {
        // console.log(`    ==> trgBit: ${posBits}, bits: ${bits}, i: ${i}`);
        proof[level] = stack[stack.length - 1];
      }
    }
  }
  if (stack.length !== 1) {
    throw new Error("Merkle tree should have exactly one root node");
  }
  // For unbalanced trees the proof may start at a level > 0 and may thus
  // contain fewer steps. We shift the proof array to accommodate for that.
  let trace = position;
  for (let i = 0; proof[i] === undefined; i++) {
    proof.shift();
    trace = trace >> 1;
  }
  console.debug(`Merkle log proof: position ${position}, root: ${hexlify(stack[0])}`);
  return [proof, trace];
}

/* ************************************************************************** */
/* Chainweb Merkle Log Proof */

export class MerkleLogProof implements ToCBOR {
  readonly tag: MerkleLogTag;
  readonly leaf: MerkleLeafType;
  readonly trace: number;
  readonly nodes: Uint8Array[];
  readonly rootTag: MerkleLogTag;
  private constructor(
    tag: MerkleLogTag,
    leaf: MerkleLeafType,
    trace: number,
    nodes: Uint8Array[],
    rootTag: MerkleLogTag,
  ) {
    this.tag = tag;
    this.leaf = leaf;
    this.trace = trace;
    this.nodes = nodes;
    this.rootTag = rootTag;
  }

  static create(
    fields: [MerkleLogTag, MerkleLeafType][],
    position: number,
    rootTag: MerkleLogTag,
  ): MerkleLogProof {
    const [tag, leaf] = fields[position];
    const [nodes, trace] = merkleLogProof(fields, position);
    return new MerkleLogProof(tag, leaf, trace, nodes, rootTag);
  }

  run(): MerkleLogRoot {
    console.debug(`merkleLogProof.run(). tag: ${this.tag}, leaf: ${hexlify(this.leaf as Uint8Array)}, trace: ${this.trace}, nodes: ${this.nodes.length}`);
    let cur = merkleLogLeaf(this.tag, this.leaf);
    let trace = this.trace;
    console.debug(`merkleLogProof.run(). cur: ${hexlify(cur)}, trace: ${trace.toString(16)}`);
    for (const node of this.nodes) {
      // 1: cur is right node, 0: cur is left node
      if (trace & 0x01) {
        cur = merkleLogNode(node, cur);
      } else {
        cur = merkleLogNode(cur, node);
      }
      console.debug(`merkleLogProof.run(). cur: ${hexlify(cur)}, trace: ${trace.toString(16)}`);
      trace = trace >> 1;
    }
    return cur;
  }

  toCBOR(): TaggedValue | undefined {
    return [NaN, {
      tag: this.tag,
      leaf: this.leaf,
      trace: this.trace,
      nodes: this.nodes,
      rootTag: this.rootTag,
    }];
  }

  encodeCbor(): Uint8Array {
    return encode(this.toCBOR());
  }

  appendUnchecked(other: MerkleLogProof): MerkleLogProof {
    if (this.rootTag !== other.tag) {
      throw new Error(`Cannot append MerkleProofs with non-matching tags: ${this.rootTag} !== ${other.tag}`);
    }
    const trace = this.trace | (other.trace << this.nodes.length);
    const nodes = [...this.nodes, ...other.nodes];
    const proof = new MerkleLogProof(this.tag, this.leaf, trace, nodes, other.rootTag);
    return proof;
  }

  append(other: MerkleLogProof): MerkleLogProof {
    const proof = this.appendUnchecked(other);
    if (hexlify(proof.run()) !== hexlify(other.run())) {
      console.debug(`MerkleProofs do not match:`);
      console.log(`first proof run: ${hexlify(proof.run())}`);
      console.log(`second proof leaf: ${hexlify(other.leaf as Uint8Array)}`);
      console.log(`second proof run: ${hexlify(other.run())}`);
      console.log(`combined proof run: ${hexlify(proof.run())}`);
      throw new Error(`MerkleProofs do not match. Combined root: ${hexlify(proof.run())}, other root ${hexlify(other.run())}`);
    }
    return proof;
  }

  static concat(proofs: MerkleLogProof[]): MerkleLogProof {
    if (proofs.length === 0) {
      throw new Error("Cannot concatenate empty MerkleLogProofs");
    }
    let result = proofs[0];
    for (let i = 1; i < proofs.length - 1; i++) {
      result = result.appendUnchecked(proofs[i]);
    }
    result = result.append(proofs[proofs.length - 1]);
    return result;
  }
}
