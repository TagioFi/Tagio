// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {IHashtagNFT} from "./interfaces/IHashtagNFT.sol";

/// @title HashtagResolver
/// @notice Onchain hashtag identity, metadata, and payment-splitting registry for
/// TagioPay on Robinhood Chain. One merged contract handles registration, metadata,
/// payments, and payout routing. Hashtag ownership has exactly one source of truth —
/// the companion HashtagNFT's `ownerOf` — this contract stores no separate owner field.
contract HashtagResolver is Ownable, ReentrancyGuard, Pausable {
    using SafeERC20 for IERC20;

    struct SocialLink {
        string key;
        string value;
    }

    struct PayoutConfig {
        address wallet;
        uint16 percentageBps;
    }

    struct HashtagAccount {
        string hashtag;
        string name;
        string imageUrl;
        string websiteUrl;
        SocialLink[] socials;
        uint256 registeredAt;
        uint256 nftTokenId;
        uint256 expiresAt;
        bytes32 recoveryHash;
        uint256 totalVolume;
        PayoutConfig[] payouts;
    }

    uint256 public constant MIN_HASHTAG_LEN = 3;
    uint256 public constant MAX_HASHTAG_LEN = 32;
    uint256 public constant MAX_NAME_LEN = 64;
    uint256 public constant MAX_URL_LEN = 256;
    uint256 public constant MAX_SOCIALS = 8;
    uint256 public constant MAX_SOCIAL_KEY = 32;
    uint256 public constant MAX_SOCIAL_VAL = 128;
    uint256 public constant MAX_PAYOUTS = 10;
    uint16 public constant TOTAL_BPS = 10000;
    uint256 public constant SUBSCRIPTION_DURATION = 30 days;
    uint256 public constant GRACE_PERIOD = 72 hours;

    /// @dev address(0) means "native Robinhood ETH" rather than an ERC-20. Mutable —
    /// TagioPay has no token at deploy time and will point this at one later.
    address public settlementToken;

    IHashtagNFT public nftContract;
    address public feeWallet;
    uint256 public registrationFee;
    uint256 public renewalFee;

    mapping(string => HashtagAccount) private accounts;
    mapping(string => bool) private registered;
    mapping(uint256 => string) public tokenIdToHashtag;

    event HashtagRegistered(string indexed hashtag, string name, address indexed registrant, uint256 timestamp);
    event MetadataUpdated(string indexed hashtag);
    event PayoutsUpdated(string indexed hashtag, PayoutConfig[] newPayouts);
    event PaymentReceived(string indexed hashtag, uint256 amount, bool isNative);
    event SubscriptionRenewed(string indexed hashtag, uint256 newExpiry);
    event HashtagTransferred(string indexed hashtag, address indexed oldOwner, address indexed newOwner, uint256 timestamp);
    event HashtagReclaimed(string indexed hashtag, address indexed previousOwner);
    event FeeWalletUpdated(address indexed newFeeWallet);
    event NftContractSet(address indexed nftContract);
    event SettlementTokenUpdated(address indexed newToken);

    error InvalidHashtag();
    error HashtagAlreadyExists();
    error HashtagNotFound();
    error NameTooLong();
    error UrlTooLong();
    error TooManySocials();
    error SocialKeyTooLong();
    error SocialValueTooLong();
    error TooManyPayouts();
    error NoPayouts();
    error InvalidPercentageSum();
    error NotOwner();
    error SubscriptionExpired();
    error InvalidRecoveryPhrase();
    error ZeroAddress();
    error ZeroAmount();
    error NftContractNotSet();
    error PaymentFailed();
    error TokenDistributionFailed();
    error TokenTransferFailed();
    error FeeTransferFailed();
    error SettlementTokenNotSet();
    error IncorrectNativeFee();
    error UnexpectedNativeValue();

    modifier onlyHashtagOwner(string memory hashtag) {
        if (hashtagOwner(hashtag) != msg.sender) revert NotOwner();
        _;
    }

    constructor(address _settlementToken, address _feeWallet, address initialOwner) Ownable(initialOwner) {
        if (_feeWallet == address(0)) revert ZeroAddress();
        settlementToken = _settlementToken;
        feeWallet = _feeWallet;
    }

    // ── Validation ──────────────────────────────────────────────────────────

    function isValidHashtag(string memory hashtag) public pure returns (bool) {
        bytes memory b = bytes(hashtag);
        if (b.length < MIN_HASHTAG_LEN || b.length > MAX_HASHTAG_LEN) return false;
        for (uint256 i = 0; i < b.length; i++) {
            bytes1 c = b[i];
            bool isLower = c >= 0x61 && c <= 0x7A;
            bool isDigit = c >= 0x30 && c <= 0x39;
            bool isUnderscore = c == 0x5F;
            if (!isLower && !isDigit && !isUnderscore) return false;
        }
        return true;
    }

    function isActive(string memory hashtag) public view returns (bool) {
        return registered[hashtag] && block.timestamp <= accounts[hashtag].expiresAt + GRACE_PERIOD;
    }

    /// @notice The single source of truth for who owns a hashtag — reads the NFT
    /// directly rather than any separately-tracked field, so a standard ERC-721
    /// transfer (e.g. via a marketplace) is instantly reflected here.
    function hashtagOwner(string memory hashtag) public view returns (address) {
        if (!registered[hashtag]) revert HashtagNotFound();
        return nftContract.ownerOf(_tokenId(hashtag));
    }

    function _tokenId(string memory hashtag) private pure returns (uint256) {
        return uint256(keccak256(bytes(hashtag)));
    }

    // ── Registration ────────────────────────────────────────────────────────

    /// @notice Registers an unclaimed (or expired-and-reclaimable) hashtag. Permissionless.
    function registerHashtag(
        string calldata hashtag,
        string calldata name,
        string calldata imageUrl,
        string calldata websiteUrl,
        SocialLink[] calldata socials,
        bytes32 recoveryHash
    ) external payable nonReentrant returns (uint256 tokenId) {
        if (address(nftContract) == address(0)) revert NftContractNotSet();
        if (!isValidHashtag(hashtag)) revert InvalidHashtag();
        _validateMetadataLengths(name, imageUrl, websiteUrl, socials);

        tokenId = _tokenId(hashtag);

        if (registered[hashtag]) {
            if (isActive(hashtag)) revert HashtagAlreadyExists();
            address staleOwner = nftContract.ownerOf(tokenId);
            nftContract.burn(tokenId);
            delete accounts[hashtag];
            emit HashtagReclaimed(hashtag, staleOwner);
        }

        _collectFee(registrationFee);

        HashtagAccount storage account = accounts[hashtag];
        account.hashtag = hashtag;
        account.name = name;
        account.imageUrl = imageUrl;
        account.websiteUrl = websiteUrl;
        account.registeredAt = block.timestamp;
        account.nftTokenId = tokenId;
        account.expiresAt = block.timestamp + SUBSCRIPTION_DURATION;
        account.recoveryHash = recoveryHash;

        for (uint256 i = 0; i < socials.length; i++) {
            account.socials.push(socials[i]);
        }

        registered[hashtag] = true;
        tokenIdToHashtag[tokenId] = hashtag;

        nftContract.mint(msg.sender, tokenId);

        emit HashtagRegistered(hashtag, name, msg.sender, block.timestamp);
    }

    /// @notice Extends a hashtag's subscription. Callable by anyone (fee-sponsorship
    /// only — this never changes ownership), each caller pays their own gas.
    function renewSubscription(string calldata hashtag) external payable nonReentrant {
        if (!registered[hashtag]) revert HashtagNotFound();

        _collectFee(renewalFee);

        HashtagAccount storage account = accounts[hashtag];
        uint256 base = block.timestamp > account.expiresAt ? block.timestamp : account.expiresAt;
        account.expiresAt = base + SUBSCRIPTION_DURATION;

        emit SubscriptionRenewed(hashtag, account.expiresAt);
    }

    /// @dev Collects a fee in whatever `settlementToken` currently is. address(0)
    /// means native — the caller must send exactly `feeAmount` as msg.value. A real
    /// ERC-20 means msg.value must be zero and the fee is pulled via transferFrom.
    function _collectFee(uint256 feeAmount) private {
        if (feeAmount == 0) {
            if (msg.value != 0) revert UnexpectedNativeValue();
            return;
        }

        if (settlementToken == address(0)) {
            if (msg.value != feeAmount) revert IncorrectNativeFee();
            (bool ok,) = feeWallet.call{value: feeAmount}("");
            if (!ok) revert FeeTransferFailed();
        } else {
            if (msg.value != 0) revert UnexpectedNativeValue();
            if (!IERC20(settlementToken).transferFrom(msg.sender, feeWallet, feeAmount)) {
                revert FeeTransferFailed();
            }
        }
    }

    // ── Metadata & payouts ───────────────────────────────────────────────────

    function updateMetadata(
        string calldata hashtag,
        string calldata name,
        string calldata imageUrl,
        string calldata websiteUrl,
        SocialLink[] calldata socials
    ) external onlyHashtagOwner(hashtag) {
        _validateMetadataLengths(name, imageUrl, websiteUrl, socials);

        HashtagAccount storage account = accounts[hashtag];
        account.name = name;
        account.imageUrl = imageUrl;
        account.websiteUrl = websiteUrl;

        delete account.socials;
        for (uint256 i = 0; i < socials.length; i++) {
            account.socials.push(socials[i]);
        }

        emit MetadataUpdated(hashtag);
    }

    function updatePayouts(string calldata hashtag, PayoutConfig[] calldata newPayouts)
        external
        onlyHashtagOwner(hashtag)
    {
        if (newPayouts.length == 0) revert NoPayouts();
        if (newPayouts.length > MAX_PAYOUTS) revert TooManyPayouts();

        uint256 sum;
        for (uint256 i = 0; i < newPayouts.length; i++) {
            if (newPayouts[i].wallet == address(0)) revert ZeroAddress();
            sum += newPayouts[i].percentageBps;
        }
        if (sum != TOTAL_BPS) revert InvalidPercentageSum();

        HashtagAccount storage account = accounts[hashtag];
        delete account.payouts;
        for (uint256 i = 0; i < newPayouts.length; i++) {
            account.payouts.push(newPayouts[i]);
        }

        emit PayoutsUpdated(hashtag, newPayouts);
    }

    // ── Payments ─────────────────────────────────────────────────────────────

    function receivePayment(string calldata hashtag) external payable nonReentrant whenNotPaused {
        if (msg.value == 0) revert ZeroAmount();
        if (!isActive(hashtag)) revert SubscriptionExpired();

        HashtagAccount storage account = accounts[hashtag];
        _distributeNative(hashtag, account, msg.value);

        account.totalVolume += msg.value;
        emit PaymentReceived(hashtag, msg.value, true);
    }

    function receiveTokenPayment(string calldata hashtag, uint256 amount) external nonReentrant whenNotPaused {
        if (settlementToken == address(0)) revert SettlementTokenNotSet();
        if (amount == 0) revert ZeroAmount();
        if (!isActive(hashtag)) revert SubscriptionExpired();

        IERC20(settlementToken).safeTransferFrom(msg.sender, address(this), amount);

        HashtagAccount storage account = accounts[hashtag];
        _distributeToken(hashtag, account, amount);

        account.totalVolume += amount;
        emit PaymentReceived(hashtag, amount, false);
    }

    function _distributeNative(string memory hashtag, HashtagAccount storage account, uint256 amount) private {
        PayoutConfig[] storage payouts = account.payouts;
        if (payouts.length == 0) {
            (bool ok,) = hashtagOwner(hashtag).call{value: amount}("");
            if (!ok) revert PaymentFailed();
            return;
        }

        uint256 distributed;
        for (uint256 i = 0; i < payouts.length; i++) {
            uint256 share = i == payouts.length - 1
                ? amount - distributed
                : (amount * payouts[i].percentageBps) / TOTAL_BPS;
            distributed += share;
            (bool ok,) = payouts[i].wallet.call{value: share}("");
            if (!ok) revert TokenDistributionFailed();
        }
    }

    function _distributeToken(string memory hashtag, HashtagAccount storage account, uint256 amount) private {
        PayoutConfig[] storage payouts = account.payouts;
        if (payouts.length == 0) {
            IERC20(settlementToken).safeTransfer(hashtagOwner(hashtag), amount);
            return;
        }

        uint256 distributed;
        for (uint256 i = 0; i < payouts.length; i++) {
            uint256 share = i == payouts.length - 1
                ? amount - distributed
                : (amount * payouts[i].percentageBps) / TOTAL_BPS;
            distributed += share;
            IERC20(settlementToken).safeTransfer(payouts[i].wallet, share);
        }
    }

    // ── Transfer & recovery ──────────────────────────────────────────────────

    function transferHashtag(string calldata hashtag, address to) external nonReentrant {
        if (to == address(0)) revert ZeroAddress();
        address currentOwner = hashtagOwner(hashtag);
        if (msg.sender != currentOwner) revert NotOwner();

        nftContract.forceTransfer(to, _tokenId(hashtag));

        emit HashtagTransferred(hashtag, currentOwner, to, block.timestamp);
    }

    function transferViaRecoveryPhrase(string calldata hashtag, string calldata recoveryPhrase, address newOwner)
        external
        nonReentrant
    {
        if (newOwner == address(0)) revert ZeroAddress();
        if (!registered[hashtag]) revert HashtagNotFound();
        if (keccak256(bytes(recoveryPhrase)) != accounts[hashtag].recoveryHash) revert InvalidRecoveryPhrase();

        address oldOwner = hashtagOwner(hashtag);
        nftContract.forceTransfer(newOwner, _tokenId(hashtag));

        emit HashtagTransferred(hashtag, oldOwner, newOwner, block.timestamp);
    }

    // ── Reads ────────────────────────────────────────────────────────────────

    function getAccount(string calldata hashtag) external view returns (HashtagAccount memory) {
        if (!registered[hashtag]) revert HashtagNotFound();
        return accounts[hashtag];
    }

    function getPayouts(string calldata hashtag) external view returns (PayoutConfig[] memory) {
        return accounts[hashtag].payouts;
    }

    // ── Admin ────────────────────────────────────────────────────────────────

    function setNftContract(address _nftContract) external onlyOwner {
        if (_nftContract == address(0)) revert ZeroAddress();
        nftContract = IHashtagNFT(_nftContract);
        emit NftContractSet(_nftContract);
    }

    function setFeeWallet(address _feeWallet) external onlyOwner {
        if (_feeWallet == address(0)) revert ZeroAddress();
        feeWallet = _feeWallet;
        emit FeeWalletUpdated(_feeWallet);
    }

    function setFees(uint256 _registrationFee, uint256 _renewalFee) external onlyOwner {
        registrationFee = _registrationFee;
        renewalFee = _renewalFee;
    }

    /// @notice address(0) switches back to native Robinhood ETH. Existing fee amounts
    /// are denominated in whatever the *new* token's units are — set fees accordingly.
    function setSettlementToken(address _token) external onlyOwner {
        settlementToken = _token;
        emit SettlementTokenUpdated(_token);
    }

    function pause() external onlyOwner {
        _pause();
    }

    function unpause() external onlyOwner {
        _unpause();
    }

    function _validateMetadataLengths(
        string calldata name,
        string calldata imageUrl,
        string calldata websiteUrl,
        SocialLink[] calldata socials
    ) private pure {
        if (bytes(name).length > MAX_NAME_LEN) revert NameTooLong();
        if (bytes(imageUrl).length > MAX_URL_LEN) revert UrlTooLong();
        if (bytes(websiteUrl).length > MAX_URL_LEN) revert UrlTooLong();
        if (socials.length > MAX_SOCIALS) revert TooManySocials();
        for (uint256 i = 0; i < socials.length; i++) {
            if (bytes(socials[i].key).length > MAX_SOCIAL_KEY) revert SocialKeyTooLong();
            if (bytes(socials[i].value).length > MAX_SOCIAL_VAL) revert SocialValueTooLong();
        }
    }
}
