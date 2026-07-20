// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

/// @title CauseRegistry
/// @notice Public, transparent donation pools for TagioPay's Wave 5 -- "$donate"/
/// "$cause" bot commands. Deliberately not another HashtagResolver: a cause has no
/// NFT, no subscription, no transfer, just a name, a goal, an organizer, and a
/// running total. Per-donor cumulative totals are tracked on-chain (trustlessly
/// readable for the leaderboard); the *sorted* top-N leaderboard itself is a
/// backend indexing concern built off this contract's Donated events, not
/// something computed on-chain.
contract CauseRegistry is ReentrancyGuard {
    using SafeERC20 for IERC20;

    struct Cause {
        string name;
        address organizer;
        address token; // address(0) = native ETH
        uint256 goal;
        uint256 totalRaised;
        uint256 totalWithdrawn;
    }

    error ZeroAddress();
    error EmptyName();
    error ZeroAmount();
    error CauseNotFound();
    error NotOrganizer();
    error IncorrectNativeValue();
    error UnexpectedNativeValue();
    error InsufficientBalance();
    error NativeTransferFailed();

    event CauseCreated(uint256 indexed causeId, string name, address indexed organizer, uint256 goal, address token);
    event Donated(uint256 indexed causeId, address indexed donor, uint256 amount, uint256 newTotalRaised);
    event Withdrawn(uint256 indexed causeId, uint256 amount, string proofUrl, uint256 remainingBalance);

    uint256 public causeCount;
    mapping(uint256 => Cause) public causes;
    // causeId => donor => cumulative amount donated. Public and on-chain so
    // anyone can independently verify a claimed leaderboard position.
    mapping(uint256 => mapping(address => uint256)) public donorTotal;

    modifier onlyOrganizer(uint256 causeId) {
        if (causes[causeId].organizer == address(0)) revert CauseNotFound();
        if (msg.sender != causes[causeId].organizer) revert NotOrganizer();
        _;
    }

    /// @notice Permissionless -- anyone can start a cause, same as anyone can
    /// register a hashtag. `token` address(0) means native ETH.
    function createCause(string calldata name, address organizer, uint256 goal, address token)
        external
        returns (uint256 causeId)
    {
        if (bytes(name).length == 0) revert EmptyName();
        if (organizer == address(0)) revert ZeroAddress();

        causeId = ++causeCount;
        causes[causeId] = Cause({
            name: name,
            organizer: organizer,
            token: token,
            goal: goal,
            totalRaised: 0,
            totalWithdrawn: 0
        });

        emit CauseCreated(causeId, name, organizer, goal, token);
    }

    function donate(uint256 causeId, uint256 amount) external payable nonReentrant {
        Cause storage cause = causes[causeId];
        if (cause.organizer == address(0)) revert CauseNotFound();
        if (amount == 0) revert ZeroAmount();

        if (cause.token == address(0)) {
            if (msg.value != amount) revert IncorrectNativeValue();
        } else {
            if (msg.value != 0) revert UnexpectedNativeValue();
            IERC20(cause.token).safeTransferFrom(msg.sender, address(this), amount);
        }

        cause.totalRaised += amount;
        donorTotal[causeId][msg.sender] += amount;

        emit Donated(causeId, msg.sender, amount, cause.totalRaised);
    }

    /// @notice Organizer-only withdrawal with an attached proof URL (e.g. an
    /// invoice/receipt image hosted off-chain) -- the amount and proof both
    /// land in the same event, so "what was this money spent on" always has
    /// an on-chain-anchored answer.
    function withdraw(uint256 causeId, uint256 amount, string calldata proofUrl) external onlyOrganizer(causeId) nonReentrant {
        Cause storage cause = causes[causeId];
        if (amount == 0) revert ZeroAmount();

        uint256 available = cause.totalRaised - cause.totalWithdrawn;
        if (amount > available) revert InsufficientBalance();

        cause.totalWithdrawn += amount;

        if (cause.token == address(0)) {
            (bool ok,) = cause.organizer.call{value: amount}("");
            if (!ok) revert NativeTransferFailed();
        } else {
            IERC20(cause.token).safeTransfer(cause.organizer, amount);
        }

        emit Withdrawn(causeId, amount, proofUrl, available - amount);
    }

    function getCause(uint256 causeId) external view returns (Cause memory) {
        if (causes[causeId].organizer == address(0)) revert CauseNotFound();
        return causes[causeId];
    }
}
