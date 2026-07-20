// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

/// @title SimpleEscrow
/// @notice Generic Create -> Accept -> Deliver -> Release escrow for TagioPay's
/// Wave 6 -- freelance work is the motivating case, but any bilateral "I pay once
/// you deliver" agreement fits the same four states. No on-chain dispute/jury
/// system in v1 (confirmed 2026-07-20): if a counterparty won't deliver, the
/// creator's funds sit idle until the deliver deadline passes and they refund
/// themselves; if a creator won't release after real delivery, the counterparty
/// can force-release after a grace window. Neither is real dispute resolution --
/// they're just timers -- but they stop either side from holding funds hostage
/// indefinitely without needing a jury.
contract SimpleEscrow is ReentrancyGuard {
    using SafeERC20 for IERC20;

    enum Status {
        None,
        Created,
        Accepted,
        Delivered,
        Released,
        Cancelled
    }

    struct Escrow {
        address creator;
        address counterparty;
        address token; // address(0) = native ETH
        uint256 amount;
        string description;
        Status status;
        uint256 deliverDeadline; // set on accept(); creator can refund after this if still Accepted
        uint256 releaseDeadline; // set on deliver(); counterparty can force-release after this if still Delivered
        string proofUrl;
    }

    // Not specified in the original spec -- reasonable defaults, flagged in
    // tech-updates.md as an open item to revisit. 7 days matches the
    // original "Deadline: 7 days" example exactly.
    uint256 public constant DELIVER_WINDOW = 7 days;
    uint256 public constant RELEASE_GRACE = 3 days;

    error ZeroAddress();
    error ZeroAmount();
    error EscrowNotFound();
    error NotCreator();
    error NotCounterparty();
    error WrongStatus();
    error DeliverDeadlineNotPassed();
    error ReleaseDeadlineNotPassed();
    error IncorrectNativeValue();
    error UnexpectedNativeValue();
    error NativeTransferFailed();

    event EscrowCreated(uint256 indexed escrowId, address indexed creator, address indexed counterparty, uint256 amount, address token, string description);
    event EscrowAccepted(uint256 indexed escrowId, uint256 deliverDeadline);
    event EscrowDelivered(uint256 indexed escrowId, string proofUrl, uint256 releaseDeadline);
    event EscrowReleased(uint256 indexed escrowId, bool forced);
    event EscrowCancelled(uint256 indexed escrowId, bool expired);

    uint256 public escrowCount;
    mapping(uint256 => Escrow) public escrows;

    modifier onlyCreator(uint256 escrowId) {
        if (escrows[escrowId].creator == address(0)) revert EscrowNotFound();
        if (msg.sender != escrows[escrowId].creator) revert NotCreator();
        _;
    }

    modifier onlyCounterparty(uint256 escrowId) {
        if (escrows[escrowId].creator == address(0)) revert EscrowNotFound();
        if (msg.sender != escrows[escrowId].counterparty) revert NotCounterparty();
        _;
    }

    /// @notice Creator funds the escrow immediately on creation.
    function create(address counterparty, uint256 amount, address token, string calldata description)
        external
        payable
        nonReentrant
        returns (uint256 escrowId)
    {
        if (counterparty == address(0)) revert ZeroAddress();
        if (amount == 0) revert ZeroAmount();

        if (token == address(0)) {
            if (msg.value != amount) revert IncorrectNativeValue();
        } else {
            if (msg.value != 0) revert UnexpectedNativeValue();
            IERC20(token).safeTransferFrom(msg.sender, address(this), amount);
        }

        escrowId = ++escrowCount;
        escrows[escrowId] = Escrow({
            creator: msg.sender,
            counterparty: counterparty,
            token: token,
            amount: amount,
            description: description,
            status: Status.Created,
            deliverDeadline: 0,
            releaseDeadline: 0,
            proofUrl: ""
        });

        emit EscrowCreated(escrowId, msg.sender, counterparty, amount, token, description);
    }

    /// @notice Counterparty accepts -- starts the deliver deadline.
    function accept(uint256 escrowId) external onlyCounterparty(escrowId) {
        Escrow storage escrow = escrows[escrowId];
        if (escrow.status != Status.Created) revert WrongStatus();

        escrow.status = Status.Accepted;
        escrow.deliverDeadline = block.timestamp + DELIVER_WINDOW;

        emit EscrowAccepted(escrowId, escrow.deliverDeadline);
    }

    /// @notice Creator can always back out before the counterparty accepts --
    /// nothing has been promised yet, so no deadline check is needed.
    function cancelBeforeAccept(uint256 escrowId) external onlyCreator(escrowId) nonReentrant {
        Escrow storage escrow = escrows[escrowId];
        if (escrow.status != Status.Created) revert WrongStatus();

        escrow.status = Status.Cancelled;
        _refund(escrow);

        emit EscrowCancelled(escrowId, false);
    }

    /// @notice Counterparty marks the work delivered -- doesn't move funds yet,
    /// just stamps a proof link and starts the release grace window.
    function deliver(uint256 escrowId, string calldata proofUrl) external onlyCounterparty(escrowId) {
        Escrow storage escrow = escrows[escrowId];
        if (escrow.status != Status.Accepted) revert WrongStatus();

        escrow.status = Status.Delivered;
        escrow.proofUrl = proofUrl;
        escrow.releaseDeadline = block.timestamp + RELEASE_GRACE;

        emit EscrowDelivered(escrowId, proofUrl, escrow.releaseDeadline);
    }

    /// @notice Creator refunds themselves if the counterparty accepted but
    /// never delivered in time -- the safety net for a ghosting counterparty.
    function refundAfterDeliverDeadline(uint256 escrowId) external onlyCreator(escrowId) nonReentrant {
        Escrow storage escrow = escrows[escrowId];
        if (escrow.status != Status.Accepted) revert WrongStatus();
        if (block.timestamp < escrow.deliverDeadline) revert DeliverDeadlineNotPassed();

        escrow.status = Status.Cancelled;
        _refund(escrow);

        emit EscrowCancelled(escrowId, true);
    }

    /// @notice Creator releases funds to the counterparty after reviewing delivery.
    function release(uint256 escrowId) external onlyCreator(escrowId) nonReentrant {
        Escrow storage escrow = escrows[escrowId];
        if (escrow.status != Status.Delivered) revert WrongStatus();

        escrow.status = Status.Released;
        _pay(escrow, escrow.counterparty);

        emit EscrowReleased(escrowId, false);
    }

    /// @notice Counterparty forces release if the creator never released
    /// within the grace window after real delivery -- the safety net for a
    /// ghosting creator who received the work but won't pay.
    function forceRelease(uint256 escrowId) external onlyCounterparty(escrowId) nonReentrant {
        Escrow storage escrow = escrows[escrowId];
        if (escrow.status != Status.Delivered) revert WrongStatus();
        if (block.timestamp < escrow.releaseDeadline) revert ReleaseDeadlineNotPassed();

        escrow.status = Status.Released;
        _pay(escrow, escrow.counterparty);

        emit EscrowReleased(escrowId, true);
    }

    function _refund(Escrow storage escrow) private {
        _pay(escrow, escrow.creator);
    }

    function _pay(Escrow storage escrow, address to) private {
        if (escrow.token == address(0)) {
            (bool ok,) = to.call{value: escrow.amount}("");
            if (!ok) revert NativeTransferFailed();
        } else {
            IERC20(escrow.token).safeTransfer(to, escrow.amount);
        }
    }

    function getEscrow(uint256 escrowId) external view returns (Escrow memory) {
        if (escrows[escrowId].creator == address(0)) revert EscrowNotFound();
        return escrows[escrowId];
    }
}
