import { expect } from 'chai';
import { BytesLike, getBytes } from 'ethers';
import {
    TargetAccountPolicy,
    XChan,
    XChanProof,
} from '../src/xchan';
import { encode } from 'cbor2';

/* ************************************************************************** */
/* Utils */

// flip a bit in a BytesLike value
function flipBit(value: BytesLike, bitIndex: number): BytesLike {
    const byteArray = getBytes(value);
    const byteIndex = Math.floor(bitIndex / 8);
    const bitPosition = bitIndex % 8;
    byteArray[byteIndex] ^= 1 << bitPosition;
    return byteArray;
}

const accounts: { [name: string]: { address: BytesLike } } = {
    alice: { address: '0x8849BAbdDcfC1327Ad199877861B577cEBd8A7b6' },
    bob: { address: '0xFB8Fb7f9bdc8951040a6D195764905138F7462Ed' },
    charlie: { address: '0x92f60275a4585348Cb43f5F0Bc90dF6b932fe8F7' },
};

type XChanProofData = {
    version: number;
    targetChain: number;
    policyIndex: number;
    policy: BytesLike;
    nodes: string[];
};

/* ************************************************************************** */
/* Specs */

describe('XChan', () => {
    // let xchan: XChan;

    it('Should create an XChan', async function () {
        const xChan = new XChan(
            0,
            [accounts.alice.address, accounts.bob.address],
            1,
            '0xaabb',
        );
        expect(xChan).to.be.an.instanceOf(XChan);
        console.log('XChan ID:', xChan.xChanId);
    });

    it('Should have the correct XChan ID', async function () {
        const xChan = new XChan(
            0,
            [accounts.alice.address, accounts.bob.address],
            1,
            '0x00ff00ff',
        );
        // the exptected value was computed with the Haskell reference implementation
        expect(xChan.xChanId).to.equal(
            '0xfdb24aa043b8d58759a20039cbbbae1305e222636e81f8864f778d43dcf8f11b'
        );
    });

    it('Should have the correct addresses', async function () {
        const xChan = new XChan(
            0,
            [accounts.alice.address, accounts.bob.address],
            1,
            '0x00ff00ff',
        );
        expect(xChan.sendAddress).to.equal(
            '0xcbbBAE1305e222636e81F8864F778D43dCf8f11b'
        );
    });

    it('Should create an XChan for different numbers of target acconts', async function () {
        const xChan0 = new XChan(0, [], 1, '0x00ff00ff');
        expect(xChan0.targetAccounts).to.deep.equal([]);
        const xChan1 = new XChan(0, [accounts.alice.address], 1, '0x00ff00ff');
        expect(xChan1.targetAccounts).to.deep.equal([accounts.alice.address]);
        const xChan2 = new XChan(
            0,
            [accounts.alice.address, accounts.bob.address],
            1,
            '0x00ff00ff',
        );
        expect(xChan2.targetAccounts).to.deep.equal([
            accounts.alice.address,
            accounts.bob.address,
        ]);
        const xChan3 = new XChan(
            0,
            [accounts.alice.address, accounts.bob.address, accounts.charlie.address],
            1,
            '0x00ff00ff',
        );
        expect(xChan3.targetAccounts).to.deep.equal([
            accounts.alice.address,
            accounts.bob.address,
            accounts.charlie.address,
        ]);
    });

    it('Should have different IDs for different XChan parameters', async function () {
        const xChan = new XChan(
            0,
            [accounts.alice.address, accounts.bob.address],
            1,
            '0x00ff00ff',
        );

        const xChan1 = new XChan(
            0,
            [flipBit(accounts.alice.address, 10), accounts.bob.address],
            1,
            '0x00ff00ff',
        );
        const xChan2 = new XChan(
            0,
            [accounts.alice.address, flipBit(accounts.bob.address, 11)],
            1,
            '0x00ff00ff',
        );
        const xChan3 = new XChan(
            1,
            [accounts.alice.address, accounts.bob.address],
            1,
            '0x00ff00ff',
        );
        const xChan4 = new XChan(
            0,
            [accounts.alice.address, accounts.bob.address],
            2,
            '0x00ff00ff',
        );
        const xChan5 = new XChan(
            0,
            [accounts.alice.address, accounts.bob.address],
            1,
            '0x00ffa0ff',
        );

        expect(xChan.xChanId).to.not.equal(xChan1.xChanId);
        expect(xChan.xChanId).to.not.equal(xChan2.xChanId);
        expect(xChan.xChanId).to.not.equal(xChan3.xChanId);
        expect(xChan.xChanId).to.not.equal(xChan4.xChanId);
        expect(xChan.xChanId).to.not.equal(xChan5.xChanId);
    });

    it('Should have different IDs for different order of target accounts', async function () {
        const xChan = new XChan(
            0,
            [accounts.alice.address, accounts.bob.address],
            1,
            '0x00ff00ff',
        );
        const xChan1 = new XChan(
            0,
            [accounts.bob.address, accounts.alice.address],
            1,
            '0x00ff00ff',
        );
        expect(xChan.xChanId).to.not.equal(xChan1.xChanId);
    });

    it('Should have different IDs for different numbers of target accounts', async function () {
        const xChan = new XChan(
            0,
            [accounts.alice.address, accounts.bob.address],
            1,
            '0x00ff00ff',
        );
        const xChan1 = new XChan(
            0,
            [accounts.alice.address, accounts.bob.address, accounts.charlie.address],
            1,
            '0x00ff00ff',
        );
        const xChan2 = new XChan(0, [accounts.alice.address], 1, '0x00ff00ff'); // only one target account
        expect(xChan.xChanId).to.not.equal(xChan1.xChanId);
        expect(xChan.xChanId).to.not.equal(xChan2.xChanId);
    });

    it('Should create a proof for the first target account XChan', async function () {
        const xChan = new XChan(
            0,
            [accounts.alice.address, accounts.bob.address],
            1,
            '0x00ff00ff',
        );
        const proof0 = xChan.createProof(accounts.alice.address);
        expect(proof0).to.be.an('object');
    });

    it('Should create a proof for the second target account XChan', async function () {
        const xChan = new XChan(
            0,
            [accounts.alice.address, accounts.bob.address],
            1,
            '0x00ff00ff',
        );
        const proof1 = xChan.createProof(accounts.bob.address);
        expect(proof1).to.be.an('object');
    });

    it('Should fail to create a proof for an invalid targetAccount', async function () {
        const xChan = new XChan(
            0,
            [accounts.alice.address, accounts.bob.address],
            1,
            '0x00ff00ff',
        );
        expect(() => xChan.createProof(accounts.charlie.address)).to.throw(
            `Target account ${accounts.charlie.address} is not in the target accounts list`,
        );
    });
});

