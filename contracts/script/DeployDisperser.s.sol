// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console} from "forge-std/Script.sol";
import {BatchDisperser} from "../src/BatchDisperser.sol";

contract DeployDisperser is Script {
    function run() external {
        vm.startBroadcast();

        BatchDisperser disperser = new BatchDisperser();

        vm.stopBroadcast();

        console.log("BatchDisperser deployed at:", address(disperser));
    }
}
