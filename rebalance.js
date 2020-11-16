const {BigNumber} = require('ethers')
const {Factory} = require('dhedge-sdk')

const CREATE_POOL = false
const POOL_ADDRESS = '0x64e62a3206704acbce13a8b9c194f792e61399e5';

const {SynthetixJs} = require('synthetix-js');
const snxjs = new SynthetixJs(); //uses default ContractSettings - ethers.js default provider, mainnet
const formatEther = snxjs.utils.formatEther;
const toUtf8Bytes = SynthetixJs.utils.formatBytes32String;
const fromBlock = "";
const blockOptions = fromBlock ? { blockTag: Number(fromBlock) } : {};

(async () => {
    const factory = Factory.initialize()

    let exchangeRates = await factory.getExchangeRates()

    let pool;

    if (CREATE_POOL) {

        pool = await factory.createPool(false, 'Rebalancing', 'Rebalancing bot pool', [
            'sETH', 'sDEFI', 'sBTC', 'iBCH'
        ])

    } else {

        pool = await factory.loadPool(POOL_ADDRESS)

    }

    console.log('Summary', await pool.getSummary())

    let sUSD = await pool.getAsset('sUSD')

    //await depositSUSD(sUSD, pool); // Deposit 1000sUSD

    let composition = await pool.getComposition()
    let sUsdEffectiveValue = composition['sUSD'].balance
    console.log('sUSD in sUSD', sUsdEffectiveValue.toString() / 1000000000000000000)

    const synths = snxjs.contractSettings.synths.map(({name}) => name);
    let totalInUSD = 0;
    const snxPrice = await snxjs.ExchangeRates.contract.rateForCurrency(toUtf8Bytes('SNX'), blockOptions) / 1e18;
    let results = await Promise.all(synths.map(async synth => {
        const totalAmount = await snxjs[synth].contract.totalSupply(blockOptions);
        const totalSupply = formatEther(totalAmount);
        const rateForSynth = await snxjs.ExchangeRates.contract.rateForCurrency(toUtf8Bytes(synth), blockOptions) / 1e18;
        const totalSupplyInUSD = rateForSynth * totalSupply;
        totalInUSD += totalSupplyInUSD;
        const rateIsFrozen = await snxjs.ExchangeRates.contract.rateIsFrozen(toUtf8Bytes(synth), blockOptions);
        console.log(synth, rateIsFrozen);
        return {synth, totalAmount, totalSupply, rateForSynth, totalSupplyInUSD, rateIsFrozen};
    }));

    results = results.sort((a, b) => a.totalSupplyInUSD > b.totalSupplyInUSD ? -1 : 1);
    results.forEach(({synth, rateForSynth, totalSupply, totalSupplyInUSD, rateIsFrozen}, i) => {
        console.log("Synth " + synth);
        console.log("totalSupply " + totalSupply);
        console.log("totalSupplyInUSD " + totalSupplyInUSD);
    });
})()


async function depositSUSD(sUSD, pool) {
    await sUSD.approve(pool.getAddress(), '1000000000000000000000') // Approve 1000sUSD
    await pool.deposit('1000000000000000000000') // Deposit 1000sUSD
}
