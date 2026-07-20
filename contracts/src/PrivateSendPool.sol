// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

/// @title PrivateSendPool
/// @notice Wave 7 -- shields the sender's identity from the *recipient*
/// (confirmed 2026-07-20): the recipient's wallet only ever shows an incoming
/// transfer from this contract, never the sender's own address. This is
/// practical/casual privacy, not cryptographic anonymity -- a sophisticated
/// chain-analysis observer could still potentially correlate a send and a
/// later claim by timing and amount, since both transactions are fully
/// public. Genuine unlinkability needs real cryptographic mixing (zk
/// commitment/nullifier schemes), which is explicitly out of scope here.
///
/// `send`/`sendToken` deposit funds keyed by an opaque `commitment` --
/// nowhere in that call's calldata does the recipient's address appear.
/// TagioPay's backend computes `commitment = keccak256(secret, recipient,
/// address(this), block.chainid)` off-chain and only ever reveals `secret`
/// later, in a separate `claim` transaction: either its own keeper claims on
/// the recipient's behalf (the common path -- the recipient's wallet never
/// signs anything, it just receives), or the recipient signs `claim`
/// themselves via the manual $claim fallback. Binding `recipient` into the
/// commitment means `claim` is safe to leave permissionless: anyone who
/// observes `secret` in the mempool (e.g. racing the keeper) can at most
/// steal `keeperFeeWei` for themselves by calling first -- the payout itself
/// always goes to the address the commitment was bound to at send time, so
/// the recipient's funds can never be redirected.
///
/// `keeperFeeWei` is always native ETH, regardless of what `token` the send
/// itself is in (confirmed 2026-07-20) -- the keeper's own gas cost is
/// always paid in ETH, so a fee denominated in whatever token was sent would
/// leave a USDG-send's fee unable to replenish the keeper's actual gas
/// float. Paying the fee in ETH always means every successful claim tops
/// the keeper back up in the one currency it actually spends.
contract PrivateSendPool is ReentrancyGuard {
    using SafeERC20 for IERC20;

    struct Allocation {
        address token; // address(0) = native ETH; this is what `amount` is denominated in
        uint256 amount; // paid to the bound recipient on claim, in `token`
        uint256 keeperFeeWei; // paid to whoever calls claim(), always native ETH
        bool claimed;
    }

    error ZeroAmount();
    error AlreadyExists();
    error NotFound();
    error AlreadyClaimed();
    error InvalidSecret();
    error IncorrectNativeValue();
    error NativeTransferFailed();

    event Sent(bytes32 indexed commitment, address indexed token, uint256 amount, uint256 keeperFeeWei);
    event Claimed(
        bytes32 indexed commitment,
        address indexed recipient,
        address indexed claimer,
        uint256 amount,
        uint256 keeperFeeWei
    );

    mapping(bytes32 => Allocation) public allocations;

    /// @notice Deposits native ETH under `commitment`. `msg.value` must cover
    /// `amount + keeperFeeWei` -- both are ETH here, so the split is provided
    /// explicitly since the contract can't otherwise tell how much of
    /// msg.value is the transfer vs. the fee.
    function send(bytes32 commitment, uint256 amount, uint256 keeperFeeWei) external payable nonReentrant {
        if (allocations[commitment].amount != 0) revert AlreadyExists();
        if (amount == 0) revert ZeroAmount();
        if (msg.value != amount + keeperFeeWei) revert IncorrectNativeValue();

        allocations[commitment] = Allocation({token: address(0), amount: amount, keeperFeeWei: keeperFeeWei, claimed: false});
        emit Sent(commitment, address(0), amount, keeperFeeWei);
    }

    /// @notice Deposits an ERC-20 token under `commitment`, plus the ETH
    /// keeper fee alongside it. Caller must have approved this contract for
    /// at least `amount` of `token` beforehand; `msg.value` must exactly
    /// equal `keeperFeeWei` (paid separately in ETH, never in `token`).
    function sendToken(bytes32 commitment, address token, uint256 amount, uint256 keeperFeeWei)
        external
        payable
        nonReentrant
    {
        if (allocations[commitment].amount != 0) revert AlreadyExists();
        if (amount == 0) revert ZeroAmount();
        if (msg.value != keeperFeeWei) revert IncorrectNativeValue();

        IERC20(token).safeTransferFrom(msg.sender, address(this), amount);
        allocations[commitment] = Allocation({token: token, amount: amount, keeperFeeWei: keeperFeeWei, claimed: false});
        emit Sent(commitment, token, amount, keeperFeeWei);
    }

    /// @notice Pays `amount` (in `token`) to `recipient` and `keeperFeeWei`
    /// (always native ETH) to `msg.sender`. `secret` must satisfy
    /// `keccak256(abi.encodePacked(secret, recipient, address(this),
    /// block.chainid)) == commitment` -- proof, revealed only by TagioPay's
    /// backend, that `recipient` is who this allocation was really meant for.
    function claim(bytes32 commitment, address recipient, bytes32 secret) external nonReentrant {
        Allocation storage allocation = allocations[commitment];
        if (allocation.amount == 0) revert NotFound();
        if (allocation.claimed) revert AlreadyClaimed();
        if (keccak256(abi.encodePacked(secret, recipient, address(this), block.chainid)) != commitment) {
            revert InvalidSecret();
        }

        allocation.claimed = true;
        uint256 amount = allocation.amount;
        uint256 feeWei = allocation.keeperFeeWei;

        if (allocation.token == address(0)) {
            if (amount > 0) {
                (bool ok,) = recipient.call{value: amount}("");
                if (!ok) revert NativeTransferFailed();
            }
        } else {
            if (amount > 0) IERC20(allocation.token).safeTransfer(recipient, amount);
        }

        if (feeWei > 0) {
            (bool ok,) = msg.sender.call{value: feeWei}("");
            if (!ok) revert NativeTransferFailed();
        }

        emit Claimed(commitment, recipient, msg.sender, amount, feeWei);
    }

    function getAllocation(bytes32 commitment) external view returns (Allocation memory) {
        return allocations[commitment];
    }
}
