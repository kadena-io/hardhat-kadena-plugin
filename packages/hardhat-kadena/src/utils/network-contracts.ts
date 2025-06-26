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
  "0x346101535773ad9923c37370bcbcf00ed194506d8950848956965f9060209160c060e091610140946101609061018091609a9660e3360361014c575f359860203560f01c9360223560ea1c9860263560601c9a603a3599605a359b607a359a5f60db3560c01c9a03610145576004815f80739b02c3e2df42533e0fd166798b5a616f59dbd2cc5afa1561013e5751036101375760408593602060018580896080985f869c372086528181601f8601370191013760015afa1561013057510361012957602083918193720f3df6d732807ef1319fb7b8bb8522d0beac029082525afa1561012257510361011b5781548091038411610114575f84819482948284950190555af11561010d575f80f35b600a610157565b6009610157565b6008610157565b6007610157565b6006610157565b6005610157565b6004610157565b6003610157565b6002610157565b6001610157565b5f80fd5b5f5260205ffd";
export const REDEEM_ABI = [
  'function redeem(bytes memory proof, byte memory amount) public pure returns (uint32)',
];
export const REDEEM_BALANCE = "0xfffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff";
