// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {HashtagNFT} from "../src/HashtagNFT.sol";
import {HashtagResolver} from "../src/HashtagResolver.sol";
import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

contract MockSettlementToken is ERC20 {
    constructor() ERC20("Mock USDC", "mUSDC") {
        _mint(msg.sender, 1_000_000e18);
    }
}

contract HashtagResolverTest is Test {
    HashtagNFT nft;
    HashtagResolver resolver;
    MockSettlementToken token;

    address owner = address(this);
    address alice = address(0xA11CE);
    address bob = address(0xB0B);
    address feeWallet = address(0xFEE);

    function setUp() public {
        token = new MockSettlementToken();
        nft = new HashtagNFT(owner);
        resolver = new HashtagResolver(address(token), feeWallet, owner);

        nft.setResolver(address(resolver));
        resolver.setNftContract(address(nft));

        token.transfer(alice, 10_000e18);
    }

    function _emptySocials() internal pure returns (HashtagResolver.SocialLink[] memory socials) {
        socials = new HashtagResolver.SocialLink[](0);
    }

    function test_isValidHashtag_acceptsLowercaseAlphanumericUnderscore() public view {
        assertTrue(resolver.isValidHashtag("finance_1"));
        assertFalse(resolver.isValidHashtag("Finance"));
        assertFalse(resolver.isValidHashtag("fi"));
        assertFalse(resolver.isValidHashtag("this_hashtag_is_way_too_long_to_be_valid_here"));
        assertFalse(resolver.isValidHashtag("has space"));
    }

    function test_registerHashtag_mintsNftAndStoresAccount() public {
        vm.prank(alice);
        uint256 tokenId = resolver.registerHashtag("finance", "Finance", "", "", _emptySocials(), bytes32(0));

        assertEq(nft.ownerOf(tokenId), alice);
        assertEq(resolver.hashtagOwner("finance"), alice);
        assertTrue(resolver.isActive("finance"));
    }

    function test_registerHashtag_revertsOnDuplicate() public {
        vm.prank(alice);
        resolver.registerHashtag("finance", "Finance", "", "", _emptySocials(), bytes32(0));

        vm.prank(bob);
        vm.expectRevert(HashtagResolver.HashtagAlreadyExists.selector);
        resolver.registerHashtag("finance", "Finance", "", "", _emptySocials(), bytes32(0));
    }

    function test_registerHashtag_revertsOnInvalidFormat() public {
        vm.expectRevert(HashtagResolver.InvalidHashtag.selector);
        resolver.registerHashtag("Not_Valid!", "x", "", "", _emptySocials(), bytes32(0));
    }

    function test_updatePayouts_requiresExactBpsSum() public {
        vm.startPrank(alice);
        resolver.registerHashtag("finance", "Finance", "", "", _emptySocials(), bytes32(0));

        HashtagResolver.PayoutConfig[] memory bad = new HashtagResolver.PayoutConfig[](1);
        bad[0] = HashtagResolver.PayoutConfig({wallet: bob, percentageBps: 9999});
        vm.expectRevert(HashtagResolver.InvalidPercentageSum.selector);
        resolver.updatePayouts("finance", bad);

        HashtagResolver.PayoutConfig[] memory good = new HashtagResolver.PayoutConfig[](2);
        good[0] = HashtagResolver.PayoutConfig({wallet: alice, percentageBps: 5000});
        good[1] = HashtagResolver.PayoutConfig({wallet: bob, percentageBps: 5000});
        resolver.updatePayouts("finance", good);
        vm.stopPrank();

        HashtagResolver.PayoutConfig[] memory stored = resolver.getPayouts("finance");
        assertEq(stored.length, 2);
    }

    function test_receivePayment_splitsNativeAccordingToPayouts() public {
        vm.prank(alice);
        resolver.registerHashtag("finance", "Finance", "", "", _emptySocials(), bytes32(0));

        HashtagResolver.PayoutConfig[] memory payouts = new HashtagResolver.PayoutConfig[](2);
        payouts[0] = HashtagResolver.PayoutConfig({wallet: alice, percentageBps: 7000});
        payouts[1] = HashtagResolver.PayoutConfig({wallet: bob, percentageBps: 3000});
        vm.prank(alice);
        resolver.updatePayouts("finance", payouts);

        uint256 aliceBefore = alice.balance;
        uint256 bobBefore = bob.balance;

        resolver.receivePayment{value: 1 ether}("finance");

        assertEq(alice.balance - aliceBefore, 0.7 ether);
        assertEq(bob.balance - bobBefore, 0.3 ether);
    }

    function test_receivePayment_revertsWhenSubscriptionExpired() public {
        vm.prank(alice);
        resolver.registerHashtag("finance", "Finance", "", "", _emptySocials(), bytes32(0));

        vm.warp(block.timestamp + resolver.SUBSCRIPTION_DURATION() + resolver.GRACE_PERIOD() + 1);

        vm.expectRevert(HashtagResolver.SubscriptionExpired.selector);
        resolver.receivePayment{value: 1 ether}("finance");
    }

    function test_renewSubscription_extendsExpiry() public {
        vm.prank(alice);
        resolver.registerHashtag("finance", "Finance", "", "", _emptySocials(), bytes32(0));

        HashtagResolver.HashtagAccount memory before = resolver.getAccount("finance");
        resolver.renewSubscription("finance");
        HashtagResolver.HashtagAccount memory afterRenew = resolver.getAccount("finance");

        assertEq(afterRenew.expiresAt, before.expiresAt + resolver.SUBSCRIPTION_DURATION());
    }

    function test_transferViaRecoveryPhrase_movesOwnership() public {
        bytes32 recoveryHash = keccak256(bytes("correct horse battery staple"));
        vm.prank(alice);
        resolver.registerHashtag("finance", "Finance", "", "", _emptySocials(), recoveryHash);

        vm.expectRevert(HashtagResolver.InvalidRecoveryPhrase.selector);
        resolver.transferViaRecoveryPhrase("finance", "wrong phrase", bob);

        resolver.transferViaRecoveryPhrase("finance", "correct horse battery staple", bob);
        assertEq(resolver.hashtagOwner("finance"), bob);
    }

    function test_updatePayouts_revertsForNonOwner() public {
        vm.prank(alice);
        resolver.registerHashtag("finance", "Finance", "", "", _emptySocials(), bytes32(0));

        HashtagResolver.PayoutConfig[] memory payouts = new HashtagResolver.PayoutConfig[](1);
        payouts[0] = HashtagResolver.PayoutConfig({wallet: bob, percentageBps: 10000});

        vm.prank(bob);
        vm.expectRevert(HashtagResolver.NotOwner.selector);
        resolver.updatePayouts("finance", payouts);
    }
}
