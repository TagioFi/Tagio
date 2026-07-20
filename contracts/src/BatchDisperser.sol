// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

/// @title BatchDisperser
/// @notice Stateless utility contract for paying many recipients from one signature --
/// giveaway/airdrop payouts, where HashtagResolver's PayoutConfig (tied to one hashtag's
/// pre-configured split) doesn't apply. The caller signs and pays their own gas, same as
/// any other TagioPay pending-transaction sign-off; this contract takes no fee and never
/// holds funds outside the single transaction that moves through it.
contract BatchDisperser is ReentrancyGuard {
    using SafeERC20 for IERC20;

    error EmptyRecipients();
    error ArrayLengthMismatch();
    error ZeroAddressRecipient();
    error IncorrectNativeValue();
    error NativeTransferFailed();

    event NativeDispersed(address indexed sender, uint256 recipientCount, uint256 totalAmount);
    event TokenDispersed(address indexed sender, address indexed token, uint256 recipientCount, uint256 totalAmount);

    /// @notice Sends native ETH to every recipient in one transaction. msg.value must
    /// equal the exact sum of `amounts` -- not "at least" -- so an over-sent value
    /// reverts the whole call instead of stranding the excess here.
    function disperseNative(address[] calldata recipients, uint256[] calldata amounts)
        external
        payable
        nonReentrant
    {
        if (recipients.length == 0) revert EmptyRecipients();
        if (recipients.length != amounts.length) revert ArrayLengthMismatch();

        uint256 total;
        for (uint256 i = 0; i < recipients.length; i++) {
            if (recipients[i] == address(0)) revert ZeroAddressRecipient();
            total += amounts[i];
        }
        if (msg.value != total) revert IncorrectNativeValue();

        for (uint256 i = 0; i < recipients.length; i++) {
            (bool ok,) = recipients[i].call{value: amounts[i]}("");
            if (!ok) revert NativeTransferFailed();
        }

        emit NativeDispersed(msg.sender, recipients.length, total);
    }

    /// @notice Sends a pre-approved ERC-20 to every recipient in one transaction.
    /// Caller must have approved this contract for at least the sum of `amounts`
    /// beforehand. Pulls the exact total, then pays out the exact per-recipient
    /// amounts -- nothing is ever left behind, by construction (no rounding step
    /// here unlike HashtagResolver's percentage-based payout splits).
    function disperseToken(address token, address[] calldata recipients, uint256[] calldata amounts)
        external
        nonReentrant
    {
        if (recipients.length == 0) revert EmptyRecipients();
        if (recipients.length != amounts.length) revert ArrayLengthMismatch();

        uint256 total;
        for (uint256 i = 0; i < recipients.length; i++) {
            if (recipients[i] == address(0)) revert ZeroAddressRecipient();
            total += amounts[i];
        }

        IERC20(token).safeTransferFrom(msg.sender, address(this), total);
        for (uint256 i = 0; i < recipients.length; i++) {
            IERC20(token).safeTransfer(recipients[i], amounts[i]);
        }

        emit TokenDispersed(msg.sender, token, recipients.length, total);
    }
}
