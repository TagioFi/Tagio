// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ERC721} from "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {IHashtagNFT} from "./interfaces/IHashtagNFT.sol";

/// @notice One NFT per registered hashtag. Minting/burning is delegated to the
/// HashtagResolver, which is set as `resolver` once and is otherwise immutable.
contract HashtagNFT is ERC721, Ownable, IHashtagNFT {
    address public resolver;

    error ResolverAlreadySet();
    error NotResolver();

    modifier onlyResolver() {
        if (msg.sender != resolver) revert NotResolver();
        _;
    }

    constructor(address initialOwner) ERC721("TagioPay Hashtag", "TAGIO") Ownable(initialOwner) {}

    function setResolver(address _resolver) external onlyOwner {
        if (resolver != address(0)) revert ResolverAlreadySet();
        resolver = _resolver;
    }

    uint256 private _supply;

    function mint(address to, uint256 tokenId) external onlyResolver {
        _safeMint(to, tokenId);
        _supply++;
    }

    function burn(uint256 tokenId) external onlyResolver {
        _burn(tokenId);
        _supply--;
    }

    function totalSupply() external view returns (uint256) {
        return _supply;
    }
}
