# Synthetix Debt Pool Mirror Fund bot
This bot uses [dHedge SDK](https://github.com/dhedge/dhedge-sdk) to manage a fund which mirrors the synths distribution in Synthetix debt pool.  
The intent of the pool is to offer a hedging set&forget tool to Synthetix minters so that they don't need to worry about their debt becoming larger than the value of the Synths they own.  

# Rebalancing logic
To ensure the value of the Synths in the pool is as close to the debt value as possible the trading logic needs to minimize the trades needed to track the debt, as each trade incurs trading fees.    
For this purpose only Synths that have a larger than **2% share** in the debt pool will be added to this fund.
  
After a Synth is added to the pool, the bot checks if a rebalancing is needed every 10 minutes. If a Synth's debt pool share diverges more than 1% to its share in this fund, the Synth will be rebalanced.  

# Fees
The fund is sponsored by dHedge and this incurs no management or performance fees. Gas needed to run by the bot is also sponsored by dHedge.
    
# Other info
Debt pool details are fetched using [synthetix-js](https://github.com/Synthetixio/synthetix-js) library.  

