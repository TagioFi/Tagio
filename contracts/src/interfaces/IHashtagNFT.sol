// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

interface IHashtagNFT {
    function mint(address to, uint256 tokenId) external;
    function burn(uint256 tokenId) external;
    function totalSupply() external view returns (uint256);
}