describe('XChanProof', () => {

    it('Should encode an XChanProof in CBOR encoding', async function () {
        const xChan = new XChan(
            1,
            [accounts.alice.address, accounts.bob.address, accounts.charlie.address],
            1,
            '0x00ff00ff',
        );
        console.log('XChan:', xChan);
        console.log('XChan ID:', xChan.xChanId);
        const proof = xChan.createProof(accounts.bob.address);
        const encoded = proof.encodeCbor();
        console.log(`Encoded XChanProof: ${Buffer.from(encoded).toString('hex')}`);
    });

    it('Should encode an Account proof in CBOR encoding', async function () {
        const accountProofJson: BytesLike[] = [
            "0xf901d180a0877ee7c9984df3ce50db4c12e164210e68f32a1f28cdf9b74663941cfba04feea0d34054c4810211ecc68c5a743827967c980a849a11c1c4527e58d9c7ab9002b2a0e4b7d78b2dfc12bb2821110a1598ecabe53d651bf8b98849c88cc1ad61225639a03047fde65ce273ea8b8ef557d709e14ccd4751c532e036adf3a16fc522f5296fa075b85c285998f51bff6fa60daac164708fc3f046899de3bdbd161fc698c7e058a03ee0433046d7261d40b49bc56e0b79622f9163df45ac6aff763ff93b25d0b45da0c8c7f52c7a55e97bcce29930d4d2a08e75ba07754d30b8b29abe64225a84f9f680a02842b7bdf8d78e85cb1719c6a9957bdafd3a1dba575f998216a19083c0dd4e28a042bc1252ea988c66b86889e984145c0b9f89548e5c17dbbe6a77d5c6a38b30d3a0708a1c1a0a29017f406243b31aebab68df3245c60b9973f1055349932a128e96a0c19e14cd09988ff562c0f90ea084398c34ed7f8b58e252337738afc3c7a648b6a005d3234fa0922dec8bcacab1536c6c24fc62ba6013761d1ac3521a01d8a90a85a08934c1f5b886b4f1ff6f2d4e348f45a18c7bfd3608b984ea56d75581a47a110ca00cbee0b296219d854bb686d568f22827594a963242c2178aef26501350ba77ac80",
            "0xf871a0fcedc553a858c990a7ce8d778b769f691e148f38f3a38f54caee1de2f9a2f5218080a0aaaf58c0f2cccea4769016ae36aec761e2d9ed9fb45cbaa2b165833aae800bcd808080808080a0bf138ad383ef5d6a0d4a100bde7db6eee6dd6715c9238d9d1ae0813b9dd2c22f808080808080",
            "0xf871a02088e0d01bfe490171d34bfc97ba8b972988708141f9a338ac5aaccd55a04abeb84ef84c8088f9ccd8a1c5080000a056e81f171bcc55a6ff8345e692c0f86e5b48e01b996cadc001622fb5e363b421a0c5d2460186f7233c927e7db2dcc703c0e500b653ca82273b7bfad8045d85a470"
        ];
        const accountProof: Uint8Array[] = accountProofJson.map((hex) => getBytes(hex));
        const encoded = encode(accountProof);
        console.log(`Encoded AccountProof: ${Buffer.from(encoded).toString('hex')}`);
    });

    it('Should have the expected claim', async function () {
        const xChan = new XChan(
            0,
            [accounts.alice.address, accounts.bob.address],
            1,
            '0x00ff00ff',
        );
        const proof = xChan.createProof(accounts.bob.address);
        const claim = proof.claim();
        expect(claim).to.be.an('object');
        expect(claim.version).to.equal(0);
        expect(claim.targetChain).to.equal(0);
        expect(claim.policy).to.deep.equal(
            new TargetAccountPolicy(accounts.bob.address),
        );
    });

    it('Running the proof for one account should return the XChan Id', async function () {
        const xChan = new XChan(0, [accounts.alice.address], 1, '0x00ff00ff');
        const proof = xChan.createProof(accounts.alice.address);
        const result = proof.run();
        expect(result).to.equal(xChan.xChanId);
    });

    it('Running the proofs for two accounts should return the XChan Id', async function () {
        const xChan = new XChan(
            0,
            [accounts.alice.address, accounts.bob.address],
            1,
            '0x00ff00ff',
        );

        const proof0 = xChan.createProof(accounts.alice.address);
        const result0 = proof0.run();
        expect(result0).to.equal(xChan.xChanId);

        const proof1 = xChan.createProof(accounts.bob.address);
        const result1 = proof1.run();
        expect(result1).to.equal(xChan.xChanId);
    });

    it('Running the proofs for three accounts should return the XChan Id', async function () {
        const xChan = new XChan(
            0,
            [accounts.alice.address, accounts.bob.address, accounts.charlie.address],
            1,
            '0x00ff00ff',
        );

        const proof0 = xChan.createProof(accounts.alice.address);
        const result0 = proof0.run();
        expect(result0).to.equal(xChan.xChanId);

        const proof1 = xChan.createProof(accounts.bob.address);
        const result1 = proof1.run();
        expect(result1).to.equal(xChan.xChanId);

        const proof2 = xChan.createProof(accounts.charlie.address);
        const result2 = proof2.run();
        expect(result2).to.equal(xChan.xChanId);
    });

    it('Tampering with target chain should cause running the proof to return an invalid XChan ID', async function () {
        const xChan = new XChan(0, [accounts.alice.address], 1, '0x00ff00ff');
        const proof = xChan.createProof(accounts.alice.address) as XChanProofData;
        proof.targetChain = 1;
        const result = (proof as XChanProof).run();
        expect(result).to.not.equal(xChan.xChanId);
    });

    it('Tampering with version should cause running the proof to return an invalid XChan ID', async function () {
        const xChan = new XChan(0, [accounts.alice.address], 1, '0x00ff00ff');
        const proof = xChan.createProof(accounts.alice.address) as XChanProofData;
        proof.version = 1;
        const result = (proof as XChanProof).run();
        expect(result).to.not.equal(xChan.xChanId);
    });

    it('Tampering with policy index should cause running the proof to return an invalid XChan ID', async function () {
        const xChan = new XChan(0, [accounts.alice.address], 1, '0x00ff00ff');
        const proof = xChan.createProof(accounts.alice.address) as XChanProofData;
        proof.policyIndex = 2; // tamper with the policy index
        const result = (proof as XChanProof).run();
        expect(result).to.not.equal(xChan.xChanId);
    });

    it('Tampering with policy should cause running the proof to return an invalid XChan ID', async function () {
        const xChan = new XChan(0, [accounts.alice.address], 1, '0x00ff00ff');
        const proof = xChan.createProof(accounts.alice.address) as XChanProofData;
        proof.policy = (new TargetAccountPolicy(accounts.bob.address)).encode(); // tamper with the policy
        const result = (proof as XChanProof).run();
        expect(result).to.not.equal(xChan.xChanId);
    });

    it('Tampering with proof roots should cause running the proof to return an invalid XChan ID', async function () {
        const xChan = new XChan(0, [accounts.alice.address], 1, '0x00ff00ff');
        const proof = xChan.createProof(accounts.alice.address);
        proof.nodes[0] = flipBit(proof.nodes[0], 10); // tamper with the proof
        const result = proof.run();
        expect(result).to.not.equal(xChan.xChanId);
    });
});
