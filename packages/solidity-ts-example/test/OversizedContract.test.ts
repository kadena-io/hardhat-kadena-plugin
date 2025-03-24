import { expect } from 'chai';
import { ethers, chainweb } from 'hardhat';
import { OversizedContract } from '../typechain-types';

describe('OversizedContract Test', function () {
  it('Should deploy the oversized contract -- hardhat deployment', async function () {
    // This test should be successful if the contract is deployed on the hardhat network with allowUnlimitedContractSize set to true for hardhat
    const OversizedContract =
      await ethers.getContractFactory('OversizedContract');
    const oversized = await OversizedContract.deploy();
    await oversized.deploymentTransaction()?.wait();

    console.log('Contract deployed at:', await oversized.getAddress());
    console.log(
      'Deployment successful - allowUnlimitedContractSize is working properly',
    );
    const result = await oversized.function1();
    expect(result.length).to.equal(200);
  });

  it('Should deploy the oversized contract -- chainweb deployment', async function () {
    // This test should be successful if the contract is deployed on the chainweb network with allowUnlimitedContractSize set to true for chainweb hardhat

    const deployed = await chainweb.deployContractOnChains<OversizedContract>({
      name: 'OversizedContract',
    });
    console.log('deployed', deployed);
    console.log('deployed.deployments:', deployed.deployments);

    const contract0 = deployed.deployments[0].contract;

    console.log('Contract deployed at:', await contract0.getAddress());
    console.log(
      'Deployment successful - allowUnlimitedContractSize is working properly',
    );

    // Optional: Test a function to verify it works
    const result = await contract0.function1();
    expect(result.length).to.equal(200);
  });
});
