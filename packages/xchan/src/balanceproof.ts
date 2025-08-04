import {
  getBytes,
  ethers,
  BigNumberish,
  BytesLike,
  BlockTag,
  AddressLike,
  Eip1193Provider,
  toBeHex,
} from 'ethers';
import { encode, TaggedValue, ToCBOR, } from 'cbor2';

/* ************************************************************************** */
/* Ethereum AccountStorage Proofs */

export class AccountStorageProof implements ToCBOR {
  readonly nonce: BigNumberish;
  readonly balance: BigNumberish;
  readonly address: BytesLike;
  readonly codeHash: BytesLike;
  readonly storageHash: BytesLike;
  readonly accountProof: BytesLike[];
  readonly storageProof: BytesLike[];

  private constructor(
    nonce: BigNumberish,
    balance: BigNumberish,
    address: BytesLike,
    codeHash: BytesLike,
    storageHash: BytesLike,
    accountProof: BytesLike[],
    storageProof: BytesLike[],
  ) {
    this.nonce = nonce;
    this.balance = balance;
    this.address = address;
    this.codeHash = codeHash;
    this.storageHash = storageHash;
    this.accountProof = accountProof;
    this.storageProof = storageProof;
  }

  static async request(
    provider: Eip1193Provider,
    address: AddressLike,
    block: BlockTag | string = "latest"
  ): Promise<AccountStorageProof> {
    const arg = typeof block === 'string' ? block : toBeHex(block);
    const result = await provider.request({
      method: 'eth_getProof',
      params: [address, [], arg],
    });
    console.debug(`Got account proof. Address: ${address}, block: ${arg}`);
    return new AccountStorageProof(
      result.nonce,
      result.balance,
      result.address,
      result.codeHash,
      result.storageHash,
      result.accountProof,
      result.storageProof,
    );
  }

  toCBOR(): TaggedValue | undefined {
    return [NaN, {
      nonce: this.nonce as bigint,
      balance: this.balance as bigint,
      address: getBytes(this.address) as Uint8Array,
      codeHash: getBytes(this.codeHash) as Uint8Array,
      storageHash: getBytes(this.storageHash) as Uint8Array,
      accountProof: this.accountProof.map((hex) => getBytes(hex)) as Uint8Array[],
      storageProof: this.storageProof.map((hex) => getBytes(hex)) as Uint8Array[],
    }];
  }

  encodeCbor(): BytesLike {
    return encode(this);
  }
}

/* ************************************************************************** */
/* Ethereum AccountStorage Proofs */

export class AccountProof implements ToCBOR {
  readonly nonce: BigNumberish;
  readonly balance: BigNumberish;
  readonly address: BytesLike;
  readonly codeHash: BytesLike;
  readonly storageHash: BytesLike;
  readonly accountProof: BytesLike[];

  private constructor(
    nonce: BigNumberish,
    balance: BigNumberish,
    address: BytesLike,
    codeHash: BytesLike,
    storageHash: BytesLike,
    accountProof: BytesLike[],
  ) {
    this.nonce = nonce;
    this.balance = balance;
    this.address = address;
    this.codeHash = codeHash;
    this.storageHash = storageHash;
    this.accountProof = accountProof;
  }

  static fromAccountProof(accountProof: AccountStorageProof): AccountProof {
    return new AccountProof(
      accountProof.nonce,
      accountProof.balance,
      accountProof.address,
      accountProof.codeHash,
      accountProof.storageHash,
      accountProof.accountProof,
    );
  }

  static async request(
    provider: Eip1193Provider,
    address: AddressLike,
    block: ethers.BlockTag | string
  ): Promise<AccountProof> {
    const accountProof = await AccountStorageProof.request(provider, address, block);
    return AccountProof.fromAccountProof(accountProof);
  }

  toCBOR(): TaggedValue | undefined {
    return [NaN, {
      nonce: this.nonce as bigint,
      balance: this.balance as bigint,
      address: getBytes(this.address) as Uint8Array,
      codeHash: getBytes(this.codeHash) as Uint8Array,
      storageHash: getBytes(this.storageHash) as Uint8Array,
      accountProof: this.accountProof.map((hex) => getBytes(hex)) as Uint8Array[],
    }];
  }

  encodeCbor(): BytesLike {
    return encode(this);
  }
}

/* ************************************************************************** */
/* Ethereum AccountStorage Proofs */

export class BalanceProof implements ToCBOR {
  readonly nodes: BytesLike[];

  private constructor(nodes: BytesLike[]) {
    this.nodes = nodes;
  }

  static fromAccountStorageProof(accountProof: AccountStorageProof): BalanceProof {
    return new BalanceProof(accountProof.accountProof);
  }

  static async request(
    provider: Eip1193Provider,
    address: AddressLike,
    block: ethers.BlockTag | string,
  ): Promise<BalanceProof> {
    const accountProof = await AccountStorageProof.request(provider, address, block);
    return BalanceProof.fromAccountStorageProof(accountProof);
  }

  toCBOR(): TaggedValue | undefined {
    return [NaN, {
      nodes: this.nodes.map((hex) => getBytes(hex)) as Uint8Array[]
    }];
  }

  encodeCbor(): BytesLike {
    return encode(this);
  }
}