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
  "0x3460f15773ad9923c37370bcbcf00ed194506d8950848956965f9060209160c060e0916101409361016090609a9560e3360360eb575f359760ea6022351c9660606026351c98603635976056359960c060d7351c986004815f80739b02c3e2df42533e0fd166798b5a616f59dbd2cc5afa1560e557510360df5760408593602060018580896080985f869c372086528181601f8601370191013760015afa1560d957510360d357528154809103841160cd575f84819482948284950190555af11560c7575f80f35b600960f5565b600860f5565b600560f5565b600460f5565b600360f5565b600260f5565b600160f5565b5f80fd5b5f5260205ffd";
export const REDEEM_ABI = [
  'function redeem(bytes memory proof, byte memory amount) public pure returns (uint32)',
];
export const REDEEM_BALANCE = "0xfffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff";
