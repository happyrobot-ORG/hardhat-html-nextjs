// SPDX-License-Identifier: MIT
pragma solidity ^0.8.7;

// 接口定义：当合约被 approveAndCall 调用时，接收者合约需要实现这个接口
interface tokenRecipient {
  function receiveApproval(
    address _from,
    uint256 _value,
    address _token,
    bytes calldata _extraData
  ) external;
}

contract TokenERC20 {
  // 代币名称，例如 "MyToken"
  string public name;
  // 代币符号，例如 "MTK"
  string public symbol;
  // 小数位数，ERC20 规范中一般为 18
  uint8 public decimals = 18;
  // 代币总供应量（按最小单位计数）
  uint256 public totalSupply;

  // 记录每个地址的代币余额
  mapping(address => uint256) public balanceOf;
  // 记录每个地址授权给其他地址的可花费额度
  mapping(address => mapping(address => uint256)) public allowance;

  // 转账事件，链上客户端可监听此事件
  event Transfer(address indexed from, address indexed to, uint256 value);

  // 授权事件，链上客户端可监听此事件
  event Approval(
    address indexed _owner,
    address indexed _spender,
    uint256 _value
  );

  // 销毁事件，记录代币被销毁的地址和数量
  event Burn(address indexed from, uint256 value);

  /**
   * 构造函数
   *
   * 使用初始代币供应量、代币名称和代币符号初始化合约
   * 部署者会获得全部初始代币
   */
  constructor(
    uint256 initialSupply,
    string memory tokenName,
    string memory tokenSymbol
  ) {
    // 计算总供应量，乘以 10^decimals 将代币单位转为最小单位
    totalSupply = initialSupply * 10**uint256(decimals);
    // 将部署者账户赋予全部初始代币
    balanceOf[msg.sender] = totalSupply;
    // 设置代币名称
    name = tokenName;
    // 设置代币符号
    symbol = tokenSymbol;
  }

  /**
   * 内部转账函数，仅在合约内部调用
   *
   * @param _from 转出地址
   * @param _to 转入地址
   * @param _value 转账数量
   */
  function _transfer(
    address _from,
    address _to,
    uint256 _value
  ) internal {
    // 不能转账到 0 地址，若要销毁应使用 burn() 接口
    require(_to != address(0x0));
    // 检查发送者余额是否足够
    require(balanceOf[_from] >= _value);
    // 防止溢出
    require(balanceOf[_to] + _value >= balanceOf[_to]);
    // 保存转账前两者余额之和，用于后续断言检查一致性
    uint256 previousBalances = balanceOf[_from] + balanceOf[_to];
    // 从发送者余额扣除
    balanceOf[_from] -= _value;
    // 给接收者增加余额
    balanceOf[_to] += _value;
    // 触发转账事件
    emit Transfer(_from, _to, _value);
    // 断言转账前后余额总和不变，辅助静态分析发现潜在错误
    assert(balanceOf[_from] + balanceOf[_to] == previousBalances);
  }

  /**
   * 转账函数
   *
   * 将当前调用者的 `_value` 代币发送给 `_to`
   *
   * @param _to 接收地址
   * @param _value 转账数量
   */
  function transfer(address _to, uint256 _value) public returns (bool success) {
    _transfer(msg.sender, _to, _value);
    return true;
  }

  /**
   * 从其他地址转账
   *
   * 将 `_from` 地址的 `_value` 代币发送给 `_to`
   * 前提是当前调用者已经获得 `_from` 的授权
   *
   * @param _from 转出地址
   * @param _to 接收地址
   * @param _value 转账数量
   */
  function transferFrom(
    address _from,
    address _to,
    uint256 _value
  ) public returns (bool success) {
    // 检查当前调用者是否被授权足够额度
    require(_value <= allowance[_from][msg.sender]);
    // 扣减授权额度
    allowance[_from][msg.sender] -= _value;
    _transfer(_from, _to, _value);
    return true;
  }

  /**
   * 授权其他地址
   *
   * 允许 `_spender` 花费调用者最多 `_value` 个代币
   *
   * @param _spender 被授权地址
   * @param _value 授权额度
   */
  function approve(address _spender, uint256 _value)
    public
    returns (bool success)
  {
    allowance[msg.sender][_spender] = _value;
    emit Approval(msg.sender, _spender, _value);
    return true;
  }

  /**
   * 授权并通知
   *
   * 允许 `_spender` 花费调用者最多 `_value` 个代币，
   * 然后调用 `_spender` 合约的 receiveApproval 方法通知它授权完成
   *
   * @param _spender 被授权合约地址
   * @param _value 授权额度
   * @param _extraData 附加数据，会传给目标合约
   */
  function approveAndCall(
    address _spender,
    uint256 _value,
    bytes memory _extraData
  ) public returns (bool success) {
    tokenRecipient spender = tokenRecipient(_spender);
    if (approve(_spender, _value)) {
      spender.receiveApproval(msg.sender, _value, address(this), _extraData);
      return true;
    }
  }

  /**
   * 销毁代币
   *
   * 从调用者账户中永久移除 `_value` 个代币，减少总供应量
   *
   * @param _value 销毁数量
   */
  function burn(uint256 _value) public returns (bool success) {
    // 检查调用者余额是否足够
    require(balanceOf[msg.sender] >= _value);
    // 从余额中扣除销毁数量
    balanceOf[msg.sender] -= _value;
    // 总供应量同步减少
    totalSupply -= _value;
    emit Burn(msg.sender, _value);
    return true;
  }

  /**
   * 从其他账户销毁代币
   *
   * 在 `_from` 已授权当前调用者的前提下，销毁该账户中的 `_value` 代币
   *
   * @param _from 代币来源地址
   * @param _value 销毁数量
   */
  function burnFrom(address _from, uint256 _value)
    public
    returns (bool success)
  {
    // 检查目标地址余额是否足够
    require(balanceOf[_from] >= _value);
    // 检查当前调用者是否有足够授权额度
    require(_value <= allowance[_from][msg.sender]);
    // 从目标地址扣除代币
    balanceOf[_from] -= _value;
    // 扣减授权额度
    allowance[_from][msg.sender] -= _value;
    // 减少总供应量
    totalSupply -= _value;
    emit Burn(_from, _value);
    return true;
  }
}
