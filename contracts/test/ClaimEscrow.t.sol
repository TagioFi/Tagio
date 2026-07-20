// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {ClaimEscrow} from "../src/ClaimEscrow.sol";
import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {MessageHashUtils} from "@openzeppelin/contracts/utils/cryptography/MessageHashUtils.sol";

contract MockToken is ERC20 {
    constructor() ERC20("Mock Global Dollar", "mUSDG") {
        _mint(msg.sender, 1_000_000e18);
    }
}

/// @dev Tries to re-enter claimNative from its own receive() hook.
contract ReentrantClaimant {
    ClaimEscrow public escrow;
    bytes32 public hash;
    bytes public sig;
    bool public armed;

    constructor(ClaimEscrow _escrow) {
        escrow = _escrow;
    }

    function arm(bytes32 _hash, bytes calldata _sig) external {
        hash = _hash;
        sig = _sig;
        armed = true;
    }

    function doClaim() external {
        escrow.claimNative(hash, sig);
    }

    receive() external payable {
        if (armed) {
            armed = false;
            escrow.claimNative(hash, sig); // re-entrant call, should revert
        }
    }
}

contract ClaimEscrowTest is Test {
    using MessageHashUtils for bytes32;

    ClaimEscrow escrow;
    MockToken token;

    uint256 attestorKey = 0xA11E5706;
    address attestor;
    address owner = address(this);
    address alice = makeAddr("alice"); // sender
    address bob = makeAddr("bob"); // claimant wallet

    bytes32 constant X_USER_HASH = keccak256("x_user_id:123456");

    function setUp() public {
        attestor = vm.addr(attestorKey);
        escrow = new ClaimEscrow(attestor, owner);
        token = new MockToken();
        vm.deal(alice, 100 ether);
        token.transfer(alice, 100_000e18);
    }

    function _sign(bytes32 xUserIdHash, address claimant) internal view returns (bytes memory) {
        bytes32 messageHash = keccak256(abi.encodePacked(xUserIdHash, claimant, address(escrow), block.chainid))
            .toEthSignedMessageHash();
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(attestorKey, messageHash);
        return abi.encodePacked(r, s, v);
    }

    // ── deposits ──────────────────────────────────────────────────────────────

    function test_depositNative_revertsOnZeroAmount() public {
        vm.expectRevert(ClaimEscrow.ZeroAmount.selector);
        escrow.depositNative(X_USER_HASH);
    }

    function test_depositNative_accumulates() public {
        vm.prank(alice);
        escrow.depositNative{value: 1 ether}(X_USER_HASH);
        vm.prank(alice);
        escrow.depositNative{value: 2 ether}(X_USER_HASH);

        assertEq(escrow.nativeBalanceOf(X_USER_HASH), 3 ether);
        assertEq(address(escrow).balance, 3 ether);
    }

    function test_depositToken_revertsOnZeroAmount() public {
        vm.expectRevert(ClaimEscrow.ZeroAmount.selector);
        escrow.depositToken(X_USER_HASH, address(token), 0);
    }

    function test_depositToken_revertsWithoutApproval() public {
        vm.prank(alice);
        vm.expectRevert();
        escrow.depositToken(X_USER_HASH, address(token), 100e18);
    }

    function test_depositToken_accumulates() public {
        vm.startPrank(alice);
        token.approve(address(escrow), 300e18);
        escrow.depositToken(X_USER_HASH, address(token), 100e18);
        escrow.depositToken(X_USER_HASH, address(token), 200e18);
        vm.stopPrank();

        assertEq(escrow.tokenBalanceOf(X_USER_HASH, address(token)), 300e18);
        assertEq(token.balanceOf(address(escrow)), 300e18);
    }

    // ── claims ────────────────────────────────────────────────────────────────

    function test_claimNative_succeedsWithValidSignature() public {
        vm.prank(alice);
        escrow.depositNative{value: 5 ether}(X_USER_HASH);

        bytes memory sig = _sign(X_USER_HASH, bob);
        vm.prank(bob);
        escrow.claimNative(X_USER_HASH, sig);

        assertEq(bob.balance, 5 ether);
        assertEq(escrow.nativeBalanceOf(X_USER_HASH), 0);
        assertEq(address(escrow).balance, 0); // no dust left behind
    }

    function test_claimNative_revertsOnWrongSignature() public {
        vm.prank(alice);
        escrow.depositNative{value: 5 ether}(X_USER_HASH);

        // Signed by a random key, not the real attestor.
        uint256 wrongKey = 0xBAD5EED;
        bytes32 messageHash = keccak256(abi.encodePacked(X_USER_HASH, bob, address(escrow), block.chainid))
            .toEthSignedMessageHash();
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(wrongKey, messageHash);
        bytes memory badSig = abi.encodePacked(r, s, v);

        vm.prank(bob);
        vm.expectRevert(ClaimEscrow.InvalidSignature.selector);
        escrow.claimNative(X_USER_HASH, badSig);
    }

    function test_claimNative_revertsIfSignatureIsForADifferentClaimant() public {
        vm.prank(alice);
        escrow.depositNative{value: 5 ether}(X_USER_HASH);

        // Valid attestor signature, but attesting for bob -- carol tries to use it.
        bytes memory sigForBob = _sign(X_USER_HASH, bob);
        address carol = makeAddr("carol");

        vm.prank(carol);
        vm.expectRevert(ClaimEscrow.InvalidSignature.selector);
        escrow.claimNative(X_USER_HASH, sigForBob);
    }

    function test_claimNative_revertsIfSignatureIsForADifferentXUserHash() public {
        vm.prank(alice);
        escrow.depositNative{value: 5 ether}(X_USER_HASH);

        bytes32 otherHash = keccak256("x_user_id:999999");
        bytes memory sigForOtherHash = _sign(otherHash, bob);

        vm.prank(bob);
        vm.expectRevert(ClaimEscrow.InvalidSignature.selector);
        escrow.claimNative(X_USER_HASH, sigForOtherHash);
    }

    function test_claimNative_revertsWhenNothingOwed() public {
        bytes memory sig = _sign(X_USER_HASH, bob);
        vm.prank(bob);
        vm.expectRevert(ClaimEscrow.NothingToClaim.selector);
        escrow.claimNative(X_USER_HASH, sig);
    }

    function test_claimNative_canClaimAgainAfterANewDeposit() public {
        vm.prank(alice);
        escrow.depositNative{value: 1 ether}(X_USER_HASH);
        bytes memory sig = _sign(X_USER_HASH, bob);
        vm.prank(bob);
        escrow.claimNative(X_USER_HASH, sig);
        assertEq(bob.balance, 1 ether);

        // More arrives after the first claim -- same signature still works
        // (it attests identity, not a one-time voucher), balance is fresh.
        vm.prank(alice);
        escrow.depositNative{value: 2 ether}(X_USER_HASH);
        vm.prank(bob);
        escrow.claimNative(X_USER_HASH, sig);
        assertEq(bob.balance, 3 ether);
    }

    function test_claimNative_reentrancyBlocked() public {
        ReentrantClaimant attacker = new ReentrantClaimant(escrow);
        bytes32 attackerHash = keccak256("x_user_id:attacker");
        vm.prank(alice);
        escrow.depositNative{value: 1 ether}(attackerHash);

        bytes memory sig = _sign(attackerHash, address(attacker));
        attacker.arm(attackerHash, sig);

        // The reentrant inner claimNative call reverts (ReentrancyGuard), which
        // bubbles up through the outer .call{value}() as a plain failed call --
        // NativeTransferFailed, same as BatchDisperser's equivalent test.
        vm.expectRevert(ClaimEscrow.NativeTransferFailed.selector);
        attacker.doClaim();
    }

    function test_claimToken_succeedsWithValidSignature() public {
        vm.startPrank(alice);
        token.approve(address(escrow), 100e18);
        escrow.depositToken(X_USER_HASH, address(token), 100e18);
        vm.stopPrank();

        bytes memory sig = _sign(X_USER_HASH, bob);
        vm.prank(bob);
        escrow.claimToken(X_USER_HASH, address(token), sig);

        assertEq(token.balanceOf(bob), 100e18);
        assertEq(escrow.tokenBalanceOf(X_USER_HASH, address(token)), 0);
        assertEq(token.balanceOf(address(escrow)), 0);
    }

    function test_claimToken_revertsWhenNothingOwed() public {
        bytes memory sig = _sign(X_USER_HASH, bob);
        vm.prank(bob);
        vm.expectRevert(ClaimEscrow.NothingToClaim.selector);
        escrow.claimToken(X_USER_HASH, address(token), sig);
    }

    // ── admin ─────────────────────────────────────────────────────────────────

    function test_setAttestor_onlyOwner() public {
        address newAttestor = makeAddr("newAttestor");
        vm.prank(alice);
        vm.expectRevert();
        escrow.setAttestor(newAttestor);

        escrow.setAttestor(newAttestor);
        assertEq(escrow.attestor(), newAttestor);
    }

    function test_setAttestor_revertsOnZeroAddress() public {
        vm.expectRevert(ClaimEscrow.ZeroAddress.selector);
        escrow.setAttestor(address(0));
    }

    function test_constructor_revertsOnZeroAttestor() public {
        vm.expectRevert(ClaimEscrow.ZeroAddress.selector);
        new ClaimEscrow(address(0), owner);
    }
}
