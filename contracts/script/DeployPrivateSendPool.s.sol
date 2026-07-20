// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console} from "forge-std/Script.sol";
import {PrivateSendPool} from "../src/PrivateSendPool.sol";

contract DeployPrivateSendPool is Script {
    function run() external {
        vm.startBroadcast();

        PrivateSendPool pool = new PrivateSendPool();

        vm.stopBroadcast();

        console.log("PrivateSendPool deployed at:", address(pool));
    }
}
