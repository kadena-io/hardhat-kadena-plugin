import { getBytes, keccak256, ethers, BigNumberish, BytesLike } from 'ethers';
import { uint16Le, uint32Le } from './utils';
import {
  MerkleHash,
  merkleNode,
  merkleRoot,
  createMerkleProof,
  runMerkleProof,
} from './merkle';

/* ************************************************************************** */
/* X-Channels */

export type ChainId = number;
export type Account = BytesLike;
export type XChanId = MerkleHash;

const VERSION = 0;

// 0 is reserved for the inner merkle tree nodes
const TagVersion = 1;
const TagTrgChain = 2;
const TagData = 3;
const TagPolicy = 4;

// This encoding is also used elsewhere throughout chainweb
function encodeChainId(chainId: ChainId): Uint8Array {
  return uint32Le(chainId);
}

function encodeVersion(version: number): Uint8Array {
  return uint16Le(version);
}

function encodeData(chainId: ChainId, nonce: BytesLike): BytesLike {
  const nonceBytes = getBytes(nonce);
  return ethers.concat([encodeChainId(chainId), nonceBytes]);
}

/* ************************************************************************** */
/* XChan Policy */

export class XChanPolicy {
  readonly type: number;
  readonly value: BytesLike;
  constructor(type: number, value: BytesLike) {
    this.type = type;
    this.value = value;
  }
  encode(): BytesLike {
    return ethers.concat([
      uint32Le(this.type),
      uint32Le(this.value.length),
      getBytes(this.value),
    ]);
  }
}

const PolicyTagTargetAccount = 0;

export class TargetAccountPolicy extends XChanPolicy {
  readonly account: Account;
  constructor(account: Account) {
    super(PolicyTagTargetAccount, getBytes(account));
    this.account = account;
  }
}

/* ************************************************************************** */
/* XChan */

// TODO: make the policy abstract
//
export class XChan {
  readonly targetChainId: ChainId;
  readonly targetAccounts: Account[];
  readonly sourceChainId: ChainId;
  readonly nonce: BytesLike;
  readonly xChanId: XChanId;
  constructor(
    targetChainId: ChainId,
    targetAccounts: Account[],
    sourceChainId: ChainId,
    nonce: BytesLike,
  ) {
    this.sourceChainId = sourceChainId;
    this.targetChainId = targetChainId;
    this.targetAccounts = targetAccounts;
    this.nonce = nonce;
    this.xChanId = this.root();
  }

  get address(): string {
    return ethers.getAddress(ethers.dataSlice(this.xChanId, 12));
  }

  root(): XChanId {
    const nodes = [
      merkleNode(TagVersion, encodeVersion(VERSION)),
      merkleNode(TagTrgChain, encodeChainId(this.targetChainId)),
      merkleNode(TagData, encodeData(this.sourceChainId, this.nonce)),
    ].concat(
      this.targetAccounts.map((account) =>
        merkleNode(TagPolicy, new TargetAccountPolicy(account).encode()),
      ),
    );
    return merkleRoot(nodes);
  }

  /* Create a proof for the xChan.
   *
   * THIS IS A MOCK IMPLEMENTATION FOR TESTING PURPOSES ONLY.
   *
   * The xChanBalance and proofRoot must be correct. This is not checked. The
   * root timestamp is not a requirement for soundness, however, proof
   * verification will fail if it is not correct.
   */
  createAuthorityProof(
    proverWallet: ethers.Wallet,
    targetAccount: Account,
    xChanBalance: BigNumberish,
    proofRoot: MerkleHash,
    rootTimestamp: number,
  ): BytesLike {
    // check that targetAccount is in the targetAccounts list
    if (!this.targetAccounts.includes(targetAccount)) {
      throw new Error(
        `Target account ${targetAccount} is not in the target accounts list`,
      );
    }

    // The proof uses an EVM specific encoding:
    const msg = ethers.concat([
      getBytes(ethers.toBeHex(VERSION, 2)),
      getBytes(ethers.toBeHex(this.targetChainId, 4)),
      getBytes(targetAccount),
      getBytes(ethers.toBeHex(xChanBalance, 32)),
      getBytes(this.xChanId),
      getBytes(proofRoot),
    ]);
    const digest = keccak256(getBytes(msg));

    const sig = proverWallet.signingKey.sign(digest);
    const proof = ethers.concat([
      msg,
      getBytes(ethers.toBeHex(sig.v, 1)),
      getBytes(sig.r),
      getBytes(sig.s),
      getBytes(ethers.toBeHex(rootTimestamp, 8)),
    ]);
    return proof;
  }

  createProof(targetAccount: Account): XChanProof {
    return XChanProof.create(this, targetAccount);
  }
}

/* ************************************************************************** */
/* XChan Proofs */

export class XChanProof {
  readonly version: number;
  readonly targetChain: ChainId;
  readonly policyIndex: number;
  readonly policy: XChanPolicy;
  readonly roots: MerkleHash[];

  private constructor(
    version: number,
    targetChain: ChainId,
    policyIndex: number,
    policy: XChanPolicy,
    roots: MerkleHash[],
  ) {
    this.version = version;
    this.targetChain = targetChain;
    this.policyIndex = policyIndex;
    this.policy = policy;
    this.roots = roots;
  }

  run(): XChanId {
    const leafs: [number, MerkleHash][] = [
      [0, merkleNode(TagVersion, encodeVersion(this.version))],
      [1, merkleNode(TagTrgChain, encodeChainId(this.targetChain))],
      [this.policyIndex, merkleNode(TagPolicy, this.policy.encode())],
    ];
    const root = runMerkleProof({
      roots: this.roots,
      leafs: leafs,
    });
    return root;
  }

  claim(): {
    version: number;
    targetChain: ChainId;
    policy: XChanPolicy;
  } {
    return {
      version: this.version,
      targetChain: this.targetChain,
      policy: this.policy,
    };
  }

  static create(xChan: XChan, targetAccount: Account): XChanProof {
    const acctIndex = xChan.targetAccounts.indexOf(targetAccount);
    if (acctIndex < 0) {
      throw new Error(
        `Target account ${targetAccount} is not in the target accounts list`,
      );
    }

    const leafs: [MerkleHash, boolean][] = [
      [merkleNode(TagVersion, encodeVersion(VERSION)), true],
      [merkleNode(TagTrgChain, encodeChainId(xChan.targetChainId)), true],
      [
        merkleNode(TagData, encodeData(xChan.sourceChainId, xChan.nonce)),
        false,
      ],
      ...xChan.targetAccounts.map(
        (account, i) =>
          [
            merkleNode(TagPolicy, new TargetAccountPolicy(account).encode()),
            i === acctIndex,
          ] as [MerkleHash, boolean],
      ),
    ];

    const [root, proofRoots] = createMerkleProof(leafs);
    if (root !== xChan.xChanId) {
      throw new Error(
        `XChanProof: root does not match xChanId. Expected ${xChan.xChanId}, got ${root}`,
      );
    }
    return new XChanProof(
      VERSION,
      xChan.targetChainId,
      3 + acctIndex, // +2 for the version and target chain, +1 for data
      new TargetAccountPolicy(targetAccount),
      proofRoots.roots,
    );
  }
}
