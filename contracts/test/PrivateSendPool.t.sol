// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {PrivateSendPool} from "../src/PrivateSendPool.sol";
import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

contract MockToken is ERC20 {
    constructor() ERC20("Mock Global Dollar", "mUSDG") {
        _mint(msg.sender, 1_000_000e18);
    }
}

/// @dev Tries to re-enter claim() from its own receive() hook.
contract ReentrantClaimer {
    PrivateSendPool public pool;
    bytes32 public commitment;
    address public recipient;
    bytes32 public secret;
    bool public armed;

    constructor(PrivateSendPool _pool) {
        pool = _pool;
    }

    function arm(bytes32 _commitment, address _recipient, bytes32 _secret) external {
        commitment = _commitment;
        recipient = _recipient;
        secret = _secret;
        armed = true;
    }

    function doClaim() external {
        pool.claim(commitment, recipient, secret);
    }

    receive() external payable {
        if (armed) {
            armed = false;
            pool.claim(commitment, recipient, secret); // re-entrant call, should revert
        }
    }
}

contract PrivateSendPoolTest is Test {
    PrivateSendPool pool;
    MockToken token;

    address alice = makeAddr("alice"); // sender
    address bob = makeAddr("bob"); // recipient
    address keeper = makeAddr("keeper");

    function setUp() public {
        pool = new PrivateSendPool();
        token = new MockToken();
        vm.deal(alice, 100 ether);
        token.transfer(alice, 100_000e18);
    }

    function _commitment(bytes32 secret, address recipient) internal view returns (bytes32) {
        return keccak256(abi.encodePacked(secret, recipient, address(pool), block.chainid));
    }

    // ── send (native) ────────────────────────────────────────────────────────

    function test_send_revertsOnZeroAmount() public {
        bytes32 commitment = _commitment(keccak256("s"), bob);
        vm.prank(alice);
        vm.expectRevert(PrivateSendPool.ZeroAmount.selector);
        pool.send{value: 1 ether}(commitment, 0, 1 ether);
    }

    function test_send_revertsOnIncorrectValue() public {
        bytes32 commitment = _commitment(keccak256("s"), bob);
        vm.prank(alice);
        vm.expectRevert(PrivateSendPool.IncorrectNativeValue.selector);
        pool.send{value: 1 ether}(commitment, 1 ether, 0.1 ether); // short by 0.1
    }

    function test_send_revertsOnDuplicateCommitment() public {
        bytes32 commitment = _commitment(keccak256("s"), bob);
        vm.startPrank(alice);
        pool.send{value: 1 ether}(commitment, 1 ether, 0);
        vm.expectRevert(PrivateSendPool.AlreadyExists.selector);
        pool.send{value: 1 ether}(commitment, 1 ether, 0);
        vm.stopPrank();
    }

    function test_send_storesAllocation() public {
        bytes32 secret = keccak256("s");
        bytes32 commitment = _commitment(secret, bob);
        vm.prank(alice);
        pool.send{value: 1.05 ether}(commitment, 1 ether, 0.05 ether);

        PrivateSendPool.Allocation memory a = pool.getAllocation(commitment);
        assertEq(a.token, address(0));
        assertEq(a.amount, 1 ether);
        assertEq(a.keeperFeeWei, 0.05 ether);
        assertFalse(a.claimed);
        assertEq(address(pool).balance, 1.05 ether);
    }

    // ── send (token) ──────────────────────────────────────────────────────────

    function test_sendToken_revertsWithoutApproval() public {
        bytes32 commitment = _commitment(keccak256("s"), bob);
        vm.prank(alice);
        vm.expectRevert();
        pool.sendToken(commitment, address(token), 100e18, 0);
    }

    function test_sendToken_revertsOnIncorrectFeeValue() public {
        bytes32 commitment = _commitment(keccak256("s"), bob);
        vm.startPrank(alice);
        token.approve(address(pool), 100e18);
        vm.expectRevert(PrivateSendPool.IncorrectNativeValue.selector);
        pool.sendToken{value: 0.001 ether}(commitment, address(token), 100e18, 0.002 ether);
        vm.stopPrank();
    }

    // The fee is ETH, pulled via msg.value; the token amount is pulled via
    // safeTransferFrom -- two separate asset types moving in one call.
    function test_sendToken_pullsTokenAmountAndEthFeeSeparately() public {
        bytes32 commitment = _commitment(keccak256("s"), bob);
        vm.startPrank(alice);
        token.approve(address(pool), 100e18);
        pool.sendToken{value: 0.002 ether}(commitment, address(token), 100e18, 0.002 ether);
        vm.stopPrank();

        assertEq(token.balanceOf(address(pool)), 100e18);
        assertEq(address(pool).balance, 0.002 ether);
        PrivateSendPool.Allocation memory a = pool.getAllocation(commitment);
        assertEq(a.token, address(token));
        assertEq(a.amount, 100e18);
        assertEq(a.keeperFeeWei, 0.002 ether);
    }

    // ── claim (native) ────────────────────────────────────────────────────────

    function test_claim_selfClaim_getsAmountPlusFee() public {
        bytes32 secret = keccak256("s");
        bytes32 commitment = _commitment(secret, bob);
        vm.prank(alice);
        pool.send{value: 1.05 ether}(commitment, 1 ether, 0.05 ether);

        vm.prank(bob);
        pool.claim(commitment, bob, secret);

        assertEq(bob.balance, 1.05 ether);
        assertEq(address(pool).balance, 0);
    }

    function test_claim_keeperClaim_splitsAmountAndFee() public {
        bytes32 secret = keccak256("s");
        bytes32 commitment = _commitment(secret, bob);
        vm.prank(alice);
        pool.send{value: 1.05 ether}(commitment, 1 ether, 0.05 ether);

        vm.prank(keeper);
        pool.claim(commitment, bob, secret);

        assertEq(bob.balance, 1 ether);
        assertEq(keeper.balance, 0.05 ether);
    }

    function test_claim_revertsOnWrongSecret() public {
        bytes32 secret = keccak256("s");
        bytes32 commitment = _commitment(secret, bob);
        vm.prank(alice);
        pool.send{value: 1 ether}(commitment, 1 ether, 0);

        vm.prank(bob);
        vm.expectRevert(PrivateSendPool.InvalidSecret.selector);
        pool.claim(commitment, bob, keccak256("wrong"));
    }

    function test_claim_revertsIfRecipientDoesNotMatchCommitment() public {
        bytes32 secret = keccak256("s");
        bytes32 commitment = _commitment(secret, bob);
        vm.prank(alice);
        pool.send{value: 1 ether}(commitment, 1 ether, 0);

        address carol = makeAddr("carol");
        // Correct secret, but a third party tries to redirect the payout to
        // themselves -- recipient is bound into the commitment, so this fails.
        vm.prank(carol);
        vm.expectRevert(PrivateSendPool.InvalidSecret.selector);
        pool.claim(commitment, carol, secret);
    }

    function test_claim_revertsIfNotFound() public {
        vm.expectRevert(PrivateSendPool.NotFound.selector);
        pool.claim(keccak256("nope"), bob, keccak256("s"));
    }

    function test_claim_revertsIfAlreadyClaimed() public {
        bytes32 secret = keccak256("s");
        bytes32 commitment = _commitment(secret, bob);
        vm.prank(alice);
        pool.send{value: 1 ether}(commitment, 1 ether, 0);

        pool.claim(commitment, bob, secret);
        vm.expectRevert(PrivateSendPool.AlreadyClaimed.selector);
        pool.claim(commitment, bob, secret);
    }

    function test_claim_reentrancyBlocked() public {
        ReentrantClaimer attacker = new ReentrantClaimer(pool);
        bytes32 secret = keccak256("s");
        bytes32 commitment = _commitment(secret, address(attacker));
        vm.prank(alice);
        pool.send{value: 1 ether}(commitment, 1 ether, 0);

        attacker.arm(commitment, address(attacker), secret);
        vm.expectRevert(PrivateSendPool.NativeTransferFailed.selector);
        attacker.doClaim();
    }

    // ── claim (token) ─────────────────────────────────────────────────────────

    function test_claimToken_selfClaim_getsTokenAmountAndEthFee() public {
        bytes32 secret = keccak256("s");
        bytes32 commitment = _commitment(secret, bob);
        vm.startPrank(alice);
        token.approve(address(pool), 100e18);
        pool.sendToken{value: 0.002 ether}(commitment, address(token), 100e18, 0.002 ether);
        vm.stopPrank();

        vm.prank(bob);
        pool.claim(commitment, bob, secret);
        assertEq(token.balanceOf(bob), 100e18);
        assertEq(bob.balance, 0.002 ether); // self-claim keeps the ETH fee too
        assertEq(token.balanceOf(address(pool)), 0);
        assertEq(address(pool).balance, 0);
    }

    function test_claimToken_keeperClaim_paysTokenToRecipientAndEthFeeToKeeper() public {
        bytes32 secret = keccak256("s");
        bytes32 commitment = _commitment(secret, bob);
        vm.startPrank(alice);
        token.approve(address(pool), 100e18);
        pool.sendToken{value: 0.002 ether}(commitment, address(token), 100e18, 0.002 ether);
        vm.stopPrank();

        vm.prank(keeper);
        pool.claim(commitment, bob, secret);
        assertEq(token.balanceOf(bob), 100e18);
        assertEq(bob.balance, 0); // recipient gets zero ETH -- the fee went to the keeper, not them
        assertEq(keeper.balance, 0.002 ether);
    }
}
