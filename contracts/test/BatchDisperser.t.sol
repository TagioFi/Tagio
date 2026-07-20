// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {BatchDisperser} from "../src/BatchDisperser.sol";
import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

contract MockToken is ERC20 {
    constructor() ERC20("Mock Global Dollar", "mUSDG") {
        _mint(msg.sender, 1_000_000e18);
    }
}

/// @dev Tries to re-enter disperseNative from its own receive() hook -- exercises
/// the same reentrancy defense HashtagResolver's low-level .call{value}() payouts
/// already rely on (nonReentrant), against the same kind of malicious-recipient
/// attack surface (a payout target that's a contract, not a plain wallet).
contract ReentrantReceiver {
    BatchDisperser public disperser;
    bool public armed;

    constructor(BatchDisperser _disperser) {
        disperser = _disperser;
    }

    function arm() external {
        armed = true;
    }

    receive() external payable {
        if (armed) {
            armed = false; // only ever try once, avoid infinite recursion in the test itself
            address[] memory recipients = new address[](1);
            uint256[] memory amounts = new uint256[](1);
            recipients[0] = address(this);
            amounts[0] = 1;
            disperser.disperseNative{value: 1}(recipients, amounts);
        }
    }
}

contract BatchDisperserTest is Test {
    BatchDisperser disperser;
    MockToken token;

    address deployer = address(this);
    address alice = makeAddr("alice");
    address bob = makeAddr("bob");
    address carol = makeAddr("carol");

    function setUp() public {
        disperser = new BatchDisperser();
        token = new MockToken();
        vm.deal(deployer, 100 ether);
    }

    function _recipients3() internal view returns (address[] memory r) {
        r = new address[](3);
        r[0] = alice;
        r[1] = bob;
        r[2] = carol;
    }

    // ── disperseNative ───────────────────────────────────────────────────────

    function test_disperseNative_revertsOnEmptyRecipients() public {
        address[] memory recipients = new address[](0);
        uint256[] memory amounts = new uint256[](0);
        vm.expectRevert(BatchDisperser.EmptyRecipients.selector);
        disperser.disperseNative(recipients, amounts);
    }

    function test_disperseNative_revertsOnMismatchedLength() public {
        address[] memory recipients = _recipients3();
        uint256[] memory amounts = new uint256[](2);
        amounts[0] = 1 ether;
        amounts[1] = 1 ether;
        vm.expectRevert(BatchDisperser.ArrayLengthMismatch.selector);
        disperser.disperseNative{value: 2 ether}(recipients, amounts);
    }

    function test_disperseNative_revertsOnZeroAddressRecipient() public {
        address[] memory recipients = new address[](2);
        recipients[0] = alice;
        recipients[1] = address(0);
        uint256[] memory amounts = new uint256[](2);
        amounts[0] = 1 ether;
        amounts[1] = 1 ether;
        vm.expectRevert(BatchDisperser.ZeroAddressRecipient.selector);
        disperser.disperseNative{value: 2 ether}(recipients, amounts);
    }

    function test_disperseNative_revertsOnIncorrectValue() public {
        address[] memory recipients = _recipients3();
        uint256[] memory amounts = new uint256[](3);
        amounts[0] = 1 ether;
        amounts[1] = 2 ether;
        amounts[2] = 3 ether;
        // Sends less than the 6 ether total -- must revert, not silently short-pay.
        vm.expectRevert(BatchDisperser.IncorrectNativeValue.selector);
        disperser.disperseNative{value: 5 ether}(recipients, amounts);
    }

    function test_disperseNative_correctAmounts() public {
        address[] memory recipients = _recipients3();
        uint256[] memory amounts = new uint256[](3);
        amounts[0] = 1 ether;
        amounts[1] = 2.5 ether;
        amounts[2] = 0.75 ether;
        uint256 total = 1 ether + 2.5 ether + 0.75 ether;

        disperser.disperseNative{value: total}(recipients, amounts);

        assertEq(alice.balance, 1 ether);
        assertEq(bob.balance, 2.5 ether);
        assertEq(carol.balance, 0.75 ether);
    }

    function test_disperseNative_noDustLeftInContract() public {
        address[] memory recipients = _recipients3();
        uint256[] memory amounts = new uint256[](3);
        amounts[0] = 1 ether;
        amounts[1] = 2 ether;
        amounts[2] = 3 ether;

        disperser.disperseNative{value: 6 ether}(recipients, amounts);

        assertEq(address(disperser).balance, 0);
    }

    function test_disperseNative_reentrancyBlocked() public {
        ReentrantReceiver attacker = new ReentrantReceiver(disperser);
        attacker.arm();

        address[] memory recipients = new address[](2);
        recipients[0] = address(attacker);
        recipients[1] = alice;
        uint256[] memory amounts = new uint256[](2);
        amounts[0] = 1 ether;
        amounts[1] = 1 ether;

        // The outer call's per-recipient low-level .call to the attacker triggers
        // its receive(), which tries to re-enter disperseNative -- that inner call
        // reverts (ReentrancyGuard), which bubbles up as this call's own
        // NativeTransferFailed (the outer loop sees the .call return false).
        vm.expectRevert(BatchDisperser.NativeTransferFailed.selector);
        disperser.disperseNative{value: 2 ether}(recipients, amounts);
    }

    // ── disperseToken ─────────────────────────────────────────────────────────

    function test_disperseToken_revertsOnEmptyRecipients() public {
        address[] memory recipients = new address[](0);
        uint256[] memory amounts = new uint256[](0);
        vm.expectRevert(BatchDisperser.EmptyRecipients.selector);
        disperser.disperseToken(address(token), recipients, amounts);
    }

    function test_disperseToken_revertsOnMismatchedLength() public {
        address[] memory recipients = _recipients3();
        uint256[] memory amounts = new uint256[](2);
        amounts[0] = 1e18;
        amounts[1] = 1e18;
        vm.expectRevert(BatchDisperser.ArrayLengthMismatch.selector);
        disperser.disperseToken(address(token), recipients, amounts);
    }

    function test_disperseToken_revertsOnZeroAddressRecipient() public {
        address[] memory recipients = new address[](2);
        recipients[0] = alice;
        recipients[1] = address(0);
        uint256[] memory amounts = new uint256[](2);
        amounts[0] = 1e18;
        amounts[1] = 1e18;
        vm.expectRevert(BatchDisperser.ZeroAddressRecipient.selector);
        disperser.disperseToken(address(token), recipients, amounts);
    }

    function test_disperseToken_revertsWithoutApproval() public {
        address[] memory recipients = _recipients3();
        uint256[] memory amounts = new uint256[](3);
        amounts[0] = 1e18;
        amounts[1] = 1e18;
        amounts[2] = 1e18;
        // No approve() was called -- SafeERC20's transferFrom must fail cleanly.
        vm.expectRevert();
        disperser.disperseToken(address(token), recipients, amounts);
    }

    function test_disperseToken_correctAmounts() public {
        address[] memory recipients = _recipients3();
        uint256[] memory amounts = new uint256[](3);
        amounts[0] = 100e18;
        amounts[1] = 250e18;
        amounts[2] = 75e18;
        uint256 total = 100e18 + 250e18 + 75e18;

        token.approve(address(disperser), total);
        disperser.disperseToken(address(token), recipients, amounts);

        assertEq(token.balanceOf(alice), 100e18);
        assertEq(token.balanceOf(bob), 250e18);
        assertEq(token.balanceOf(carol), 75e18);
    }

    function test_disperseToken_noDustLeftInContract() public {
        address[] memory recipients = _recipients3();
        uint256[] memory amounts = new uint256[](3);
        amounts[0] = 100e18;
        amounts[1] = 200e18;
        amounts[2] = 300e18;
        uint256 total = 600e18;

        token.approve(address(disperser), total);
        disperser.disperseToken(address(token), recipients, amounts);

        assertEq(token.balanceOf(address(disperser)), 0);
    }
}
