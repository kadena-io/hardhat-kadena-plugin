import fs from 'fs';
import path from 'path';

export const CREATE2_PROXY_ADDRESS = '0x4e59b44847b379578588920ca78fbf26c0b4956c';


// Read CREATE2 proxy bytecode from artifacts
const CREATE2_PROXY_BYTECODE = '0x' + fs.readFileSync(
    path.join(__dirname, '../../artifacts/contracts/deterministic-deployment-proxy.yul/Proxy/bytecode.txt'),
    'utf8'
).trim();

// Constants for CREATE2 deployment
export const CREATE2 = {
    BYTECODE: CREATE2_PROXY_BYTECODE,
    ABI: ['function deploy(bytes32 salt, bytes memory code) returns (address)'] as const,
    ADDRESS: CREATE2_PROXY_ADDRESS
} as const;