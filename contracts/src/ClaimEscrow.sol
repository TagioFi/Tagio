// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {ECDSA} from "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import {MessageHashUtils} from "@openzeppelin/contracts/utils/cryptography/MessageHashUtils.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

/// @title ClaimEscrow
/// @notice Holds funds sent to an X account that hasn't linked a TagioPay wallet
/// yet, tagged by a hash of their X user id (never the raw id, so no X-identifying
/// data sits in plain contract storage). Deposits are permissionless -- anyone can
/// fund an allocation, same as any other TagioPay payment path. Claiming requires a
/// signature from TagioPay's backend attestor confirming the caller's wallet is the
/// one that just linked that X account. The attestor never holds funds and can't
/// redirect a balance anywhere except to the exact wallet address it signed for --
/// it only ever authorizes "this wallet is who it says it is"; this contract does
/// the actual, permissionless holding and paying out.
contract ClaimEscrow is Ownable, ReentrancyGuard {
    using SafeERC20 for IERC20;
    using ECDSA for bytes32;
    using MessageHashUtils for bytes32;

    error ZeroAmount();
    error ZeroAddress();
    error InvalidSignature();
    error NothingToClaim();
    error NativeTransferFailed();

    event NativeDeposited(bytes32 indexed xUserIdHash, uint256 amount);
    event TokenDeposited(bytes32 indexed xUserIdHash, address indexed token, uint256 amount);
    event NativeClaimed(bytes32 indexed xUserIdHash, address indexed claimant, uint256 amount);
    event TokenClaimed(bytes32 indexed xUserIdHash, address indexed token, address indexed claimant, uint256 amount);
    event AttestorUpdated(address indexed newAttestor);

    address public attestor;

    mapping(bytes32 => uint256) public nativeBalanceOf;
    mapping(bytes32 => mapping(address => uint256)) public tokenBalanceOf;

    constructor(address _attestor, address initialOwner) Ownable(initialOwner) {
        if (_attestor == address(0)) revert ZeroAddress();
        attestor = _attestor;
    }

    /// @notice Funds a native-ETH allocation for `xUserIdHash`. Permissionless --
    /// matches every other TagioPay payment path (no custody, no gatekeeping on
    /// who can send). Multiple deposits accumulate.
    function depositNative(bytes32 xUserIdHash) external payable {
        if (msg.value == 0) revert ZeroAmount();
        nativeBalanceOf[xUserIdHash] += msg.value;
        emit NativeDeposited(xUserIdHash, msg.value);
    }

    /// @notice Funds a token allocation. Caller must have approved this contract
    /// for at least `amount` beforehand.
    function depositToken(bytes32 xUserIdHash, address token, uint256 amount) external {
        if (amount == 0) revert ZeroAmount();
        IERC20(token).safeTransferFrom(msg.sender, address(this), amount);
        tokenBalanceOf[xUserIdHash][token] += amount;
        emit TokenDeposited(xUserIdHash, token, amount);
    }

    /// @notice Sweeps the full native balance owed to `xUserIdHash` to the caller.
    /// `signature` must be the attestor's signature over (xUserIdHash, msg.sender,
    /// address(this), block.chainid) -- proof from TagioPay's backend that
    /// msg.sender is the wallet that linked this X account. Safe to call again
    /// later if more gets deposited after an earlier claim; reverts instead of
    /// silently paying 0 if nothing is currently owed.
    function claimNative(bytes32 xUserIdHash, bytes calldata signature) external nonReentrant {
        _verifyAttestation(xUserIdHash, signature);

        uint256 amount = nativeBalanceOf[xUserIdHash];
        if (amount == 0) revert NothingToClaim();
        nativeBalanceOf[xUserIdHash] = 0;

        (bool ok,) = msg.sender.call{value: amount}("");
        if (!ok) revert NativeTransferFailed();

        emit NativeClaimed(xUserIdHash, msg.sender, amount);
    }

    function claimToken(bytes32 xUserIdHash, address token, bytes calldata signature) external nonReentrant {
        _verifyAttestation(xUserIdHash, signature);

        uint256 amount = tokenBalanceOf[xUserIdHash][token];
        if (amount == 0) revert NothingToClaim();
        tokenBalanceOf[xUserIdHash][token] = 0;

        IERC20(token).safeTransfer(msg.sender, amount);
        emit TokenClaimed(xUserIdHash, token, msg.sender, amount);
    }

    function _verifyAttestation(bytes32 xUserIdHash, bytes calldata signature) private view {
        bytes32 messageHash =
            keccak256(abi.encodePacked(xUserIdHash, msg.sender, address(this), block.chainid)).toEthSignedMessageHash();
        if (messageHash.recover(signature) != attestor) revert InvalidSignature();
    }

    function setAttestor(address _attestor) external onlyOwner {
        if (_attestor == address(0)) revert ZeroAddress();
        attestor = _attestor;
        emit AttestorUpdated(_attestor);
    }
}
