// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {HashtagNFT} from "../src/HashtagNFT.sol";
import {HashtagResolver} from "../src/HashtagResolver.sol";

/// @notice Drives random register/pay/renew/split-update sequences against a fixed
/// pool of hashtags and actors. Every payment path forwards funds out in the same
/// call that receives them, so the resolver should never accrete a native balance.
contract Handler is Test {
    HashtagResolver public resolver;
    string[3] public hashtags = ["alpha", "bravo", "charlie"];
    address[3] public actors;

    constructor(HashtagResolver _resolver, address[3] memory _actors) {
        resolver = _resolver;
        actors = _actors;
    }

    function _emptySocials() internal pure returns (HashtagResolver.SocialLink[] memory socials) {
        socials = new HashtagResolver.SocialLink[](0);
    }

    function register(uint256 hashtagSeed, uint256 actorSeed) external {
        string memory hashtag = hashtags[hashtagSeed % hashtags.length];
        address actor = actors[actorSeed % actors.length];

        if (resolver.isActive(hashtag)) return; // not currently registrable

        vm.prank(actor);
        try resolver.registerHashtag(hashtag, "x", "", "", _emptySocials(), bytes32(0)) {} catch {}
    }

    function renew(uint256 hashtagSeed, uint256 actorSeed) external {
        string memory hashtag = hashtags[hashtagSeed % hashtags.length];
        address actor = actors[actorSeed % actors.length];

        vm.prank(actor);
        try resolver.renewSubscription(hashtag) {} catch {}
    }

    function updatePayouts(uint256 hashtagSeed, uint16 bpsA) external {
        string memory hashtag = hashtags[hashtagSeed % hashtags.length];
        if (!resolver.isActive(hashtag)) return;

        address owner_;
        try resolver.hashtagOwner(hashtag) returns (address o) {
            owner_ = o;
        } catch {
            return;
        }

        bpsA = uint16(bound(bpsA, 1, 9999));
        HashtagResolver.PayoutConfig[] memory payouts = new HashtagResolver.PayoutConfig[](2);
        payouts[0] = HashtagResolver.PayoutConfig({wallet: actors[0], percentageBps: bpsA});
        payouts[1] = HashtagResolver.PayoutConfig({wallet: actors[1], percentageBps: 10000 - bpsA});

        vm.prank(owner_);
        try resolver.updatePayouts(hashtag, payouts) {} catch {}
    }

    function pay(uint256 hashtagSeed, uint256 actorSeed, uint256 amount) external {
        string memory hashtag = hashtags[hashtagSeed % hashtags.length];
        address actor = actors[actorSeed % actors.length];
        amount = bound(amount, 0, 10 ether);

        vm.deal(actor, actor.balance + amount);
        vm.prank(actor);
        try resolver.receivePayment{value: amount}(hashtag) {} catch {}
    }

    function warp(uint256 secondsForward) external {
        secondsForward = bound(secondsForward, 0, 40 days);
        vm.warp(block.timestamp + secondsForward);
    }
}

contract HashtagResolverInvariantTest is Test {
    HashtagNFT nft;
    HashtagResolver resolver;
    Handler handler;

    function setUp() public {
        address deployer = address(this);
        address feeWallet = makeAddr("feeWallet");
        address[3] memory actors = [makeAddr("actorA"), makeAddr("actorB"), makeAddr("actorC")];

        nft = new HashtagNFT(deployer);
        resolver = new HashtagResolver(address(0), feeWallet, deployer);
        nft.setResolver(address(resolver));
        resolver.setNftContract(address(nft));

        handler = new Handler(resolver, actors);

        targetContract(address(handler));
    }

    /// @dev Every native-value entrypoint (fees, payments) forwards funds out in the
    /// same transaction it receives them in — the resolver should never hold a
    /// balance between calls, across any sequence of register/renew/pay/split-update.
    function invariant_resolverNeverHoldsNativeBalance() public view {
        assertEq(address(resolver).balance, 0);
    }
}
