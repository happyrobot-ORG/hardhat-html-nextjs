// 导入 Hardhat 对象，包含当前网络信息和 ethers 库
const { network, ethers } = require("hardhat")
// 导入自定义配置，包括网络参数、开发链列表和验证时区块确认数
const {
    networkConfig,
    developmentChains,
    VERIFICATION_BLOCK_CONFIRMATIONS,
} = require("../helper-hardhat-config")
// 导入合约验证工具，用于在 etherscan 上自动验证合约
const { verify } = require("../utils/verify")

// 本地测试时为模拟 Chainlink VRF 订阅充值的金额，1 Ether
const FUND_AMOUNT = ethers.utils.parseEther("1") // 1 Ether, or 1e18 (10^18) Wei

module.exports = async ({ getNamedAccounts, deployments }) => {
    const { deploy, log } = deployments
    // 获取命名账户中的 deployer 地址
    const { deployer } = await getNamedAccounts()
    const chainId = network.config.chainId
    let vrfCoordinatorV2Address, subscriptionId, vrfCoordinatorV2Mock

    if (chainId == 31337) {
        // 如果是本地开发链（默认 hardhat 区块链）
        // 使用 Mock VRFCoordinator 合约模拟 Chainlink VRF 逻辑
        vrfCoordinatorV2Mock = await ethers.getContract("VRFCoordinatorV2Mock")
        vrfCoordinatorV2Address = vrfCoordinatorV2Mock.address
        // 本地模拟创建 VRF v2 订阅
        const transactionResponse = await vrfCoordinatorV2Mock.createSubscription()
        const transactionReceipt = await transactionResponse.wait()
        subscriptionId = transactionReceipt.events[0].args.subId
        // 为模拟订阅充值
        // 由于这是 mock 合约，不需要真实发送 LINK
        await vrfCoordinatorV2Mock.fundSubscription(subscriptionId, FUND_AMOUNT)
    } else {
        // 如果是测试网或主网，使用配置文件中的 VRFCoordinator 地址和已有 subscriptionId
        vrfCoordinatorV2Address = networkConfig[chainId]["vrfCoordinatorV2"]
        subscriptionId = networkConfig[chainId]["subscriptionId"]
    }

    // 根据网络类型决定等待多少个区块确认
    // 开发链只需等待 1 个区块确认，真实链则按配置等待更多确认
    const waitBlockConfirmations = developmentChains.includes(network.name)
        ? 1
        : VERIFICATION_BLOCK_CONFIRMATIONS

    log("----------------------------------------------------")
    // 构造部署 Raffle 合约时的参数列表
    const arguments = [
        vrfCoordinatorV2Address,
        subscriptionId,
        networkConfig[chainId]["gasLane"],
        networkConfig[chainId]["keepersUpdateInterval"],
        networkConfig[chainId]["raffleEntranceFee"],
        networkConfig[chainId]["callbackGasLimit"],
    ]
    const raffle = await deploy("Raffle", {
        from: deployer,
        args: arguments,
        log: true,
        waitConfirmations: waitBlockConfirmations,
    })

    // 如果是本地开发链，需要把 Raffle 合约添加到 VRFCoordinatorV2Mock 的消费者列表中
    // 这样 mock VRFCoordinator 才会允许这个合约请求随机数
    if (developmentChains.includes(network.name)) {
        const vrfCoordinatorV2Mock = await ethers.getContract("VRFCoordinatorV2Mock")
        await vrfCoordinatorV2Mock.addConsumer(subscriptionId, raffle.address)
    }

    // 如果是在真实网络并且配置了 Etherscan API Key，则自动验证合约
    if (!developmentChains.includes(network.name) && process.env.ETHERSCAN_API_KEY) {
        log("Verifying...")
        await verify(raffle.address, arguments)
    }

    // 输出后续手动进入抽奖的命令提示
    log("Enter lottery with command:")
    const networkName = network.name == "hardhat" ? "localhost" : network.name
    log(`yarn hardhat run scripts/enterRaffle.js --network ${networkName}`)
    log("----------------------------------------------------")
}

// 设置部署脚本标签，方便使用 hardhat deploy --tags 过滤执行
module.exports.tags = ["all", "raffle"]
