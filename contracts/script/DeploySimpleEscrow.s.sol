// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console} from "forge-std/Script.sol";
import {SimpleEscrow} from "../src/SimpleEscrow.sol";

contract DeploySimpleEscrow is Script {
    function run() external {
        vm.startBroadcast();

        SimpleEscrow escrow = new SimpleEscrow();

        vm.stopBroadcast();

        console.log("SimpleEscrow deployed at:", address(escrow));
    }
}
