// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {CauseRegistry} from "../src/CauseRegistry.sol";
import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

contract MockToken is ERC20 {
    constructor() ERC20("Mock Global Dollar", "mUSDG") {
        _mint(msg.sender, 1_000_000e18);
    }
}

contract CauseRegistryTest is Test {
    CauseRegistry registry;
    MockToken token;

    address organizer = makeAddr("organizer");
    address alice = makeAddr("alice");
    address bob = makeAddr("bob");

    function setUp() public {
        registry = new CauseRegistry();
        token = new MockToken();
        vm.deal(alice, 100 ether);
        vm.deal(bob, 100 ether);
        token.transfer(alice, 10_000e18);
        token.transfer(bob, 10_000e18);
    }

    function _createNativeCause() internal returns (uint256) {
        return registry.createCause("Flood Relief", organizer, 10 ether, address(0));
    }

    function _createTokenCause() internal returns (uint256) {
        return registry.createCause("Stray Dogs Lagos", organizer, 5000e18, address(token));
    }

    // ── createCause ──────────────────────────────────────────────────────────

    function test_createCause_revertsOnEmptyName() public {
        vm.expectRevert(CauseRegistry.EmptyName.selector);
        registry.createCause("", organizer, 100, address(0));
    }

    function test_createCause_revertsOnZeroOrganizer() public {
        vm.expectRevert(CauseRegistry.ZeroAddress.selector);
        registry.createCause("Test", address(0), 100, address(0));
    }

    function test_createCause_incrementsCauseId() public {
        uint256 id1 = _createNativeCause();
        uint256 id2 = _createTokenCause();
        assertEq(id1, 1);
        assertEq(id2, 2);
    }

    function test_getCause_revertsWhenNotFound() public {
        vm.expectRevert(CauseRegistry.CauseNotFound.selector);
        registry.getCause(999);
    }

    // ── donate ────────────────────────────────────────────────────────────────

    function test_donate_revertsOnCauseNotFound() public {
        vm.expectRevert(CauseRegistry.CauseNotFound.selector);
        registry.donate(999, 1 ether);
    }

    function test_donate_revertsOnZeroAmount() public {
        uint256 id = _createNativeCause();
        vm.expectRevert(CauseRegistry.ZeroAmount.selector);
        registry.donate(id, 0);
    }

    function test_donate_native_revertsOnIncorrectValue() public {
        uint256 id = _createNativeCause();
        vm.prank(alice);
        vm.expectRevert(CauseRegistry.IncorrectNativeValue.selector);
        registry.donate{value: 0.5 ether}(id, 1 ether);
    }

    function test_donate_native_accumulates() public {
        uint256 id = _createNativeCause();

        vm.prank(alice);
        registry.donate{value: 3 ether}(id, 3 ether);
        vm.prank(bob);
        registry.donate{value: 2 ether}(id, 2 ether);
        vm.prank(alice);
        registry.donate{value: 1 ether}(id, 1 ether);

        CauseRegistry.Cause memory cause = registry.getCause(id);
        assertEq(cause.totalRaised, 6 ether);
        assertEq(registry.donorTotal(id, alice), 4 ether);
        assertEq(registry.donorTotal(id, bob), 2 ether);
        assertEq(address(registry).balance, 6 ether);
    }

    function test_donate_token_revertsOnUnexpectedNativeValue() public {
        uint256 id = _createTokenCause();
        vm.startPrank(alice);
        token.approve(address(registry), 100e18);
        vm.expectRevert(CauseRegistry.UnexpectedNativeValue.selector);
        registry.donate{value: 1}(id, 100e18);
        vm.stopPrank();
    }

    function test_donate_token_accumulates() public {
        uint256 id = _createTokenCause();

        vm.startPrank(alice);
        token.approve(address(registry), 500e18);
        registry.donate(id, 500e18);
        vm.stopPrank();

        CauseRegistry.Cause memory cause = registry.getCause(id);
        assertEq(cause.totalRaised, 500e18);
        assertEq(token.balanceOf(address(registry)), 500e18);
    }

    // ── withdraw ──────────────────────────────────────────────────────────────

    function test_withdraw_onlyOrganizer() public {
        uint256 id = _createNativeCause();
        vm.prank(alice);
        registry.donate{value: 5 ether}(id, 5 ether);

        vm.prank(alice);
        vm.expectRevert(CauseRegistry.NotOrganizer.selector);
        registry.withdraw(id, 1 ether, "invoice.jpg");
    }

    function test_withdraw_revertsOnInsufficientBalance() public {
        uint256 id = _createNativeCause();
        vm.prank(alice);
        registry.donate{value: 2 ether}(id, 2 ether);

        vm.prank(organizer);
        vm.expectRevert(CauseRegistry.InsufficientBalance.selector);
        registry.withdraw(id, 3 ether, "invoice.jpg");
    }

    function test_withdraw_native_paysOrganizerAndUpdatesState() public {
        uint256 id = _createNativeCause();
        vm.prank(alice);
        registry.donate{value: 5 ether}(id, 5 ether);

        uint256 before = organizer.balance;
        vm.prank(organizer);
        registry.withdraw(id, 2 ether, "vet-bills.jpg");

        assertEq(organizer.balance, before + 2 ether);
        CauseRegistry.Cause memory cause = registry.getCause(id);
        assertEq(cause.totalWithdrawn, 2 ether);
        assertEq(address(registry).balance, 3 ether); // remaining, not dust -- still owed to the cause
    }

    function test_withdraw_token_paysOrganizer() public {
        uint256 id = _createTokenCause();
        vm.startPrank(alice);
        token.approve(address(registry), 500e18);
        registry.donate(id, 500e18);
        vm.stopPrank();

        vm.prank(organizer);
        registry.withdraw(id, 200e18, "vet-bills.jpg");

        assertEq(token.balanceOf(organizer), 200e18);
        assertEq(token.balanceOf(address(registry)), 300e18);
    }

    function test_withdraw_canWithdrawRemainderAfterMultipleDonations() public {
        uint256 id = _createNativeCause();
        vm.prank(alice);
        registry.donate{value: 3 ether}(id, 3 ether);
        vm.prank(bob);
        registry.donate{value: 3 ether}(id, 3 ether);

        vm.prank(organizer);
        registry.withdraw(id, 4 ether, "first-batch.jpg");

        vm.prank(organizer);
        registry.withdraw(id, 2 ether, "second-batch.jpg");

        assertEq(address(registry).balance, 0); // fully withdrawn, no dust
        CauseRegistry.Cause memory cause = registry.getCause(id);
        assertEq(cause.totalWithdrawn, 6 ether);
    }
}
