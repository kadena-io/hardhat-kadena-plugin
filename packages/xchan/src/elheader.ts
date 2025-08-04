import {
  getBytes,
  ethers,
  BigNumberish,
  BytesLike,
  encodeRlp,
  BlockTag,
  keccak256,
  hexlify,
  Eip1193Provider,
} from 'ethers';
import {
  MerkleLeafType,
  MerkleLogProof,
  MerkleLogTag,
  encodeMerkleLogLeaf,
  merkleLogRoot
} from './merklelog';

/* ************************************************************************** */
/* EVM Execution Header */

export class ElHeader {
  readonly parentHash: Uint8Array;
  readonly sha3Uncles: Uint8Array;
  readonly miner: Uint8Array;
  readonly stateRoot: Uint8Array;
  readonly transactionsRoot: Uint8Array;
  readonly receiptsRoot: Uint8Array;
  readonly logsBloom: Uint8Array;
  readonly difficulty: bigint;
  readonly number: bigint;
  readonly gasLimit: bigint;
  readonly gasUsed: bigint;
  readonly timestamp: bigint;
  readonly extraData: Uint8Array;
  readonly prevRandao: Uint8Array;
  readonly nonce: Uint8Array;
  readonly baseFeePerGas: bigint;
  readonly withdrawalsRoot: Uint8Array;
  readonly blobGasUsed: bigint;
  readonly excessBlobGas: bigint;
  readonly parentBeaconBlockRoot: Uint8Array;
  readonly requestsHash: Uint8Array;

  // Not part of the Merkle tree
  readonly hash: Uint8Array;
  readonly payloadHash: Uint8Array;

  constructor(
    parentHash: BytesLike,
    sha3Uncles: BytesLike,
    miner: BytesLike,
    stateRoot: BytesLike,
    transactionsRoot: BytesLike,
    receiptsRoot: BytesLike,
    logsBloom: BytesLike,
    difficulty: BigNumberish,
    number: BigNumberish,
    gasLimit: BigNumberish,
    gasUsed: BigNumberish,
    timestamp: BigNumberish,
    extraData: BytesLike,
    prevRandao: BytesLike,
    nonce: BytesLike,
    baseFeePerGas: BigNumberish,
    withdrawalsRoot: BytesLike,
    blobGasUsed: BigNumberish,
    excessBlobGas: BigNumberish,
    parentBeaconBlockRoot: BytesLike,
    requestsHash: BytesLike,
    hash: Uint8Array | undefined = undefined,
    payloadHash: Uint8Array | undefined = undefined,
  ) {
    this.parentHash = getBytes(parentHash);
    this.sha3Uncles = getBytes(sha3Uncles);
    this.miner = getBytes(miner);
    this.stateRoot = getBytes(stateRoot);
    this.transactionsRoot = getBytes(transactionsRoot);
    this.receiptsRoot = getBytes(receiptsRoot);
    this.logsBloom = getBytes(logsBloom);
    this.difficulty = ethers.toBigInt(difficulty);
    this.number = ethers.toBigInt(number);
    this.gasLimit = ethers.toBigInt(gasLimit);
    this.gasUsed = ethers.toBigInt(gasUsed);
    this.timestamp = ethers.toBigInt(timestamp);
    this.extraData = getBytes(extraData);
    this.prevRandao = getBytes(prevRandao);
    this.nonce = getBytes(nonce); // legacy, always 0x0000000000000000 (bytes)
    this.baseFeePerGas = ethers.toBigInt(baseFeePerGas);
    this.withdrawalsRoot = getBytes(withdrawalsRoot);
    this.blobGasUsed = ethers.toBigInt(blobGasUsed);
    this.excessBlobGas = ethers.toBigInt(excessBlobGas);
    this.parentBeaconBlockRoot = getBytes(parentBeaconBlockRoot);
    this.requestsHash = getBytes(requestsHash);
    this.hash = this.computeHash();
    if (hash && hexlify(hash) !== hexlify(this.hash)) {
      console.warn(`Provided hash does not match computed hash: ${hexlify(hash)} !== ${hexlify(this.hash)}`);
    }
    this.payloadHash = this.computePayloadHash();
    if (payloadHash && hexlify(payloadHash) !== hexlify(this.payloadHash)) {
      console.warn(`Provided payload hash does not match computed payload hash: ${hexlify(payloadHash)} !== ${hexlify(this.payloadHash)}`);
    }
  }

