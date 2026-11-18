// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/// @title MintGate — free-mint board gated to Binance Agent ID holders
/// @author MintGate (Binance Agent ID Hackathon entry, Concept A)
/// @notice A curated board of VERIFIED free mints on BNB Chain. The full
///         mint list and slot reservations are only usable by wallets that
///         hold a Binance Agent ID (SPACE ID registry, ERC-721).
/// @dev Design rules (hackathon red lines):
///      - No payable function: this contract can NEVER receive or hold BNB
///        or tokens. There is nothing for anyone to withdraw.
///      - No tax, no fee, no minting of anything, no pause, no freeze.
///      - Owner can ONLY manage the mint listings (register / activate /
///        deactivate) and transfer or renounce ownership. Owner powers are
///        documented in full in README.md (red line #4).
///      - Agent ID is used ONLY as an access gate (balanceOf >= 1). The
///        contract never looks up, displays, or resolves anyone else's
///        wallet by name (red line #9). `checkIn` stores only a keccak256
///        hash of the caller's own `.ai` name, supplied voluntarily by the
///        caller, and only to count distinct check-ins.
///      - Users interact through their own AI agent + confirm in the
///        Binance app. There is no web login, no QR, no session storage
///        (red lines #1, #2, #3, #6).
interface IAgentIdRegistry {
    function balanceOf(address owner) external view returns (uint256);
}

