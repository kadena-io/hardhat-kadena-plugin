// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import '@openzeppelin/contracts/token/ERC20/ERC20.sol';
import '@openzeppelin/contracts/access/Ownable.sol';

/**
 * @title WrongOperationTypeToken
 * @author Kadena Team
 * @notice A simple ERC-20 token that can be transferred cross chain. This mock sets incorrect values for error testing.
 */
contract WrongOperationTypeToken is ERC20('SimpleToken', 'SIM'), Ownable {
  /// @notice The cross chain operation that is being performed
  enum CrossChainOperation {
    None,
    Erc20Transfer,
    Erc20TransferFrom
  }

  /**
   * @notice The Application data for a Simple ERC-20 transfer
   * @dev The members of the struct are operation-specific and are encoded to bytes
   */
  struct CrossChainData {
    address receiver;
    uint256 value;
  }

  /**
   * @notice The origin of a cross chain message
   * @dev  Returned as part of the CrossChainMessage from the precompile.
   */
  struct CrossChainOrigin {
    uint32 originChainId;
    address originContractAddress;
    uint64 originBlockHeight;
    uint64 originTransactionIndex;
    uint64 originEventIndex;
  }

  /// @notice Cross chain message data that is returned by the redeem precompile
  struct CrossChainMessage {
    uint32 targetChainId;
    address targetContractAddress;
    uint64 crossChainOperationType;
    bytes crossChainData;
    CrossChainOrigin origin;
  }

  /// @notice Precompile for verifying the SPV proof
  address public constant VALIDATE_PROOF_PRECOMPILE =
    address(uint160(uint256(keccak256('/Chainweb/KIP-34/VERIFY/SVP/'))));

  /// @notice Precompile that provides the chainweb-chain-id
  address public constant CHAIN_ID_PRECOMPILE =
    address(uint160(uint256(keccak256('/Chainweb/Chain/Id/'))));

  /// @notice Mapping of chainId to the address of the same contract on other chains
  mapping(uint32 => address) private crossChainAddresses;

  /// @notice Mapping of originHash to a boolean indicating if the transaction has been completed
  mapping(bytes32 => bool) public completed;

  /**
   * @notice Event emitted when tokens are transferred
   * @dev Emitted for any cross chain transaction
   */
  event CrossChainInitialized(
    uint32 indexed targetChainId,
    address indexed targetContractAddress,
    uint64 indexed crossChainOperationType,
    bytes crossChainData
  );

  /**
   * @notice Event emitted when a cross chain transaction is completed
   * @dev Emitted for any cross chain transaction
   */
  event CrossChainCompleted(
    uint64 crossChainOperationType,
    bytes crossChainData,
    CrossChainOrigin origin
  );

  /// @notice Event emitted when an address in authorized as a cross chain peer
  event CrossChainAddressSet(
    uint32 indexed chainId,
    address indexed crossChainAddress,
    address indexed executedBy
  );

  /// @notice Cross chain transaction initialization errors
  error TargetContractAddressNotFound(uint32 targetChainId);
  error InvalidReceiver(address invalidAddress);
  error InvalidAmount(uint256 invalidAmount);
  error TargetChainIsCurrentChain(uint32 currentChainId, uint32 targetChainId);

  /// @notice Cross chain transaction completion errors
  error IncorrectOperation(
    uint64 crossChainOperationType,
    uint64 expectedOperationType
  );
  error IncorrectTargetChainId(uint32 targetChainId, uint32 currentChainId);
  error IncorrectTargetContract(
    address targetContractAddress,
    address currentContractAddress
  );
  error OriginContractAddressNotFound(uint32 originChainId);
  error UnauthorizedOriginContract(
    address originContractAddress,
    address knownOriginContractAddress
  );
  error IncorrectReceiver(address crossChainReceiver, address receiver);
  error IncorrectAmount(uint256 crossChainValue, uint256 amount);

  /// @notice Other errors
  error SPVVerificationFailed();
  error AlreadyCompleted(bytes32 originHash);
  error ChainwebChainIdRetrievalFailed();
  error InvalidChainwebChainId();

  /**
   * @notice Constructor
   * @dev Sets caller as owner and mints the initial supply to owner
   * @param initialSupply The initial supply of the token
   */
  constructor(uint256 initialSupply) Ownable(msg.sender) {
    _mint(msg.sender, initialSupply);
  }

  /**
   * @notice Transfers tokens to a specific address on the given target chain
   * @dev Burns the tokens on the current chain and emits the CrossChainInitialized event
   * to initialize the cross chain transfer
   * @param to The address to which the tokens are to be transferred
   * @param amount The amount of tokens to be transferred
   * @param targetChainId The chainId of the target chain
   */
  function transferCrossChain(
    address to,
    uint256 amount,
    uint32 targetChainId
  ) external {
    require(to != address(0), InvalidReceiver(to));
    require(amount > 0, InvalidAmount(amount));

    address targetContract = getCrossChainAddress(targetChainId);
    require(
      targetContract != address(0),
      TargetContractAddressNotFound(targetChainId)
    );

    _burn(msg.sender, amount);

    CrossChainData memory cdata = CrossChainData({receiver: to, value: amount});

    // Emit the cross chain init event
    emit CrossChainInitialized(
      targetChainId,
      targetContract,
      uint64(CrossChainOperation.Erc20TransferFrom), // Incorrect operation type
      abi.encode(cdata)
    );
  }

  /**
   * @notice Redeems a cross chain transfer
   * @dev Mints the tokens on the current chain after verifying the SPV proof
   * and performing the necessary checks. Emits the CrossChainCompleted event
   * @param to The address to which the tokens are to be transferred
   * @param amount The amount of tokens to be transferred
   * @param proof The SPV proof
   */
  function redeemCrossChain(
    address to,
    uint256 amount,
    bytes calldata proof
  ) external {
    (
      CrossChainMessage memory crossChainMessage,
      bytes32 originHash
    ) = verifySPV(proof);

    uint32 cid = getChainwebChainId();

    require(
      crossChainMessage.crossChainOperationType ==
        uint64(CrossChainOperation.Erc20Transfer),
      IncorrectOperation(
        crossChainMessage.crossChainOperationType,
        uint64(CrossChainOperation.Erc20Transfer)
      )
    );

    require(
      crossChainMessage.targetChainId == cid,
      IncorrectTargetChainId(crossChainMessage.targetChainId, cid)
    );

    require(
      crossChainMessage.targetContractAddress == address(this),
      IncorrectTargetContract(
        crossChainMessage.targetContractAddress,
        address(this)
      )
    );

    address knownOriginContract = getCrossChainAddress(
      crossChainMessage.origin.originChainId
    );
    require(
      knownOriginContract != address(0),
      OriginContractAddressNotFound(crossChainMessage.origin.originChainId)
    );
    require(
      crossChainMessage.origin.originContractAddress == knownOriginContract,
      UnauthorizedOriginContract(
        crossChainMessage.origin.originContractAddress,
        knownOriginContract
      )
    );

    // Decode the message data:
    CrossChainData memory crossChainData = abi.decode(
      crossChainMessage.crossChainData,
      (CrossChainData)
    );

    require(
      crossChainData.receiver == to,
      IncorrectReceiver(crossChainData.receiver, to)
    );

    require(
      crossChainData.value == amount,
      IncorrectAmount(crossChainData.value, amount)
    );

    _mint(crossChainData.receiver, crossChainData.value);

    completed[originHash] = true;

    emit CrossChainCompleted(
      crossChainMessage.crossChainOperationType,
      crossChainMessage.crossChainData,
      crossChainMessage.origin
    );
  }

  /**
   * @notice Sets known cross chain contract address that is authorized to send and
   * receive transfers from this contract
   * @dev Should be this contract on the specified chain. Callable only by the owner
   * @param chainWebChainId The Chainweb chainId of the chain
   */
  function setCrossChainAddress(
    uint32 chainWebChainId,
    address crossChainAddress
  ) external onlyOwner {
    crossChainAddresses[chainWebChainId] = crossChainAddress;
    emit CrossChainAddressSet(chainWebChainId, crossChainAddress, msg.sender);
  }

  /**
   * @notice Verifies an SPV (Simplified Payment Verification) proof
   * @dev Calls the VALIDATE_PROOF_PRECOMPILE with the proof and returns the cross chain message
   * and the origin hash
   * @param proof The SPV proof
   * @return crossChainMessage The cross chain message data
   * @return originHash The hash of the origin data
   */
  function verifySPV(
    bytes memory proof
  )
    public
    view
    returns (CrossChainMessage memory crossChainMessage, bytes32 originHash)
  {
    (bool success, bytes memory data) = VALIDATE_PROOF_PRECOMPILE.staticcall(
      proof
    );
    require(success, SPVVerificationFailed());
    crossChainMessage = abi.decode(data, (CrossChainMessage));
    originHash = keccak256(abi.encode(crossChainMessage.origin));
    require(!completed[originHash], AlreadyCompleted(originHash));
  }

  /**
   * @notice Returns the Chainweb chain id
   * @dev Calls the CHAIN_ID_PRECOMPILE and returns the Chainweb chain id
   * @return cid The Chainweb chain id
   */
  function getChainwebChainId() public view returns (uint32 cid) {
    (bool success, bytes memory c) = CHAIN_ID_PRECOMPILE.staticcall('');
    require(success, ChainwebChainIdRetrievalFailed());
    require(c.length == 4, InvalidChainwebChainId());
    cid = uint32(bytes4(c));
  }

  /**
   * @notice Return sthe known cross chain contract address for the given Chainweb chain id
   * @param chainWebChainId The Chainweb chainId of the chain
   * @return crossChainAddress The address of the cross chain contract
   */
  function getCrossChainAddress(
    uint32 chainWebChainId
  ) public view returns (address) {
    return crossChainAddresses[chainWebChainId];
  }
}
