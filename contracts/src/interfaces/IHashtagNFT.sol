// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

interface IHashtagNFT {
    function mint(address to, uint256 tokenId) external;
    function burn(uint256 tokenId) external;
    function forceTransfer(address to, uint256 tokenId) external;
    function ownerOf(uint256 tokenId) external view returns (address);
    function totalSupply() external view returns (uint256);
}
