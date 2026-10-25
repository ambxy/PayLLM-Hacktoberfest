// SPDX-License-Identifier: MIT
pragma solidity ^0.8.37;
import {ERC20} from '@openzeppelin/contracts/token/ERC20/ERC20.sol';
interface IVaultBinding { function token() external view returns(address); function bank() external view returns(address); }
contract BankTD is ERC20 {
    address public immutable bank;
    address public vault;
    mapping(bytes32 => bool) public processedOperations;
    event Operation(bytes32 indexed operationId, address indexed from, address indexed to, uint256 amount);
    constructor(address bank_) ERC20('Demo Bank TD', 'TD') { require(bank_ != address(0)); bank=bank_; }
    modifier onlyBank() { require(msg.sender == bank, 'bank only'); _; }
    modifier onlyVault() { require(msg.sender == vault && vault != address(0), 'vault only'); _; }
    function decimals() public pure override returns(uint8) { return 0; }
    function bindVault(address v) external onlyBank {
        require(vault == address(0) && v.code.length > 0, 'invalid vault');
        require(IVaultBinding(v).token() == address(this) && IVaultBinding(v).bank() == bank, 'binding'); vault=v;
    }
    function record(bytes32 id, address from, address to, uint256 amount) private {
        require(vault != address(0) && amount > 0 && id != bytes32(0) && !processedOperations[id], 'operation');
        processedOperations[id]=true; emit Operation(id,from,to,amount);
    }
    function mintTo(address to,uint256 amount,bytes32 id) external onlyBank {
        require(to != vault && to != address(0), 'recipient'); record(id,address(0),to,amount); _mint(to,amount);
    }
    function bankTransfer(address from,address to,uint256 amount,bytes32 id) external onlyBank {
        require(from != vault && to != vault && from != address(0) && to != address(0), 'account');
        record(id,from,to,amount); _transfer(from,to,amount);
    }
    function lockTransfer(address from,uint256 amount,bytes32 id) external onlyVault {
        require(from != vault && from != address(0), 'account'); record(id,from,vault,amount); _transfer(from,vault,amount);
    }
    function unlockTransfer(address customer,uint256 amount,bytes32 id) external onlyVault {
        require(customer != vault && customer != address(0), 'account'); record(id,vault,customer,amount); _transfer(vault,customer,amount);
    }
    function transfer(address,uint256) public pure override returns(bool) { revert('bank only'); }
    function transferFrom(address,address,uint256) public pure override returns(bool) { revert('bank only'); }
    function approve(address,uint256) public pure override returns(bool) { revert('bank only'); }
}
