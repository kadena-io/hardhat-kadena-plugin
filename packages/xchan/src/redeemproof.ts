import { Account, ChainId, XChan, XChanPolicy, XChanProof } from './xchan'
import { BalanceProof } from './balanceproof'
import { stateRootProof } from './stateproof'
import {
  AddressLike,
  BytesLike,
  decodeRlp,
  Eip1193Provider,
  ethers,
  hexlify
} from 'ethers';
import { encode, TaggedValue, ToCBOR, } from 'cbor2';
import { MerkleLogProof } from './merklelog';
import { ClBlockTag } from './clheader';

export class RedeemClaim {
  readonly version: number;
  readonly targetChain: ChainId;
  readonly policy: XChanPolicy;
  readonly xchanRedeemAddress: AddressLike;
  readonly amount: bigint;

  private constructor(
    version: number,
    targetChain: ChainId,
    policy: XChanPolicy,
    xchanRedeemAddress: AddressLike,
    amount: bigint
  ) {
    this.version = version;
    this.targetChain = targetChain;
    this.policy = policy;
    this.xchanRedeemAddress = xchanRedeemAddress;
    this.amount = amount;
  }
  static create(redeemProof: RedeemProof): RedeemClaim {
    const xchanClaim = redeemProof.xchanProof.claim();

    // Extract the balance from the balance proof
    // A proof may provide a smaller value.
    const accountClaimNode = redeemProof.account.nodes[redeemProof.account.nodes.length - 1];
    const value = decodeRlp(accountClaimNode)[1];
    const balance = decodeRlp(value as BytesLike)[1];

    const redeemAddress = redeemProof.xchanProof.run()[1];

    return new RedeemClaim(
      xchanClaim.version,
      xchanClaim.targetChain,
      xchanClaim.policy,
      redeemAddress,
      BigInt("0x" + balance)
    );
  }
}

export class RedeemProof implements ToCBOR {
  readonly xchanProof: XChanProof;
  readonly account: BalanceProof;
  readonly stateRootProof: {
    trace: number;
    nodes: BytesLike[];
  };

  private constructor(
    xchanProof: XChanProof,
    accountProof: BalanceProof,
    stateRootProof: {
      trace: number;
      nodes: BytesLike[];
    },
  ) {
    this.xchanProof = xchanProof;

    // the address must match the send address of the xchan
    this.account = accountProof;

    // the state root must match the state root of the balance proof
    this.stateRootProof = stateRootProof
  }

  static create(
    xchanProof: XChanProof,
    balanceProof: BalanceProof,
    stateRootProof: MerkleLogProof,
  ): RedeemProof {
    // FIXME: run and check the proofs and the respective claims
    return new RedeemProof(
      xchanProof,
      balanceProof,
      stateRootProof,
    );
  }

  static async request(
    chainwebVersion: string,
    chainwebHost: string,
    provider: Eip1193Provider,
    xChan: XChan,
    targetAccount: Account,
    blockTag: ClBlockTag = 'latest'
  ): Promise<RedeemProof> {
    const [cwproof, elheader] = await stateRootProof(
      xChan.sourceChainId,
      xChan.targetChainId,
      chainwebVersion,
      chainwebHost,
      blockTag,
      provider
    );
    const cwproofRoot = cwproof.run()
    console.debug(`Got chainweb proof. leaf: ${hexlify(cwproof.leaf as Uint8Array)}, root: ${hexlify(cwproofRoot)}`);
    const xchanProof = xChan.createProof(targetAccount);
    const balanceProof = await BalanceProof.request(
      provider,
      xChan.sendAddress,
      elheader.number,
    );
    return RedeemProof.create(
      xchanProof,
      balanceProof,
      cwproof
    );
  }

  toCBOR(): TaggedValue | undefined {
    return [NaN, {
      xchanProof: this.xchanProof,
      accountProof: this.account,
      stateRootProof: {
        trace: this.stateRootProof.trace,
        nodes: this.stateRootProof.nodes.map((node) => ethers.getBytes(node)) as Uint8Array[],
      },
    }];
  }

  encodeCbor(): BytesLike {
    return encode(this);
  }
}