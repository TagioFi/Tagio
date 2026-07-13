// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {HashtagNFT} from "../src/HashtagNFT.sol";
import {HashtagResolver} from "../src/HashtagResolver.sol";
import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";
import {IERC721Receiver} from "@openzeppelin/contracts/token/ERC721/IERC721Receiver.sol";

contract MockSettlementToken is ERC20 {
    constructor() ERC20("Mock USDC", "mUSDC") {
        _mint(msg.sender, 1_000_000e18);
    }
}

/// @dev Accepts the hashtag NFT (so registration succeeds) but rejects plain native
/// transfers, to exercise the payout-failure path in receivePayment.
contract RevertingReceiver is IERC721Receiver {
    function onERC721Received(address, address, uint256, bytes calldata) external pure returns (bytes4) {
        return IERC721Receiver.onERC721Received.selector;
    }

    receive() external payable {
        revert("nope");
    }
}

contract HashtagResolverTest is Test {
    HashtagNFT nft;
    HashtagResolver resolver;
    MockSettlementToken token;

    address deployer = address(this);
    address alice = makeAddr("alice");
    address bob = makeAddr("bob");
    address carol = makeAddr("carol");
    address feeWallet = makeAddr("feeWallet");

    uint256 constant SUBSCRIPTION = 30 days;
    uint256 constant GRACE = 72 hours;

    function setUp() public {
        token = new MockSettlementToken();
        nft = new HashtagNFT(deployer);
        // Deploy with native settlement (address(0)) by default, matching the real
        // deploy plan: TagioPay has no token yet.
        resolver = new HashtagResolver(address(0), feeWallet, deployer);

        nft.setResolver(address(resolver));
        resolver.setNftContract(address(nft));

        token.transfer(alice, 100_000e18);
        token.transfer(bob, 100_000e18);
        vm.deal(alice, 100 ether);
        vm.deal(bob, 100 ether);
        vm.deal(carol, 100 ether);
    }

    function _emptySocials() internal pure returns (HashtagResolver.SocialLink[] memory socials) {
        socials = new HashtagResolver.SocialLink[](0);
    }

    function _register(address who, string memory hashtag) internal returns (uint256 tokenId) {
        vm.prank(who);
        tokenId = resolver.registerHashtag(hashtag, "Name", "", "", _emptySocials(), bytes32(0));
    }

    // ── isValidHashtag ────────────────────────────────────────────────────────

    function test_isValidHashtag_boundaries() public view {
        assertFalse(resolver.isValidHashtag("ab")); // 2 chars, too short
        assertTrue(resolver.isValidHashtag("abc")); // 3 chars, min
        assertTrue(resolver.isValidHashtag("finance_1"));
        assertFalse(resolver.isValidHashtag("Finance")); // uppercase
        assertFalse(resolver.isValidHashtag("has space"));
        assertFalse(resolver.isValidHashtag("has-dash"));
        assertFalse(resolver.isValidHashtag("has.dot"));
    }

    function test_isValidHashtag_exactly32CharsIsValid() public view {
        bytes memory b = new bytes(32);
        for (uint256 i = 0; i < 32; i++) b[i] = "a";
        assertTrue(resolver.isValidHashtag(string(b)));
    }

    function test_isValidHashtag_33CharsIsInvalid() public view {
        bytes memory b = new bytes(33);
        for (uint256 i = 0; i < 33; i++) b[i] = "a";
        assertFalse(resolver.isValidHashtag(string(b)));
    }

    function testFuzz_isValidHashtag_lengthOutOfRangeAlwaysInvalid(uint8 len) public view {
        vm.assume(len < 3 || len > 32);
        bytes memory b = new bytes(len);
        for (uint256 i = 0; i < len; i++) b[i] = "a";
        assertFalse(resolver.isValidHashtag(string(b)));
    }

    // ── registerHashtag ──────────────────────────────────────────────────────

    function test_registerHashtag_mintsNftAndStoresAccount() public {
        uint256 tokenId = _register(alice, "finance");

        assertEq(nft.ownerOf(tokenId), alice);
        assertEq(resolver.hashtagOwner("finance"), alice);
        assertTrue(resolver.isActive("finance"));
        assertEq(tokenId, uint256(keccak256(bytes("finance"))));
    }

    function test_registerHashtag_revertsWhenNftContractNotSet() public {
        HashtagResolver freshResolver = new HashtagResolver(address(0), feeWallet, deployer);
        vm.expectRevert(HashtagResolver.NftContractNotSet.selector);
        freshResolver.registerHashtag("finance", "x", "", "", _emptySocials(), bytes32(0));
    }

    function test_registerHashtag_revertsOnInvalidFormat() public {
        vm.expectRevert(HashtagResolver.InvalidHashtag.selector);
        resolver.registerHashtag("Not_Valid!", "x", "", "", _emptySocials(), bytes32(0));
    }

    function test_registerHashtag_revertsOnDuplicateWhileActive() public {
        _register(alice, "finance");

        vm.prank(bob);
        vm.expectRevert(HashtagResolver.HashtagAlreadyExists.selector);
        resolver.registerHashtag("finance", "x", "", "", _emptySocials(), bytes32(0));
    }

    function test_registerHashtag_revertsMetadataTooLong() public {
        string memory tooLongName = _repeat("a", resolver.MAX_NAME_LEN() + 1);
        vm.expectRevert(HashtagResolver.NameTooLong.selector);
        resolver.registerHashtag("finance", tooLongName, "", "", _emptySocials(), bytes32(0));

        string memory tooLongUrl = _repeat("a", resolver.MAX_URL_LEN() + 1);
        vm.expectRevert(HashtagResolver.UrlTooLong.selector);
        resolver.registerHashtag("finance2", "x", tooLongUrl, "", _emptySocials(), bytes32(0));
    }

    function test_registerHashtag_revertsTooManySocials() public {
        HashtagResolver.SocialLink[] memory socials = new HashtagResolver.SocialLink[](resolver.MAX_SOCIALS() + 1);
        for (uint256 i = 0; i < socials.length; i++) {
            socials[i] = HashtagResolver.SocialLink({key: "k", value: "v"});
        }
        vm.expectRevert(HashtagResolver.TooManySocials.selector);
        resolver.registerHashtag("finance", "x", "", "", socials, bytes32(0));
    }

    function test_registerHashtag_revertsSocialKeyOrValueTooLong() public {
        HashtagResolver.SocialLink[] memory socials = new HashtagResolver.SocialLink[](1);
        socials[0] = HashtagResolver.SocialLink({key: _repeat("k", resolver.MAX_SOCIAL_KEY() + 1), value: "v"});
        vm.expectRevert(HashtagResolver.SocialKeyTooLong.selector);
        resolver.registerHashtag("finance", "x", "", "", socials, bytes32(0));

        socials[0] = HashtagResolver.SocialLink({key: "k", value: _repeat("v", resolver.MAX_SOCIAL_VAL() + 1)});
        vm.expectRevert(HashtagResolver.SocialValueTooLong.selector);
        resolver.registerHashtag("finance2", "x", "", "", socials, bytes32(0));
    }

    // ── Reclaim after expiry ─────────────────────────────────────────────────

    function test_registerHashtag_cannotReclaimDuringGracePeriod() public {
        _register(alice, "finance");
        vm.warp(block.timestamp + SUBSCRIPTION + 1); // expired, but still in grace

        vm.prank(bob);
        vm.expectRevert(HashtagResolver.HashtagAlreadyExists.selector);
        resolver.registerHashtag("finance", "x", "", "", _emptySocials(), bytes32(0));
    }

    function test_registerHashtag_reclaimableAfterExpiryAndGrace() public {
        uint256 tokenId = _register(alice, "finance");
        vm.warp(block.timestamp + SUBSCRIPTION + GRACE + 1);

        vm.expectEmit(true, true, false, true);
        emit HashtagResolver.HashtagReclaimed("finance", alice);
        uint256 newTokenId = _register(bob, "finance");

        assertEq(newTokenId, tokenId); // tokenId is deterministic, unchanged across reclaim
        assertEq(nft.ownerOf(tokenId), bob);
        assertEq(resolver.hashtagOwner("finance"), bob);
        assertTrue(resolver.isActive("finance"));
    }

    function test_registerHashtag_reclaimBurnsOldNftBeforeReminting() public {
        uint256 tokenId = _register(alice, "finance");
        assertEq(nft.balanceOf(alice), 1);

        vm.warp(block.timestamp + SUBSCRIPTION + GRACE + 1);
        _register(bob, "finance");

        assertEq(nft.balanceOf(alice), 0); // old NFT was burned, not left dangling
        assertEq(nft.balanceOf(bob), 1);
        assertEq(nft.ownerOf(tokenId), bob);
    }

    function test_registerHashtag_reclaimWipesStalePayoutsAndSocials() public {
        _register(alice, "finance");
        HashtagResolver.PayoutConfig[] memory payouts = new HashtagResolver.PayoutConfig[](1);
        payouts[0] = HashtagResolver.PayoutConfig({wallet: alice, percentageBps: 10000});
        vm.prank(alice);
        resolver.updatePayouts("finance", payouts);

        vm.warp(block.timestamp + SUBSCRIPTION + GRACE + 1);
        _register(bob, "finance");

        HashtagResolver.HashtagAccount memory account = resolver.getAccount("finance");
        assertEq(account.payouts.length, 0);
    }

    // ── renewSubscription ────────────────────────────────────────────────────

    function test_renewSubscription_revertsIfNeverRegistered() public {
        vm.expectRevert(HashtagResolver.HashtagNotFound.selector);
        resolver.renewSubscription("finance");
    }

    function test_renewSubscription_extendsFromCurrentExpiryWhenNotYetExpired() public {
        _register(alice, "finance");
        HashtagResolver.HashtagAccount memory before = resolver.getAccount("finance");

        vm.warp(block.timestamp + 5 days);
        resolver.renewSubscription("finance");

        HashtagResolver.HashtagAccount memory afterRenew = resolver.getAccount("finance");
        assertEq(afterRenew.expiresAt, before.expiresAt + SUBSCRIPTION);
    }

    function test_renewSubscription_extendsFromNowWhenAlreadyExpired() public {
        _register(alice, "finance");
        vm.warp(block.timestamp + SUBSCRIPTION + GRACE - 1); // still just barely active

        resolver.renewSubscription("finance");
        HashtagResolver.HashtagAccount memory account = resolver.getAccount("finance");
        assertEq(account.expiresAt, block.timestamp + SUBSCRIPTION);
    }

    function test_renewSubscription_callableByAnyone() public {
        _register(alice, "finance");
        vm.prank(carol); // not the owner
        resolver.renewSubscription("finance");
        assertTrue(resolver.isActive("finance"));
        assertEq(resolver.hashtagOwner("finance"), alice); // ownership unchanged
    }

    // ── Fees (native + ERC20) ────────────────────────────────────────────────

    function test_registerHashtag_nativeFee_requiresExactAmount() public {
        resolver.setFees(0.01 ether, 0);

        vm.expectRevert(HashtagResolver.IncorrectNativeFee.selector);
        vm.prank(alice);
        resolver.registerHashtag{value: 0.005 ether}("finance", "x", "", "", _emptySocials(), bytes32(0));

        uint256 feeWalletBefore = feeWallet.balance;
        vm.prank(alice);
        resolver.registerHashtag{value: 0.01 ether}("finance", "x", "", "", _emptySocials(), bytes32(0));
        assertEq(feeWallet.balance - feeWalletBefore, 0.01 ether);
    }

    function test_registerHashtag_zeroFee_revertsOnUnexpectedValue() public {
        vm.expectRevert(HashtagResolver.UnexpectedNativeValue.selector);
        vm.prank(alice);
        resolver.registerHashtag{value: 1 wei}("finance", "x", "", "", _emptySocials(), bytes32(0));
    }

    function test_registerHashtag_erc20Fee_pullsViaTransferFromAndRejectsNativeValue() public {
        resolver.setSettlementToken(address(token));
        resolver.setFees(100e18, 0);

        vm.prank(alice);
        vm.expectRevert(HashtagResolver.UnexpectedNativeValue.selector);
        resolver.registerHashtag{value: 1 wei}("finance", "x", "", "", _emptySocials(), bytes32(0));

        vm.prank(alice);
        token.approve(address(resolver), 100e18);
        uint256 feeWalletBefore = token.balanceOf(feeWallet);
        vm.prank(alice);
        resolver.registerHashtag("finance", "x", "", "", _emptySocials(), bytes32(0));
        assertEq(token.balanceOf(feeWallet) - feeWalletBefore, 100e18);
    }

    function test_registerHashtag_erc20Fee_revertsWithoutApproval() public {
        resolver.setSettlementToken(address(token));
        resolver.setFees(100e18, 0);

        vm.prank(alice);
        vm.expectRevert();
        resolver.registerHashtag("finance", "x", "", "", _emptySocials(), bytes32(0));
    }

    // ── Metadata & payouts (owner-gated via NFT ownership) ──────────────────

    function test_updateMetadata_ownerOnly() public {
        _register(alice, "finance");

        vm.prank(bob);
        vm.expectRevert(HashtagResolver.NotOwner.selector);
        resolver.updateMetadata("finance", "New", "", "", _emptySocials());

        vm.prank(alice);
        resolver.updateMetadata("finance", "New", "img", "site", _emptySocials());
        HashtagResolver.HashtagAccount memory account = resolver.getAccount("finance");
        assertEq(account.name, "New");
    }

    function test_updateMetadata_gatingFollowsDirectNftTransfer() public {
        uint256 tokenId = _register(alice, "finance");

        vm.prank(alice);
        nft.transferFrom(alice, bob, tokenId); // bypasses the resolver entirely

        assertEq(resolver.hashtagOwner("finance"), bob);

        vm.prank(alice);
        vm.expectRevert(HashtagResolver.NotOwner.selector);
        resolver.updateMetadata("finance", "New", "", "", _emptySocials());

        vm.prank(bob);
        resolver.updateMetadata("finance", "New", "", "", _emptySocials());
    }

    function test_updatePayouts_requiresExactBpsSum() public {
        _register(alice, "finance");

        HashtagResolver.PayoutConfig[] memory bad = new HashtagResolver.PayoutConfig[](1);
        bad[0] = HashtagResolver.PayoutConfig({wallet: bob, percentageBps: 9999});
        vm.prank(alice);
        vm.expectRevert(HashtagResolver.InvalidPercentageSum.selector);
        resolver.updatePayouts("finance", bad);

        HashtagResolver.PayoutConfig[] memory good = new HashtagResolver.PayoutConfig[](2);
        good[0] = HashtagResolver.PayoutConfig({wallet: alice, percentageBps: 5000});
        good[1] = HashtagResolver.PayoutConfig({wallet: bob, percentageBps: 5000});
        vm.prank(alice);
        resolver.updatePayouts("finance", good);

        assertEq(resolver.getPayouts("finance").length, 2);
    }

    function test_updatePayouts_revertsEmptyTooManyAndZeroAddress() public {
        _register(alice, "finance");

        vm.startPrank(alice);
        vm.expectRevert(HashtagResolver.NoPayouts.selector);
        resolver.updatePayouts("finance", new HashtagResolver.PayoutConfig[](0));

        HashtagResolver.PayoutConfig[] memory tooMany = new HashtagResolver.PayoutConfig[](resolver.MAX_PAYOUTS() + 1);
        vm.expectRevert(HashtagResolver.TooManyPayouts.selector);
        resolver.updatePayouts("finance", tooMany);

        HashtagResolver.PayoutConfig[] memory zeroAddr = new HashtagResolver.PayoutConfig[](1);
        zeroAddr[0] = HashtagResolver.PayoutConfig({wallet: address(0), percentageBps: 10000});
        vm.expectRevert(HashtagResolver.ZeroAddress.selector);
        resolver.updatePayouts("finance", zeroAddr);
        vm.stopPrank();
    }

    // ── Payments ─────────────────────────────────────────────────────────────

    function test_receivePayment_noPayoutsSendsFullAmountToOwner() public {
        _register(alice, "finance");
        uint256 before = alice.balance;

        resolver.receivePayment{value: 1 ether}("finance");

        assertEq(alice.balance - before, 1 ether);
    }

    function test_receivePayment_splitsAccordingToPayoutsWithDustToLastRecipient() public {
        _register(alice, "finance");
        HashtagResolver.PayoutConfig[] memory payouts = new HashtagResolver.PayoutConfig[](3);
        payouts[0] = HashtagResolver.PayoutConfig({wallet: alice, percentageBps: 3334});
        payouts[1] = HashtagResolver.PayoutConfig({wallet: bob, percentageBps: 3333});
        payouts[2] = HashtagResolver.PayoutConfig({wallet: carol, percentageBps: 3333});
        vm.prank(alice);
        resolver.updatePayouts("finance", payouts);

        uint256 aliceBefore = alice.balance;
        uint256 bobBefore = bob.balance;
        uint256 carolBefore = carol.balance;

        resolver.receivePayment{value: 1 ether}("finance");

        uint256 aliceGain = alice.balance - aliceBefore;
        uint256 bobGain = bob.balance - bobBefore;
        uint256 carolGain = carol.balance - carolBefore;

        assertEq(aliceGain + bobGain + carolGain, 1 ether); // no dust lost or stuck
        assertEq(bobGain, (1 ether * 3333) / 10000);
        assertEq(carolGain, (1 ether * 3333) / 10000);
    }

    function test_receivePayment_revertsZeroAmount() public {
        _register(alice, "finance");
        vm.expectRevert(HashtagResolver.ZeroAmount.selector);
        resolver.receivePayment{value: 0}("finance");
    }

    function test_receivePayment_revertsWhenExpiredPastGrace() public {
        _register(alice, "finance");
        vm.warp(block.timestamp + SUBSCRIPTION + GRACE + 1);

        vm.expectRevert(HashtagResolver.SubscriptionExpired.selector);
        resolver.receivePayment{value: 1 ether}("finance");
    }

    function test_receivePayment_revertsWhenRecipientRejectsNative() public {
        RevertingReceiver rejector = new RevertingReceiver();
        vm.prank(address(rejector));
        resolver.registerHashtag("finance", "x", "", "", _emptySocials(), bytes32(0));

        vm.expectRevert(HashtagResolver.PaymentFailed.selector);
        resolver.receivePayment{value: 1 ether}("finance");
    }

    function test_receiveTokenPayment_revertsWhenSettlementTokenNotSet() public {
        _register(alice, "finance");
        vm.expectRevert(HashtagResolver.SettlementTokenNotSet.selector);
        resolver.receiveTokenPayment("finance", 1e18);
    }

    function test_receiveTokenPayment_splitsAndTracksVolume() public {
        resolver.setSettlementToken(address(token));
        _register(alice, "finance");

        HashtagResolver.PayoutConfig[] memory payouts = new HashtagResolver.PayoutConfig[](2);
        payouts[0] = HashtagResolver.PayoutConfig({wallet: alice, percentageBps: 6000});
        payouts[1] = HashtagResolver.PayoutConfig({wallet: bob, percentageBps: 4000});
        vm.prank(alice);
        resolver.updatePayouts("finance", payouts);

        vm.startPrank(bob);
        token.approve(address(resolver), 1000e18);
        resolver.receiveTokenPayment("finance", 1000e18);
        vm.stopPrank();

        HashtagResolver.HashtagAccount memory account = resolver.getAccount("finance");
        assertEq(account.totalVolume, 1000e18);
    }

    function test_totalVolume_accumulatesPastOldUint64Ceiling() public {
        _register(alice, "finance");
        // uint64 max is ~1.8e19; two payments summing past that must not overflow/wrap.
        uint256 big = 12_000_000_000_000_000_000; // 1.2e19
        resolver.receivePayment{value: big}("finance");
        resolver.receivePayment{value: big}("finance");

        HashtagResolver.HashtagAccount memory account = resolver.getAccount("finance");
        assertEq(account.totalVolume, big * 2);
    }

    // ── Pause ────────────────────────────────────────────────────────────────

    function test_pause_blocksPaymentsAndUnpauseRestores() public {
        _register(alice, "finance");
        resolver.pause();

        vm.expectRevert(Pausable.EnforcedPause.selector);
        resolver.receivePayment{value: 1 ether}("finance");

        resolver.unpause();
        resolver.receivePayment{value: 1 ether}("finance"); // no revert
    }

    function test_pause_onlyOwner() public {
        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, alice));
        resolver.pause();
    }

    // ── Transfer & recovery ──────────────────────────────────────────────────

    function test_transferHashtag_ownerOnly() public {
        _register(alice, "finance");

        vm.prank(bob);
        vm.expectRevert(HashtagResolver.NotOwner.selector);
        resolver.transferHashtag("finance", bob);

        vm.prank(alice);
        resolver.transferHashtag("finance", bob);
        assertEq(resolver.hashtagOwner("finance"), bob);
    }

    function test_transferHashtag_revertsZeroAddress() public {
        _register(alice, "finance");
        vm.prank(alice);
        vm.expectRevert(HashtagResolver.ZeroAddress.selector);
        resolver.transferHashtag("finance", address(0));
    }

    function test_transferViaRecoveryPhrase_movesOwnershipRegardlessOfCaller() public {
        bytes32 recoveryHash = keccak256(bytes("correct horse battery staple"));
        vm.prank(alice);
        resolver.registerHashtag("finance", "x", "", "", _emptySocials(), recoveryHash);

        vm.prank(carol); // caller need not be the owner
        vm.expectRevert(HashtagResolver.InvalidRecoveryPhrase.selector);
        resolver.transferViaRecoveryPhrase("finance", "wrong phrase", bob);

        vm.prank(carol);
        resolver.transferViaRecoveryPhrase("finance", "correct horse battery staple", bob);
        assertEq(resolver.hashtagOwner("finance"), bob);
        assertEq(nft.ownerOf(uint256(keccak256(bytes("finance")))), bob);
    }

    function test_transferViaRecoveryPhrase_revertsForUnregisteredHashtag() public {
        vm.expectRevert(HashtagResolver.HashtagNotFound.selector);
        resolver.transferViaRecoveryPhrase("finance", "anything", bob);
    }

    function test_standardErc721Transfer_isReflectedImmediatelyByResolver() public {
        uint256 tokenId = _register(alice, "finance");

        vm.prank(alice);
        nft.safeTransferFrom(alice, bob, tokenId);

        assertEq(resolver.hashtagOwner("finance"), bob);
    }

    // ── Admin ────────────────────────────────────────────────────────────────

    function test_setNftContract_revertsZeroAddressAndNonOwner() public {
        vm.expectRevert(HashtagResolver.ZeroAddress.selector);
        resolver.setNftContract(address(0));

        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, alice));
        resolver.setNftContract(address(nft));
    }

    function test_setFeeWallet_updatesAndEmits() public {
        vm.expectEmit(true, false, false, false);
        emit HashtagResolver.FeeWalletUpdated(bob);
        resolver.setFeeWallet(bob);
        assertEq(resolver.feeWallet(), bob);
    }

    function test_setSettlementToken_switchesNativeToErc20AndBack() public {
        assertEq(resolver.settlementToken(), address(0));

        resolver.setSettlementToken(address(token));
        assertEq(resolver.settlementToken(), address(token));

        resolver.setSettlementToken(address(0));
        assertEq(resolver.settlementToken(), address(0));
    }

    // ── Fuzz ─────────────────────────────────────────────────────────────────

    function testFuzz_payoutSplit_alwaysDistributesExactAmountNoResidue(uint16 bpsA, uint256 amount) public {
        bpsA = uint16(bound(bpsA, 1, 9999));
        uint16 bpsB = 10000 - bpsA;
        amount = bound(amount, 1, 1000 ether);

        _register(alice, "finance");
        HashtagResolver.PayoutConfig[] memory payouts = new HashtagResolver.PayoutConfig[](2);
        payouts[0] = HashtagResolver.PayoutConfig({wallet: alice, percentageBps: bpsA});
        payouts[1] = HashtagResolver.PayoutConfig({wallet: bob, percentageBps: bpsB});
        vm.prank(alice);
        resolver.updatePayouts("finance", payouts);

        vm.deal(address(this), amount);
        uint256 aliceBefore = alice.balance;
        uint256 bobBefore = bob.balance;

        resolver.receivePayment{value: amount}("finance");

        uint256 distributed = (alice.balance - aliceBefore) + (bob.balance - bobBefore);
        assertEq(distributed, amount);
        assertEq(address(resolver).balance, 0);
    }

    function testFuzz_registerHashtag_reclaimOnlyAllowedAfterExpiryPlusGrace(uint256 warpTo) public {
        _register(alice, "finance");
        warpTo = bound(warpTo, block.timestamp, block.timestamp + SUBSCRIPTION + GRACE);
        vm.warp(warpTo);

        vm.prank(bob);
        vm.expectRevert(HashtagResolver.HashtagAlreadyExists.selector);
        resolver.registerHashtag("finance", "x", "", "", _emptySocials(), bytes32(0));
    }

    function _repeat(string memory s, uint256 times) internal pure returns (string memory result) {
        bytes memory sBytes = bytes(s);
        bytes memory out = new bytes(sBytes.length * times);
        for (uint256 i = 0; i < times; i++) {
            for (uint256 j = 0; j < sBytes.length; j++) {
                out[i * sBytes.length + j] = sBytes[j];
            }
        }
        result = string(out);
    }
}
