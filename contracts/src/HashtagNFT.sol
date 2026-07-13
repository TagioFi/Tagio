// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ERC721} from "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {IHashtagNFT} from "./interfaces/IHashtagNFT.sol";

/// @notice One NFT per registered hashtag. This NFT is the single source of truth for
/// hashtag ownership — HashtagResolver never stores a separate owner field, it always
/// reads `ownerOf`. Minting, burning, and force-transfers (used for resolver-mediated
/// owner-initiated transfers and recovery-phrase recovery) are delegated to the
/// resolver, set once via `setResolver` and otherwise immutable. Standard ERC-721
/// `transferFrom`/`safeTransferFrom` remain fully usable by holders at all times
/// (e.g. via marketplaces), and immediately change who `hashtagOwner` resolves to.
contract HashtagNFT is ERC721, Ownable, IHashtagNFT {
    address public resolver;
    uint256 private _supply;

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

    function mint(address to, uint256 tokenId) external onlyResolver {
        _safeMint(to, tokenId);
        _supply++;
    }

    function burn(uint256 tokenId) external onlyResolver {
        _burn(tokenId);
        _supply--;
    }

    /// @dev Unchecked transfer bypassing owner/approval requirements — only for the
    /// resolver to move a token on behalf of its current owner (owner-initiated
    /// transfer) or a verified recovery-phrase holder (recovery transfer). The
    /// resolver is solely responsible for authorizing the caller before invoking this.
    function forceTransfer(address to, uint256 tokenId) external onlyResolver {
        _update(to, tokenId, address(0));
    }

    function ownerOf(uint256 tokenId) public view override(ERC721, IHashtagNFT) returns (address) {
        return super.ownerOf(tokenId);
    }

    function totalSupply() external view returns (uint256) {
        return _supply;
    }
}
