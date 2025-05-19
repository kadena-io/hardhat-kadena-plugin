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
});
