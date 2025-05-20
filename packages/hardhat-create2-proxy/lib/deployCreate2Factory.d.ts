import { Signer } from 'ethers';
import { Create2Helpers } from './type';
export declare const create2Artifacts: {
    abi: ({
        anonymous: boolean;
        inputs: {
            indexed: boolean;
            internalType: string;
            name: string;
            type: string;
        }[];
        name: string;
        type: string;
        outputs?: undefined;
        stateMutability?: undefined;
    } | {
        inputs: {
            internalType: string;
            name: string;
            type: string;
        }[];
        name: string;
        outputs: {
            internalType: string;
            name: string;
            type: string;
        }[];
        stateMutability: string;
        type: string;
        anonymous?: undefined;
    })[];
    bin: string;
};
export declare const getCreate2FactoryAddress: Create2Helpers['getCreate2FactoryAddress'];
export declare function deriveSecondaryKey(signer: Signer, version?: number | bigint): Promise<{
    publicKey: string;
    privateKey: string;
}>;
export declare const deployCreate2Factory: Create2Helpers['deployCreate2Factory'];
//# sourceMappingURL=deployCreate2Factory.d.ts.map