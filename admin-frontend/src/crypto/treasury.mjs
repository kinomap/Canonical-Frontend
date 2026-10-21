// Local-only treasury signer. Mnemonic/private keys never enter fetch, storage or API payloads.
import './buffer.mjs'
import { HDKey } from '@scure/bip32'
import { mnemonicToSeedSync, validateMnemonic } from '@scure/bip39'
import { wordlist } from '@scure/bip39/wordlists/english.js'
import { hmac } from '@noble/hashes/hmac.js'
import { sha512 } from '@noble/hashes/sha2.js'
import { concatBytes, utf8ToBytes, bytesToHex } from '@noble/hashes/utils.js'
import { ed25519 } from '@noble/curves/ed25519.js'
import { JsonRpcProvider, Wallet, Contract, parseEther } from 'ethers'
import { TronWeb } from 'tronweb'
import { TonClient, WalletContractV4, internal, SendMode } from '@ton/ton'
import { Address, beginCell, toNano } from '@ton/core'
import { fromMnemonic } from './hd.mjs'

const TON_BASE=698983191
const BSC_USDT_ABI=['function transfer(address to,uint256 value) returns (bool)']
function assertPhrase(phrase){if(typeof phrase!=='string'||!validateMnemonic(phrase.trim(),wordlist))throw new Error('INVALID_BIP39_MNEMONIC')}
function equalKeys(a,b){return a.trc20_xpub===b.trc20_xpub&&a.bep20_xpub===b.bep20_xpub&&a.ton_public_key.toLowerCase()===b.ton_public_key.toLowerCase()}
export function verifyTreasuryMnemonic(phrase,keys){assertPhrase(phrase);if(!equalKeys(fromMnemonic(phrase.trim()),keys))throw new Error('MNEMONIC_DOES_NOT_MATCH_PUBLIC_KEYS');return true}
function privateSecp(phrase,coin,index){const seed=mnemonicToSeedSync(phrase.trim(),'');const root=HDKey.fromMasterSeed(seed);let child;try{child=root.derive(`m/44'/${coin}'/0'/0/${index}`);if(!child.privateKey)throw new Error('PRIVATE_DERIVATION_FAILED');return new Uint8Array(child.privateKey)}finally{seed.fill(0);root.wipePrivateData();child?.wipePrivateData()}}
function tonSeed(phrase){const seed=mnemonicToSeedSync(phrase.trim(),'');let slip;try{slip=hmac(sha512,utf8ToBytes('ed25519 seed'),seed);for(const index of [44,607,0]){const i=new Uint8Array(4);new DataView(i.buffer).setUint32(0,index+0x80000000,false);const next=hmac(sha512,slip.subarray(32),concatBytes(new Uint8Array([0]),slip.subarray(0,32),i));slip.fill(0);slip=next}return new Uint8Array(slip.subarray(0,32))}finally{seed.fill(0);slip?.fill(0)}}
function wipe(...values){for(const v of values)if(v?.fill)v.fill(0)}
export function decimalToRaw(value,decimals){const text=String(value??'').trim();if(!/^(?:0|[1-9]\d*)(?:\.\d+)?$/.test(text))throw new Error('INVALID_AMOUNT');const [whole,fraction='']=text.split('.');if(fraction.length>decimals)throw new Error('TOO_MANY_DECIMALS');return (BigInt(whole)*10n**BigInt(decimals)+BigInt((fraction+'0'.repeat(decimals)).slice(0,decimals)||'0')).toString()}
export function buildTreasuryPlan({phrase,keys,snapshot,provider,mode='consolidate',target='',amountRaw=''}){
 verifyTreasuryMnemonic(phrase,keys)
 const net=snapshot.networks.find(n=>n.provider===provider);if(!net||provider==='stars')throw new Error('NETWORK_NOT_AVAILABLE')
 const actions=[]
 if(mode==='consolidate'){const threshold=provider==='trc20'?35000000n:provider==='bep20'?parseEther('0.00025'):provider==='ton'?0n:toNano('0.07');for(const row of net.active){if(provider!=='ton'&&BigInt(row.gas_raw||0)<threshold)actions.push({type:'gas',from:0,to:row.index});actions.push({type:'sweep',from:row.index,to:0,amount_raw:row.amount_raw})}if(!actions.length)throw new Error('NO_ACTIVE_BALANCES')}
 else{if(!target)throw new Error('TARGET_REQUIRED');let raw=amountRaw||net.master_raw;if(BigInt(raw)>BigInt(net.master_raw))throw new Error('AMOUNT_EXCEEDS_BALANCE');if(provider==='ton'&&BigInt(raw)===BigInt(net.master_raw))raw=(BigInt(net.master_raw)-toNano('0.015')).toString();if(BigInt(raw)<=0n)throw new Error('AMOUNT_REQUIRED');actions.push({type:'withdraw',from:0,to:target,amount_raw:String(raw)})}
 return {provider,mode,master:net.master_address,actions,count:actions.length}
}
async function waitSeqno(wallet,before,tries=45){for(let i=0;i<tries;i++){await new Promise(r=>setTimeout(r,2000));if(await wallet.getSeqno()>before)return}throw new Error('TRANSACTION_CONFIRMATION_TIMEOUT')}
async function tonWallet(client,pub,secret,index){const contract=WalletContractV4.create({workchain:0,publicKey:pub,walletId:TON_BASE+index});const wallet=client.open(contract);return {wallet,secretKey:concatBytes(secret,pub)}}
function jettonTransfer(amount,destination,response){return beginCell().storeUint(0x0f8a7ea5,32).storeUint(0,64).storeCoins(BigInt(amount)).storeAddress(Address.parse(destination)).storeAddress(Address.parse(response)).storeBit(0).storeCoins(1n).storeBit(0).endCell()}
async function sendTon(wallet,secretKey,messages){const seqno=await wallet.getSeqno();await wallet.sendTransfer({seqno,secretKey,sendMode:SendMode.PAY_GAS_SEPARATELY|SendMode.IGNORE_ERRORS,messages});await waitSeqno(wallet,seqno)}
async function executeTon({phrase,snapshot,net,mode,target,amountRaw}){const secret=tonSeed(phrase),pub=ed25519.getPublicKey(secret);const client=new TonClient({endpoint:snapshot.rpc.ton});try{const master=await tonWallet(client,pub,secret,0)
 if(mode==='consolidate')for(const row of net.active){const child=await tonWallet(client,pub,secret,row.index);if(net.provider==='ton'){const raw=BigInt(row.amount_raw);if(raw>toNano('0.02'))await sendTon(child.wallet,child.secretKey,[internal({to:net.master_address,value:raw-toNano('0.015'),bounce:false})])}else{if(BigInt(row.gas_raw)<toNano('0.07'))await sendTon(master.wallet,master.secretKey,[internal({to:row.address,value:toNano('0.09'),bounce:false})]);await sendTon(child.wallet,child.secretKey,[internal({to:row.token_wallet,value:toNano('0.06'),bounce:true,body:jettonTransfer(row.amount_raw,net.master_address,row.address)})])}wipe(child.secretKey)}
 else if(net.provider==='ton')await sendTon(master.wallet,master.secretKey,[internal({to:target,value:BigInt(amountRaw),bounce:false})]);else await sendTon(master.wallet,master.secretKey,[internal({to:net.master_token_wallet,value:toNano('0.06'),bounce:true,body:jettonTransfer(amountRaw,target,net.master_address)})]);wipe(master.secretKey)
 }finally{wipe(secret,pub)}}
