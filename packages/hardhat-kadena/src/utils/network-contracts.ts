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

export const REDEEM_ADDRESS = ethers.dataSlice(
  ethers.id('/Chainweb/XChan/Redeem/'),
  12,
);
// TODO: build the contract at build time and import it here
export const REDEEM_BYTE_CODE =
  '0x5f356100096100f9565b610011610107565b60033561001c610115565b9260018414196100f557600535938060050135600682013594600783013591600884013593600481019261005260098301610123565b9660045f8080739b02c3e2df42533e0fd166798b5a616f59dbd2cc5afa156100f557815f5114196100f5575f5260015286600252806005600337600301528581525f20602052602152602252602352601460816041602060015afa156100f55773ad9923c37370bcbcf00ed194506d895084895696608151036100f557815480910380851490851017196100f5575f84819482948284950190555af1156100f557005b5f80fd5b600135908160101c6100f557565b600235908160201c6100f557565b600435908160101c6100f557565b35908160081c6100f55756';
export const REDEEM_ABI = [
  'function redeem(bytes memory proof) public pure returns (bytes memory data)',
];
