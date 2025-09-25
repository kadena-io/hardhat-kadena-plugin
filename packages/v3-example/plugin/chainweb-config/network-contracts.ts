/* *************************************************************************** */
/* Network Constants */

import { ethers } from 'ethers';

// TODO: build the contract at build time and import it here
export const CHAIN_ID_BYTE_CODE = '0x5f545f526004601cf3';
// the main branch uses the static address so I commented out the dynamic one
export const CHAIN_ID_ADDRESS = ethers.dataSlice(
  ethers.id('/Chainweb/Chain/Id/'),
  12,
);
export const CHAIN_ID_ABI = [
  'function chainwebChainId() view returns (uint32)',
];

// FIXME this address is at risk of conflicting with future Ethereum upgrades
// Instead uses something like address(keccak256("/Chainweb/KIP-34/VERIFY/SVP/"))
export const VERIFY_ADDRESS = ethers.dataSlice(
  ethers.id('/Chainweb/KIP-34/VERIFY/SVP/'),
  12,
);
// TODO: build the contract at build time and import it here
export const VERIFY_BYTE_CODE =
  '0x60203610601f5736601f1901806020608037806080205f3503601f576080f35b5f80fd';
export const VERIFY_ABI = [
  'function verify(bytes memory proof) public pure returns (bytes memory data)',
];