  // static async request(provider: JsonRpcApiProvider, block: BlockTag | string = "latest"): Promise<ElHeader> {
  static async request(
    provider: Eip1193Provider,
    block: BlockTag | string = "latest"
  ): Promise<ElHeader> {
    const arg = typeof block === 'string' ? block : ethers.toBeHex(block);
    const rpcBlock = await provider.request({
      method: 'eth_getBlockByNumber', params: [arg, false]
    }).then((block) => {
      if (!block) {
        throw new Error(`Block not found: ${block}`);
      }
      return block;
    });
    console.debug(`Got EL header. height: ${rpcBlock.number}, hash: ${hexlify(rpcBlock.hash)}, stateRoot: ${hexlify(rpcBlock.stateRoot)}`);

    return new ElHeader(
      rpcBlock.parentHash,
      rpcBlock.sha3Uncles,
      rpcBlock.miner,
      rpcBlock.stateRoot,
      rpcBlock.transactionsRoot,
      rpcBlock.receiptsRoot,
      rpcBlock.logsBloom,
      rpcBlock.difficulty,
      rpcBlock.number,
      rpcBlock.gasLimit,
      rpcBlock.gasUsed,
      rpcBlock.timestamp,
      rpcBlock.extraData,
      rpcBlock.mixHash, // prevRandao
      rpcBlock.nonce,
      rpcBlock.baseFeePerGas,
      rpcBlock.withdrawalsRoot,
      rpcBlock.blobGasUsed,
      rpcBlock.excessBlobGas,
      rpcBlock.parentBeaconBlockRoot,
      rpcBlock.requestsHash,
      rpcBlock.hash
    );
  }

  private computePayloadHash(): Uint8Array {
    return merkleLogRoot(this.merkleFields());
  }

  private computeHash(): Uint8Array {
    const fields: Uint8Array[] = this.merkleFields().map(([tag, leaf]) =>
      encodeMerkleLogLeaf(tag, leaf)
    );
    console.debug(`Computing hash for fields: ${fields.map(f => hexlify(f))}`);
    const rlp = encodeRlp(fields);
    console.debug(`RLP encoded fields: ${hexlify(rlp)}`);
    const hash = getBytes(keccak256(rlp));
    console.debug(`Computed hash: ${hexlify(hash)}`);
    return hash;
  }

  private merkleFields(): [MerkleLogTag, MerkleLeafType][] {
    return [
      [MerkleLogTag.EthParentTag, this.parentHash],
      [MerkleLogTag.EthOmmersTag, this.sha3Uncles], // ommersHash, legacy, always keccak256(RLP(""))
      [MerkleLogTag.EthBeneficiaryTag, this.miner], // TODO: is this the same as the beneficiary?
      [MerkleLogTag.EthStateRootTag, this.stateRoot],
      [MerkleLogTag.EthTransactionsRootTag, this.transactionsRoot],
      [MerkleLogTag.EthReceiptsRootTag, this.receiptsRoot],
      [MerkleLogTag.EthBloomTag, this.logsBloom],
      [MerkleLogTag.EthDifficultyTag, this.difficulty], // legacy, always 0 (quantity)
      [MerkleLogTag.EthBlockNumberTag, this.number],
      [MerkleLogTag.EthGasLimitTag, this.gasLimit],
      [MerkleLogTag.EthGasUsedTag, this.gasUsed],
      [MerkleLogTag.EthTimestampTag, this.timestamp],
      [MerkleLogTag.EthExtraDataTag, this.extraData],
      [MerkleLogTag.EthRandaoTag, this.prevRandao],
      [MerkleLogTag.EthNonceTag, this.nonce], // legacy, always 0x0000000000000000 (bytes)
      [MerkleLogTag.EthBaseFeePerGasTag, this.baseFeePerGas],
      [MerkleLogTag.EthWithdrawalsRootTag, this.withdrawalsRoot],
      [MerkleLogTag.EthBlobGasUsedTag, this.blobGasUsed],
      [MerkleLogTag.EthExcessBlobGasTag, this.excessBlobGas],
      [MerkleLogTag.EthParentBeaconBlockRootTag, this.parentBeaconBlockRoot],
      [MerkleLogTag.EthRequestsHashTag, this.requestsHash],
    ];
  }

  public stateRootProof(): MerkleLogProof {
    return MerkleLogProof.create(
      this.merkleFields(),
      0x03,
      MerkleLogTag.BlockPayloadHashTag
    );
  }
}
