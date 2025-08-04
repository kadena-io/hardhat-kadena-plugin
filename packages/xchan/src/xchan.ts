import {
  getBytes,
  keccak256,
  ethers,
  BigNumberish,
  BytesLike,
  AddressLike,
  sha256,
} from 'ethers';
import { encode, TaggedValue, ToCBOR, } from 'cbor2';
import { toUint32Le, uint16Le, uint32Le } from './utils';
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
export type XRedeemAddress = AddressLike;
export type XSendAddress = AddressLike;

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

function sendAddress(xchanid: XChanId): AddressLike {
  const raw = sha256(ethers.concat([X_CHAN_ADDRESS_TAG, xchanid]));
  return ethers.getAddress(ethers.dataSlice(raw, 12));
}

function redeemAddress(xchanid: XChanId): AddressLike {
  const raw = sha256(ethers.concat([X_REDEEM_ADDRESS_TAG, xchanid]));
  return ethers.getAddress(ethers.dataSlice(raw, 12));
}

/* ************************************************************************** */
/* XChan Policy */

export class XChanPolicy {
  readonly type: number;
  readonly data: BytesLike;
  constructor(type: number, value: BytesLike) {
    this.type = type;
    this.data = value;
  }
  encode(): BytesLike {
    return ethers.concat([
      uint32Le(this.type),
      getBytes(this.data),
    ]);
  }
  static decode(data: BytesLike): XChanPolicy {
    const bytes = getBytes(data);
    if (bytes.length < 4) {
      throw new Error(`XChanPolicy: invalid data length ${bytes.length}`);
    }
    const type = toUint32Le(bytes.slice(0, 4));
    const value = bytes.slice(4);
    return new XChanPolicy(type, value);
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

const X_CHAN_ADDRESS_TAG = new Uint8Array([0x0]);
const X_REDEEM_ADDRESS_TAG = new Uint8Array([0x1]);

// TODO: make the policy abstract
//
export class XChan {
  readonly targetChainId: ChainId;
  readonly targetAccounts: Account[];
  readonly sourceChainId: ChainId;
  readonly nonce: BytesLike;

  // The xChanId is the root of the Merkle tree that of the channel properities.
  // It is considered confidential. The xChanAddress and xRedeemAddress are
  // derived from the xChanId and are public.
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

  get sendAddress(): AddressLike {
    return sendAddress(this.xChanId);
  }

  get redeemAddress(): AddressLike {
    return redeemAddress(this.xChanId);
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

export class XChanProof implements ToCBOR {
  readonly version: number;
  readonly targetChain: ChainId;
  readonly policyIndex: number;
  readonly policy: BytesLike;
  readonly nodes: MerkleHash[];

  private constructor(
    version: number,
    targetChain: ChainId,
    policyIndex: number,
    policy: BytesLike,
    nodes: MerkleHash[],
  ) {
    this.version = version;
    this.targetChain = targetChain;
    this.policyIndex = policyIndex;
    this.policy = policy;
    this.nodes = nodes;
  }

  run(): [XSendAddress, XRedeemAddress] {
    const leafs: [number, MerkleHash][] = [
      [0, merkleNode(TagVersion, encodeVersion(this.version))],
      [1, merkleNode(TagTrgChain, encodeChainId(this.targetChain))],
      [this.policyIndex, merkleNode(TagPolicy, this.policy)],
    ];
    const root = runMerkleProof({
      roots: this.nodes,
      leafs: leafs,
    });

    return [
      sendAddress(root),
      redeemAddress(root),
    ];
  }

  claim(): {
    version: number;
    targetChain: ChainId;
    policy: XChanPolicy;
  } {
    return {
      version: this.version,
      targetChain: this.targetChain,
      policy: XChanPolicy.decode(this.policy),
    };
  }

  encode(): BytesLike {
    return ethers.concat([
      encodeVersion(this.version),
      encodeChainId(this.targetChain),
      uint32Le(this.policyIndex),
      this.policy,
      ...this.nodes.map((root) => getBytes(root)),
    ]);
  }

  encodeCbor(): BytesLike {
    return encode(this);
  }

  toCBOR(): TaggedValue | undefined {
    return [NaN, {
      version: this.version as number,
      targetChain: this.targetChain as ChainId,
      policyIndex: this.policyIndex as number,
      policy: getBytes(this.policy) as Uint8Array,
      nodes: this.nodes.map((node) => getBytes(node)) as Uint8Array[],
    }];
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
      (new TargetAccountPolicy(targetAccount)).encode(),
      proofRoots.roots,
    );
  }
}