async function executeBsc({phrase,snapshot,net,mode,target,amountRaw}){const provider=new JsonRpcProvider(snapshot.rpc.bsc,56,{staticNetwork:true});const masterKey=privateSecp(phrase,60,0),master=new Wallet('0x'+bytesToHex(masterKey),provider);try{if(mode==='consolidate')for(const row of net.active){const key=privateSecp(phrase,60,row.index),child=new Wallet('0x'+bytesToHex(key),provider);try{if(BigInt(row.gas_raw)<parseEther('0.00025'))await (await master.sendTransaction({to:child.address,value:parseEther('0.00035')})).wait(1);await (await new Contract(snapshot.contracts.bep20,BSC_USDT_ABI,child).transfer(master.address,BigInt(row.amount_raw))).wait(1)}finally{wipe(key)}}else await (await new Contract(snapshot.contracts.bep20,BSC_USDT_ABI,master).transfer(target,BigInt(amountRaw))).wait(1)}finally{wipe(masterKey);provider.destroy()}}
async function waitTron(client,txid,tries=60){if(!txid)throw new Error('TRON_BROADCAST_FAILED');for(let i=0;i<tries;i++){await new Promise(r=>setTimeout(r,3000));const info=await client.trx.getTransactionInfo(txid);if(info?.id){if(info.receipt?.result&&info.receipt.result!=='SUCCESS')throw new Error('TRON_TRANSACTION_FAILED');return}}throw new Error('TRANSACTION_CONFIRMATION_TIMEOUT')}
async function executeTron({phrase,snapshot,net,mode,target,amountRaw}){const masterKey=privateSecp(phrase,195,0),masterHex=bytesToHex(masterKey),master=new TronWeb({fullHost:snapshot.rpc.tron,privateKey:masterHex});try{if(mode==='consolidate')for(const row of net.active){const key=privateSecp(phrase,195,row.index),hex=bytesToHex(key),child=new TronWeb({fullHost:snapshot.rpc.tron,privateKey:hex});try{if(BigInt(row.gas_raw)<35000000n){const funded=await master.trx.sendTransaction(row.address,35000000);await waitTron(master,funded.txid||funded.transaction?.txID)}const token=await child.contract().at(snapshot.contracts.trc20);await token.transfer(net.master_address,row.amount_raw).send({feeLimit:40000000})}finally{wipe(key)}}else{const token=await master.contract().at(snapshot.contracts.trc20);await token.transfer(target,amountRaw).send({feeLimit:40000000})}}finally{wipe(masterKey)}}
export async function executeTreasury(input){const {phrase,keys,snapshot,provider,mode='consolidate',target='',amountRaw=''}=input;buildTreasuryPlan(input);const net=snapshot.networks.find(n=>n.provider===provider);try{if(provider==='bep20')return await executeBsc({phrase,snapshot,net,mode,target,amountRaw:amountRaw||net.master_raw});if(provider==='trc20')return await executeTron({phrase,snapshot,net,mode,target,amountRaw:amountRaw||net.master_raw});return await executeTon({phrase,snapshot,net,mode,target,amountRaw:amountRaw||net.master_raw})}finally{input.phrase=''}}
