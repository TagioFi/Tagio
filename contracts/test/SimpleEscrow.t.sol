// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {SimpleEscrow} from "../src/SimpleEscrow.sol";
import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

contract MockToken is ERC20 {
    constructor() ERC20("Mock Global Dollar", "mUSDG") {
        _mint(msg.sender, 1_000_000e18);
    }
}

/// @dev Tries to re-enter release() from its own receive() hook.
contract ReentrantCounterparty {
    SimpleEscrow public escrow;
    uint256 public targetId;
    bool public armed;

    constructor(SimpleEscrow _escrow) {
        escrow = _escrow;
    }

    function arm(uint256 _id) external {
        targetId = _id;
        armed = true;
    }

    function doForceRelease() external {
        escrow.forceRelease(targetId);
    }

    receive() external payable {
        if (armed) {
            armed = false;
            escrow.forceRelease(targetId);
        }
    }
}

contract SimpleEscrowTest is Test {
    SimpleEscrow escrow;
    MockToken token;

    address creator = makeAddr("creator");
    address counterparty = makeAddr("counterparty");
    address stranger = makeAddr("stranger");

    function setUp() public {
        escrow = new SimpleEscrow();
        token = new MockToken();
        vm.deal(creator, 100 ether);
        token.transfer(creator, 10_000e18);
    }

    function _createNative(uint256 amount) internal returns (uint256) {
        vm.prank(creator);
        return escrow.create{value: amount}(counterparty, amount, address(0), "Build 3 logos");
    }

    function _createToken(uint256 amount) internal returns (uint256) {
        vm.startPrank(creator);
        token.approve(address(escrow), amount);
        uint256 id = escrow.create(counterparty, amount, address(token), "Build 3 logos");
        vm.stopPrank();
        return id;
    }

    // ── create ────────────────────────────────────────────────────────────────

    function test_create_revertsOnZeroCounterparty() public {
        vm.prank(creator);
        vm.expectRevert(SimpleEscrow.ZeroAddress.selector);
        escrow.create{value: 1 ether}(address(0), 1 ether, address(0), "x");
    }

    function test_create_revertsOnZeroAmount() public {
        vm.prank(creator);
        vm.expectRevert(SimpleEscrow.ZeroAmount.selector);
        escrow.create(counterparty, 0, address(0), "x");
    }

    function test_create_native_revertsOnIncorrectValue() public {
        vm.prank(creator);
        vm.expectRevert(SimpleEscrow.IncorrectNativeValue.selector);
        escrow.create{value: 0.5 ether}(counterparty, 1 ether, address(0), "x");
    }

    function test_create_native_locksFunds() public {
        uint256 id = _createNative(5 ether);
        assertEq(address(escrow).balance, 5 ether);
        SimpleEscrow.Escrow memory e = escrow.getEscrow(id);
        assertEq(uint256(e.status), uint256(SimpleEscrow.Status.Created));
        assertEq(e.amount, 5 ether);
    }

    function test_create_token_revertsOnUnexpectedNativeValue() public {
        vm.startPrank(creator);
        token.approve(address(escrow), 100e18);
        vm.expectRevert(SimpleEscrow.UnexpectedNativeValue.selector);
        escrow.create{value: 1}(counterparty, 100e18, address(token), "x");
        vm.stopPrank();
    }

    function test_create_token_locksFunds() public {
        uint256 id = _createToken(500e18);
        assertEq(token.balanceOf(address(escrow)), 500e18);
        assertEq(token.balanceOf(creator), 9_500e18);
    }

    function test_getEscrow_revertsWhenNotFound() public {
        vm.expectRevert(SimpleEscrow.EscrowNotFound.selector);
        escrow.getEscrow(999);
    }

    // ── accept ────────────────────────────────────────────────────────────────

    function test_accept_onlyCounterparty() public {
        uint256 id = _createNative(1 ether);
        vm.prank(stranger);
        vm.expectRevert(SimpleEscrow.NotCounterparty.selector);
        escrow.accept(id);
    }

    function test_accept_revertsOnWrongStatus() public {
        uint256 id = _createNative(1 ether);
        vm.prank(counterparty);
        escrow.accept(id);

        vm.prank(counterparty);
        vm.expectRevert(SimpleEscrow.WrongStatus.selector);
        escrow.accept(id); // already accepted
    }

    function test_accept_setsDeliverDeadline() public {
        uint256 id = _createNative(1 ether);
        vm.prank(counterparty);
        escrow.accept(id);

        SimpleEscrow.Escrow memory e = escrow.getEscrow(id);
        assertEq(uint256(e.status), uint256(SimpleEscrow.Status.Accepted));
        assertEq(e.deliverDeadline, block.timestamp + escrow.DELIVER_WINDOW());
    }

    // ── cancelBeforeAccept ────────────────────────────────────────────────────

    function test_cancelBeforeAccept_onlyCreator() public {
        uint256 id = _createNative(1 ether);
        vm.prank(stranger);
        vm.expectRevert(SimpleEscrow.NotCreator.selector);
        escrow.cancelBeforeAccept(id);
    }

    function test_cancelBeforeAccept_revertsAfterAccept() public {
        uint256 id = _createNative(1 ether);
        vm.prank(counterparty);
        escrow.accept(id);

        vm.prank(creator);
        vm.expectRevert(SimpleEscrow.WrongStatus.selector);
        escrow.cancelBeforeAccept(id);
    }

    function test_cancelBeforeAccept_refundsCreator() public {
        uint256 id = _createNative(3 ether);
        uint256 before = creator.balance;

        vm.prank(creator);
        escrow.cancelBeforeAccept(id);

        assertEq(creator.balance, before + 3 ether);
        assertEq(address(escrow).balance, 0);
    }

    // ── deliver ───────────────────────────────────────────────────────────────

    function test_deliver_onlyCounterparty() public {
        uint256 id = _createNative(1 ether);
        vm.prank(counterparty);
        escrow.accept(id);

        vm.prank(stranger);
        vm.expectRevert(SimpleEscrow.NotCounterparty.selector);
        escrow.deliver(id, "proof.jpg");
    }

    function test_deliver_revertsBeforeAccept() public {
        uint256 id = _createNative(1 ether);
        vm.prank(counterparty);
        vm.expectRevert(SimpleEscrow.WrongStatus.selector);
        escrow.deliver(id, "proof.jpg");
    }

    function test_deliver_setsReleaseDeadlineAndProof() public {
        uint256 id = _createNative(1 ether);
        vm.prank(counterparty);
        escrow.accept(id);
        vm.prank(counterparty);
        escrow.deliver(id, "https://drive.google.com/proof");

        SimpleEscrow.Escrow memory e = escrow.getEscrow(id);
        assertEq(uint256(e.status), uint256(SimpleEscrow.Status.Delivered));
        assertEq(e.proofUrl, "https://drive.google.com/proof");
        assertEq(e.releaseDeadline, block.timestamp + escrow.RELEASE_GRACE());
    }

    // ── refundAfterDeliverDeadline ────────────────────────────────────────────

    function test_refundAfterDeliverDeadline_revertsBeforeDeadline() public {
        uint256 id = _createNative(1 ether);
        vm.prank(counterparty);
        escrow.accept(id);

        vm.prank(creator);
        vm.expectRevert(SimpleEscrow.DeliverDeadlineNotPassed.selector);
        escrow.refundAfterDeliverDeadline(id);
    }

    function test_refundAfterDeliverDeadline_refundsAfterDeadline() public {
        uint256 id = _createNative(2 ether);
        vm.prank(counterparty);
        escrow.accept(id);

        vm.warp(block.timestamp + escrow.DELIVER_WINDOW() + 1);

        uint256 before = creator.balance;
        vm.prank(creator);
        escrow.refundAfterDeliverDeadline(id);

        assertEq(creator.balance, before + 2 ether);
        assertEq(address(escrow).balance, 0);
        SimpleEscrow.Escrow memory e = escrow.getEscrow(id);
        assertEq(uint256(e.status), uint256(SimpleEscrow.Status.Cancelled));
    }

    // ── release ───────────────────────────────────────────────────────────────

    function test_release_onlyCreator() public {
        uint256 id = _createNative(1 ether);
        vm.prank(counterparty);
        escrow.accept(id);
        vm.prank(counterparty);
        escrow.deliver(id, "proof.jpg");

        vm.prank(stranger);
        vm.expectRevert(SimpleEscrow.NotCreator.selector);
        escrow.release(id);
    }

    function test_release_revertsBeforeDelivery() public {
        uint256 id = _createNative(1 ether);
        vm.prank(counterparty);
        escrow.accept(id);

        vm.prank(creator);
        vm.expectRevert(SimpleEscrow.WrongStatus.selector);
        escrow.release(id);
    }

    function test_release_paysCounterparty_native() public {
        uint256 id = _createNative(5 ether);
        vm.prank(counterparty);
        escrow.accept(id);
        vm.prank(counterparty);
        escrow.deliver(id, "proof.jpg");

        uint256 before = counterparty.balance;
        vm.prank(creator);
        escrow.release(id);

        assertEq(counterparty.balance, before + 5 ether);
        assertEq(address(escrow).balance, 0);
        SimpleEscrow.Escrow memory e = escrow.getEscrow(id);
        assertEq(uint256(e.status), uint256(SimpleEscrow.Status.Released));
    }

    function test_release_paysCounterparty_token() public {
        uint256 id = _createToken(500e18);
        vm.prank(counterparty);
        escrow.accept(id);
        vm.prank(counterparty);
        escrow.deliver(id, "proof.jpg");

        vm.prank(creator);
        escrow.release(id);

        assertEq(token.balanceOf(counterparty), 500e18);
        assertEq(token.balanceOf(address(escrow)), 0);
    }

    // ── forceRelease ──────────────────────────────────────────────────────────

    function test_forceRelease_onlyCounterparty() public {
        uint256 id = _createNative(1 ether);
        vm.prank(counterparty);
        escrow.accept(id);
        vm.prank(counterparty);
        escrow.deliver(id, "proof.jpg");
        vm.warp(block.timestamp + escrow.RELEASE_GRACE() + 1);

        vm.prank(stranger);
        vm.expectRevert(SimpleEscrow.NotCounterparty.selector);
        escrow.forceRelease(id);
    }

    function test_forceRelease_revertsBeforeGraceExpires() public {
        uint256 id = _createNative(1 ether);
        vm.prank(counterparty);
        escrow.accept(id);
        vm.prank(counterparty);
        escrow.deliver(id, "proof.jpg");

        vm.prank(counterparty);
        vm.expectRevert(SimpleEscrow.ReleaseDeadlineNotPassed.selector);
        escrow.forceRelease(id);
    }

    function test_forceRelease_paysAfterGraceExpires() public {
        uint256 id = _createNative(4 ether);
        vm.prank(counterparty);
        escrow.accept(id);
        vm.prank(counterparty);
        escrow.deliver(id, "proof.jpg");
        vm.warp(block.timestamp + escrow.RELEASE_GRACE() + 1);

        uint256 before = counterparty.balance;
        vm.prank(counterparty);
        escrow.forceRelease(id);

        assertEq(counterparty.balance, before + 4 ether);
        SimpleEscrow.Escrow memory e = escrow.getEscrow(id);
        assertEq(uint256(e.status), uint256(SimpleEscrow.Status.Released));
    }

    function test_forceRelease_reentrancyBlocked() public {
        ReentrantCounterparty attacker = new ReentrantCounterparty(escrow);
        vm.prank(creator);
        uint256 id = escrow.create{value: 1 ether}(address(attacker), 1 ether, address(0), "x");

        vm.prank(address(attacker));
        escrow.accept(id);
        vm.prank(address(attacker));
        escrow.deliver(id, "proof.jpg");
        vm.warp(block.timestamp + escrow.RELEASE_GRACE() + 1);

        attacker.arm(id);
        vm.expectRevert(SimpleEscrow.NativeTransferFailed.selector);
        attacker.doForceRelease();
    }
}
