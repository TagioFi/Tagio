// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console} from "forge-std/Script.sol";
import {ClaimEscrow} from "../src/ClaimEscrow.sol";

contract DeployClaimEscrow is Script {
    function run() external {
        address deployer = vm.envAddress("DEPLOYER_ADDRESS");
        address attestor = vm.envAddress("CLAIM_ESCROW_ATTESTOR_ADDRESS");

        vm.startBroadcast();

        ClaimEscrow escrow = new ClaimEscrow(attestor, deployer);

        vm.stopBroadcast();

        console.log("ClaimEscrow deployed at:", address(escrow));
        console.log("Attestor:", attestor);
    }
}
