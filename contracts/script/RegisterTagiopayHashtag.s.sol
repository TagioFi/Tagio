// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console} from "forge-std/Script.sol";
import {HashtagResolver} from "../src/HashtagResolver.sol";

/// @notice One-off: registers the official #tagiopay hashtag to the deployer/owner
/// wallet. Recovery hash is the keccak256 of a phrase generated and stored locally
/// (backend/.secrets/tagiopay-recovery-phrase.txt, gitignored) — never committed.
contract RegisterTagiopayHashtag is Script {
    address constant RESOLVER = 0x1326bBA97a060b6c4B445E0dD83342203795725E;

    function run() external {
        bytes32 recoveryHash = vm.envBytes32("RECOVERY_HASH");

        HashtagResolver.SocialLink[] memory socials = new HashtagResolver.SocialLink[](1);
        socials[0] = HashtagResolver.SocialLink({key: "x", value: "tagiopay"});

        vm.startBroadcast();

        uint256 tokenId = HashtagResolver(RESOLVER).registerHashtag(
            "tagiopay",
            "TagioPay",
            "https://tagiopay.com/favicon.png",
            "https://tagiopay.com",
            socials,
            recoveryHash
        );

        vm.stopBroadcast();

        console.log("Registered #tagiopay, tokenId:", tokenId);
    }
}
