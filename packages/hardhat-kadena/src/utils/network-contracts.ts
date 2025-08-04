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

export const VERIFY_ADDRESS = ethers.dataSlice(
  ethers.id('/Chainweb/KIP-34/VERIFY/SVP/'),
  12,
);
export const VERIFY_BYTE_CODE =
  '0x60203610601f5736601f1901806020608037806080205f3503601f576080f35b5f80fd';
export const VERIFY_ABI = [
  'function verify(bytes memory proof) public pure returns (bytes memory data)',
];

export const REDEEM_ADDRESS = ethers.dataSlice(
  ethers.id('/Chainweb/XChan/Redeem/'),
  12,
);
export const REDEEM_BYTE_CODE =
  '0x3461015c5773ad9923c37370bcbcf00ed194506d8950848956965f60409060c09060e090610140936101609061018091602097607a97609a9360e33603610155575f359a60203560f01c9560223560e01c9a60263560601c9c603a359b605a359d607a359c5f60db3560c01c9c0361014e576004739b02c3e2df42533e0fd166798b5a616f59dbd2cc5f80601c8501925afa15610147575103610140576020600160809584896040968c9a869c372086528181601f8601370191013760015afa1561013957510361013257602083918193720f3df6d732807ef1319fb7b8bb8522d0beac029082525afa1561012b575103610124578154809103841161011d575f84819482948284950190555af115610116575f80f35b600a610160565b6009610160565b6008610160565b6007610160565b6006610160565b6005610160565b6004610160565b6003610160565b6002610160565b6001610160565b5f80fd5b5f5260205ffd';
export const REDEEM_ABI = [
  'function redeem(bytes memory proof, byte memory amount) public pure returns (uint32)',
];
export const REDEEM_BALANCE =
  '0xfffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff';
