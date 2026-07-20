// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console} from "forge-std/Script.sol";
import {CauseRegistry} from "../src/CauseRegistry.sol";

contract DeployCauseRegistry is Script {
    function run() external {
        vm.startBroadcast();

        CauseRegistry registry = new CauseRegistry();

        vm.stopBroadcast();

        console.log("CauseRegistry deployed at:", address(registry));
    }
}
