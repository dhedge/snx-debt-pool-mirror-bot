const {Factory} = require('dhedge-sdk')

const CREATE_POOL = false
const POOL_ADDRESS = '0x64e62a3206704acbce13a8b9c194f792e61399e5';

require("dotenv").config()
const ethers = require('ethers');
const BigNumber = require('ethers/utils/bignumber');
const SynthetixJs = require('synthetix-js');
const infura = new ethers.providers.InfuraProvider('homestead', process.env.ARCHIVE_NODE);
const snxjs = new SynthetixJs.SynthetixJs({provider: infura});

// const {SynthetixJs} = require('synthetix-js');
// const snxjs = new SynthetixJs(); //uses default ContractSettings - ethers.js default provider, mainnet

const toUtf8Bytes = SynthetixJs.SynthetixJs.utils.formatBytes32String;
const formatEther = snxjs.utils.formatEther;
const fromBlock = "";
const blockOptions = fromBlock ? {blockTag: Number(fromBlock)} : {};


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

    const synths = snxjs.contractSettings.synths.map(({name}) => name);
    let totalInUSD = 0;
    let totalInUSDAboveTwoPercent = 0;
    const snxPrice = await snxjs.ExchangeRates.contract.rateForCurrency(toUtf8Bytes('SNX'), blockOptions) / 1e18;
    let results = [];
    for (let synth in synths) {
        console.log("getting synth: " + synths[synth]);
        await getSynthInfo(synths[synth], results);
    }

    console.log('got results');
    let composition = await pool.getComposition()
    results = results.sort((a, b) => a.totalSupplyInUSD > b.totalSupplyInUSD ? -1 : 1);
    results.forEach(r => {
        totalInUSD += r.totalSupplyInUSD;
    });
    console.log("Total value of all synths is: " + totalInUSD);
    let filteredResults = [];
    results.forEach(r => {
        if ((r.totalSupplyInUSD * 100 / totalInUSD) > 2) {
            filteredResults.push(r);
        }
    });
    filteredResults.forEach(r => {
        totalInUSDAboveTwoPercent += r.totalSupplyInUSD;
    });
    console.log("Total value of all synths above 2% is: " + totalInUSDAboveTwoPercent);
    let rebalancingFactor = totalInUSD / totalInUSDAboveTwoPercent;
    console.log("rebalancingFactor is: " + rebalancingFactor);
    for (let r in filteredResults) {
        let result = results[r];
        console.log("checking synth: " + result.synth);
        await checkSynth(result.synth, result.totalSupply, result.totalSupplyInUSD, exchangeRates, composition, pool, totalInUSD, rebalancingFactor);
    }

})()

async function checkSynth(synth, totalSupply, totalSupplyInUSD, exchangeRates, composition, pool, totalInUSD, rebalancingFactor) {
    try {
        console.log("Synth " + synth);
        console.log(synth + " totalSupply " + totalSupply);
        console.log(synth + "totalSupplyInUSD " + totalSupplyInUSD);
        let synthPercentageInDebt = totalSupplyInUSD * 100 / totalInUSD;
        console.log(synth + ' percentage in debt', synthPercentageInDebt);
        let rebalancedSynthPercentageInDebt = synthPercentageInDebt * rebalancingFactor;
        console.log(synth + ' rebalanced percentage in debt', rebalancedSynthPercentageInDebt);

        let sUSD = await pool.getAsset('sUSD')

        //await depositSUSD(sUSD, pool); // Deposit 2000sUSD

        let sUsdEffectiveValue = composition['sUSD'].balance
        console.log('sUSD in sUSD', sUsdEffectiveValue.toString() / 1e18)
        let totalValue = await pool.getPoolValue();
        let susdPercentageInPool = sUsdEffectiveValue * 100 / totalValue;
        console.log('sUSD percentage in pool', susdPercentageInPool);

        if (!synth.includes("sUSD")) {
            let synthEffectiveValue = 0;
            if (composition[synth] != undefined) {
                synthEffectiveValue = await exchangeRates.getEffectiveValue(
                    synth,
                    composition[synth].balance.toString(),
                    'sUSD'
                )
            }
            console.log(synth + ' sUSD value in pool: ', synthEffectiveValue.toString())
            let totalValue = await pool.getPoolValue();
            let synthPercentageInPool = synthEffectiveValue * 100 / totalValue;
            console.log(synth + 'percentage in pool', synthPercentageInPool);
            if (Math.abs(synthPercentageInPool - rebalancedSynthPercentageInDebt) > 1) {
                console.log(synth + ' diverges more than 1%, a rebalance is needed');

                let asset = null;
                try {
                    asset = await pool.getAsset(synth)
                } catch (e) {
                    await pool.addAsset(synth);
                    try {
                        asset = await pool.getAsset(synth);
                    } catch (e) {
                        console.log("Error approving synth: " + synth, e);
                    }
                }
                if (asset) {
                    rebalancedSynthPercentageInDebt = Math.round((rebalancedSynthPercentageInDebt + Number.EPSILON) * 100) / 100;
                    let target = totalValue.mul(BigNumber.bigNumberify(rebalancedSynthPercentageInDebt * 100))
                        .div(BigNumber.bigNumberify(10000)).sub(synthEffectiveValue);
                    if ((synthPercentageInPool - rebalancedSynthPercentageInDebt) < 0) {
                        await pool.exchange('sUSD', target, synth)
                    } else {
                        // swap synth to sUSD
                        let synthToExchange = await exchangeRates.getEffectiveValue(
                            'sUSD',
                            target,
                            synth
                        )
                        await pool.exchange(synth, synthToExchange, 'sUSD');
                    }
                }
            }
        }
    } catch (e) {
        console.log("Error checkings if rebalancing is needed ", e);
    }
}

async function getSynthInfo(synth, results) {
    const totalAmount = await snxjs[synth].contract.totalSupply(blockOptions);
    const totalSupply = formatEther(totalAmount);
    const rateForSynth = await snxjs.ExchangeRates.contract.rateForCurrency(toUtf8Bytes(synth), blockOptions) / 1e18;
    const totalSupplyInUSD = rateForSynth * totalSupply;
    const rateIsFrozen = await snxjs.ExchangeRates.contract.rateIsFrozen(toUtf8Bytes(synth), blockOptions);
    console.log(synth + " frozen value is: ", rateIsFrozen);
    results.push({synth, totalAmount, totalSupply, rateForSynth, totalSupplyInUSD, rateIsFrozen});
}

async function depositSUSD(sUSD, pool) {
    await sUSD.approve(pool.getAddress(), '1000000000000000000000') // Approve 1000sUSD
    await pool.deposit('1000000000000000000000') // Deposit 1000sUSD
}
