import { expect } from 'chai';
import { ethers, chainweb } from 'hardhat';
import { HardhatEthersSigner } from '@nomicfoundation/hardhat-ethers/signers';
import { PayableContract__factory } from '../typechain-types';

describe('PayableContract with Create2Factory', function () {
  let signers: HardhatEthersSigner[];
  let deployer: HardhatEthersSigner;

  before(async function () {
    signers = await ethers.getSigners();
    deployer = signers[0];

    // Deploy the Create2Factory if not already deployed
    await chainweb.create2.deployCreate2Factory();
  });

  describe('Deployment with value', function () {
    it('Should receive native token when deployed with value', async function () {
      // Amount of native token to send during deployment
      const valueToSend = ethers.parseEther('1.0');

      // Deploy the contract using Create2Factory with value in overrides
      const deployedContracts = await chainweb.create2.deployUsingCreate2({
        name: 'PayableContract',
        constructorArgs: [],
        salt: ethers.id('test-deployment-with-value'),
        overrides: { value: valueToSend },
      });

      // Test the contract on each chain
      for (const deployment of deployedContracts.deployments) {
        const chain = deployment.chain;
        const contractAddress = deployment.address;

        // Switch to the correct chain
        await chainweb.switchChain(chain);

        // Create a contract instance
        const contract = PayableContract__factory.connect(
          contractAddress,
          deployer,
        );

        // Verify the contract received the expected amount
        const balance = await contract.getBalance();
        expect(balance).to.equal(valueToSend);

        // Verify the constructorValue tracked internally matches
        const constructorValue = await contract.constructorValue();
        expect(constructorValue).to.equal(valueToSend);
      }
    });

    it('Should accurately track different values on different deployments', async function () {
      // Two different amounts to test with
      const value1 = ethers.parseEther('0.1');
      const value2 = ethers.parseEther('0.5');

      // First deployment with value1
      const deployedContracts1 = await chainweb.create2.deployUsingCreate2({
        name: 'PayableContract',
        constructorArgs: [],
        salt: ethers.id('test-deployment-1'),
        overrides: { value: value1 },
      });

      // Second deployment with value2
      const deployedContracts2 = await chainweb.create2.deployUsingCreate2({
        name: 'PayableContract',
        constructorArgs: [],
        salt: ethers.id('test-deployment-2'),
        overrides: { value: value2 },
      });

      // Test the contract on each chain
      for (const deployment of deployedContracts1.deployments) {
        const chain = deployment.chain;
        const contractAddress = deployment.address;

        // Switch to the correct chain
        await chainweb.switchChain(chain);

        // Create a contract instance
        const contract = PayableContract__factory.connect(
          contractAddress,
          deployer,
        );

        expect(await contract.getBalance()).to.equal(value1);
        expect(await contract.constructorValue()).to.equal(value1);
      }

      for (const deployment of deployedContracts2.deployments) {
        const chain = deployment.chain;
        const contractAddress = deployment.address;

        // Switch to the correct chain
        await chainweb.switchChain(chain);

        // Create a contract instance
        const contract = PayableContract__factory.connect(
          contractAddress,
          deployer,
        );

        expect(await contract.getBalance()).to.equal(value2);
        expect(await contract.constructorValue()).to.equal(value2);
      }
    });
  });

  describe('Deployment with different admin addresses', function () {
    let deployer1: HardhatEthersSigner;
    let deployer2: HardhatEthersSigner;
    let valueToSend: bigint;
    let create2FactoryAddress: string;

    beforeEach(async function () {
      const [first, second] = await ethers.getSigners();
      deployer1 = first;
      deployer2 = second;
      valueToSend = ethers.parseEther('0.1');

      // Deploy a fresh factory for each test
      [create2FactoryAddress] = await chainweb.create2.deployCreate2Factory();
    });

    it('Should produce different addresses when deployed with different admin addresses using the same salt', async function () {
      const salt = ethers.id('same-salt-different-admins');

      // Deploy first contract with deployer1 as admin
      const deployedContracts1 = await chainweb.create2.deployUsingCreate2({
        name: 'PayableContract',
        constructorArgs: [deployer1.address],
        overrides: { value: valueToSend },
        salt: salt,
        create2Factory: create2FactoryAddress,
        signer: deployer1,
      });

      // Deploy second contract with deployer2 as admin
      const deployedContracts2 = await chainweb.create2.deployUsingCreate2({
        name: 'PayableContract',
        constructorArgs: [deployer2.address],
        overrides: { value: valueToSend },
        salt: salt,
        create2Factory: create2FactoryAddress,
        signer: deployer2,
      });

      // Verify the addresses are different
      expect(deployedContracts1.deployments.length).to.be.greaterThan(0);
      expect(deployedContracts2.deployments.length).to.be.greaterThan(0);

      for (let i = 0; i < deployedContracts1.deployments.length; i++) {
        const chain = deployedContracts1.deployments[i].chain;
        const address1 = deployedContracts1.deployments[i].address;

        // Find the matching chain in the second deployment
        const matchingDeployment = deployedContracts2.deployments.find(
          d => d.chain === chain
        );

        if (matchingDeployment) {
          const address2 = matchingDeployment.address;

          console.log(`Chain ${chain}: Deployer1 contract address: ${address1}`);
          console.log(`Chain ${chain}: Deployer2 contract address: ${address2}`);

          // Check that addresses are different
          expect(address1).to.not.equal(address2,
            `Contract addresses should be different when deployed with different admin addresses`);

          // Switch to the correct chain
          await chainweb.switchChain(chain);

          // Verify admin roles are correctly assigned
          const contract1 = PayableContract__factory.connect(
            address1,
            deployer1
          );
          expect(await contract1.hasRole(
            await contract1.DEFAULT_ADMIN_ROLE(),
            deployer1.address
          )).to.be.true;

          const contract2 = PayableContract__factory.connect(
            address2,
            deployer2
          );
          expect(await contract2.hasRole(
            await contract2.DEFAULT_ADMIN_ROLE(),
            deployer2.address
          )).to.be.true;
        }
      }
    });
  });
});
