// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console} from "forge-std/Script.sol";
import {HashtagNFT} from "../src/HashtagNFT.sol";
import {HashtagResolver} from "../src/HashtagResolver.sol";

contract Deploy is Script {
    function run() external {
        address deployer = vm.envAddress("DEPLOYER_ADDRESS");
        address settlementToken = vm.envAddress("SETTLEMENT_TOKEN_ADDRESS");
        address feeWallet = vm.envOr("FEE_WALLET_ADDRESS", deployer);

        vm.startBroadcast();

        HashtagNFT nft = new HashtagNFT(deployer);
        HashtagResolver resolver = new HashtagResolver(settlementToken, feeWallet, deployer);

        nft.setResolver(address(resolver));
        resolver.setNftContract(address(nft));

        vm.stopBroadcast();

        console.log("HashtagNFT deployed at:", address(nft));
        console.log("HashtagResolver deployed at:", address(resolver));
    }
}
