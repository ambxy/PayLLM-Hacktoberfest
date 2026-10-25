// SPDX-License-Identifier: MIT
pragma solidity ^0.8.37;
import {BankTD} from './BankTD.sol';
contract TDLockVault {
    BankTD public immutable token;
    address public immutable bank;
    struct Lock { address customer; uint256 originalAmount; uint256 remainingAmount; }
    mapping(bytes32=>Lock) public locks;
    mapping(bytes32=>bool) public redemptions;
    mapping(address=>uint256) public lockedByCustomer;
    uint256 public totalLocked;
    event Locked(bytes32 indexed lockId,address indexed customer,uint256 amount);
    event Released(bytes32 indexed redemptionId,bytes32 indexed lockId,address indexed customer,uint256 amount,bytes32 settlementRef);
    constructor(address token_,address bank_) { require(token_ != address(0) && bank_ != address(0)); token=BankTD(token_); require(token.bank()==bank_); bank=bank_; }
    modifier onlyBank() { require(msg.sender==bank,'bank only'); _; }
    function lockFor(address customer,uint256 amount,bytes32 id) external onlyBank {
        _lock(customer,amount,id);
    }
    function lockBatchFor(address customer,uint256[] calldata amounts,bytes32[] calldata ids) external onlyBank {
        require(amounts.length>0 && amounts.length==ids.length,'batch');
        for(uint256 i=0;i<amounts.length;i++) _lock(customer,amounts[i],ids[i]);
    }
    function _lock(address customer,uint256 amount,bytes32 id) private {
        require(amount>0 && locks[id].customer==address(0),'lock');
        locks[id]=Lock(customer,amount,amount); lockedByCustomer[customer]+=amount; totalLocked+=amount;
        token.lockTransfer(customer,amount,id); emit Locked(id,customer,amount);
    }
    function release(bytes32 lockId,uint256 amount,bytes32 id,bytes32 settlementRef) external onlyBank {
        Lock storage l=locks[lockId];
        require(amount>0 && l.remainingAmount==amount && !redemptions[id] && settlementRef!=bytes32(0),'redemption');
        redemptions[id]=true; l.remainingAmount=0; lockedByCustomer[l.customer]-=amount; totalLocked-=amount;
        token.unlockTransfer(l.customer,amount,id); emit Released(id,lockId,l.customer,amount,settlementRef);
    }
}
