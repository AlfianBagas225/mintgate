// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/// @notice TEST-ONLY mock of the SPACE ID Agent ID ERC-721 registry.
/// @dev Deployed ONLY on local test chains (ganache). NOT part of the
///      hackathon submission, NOT deployed to BSC, NOT verified anywhere.
///      Deliberately minimal: mint + transfer without approvals, just enough
///      for balanceOf-based gating tests.
contract MockAgentID {
    mapping(address => uint256) private _balances;
    mapping(uint256 => address) private _owners;
    uint256 private _nextId = 1;

    event Transfer(address indexed from, address indexed to, uint256 indexed tokenId);

    function mint(address to) external returns (uint256 tokenId) {
        require(to != address(0), "zero address");
        tokenId = _nextId++;
        _owners[tokenId] = to;
        _balances[to] += 1;
        emit Transfer(address(0), to, tokenId);
    }

    function transfer(address to, uint256 tokenId) external {
        require(_owners[tokenId] == msg.sender, "not owner");
        require(to != address(0), "zero address");
        _owners[tokenId] = to;
        _balances[msg.sender] -= 1;
        _balances[to] += 1;
        emit Transfer(msg.sender, to, tokenId);
    }

    function balanceOf(address account) external view returns (uint256) {
        return _balances[account];
    }

    function ownerOf(uint256 tokenId) external view returns (address) {
        return _owners[tokenId];
    }
}
