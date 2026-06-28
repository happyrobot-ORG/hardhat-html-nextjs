// 导入 Chai 断言库，用于编写测试断言
const { assert, expect } = require("chai")
// 导入 Hardhat 提供的 helper，用于获取账户、合约实例和当前网络信息
const { getNamedAccounts, ethers, network } = require("hardhat")
// 导入自定义配置，区分本地开发链和远程网络
const { developmentChains } = require("../../helper-hardhat-config")

// 如果当前网络属于开发链，则跳过这个 staging 测试
// staging 测试是给真实测试网/主网环境准备的，不适合本地测试链运行
developmentChains.includes(network.name)
    ? describe.skip
    : describe("Raffle Staging Tests", function () {
          let raffle, raffleEntranceFee, deployer

          beforeEach(async function () {
              // 获取命名账户中的 deployer 地址
              deployer = (await getNamedAccounts()).deployer
              // 获取已部署的 Raffle 合约实例，并让 deployer 作为调用者
              raffle = await ethers.getContract("Raffle", deployer)
              // 查询进入抽奖所需的最低费用
              raffleEntranceFee = await raffle.getEntranceFee()
          })

          describe("fulfillRandomWords", function () {
              it("works with live Chainlink Keepers and Chainlink VRF, we get a random winner", async function () {
                  // 记录测试开始日志
                  console.log("Setting up test...")
                  // 获取当前合约的最后时间戳，用于后面判断事件后的时间是否更新
                  const startingTimeStamp = await raffle.getLastTimeStamp()
                  // 获取本地测试环境的账户列表，默认 accounts[0] 是 deployer
                  const accounts = await ethers.getSigners()

                  console.log("Setting up Listener...")
                  await new Promise(async (resolve, reject) => {
                      // 在进入抽奖之前先设置事件监听器，避免错过 WinnerPicked 事件
                      // 这里使用一次性监听器，事件触发后自动执行回调
                      raffle.once("WinnerPicked", async () => {
                          console.log("WinnerPicked event fired!")
                          try {
                              // 事件触发后获取最新状态并执行断言
                              const recentWinner = await raffle.getRecentWinner()
                              const raffleState = await raffle.getRaffleState()
                              const winnerEndingBalance = await accounts[0].getBalance()
                              const endingTimeStamp = await raffle.getLastTimeStamp()

                              // 玩家列表已重置，读取第一个玩家应当失败
                              await expect(raffle.getPlayer(0)).to.be.reverted
                              // 最近中奖者应当是第一个账户
                              assert.equal(recentWinner.toString(), accounts[0].address)
                              // 抽奖状态应当已重置为 OPEN（对应枚举值 0）
                              assert.equal(raffleState, 0)
                              // 中奖者余额应当增加 entranceFee
                              assert.equal(
                                  winnerEndingBalance.toString(),
                                  winnerStartingBalance.add(raffleEntranceFee).toString()
                              )
                              // 时间戳应当被更新为更大值
                              assert(endingTimeStamp > startingTimeStamp)
                              resolve()
                          } catch (error) {
                              console.log(error)
                              reject(error)
                          }
                      })
                      // 进入抽奖，支付入场费
                      console.log("Entering Raffle...")
                      const tx = await raffle.enterRaffle({ value: raffleEntranceFee })
                      await tx.wait(1)
                      console.log("Ok, time to wait...")
                      // 保存进入抽奖后的账户余额，用来和中奖后余额比较
                      const winnerStartingBalance = await accounts[0].getBalance()

                      // 这里的 Promise 会一直等待，直到 WinnerPicked 事件被监听器处理完毕
                  })
              })
          })
      })
