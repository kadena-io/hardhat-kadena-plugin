/* *************************************************************************** */
/* Network Constants */

import { ethers } from "ethers";

export const CHAIN_ID_BYTE_CODE = "0x5f545f526004601cf3";
export const CHAIN_ID_ADDRESS = ethers.dataSlice(
  ethers.id("/Chainweb/Chain/Id/"),
  12
);
export const CHAIN_ID_ABI = [
  "function chainwebChainId() view returns (uint32)",
];

// FIXME this address is at risk of conflicting with future Ethereum upgrades
// Instead uses something like address(keccak256("/Chainweb/KIP-34/VERIFY/SVP/"))
export const VERIFY_ADDRESS = "0x0000000000000000000000000000000000000421";
export const VERIFY_BYTE_CODE =
  "0x60203610601f5736601f1901806020608037806080205f3503601f576080f35b5f80fd";
export const VERIFY_ABI = [
  "function verify(bytes memory proof) public pure returns (bytes memory data)",
];
