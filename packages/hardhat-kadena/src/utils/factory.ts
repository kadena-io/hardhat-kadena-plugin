import { HardhatRuntimeEnvironment } from "hardhat/types";
import { readFileSync } from "fs";
import { join } from "path";

export async function loadCreate2Factory(hre: HardhatRuntimeEnvironment) {
    const abiPath = join(__dirname, "../../artifacts/contracts/Create2Factory.sol/Create2Factory.abi");
    const binPath = join(__dirname, "../../artifacts/contracts/Create2Factory.sol/Create2Factory.bin");

    const abi = JSON.parse(readFileSync(abiPath, "utf8"));
    const bytecode = readFileSync(binPath, "utf8");

    // Pass the ABI array directly, not as an Interface
    return await hre.ethers.getContractFactory(abi, "0x" + bytecode);
}