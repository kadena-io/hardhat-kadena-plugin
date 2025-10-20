import { AddressLike, BytesLike, ethers, TransactionResponse } from 'ethers';

/* ************************************************************************** */
/* Chainweb ChainID Contract */

export const CHAIN_ID_BYTE_CODE = '0x5f545f526004601cf3';
export const CHAIN_ID_ADDRESS = ethers.dataSlice(
  ethers.id('/Chainweb/Chain/Id/'),
  12,
);
export const CHAIN_ID_ABI = [
  'function chainwebChainId() view returns (uint32)',
];

/* ************************************************************************** */
/* Create2 Factory Contract */

export const CREATE2_FACTORY_ADDRESS =
  '0x4e59b44847b379578588920ca78fbf26c0b4956c';
export const CREATE2_FACTORY_CODE =
  '0x7fffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffe03601600081602082378035828234f58015156039578182fd5b8082525050506014600cf3';

export async function callCreate2Factory(
  provider: ethers.Provider,
  salt: BytesLike,
  bytecode: BytesLike,
  constructorArgs: BytesLike,
  create2FactoryAddress: string,
): Promise<AddressLike> {
  const address = await provider.call({
    to: create2FactoryAddress,
    data: ethers.concat([salt, bytecode, constructorArgs]),
  });
  return ethers.getAddress(address);
}

export async function sendCreate2Factory(
  provider: ethers.Signer,
  salt: BytesLike,
  bytecode: BytesLike,
  constructorArgs: BytesLike,
): Promise<TransactionResponse> {
  const tx = await provider.sendTransaction({
    to: CREATE2_FACTORY_ADDRESS,
    data: ethers.concat([salt, bytecode, constructorArgs]),
  });
  return tx;
}

/* ************************************************************************** */
/* Chainweb KIP-34 Contract (Deprecated) */

export const VERIFY_ADDRESS = ethers.dataSlice(
  ethers.id('/Chainweb/KIP-34/VERIFY/SVP/'),
  12,
);
export const VERIFY_BYTE_CODE =
  '0x60203610601f5736601f1901806020608037806080205f3503601f576080f35b5f80fd';
export const VERIFY_ABI = [
  'function verify(bytes memory proof) public pure returns (bytes memory data)',
];
