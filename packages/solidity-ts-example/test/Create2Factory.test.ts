import { expect } from 'chai';
import { DeployedContractsOnChains } from '@kadena/hardhat-chainweb';
import { Signers } from './utils/utils';
import { ethers, chainweb } from 'hardhat';
import { BytesLike } from 'ethers';
import { getSigners } from './utils/utils';
import { SimpleToken } from '../typechain-types';
import { create2Address } from '@kadena/hardhat-chainweb/lib/utils';

const { deployContractOnChains, getChainIds } = chainweb;

describe('Create2Factory Tests', async function () {
  let deployments: DeployedContractsOnChains<SimpleToken>[];
  let initialSigners: Signers;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let constructorArgs: any[];
  let salt: BytesLike;

  before(async function () {
    const chains = await getChainIds();
    initialSigners = await getSigners(chains[0]); // get initialSigners for the first chain
    constructorArgs = [
      ethers.parseUnits('1000000'),
      initialSigners.deployer.address,
    ];
    salt = ethers.randomBytes(32);
  });

  it('Should have the correct CREATE2 factory', async function () {
    await chainweb.runOverChains(async () => {
      const code = await ethers.provider.getCode(
        '0x4e59b44847b379578588920ca78fbf26c0b4956c',
      );
      expect(code).to.equal(
        '0x7fffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffe03601600081602082378035828234f58015156039578182fd5b8082525050506014600cf3',
      );
    });
  });

  it('Should deploy the contracts with CREATE2', async function () {
    const deployed = await deployContractOnChains<SimpleToken>({
      name: 'SimpleToken',
      constructorArgs: constructorArgs,
      salt: salt,
    });
    deployments = deployed.deployments;
  });

  it('Should have deployed to the expected address', async function () {
    await chainweb.runOverChains(async (chainId: number) => {
      const deployment = deployments.find((d) => d.chain === chainId);
      const expectedAddress: string = await create2Address(
        'SimpleToken',
        constructorArgs,
        salt,
      );
      expect(deployment?.address).to.equal(expectedAddress);
    });
  });

  it('Should deploy to different address if salt is different', async function () {
    const deployed = await deployContractOnChains<SimpleToken>({
      name: 'SimpleToken',
      constructorArgs: constructorArgs,
      salt: ethers.randomBytes(32),
    });
    expect(deployed.deployments.length).to.equal(deployments.length);
    for (const deployment of deployed.deployments) {
      const originalDeployment = deployments.find(
        (d) => d.chain === deployment.chain,
      );
      expect(deployment.address).to.not.equal(originalDeployment?.address);
    }
  });

  it('Should deploy to different address if constructor args are different', async function () {
    const deployed = await deployContractOnChains<SimpleToken>({
      name: 'SimpleToken',
      constructorArgs: [
        ethers.parseUnits('2000000'),
        initialSigners.deployer.address,
      ],
      salt: salt,
    });
    expect(deployed.deployments.length).to.equal(deployments.length);
    for (const deployment of deployed.deployments) {
      const originalDeployment = deployments.find(
        (d) => d.chain === deployment.chain,
      );
      expect(deployment.address).to.not.equal(originalDeployment?.address);
    }
  });

  it('Should deploy to different address if code is different', async function () {
    const deployed = await deployContractOnChains<SimpleToken>({
      name: 'PayableContract',
      constructorArgs: [initialSigners.deployer.address],
      salt: salt,
    });
    expect(deployed.deployments.length).to.equal(deployments.length);
    for (const deployment of deployed.deployments) {
      const originalDeployment = deployments.find(
        (d) => d.chain === deployment.chain,
      );
      expect(deployment.address).to.not.equal(originalDeployment?.address);
    }
  });

  it('Should have the same address on all chains', async function () {
    const addressSet = new Set(
      deployments.map((deployment) => deployment.address),
    );
    expect(addressSet.size).to.equal(1);
  });

  it('Should have the correct configuration after deployment on all chains', async function () {
    await chainweb.runOverChains(async (chainId: number) => {
      const chainSigners = await getSigners(chainId);
      const deployment = deployments.find((d) => d.chain === chainId);

      expect(deployment).to.not.equal(undefined);
      expect(await deployment.contract.symbol()).to.equal('SIM');
      expect(await deployment.contract.name()).to.equal('SimpleToken');
      expect(await deployment.contract.totalSupply()).to.equal(
        ethers.parseEther('1000000'),
      );

      // Verify that the deployer address matches the chain-specific signer
      expect(deployment.deployer).to.equal(chainSigners.deployer.address);

      // Verify that the contract owner is the chain-specific deployer
      expect(await deployment.contract.owner()).to.equal(
        chainSigners.deployer.address,
      );

      // Verify that the deployer has the full initial supply on this chain
      expect(
        await deployment.contract.balanceOf(chainSigners.deployer.address),
      ).to.equal(ethers.parseEther('1000000'));
    });
  });
});