contract MintGate {
    // ------------------------------------------------------------------------
    // Errors
    // ------------------------------------------------------------------------
    error NotAgentIdHolder();
    error AlreadyCheckedIn();
    error NotCheckedIn();
    error AlreadyReserved();
    error MintNotActive();
    error MintNotFound();
    error NotOwner();
    error ZeroAddress();
    error EmptyName();

    // ------------------------------------------------------------------------
    // Types
    // ------------------------------------------------------------------------
    struct Mint {
        address mintContract; // contract of the curated free mint
        string name; // display name, e.g. "Worldygg Tree"
        uint32 score; // MINTS score (0-100) at curation time
        bytes32 auditHash; // keccak256 of the audit-evidence bundle, see README
        bool active; // owner can deactivate a listing if the mint dies
        uint256 reservedCount; // number of distinct Agent ID wallets reserved
    }

    // ------------------------------------------------------------------------
    // State
    // ------------------------------------------------------------------------
    /// @notice SPACE ID Agent ID registry (ERC-721, non-transferable).
    address public immutable agentIdRegistry;

    /// @notice Owner can ONLY manage mint listings. See NatSpec above.
    address public owner;

    /// @notice Registered mint listings, in registration order.
    Mint[] public mints;

    /// @notice True once an address has checked in (one check-in per address).
    mapping(address => bool) public hasCheckedIn;

    /// @notice keccak256 hash of the check-in's own `.ai` name (bytes32(0) = none given).
    mapping(address => bytes32) public agentNameHash;

    /// @notice Block timestamp of the address's check-in.
    mapping(address => uint256) public checkedInAt;

    /// @notice mintId => agent => has reserved a slot for that mint.
    mapping(uint256 => mapping(address => bool)) public hasReserved;

    /// @notice Total distinct Agent ID addresses that have checked in.
    uint256 public checkInCount;

    // ------------------------------------------------------------------------
    // Events (the read-only frontend indexes these; no login needed)
    // ------------------------------------------------------------------------
    event CheckedIn(address indexed agent, bytes32 indexed agentNameHash, uint256 timestamp);
    event SlotReserved(address indexed agent, uint256 indexed mintId, uint256 timestamp);
    event MintRegistered(
        uint256 indexed mintId, address indexed mintContract, string name, uint32 score, bytes32 auditHash
    );
    event MintStatusChanged(uint256 indexed mintId, bool active);
    event OwnershipTransferred(address indexed previousOwner, address indexed newOwner);

    // ------------------------------------------------------------------------
    // Constructor
    // ------------------------------------------------------------------------
    /// @param _agentIdRegistry SPACE ID Agent ID registry on BNB Chain:
    ///        0x60B9262456dE011F7d15a54CdD8c48bAaa8B022F
    /// @param _initialOwner Owner of this contract (the deploying Agent ID
    ///        wallet). Passed explicitly because deployment goes through a
    ///        factory contract, so msg.sender at construction is the factory,
    ///        not the human/agent owner.
    constructor(address _agentIdRegistry, address _initialOwner) {
        if (_agentIdRegistry == address(0) || _initialOwner == address(0)) revert ZeroAddress();
        agentIdRegistry = _agentIdRegistry;
        owner = _initialOwner;
        emit OwnershipTransferred(address(0), _initialOwner);
    }

    modifier onlyOwner() {
        if (msg.sender != owner) revert NotOwner();
        _;
    }

    // ------------------------------------------------------------------------
    // Views
    // ------------------------------------------------------------------------
    /// @notice True if `account` currently holds at least one Agent ID.
    function isAgent(address account) public view returns (bool) {
        return IAgentIdRegistry(agentIdRegistry).balanceOf(account) > 0;
    }

    /// @notice Number of registered mint listings.
    function totalMints() external view returns (uint256) {
        return mints.length;
    }

    /// @notice Full listing record for `mintId`. Reverts if out of range.
    function getMint(uint256 mintId) external view returns (Mint memory) {
        if (mintId >= mints.length) revert MintNotFound();
        return mints[mintId];
    }

    // ------------------------------------------------------------------------
    // Agent flow (gas only — all functions are non-payable)
    // ------------------------------------------------------------------------
    /// @notice One-time check-in for an Agent ID holder. Records the caller
    ///         as checked in so `reserveSlot` can be used.
    /// @param _agentNameHash keccak256 of the caller's own `.ai` name
    ///        (e.g. keccak256("schizo.ai")); bytes32(0) to stay anonymous.
    function checkIn(bytes32 _agentNameHash) external {
        if (!isAgent(msg.sender)) revert NotAgentIdHolder();
        if (hasCheckedIn[msg.sender]) revert AlreadyCheckedIn();
        hasCheckedIn[msg.sender] = true;
        agentNameHash[msg.sender] = _agentNameHash;
        checkedInAt[msg.sender] = block.timestamp;
        checkInCount += 1;
        emit CheckedIn(msg.sender, _agentNameHash, block.timestamp);
    }

    /// @notice Reserve one slot for mint `mintId`. One slot per address per
    ///         mint. No payment: the reservation itself is free; the actual
    ///         mint (on the listed contract) is free too (value 0) per the
    ///         listing terms. Caller must still hold an Agent ID.
    function reserveSlot(uint256 mintId) external {
        if (!hasCheckedIn[msg.sender]) revert NotCheckedIn();
        if (!isAgent(msg.sender)) revert NotAgentIdHolder();
        if (mintId >= mints.length) revert MintNotFound();
        if (!mints[mintId].active) revert MintNotActive();
        if (hasReserved[mintId][msg.sender]) revert AlreadyReserved();
        hasReserved[mintId][msg.sender] = true;
        mints[mintId].reservedCount += 1;
        emit SlotReserved(msg.sender, mintId, block.timestamp);
    }

    // ------------------------------------------------------------------------
    // Owner: mint listings ONLY (no funds, no pause, no freeze, no tax)
    // ------------------------------------------------------------------------
    /// @notice Register a new curated free mint. `auditHash` is keccak256 of
    ///         the canonical audit-evidence string (see README.md / CURATION.md).
    function registerMint(address mintContract, string calldata name, uint32 score, bytes32 auditHash)
        external
        onlyOwner
        returns (uint256 mintId)
    {
        if (mintContract == address(0)) revert ZeroAddress();
        if (bytes(name).length == 0) revert EmptyName();
        mintId = mints.length;
        mints.push(
            Mint({
                mintContract: mintContract,
                name: name,
                score: score,
                auditHash: auditHash,
                active: true,
                reservedCount: 0
            })
        );
        emit MintRegistered(mintId, mintContract, name, score, auditHash);
    }

    /// @notice Activate / deactivate a listing (e.g. mint sold out or died).
    ///         Deactivation never affects existing reservations or check-ins.
    function setMintActive(uint256 mintId, bool active) external onlyOwner {
        if (mintId >= mints.length) revert MintNotFound();
        mints[mintId].active = active;
        emit MintStatusChanged(mintId, active);
    }

    /// @notice Transfer ownership (e.g. to a multisig later). No other power.
    function transferOwnership(address newOwner) external onlyOwner {
        if (newOwner == address(0)) revert ZeroAddress();
        emit OwnershipTransferred(owner, newOwner);
        owner = newOwner;
    }

    /// @notice Give up ownership forever. Listings then become immutable.
    function renounceOwnership() external onlyOwner {
        emit OwnershipTransferred(owner, address(0));
        owner = address(0);
    }
}
