// Watch-only address preview and BIP39/SLIP10 generation; no network/persistence APIs.
import './buffer.mjs'
import { Buffer } from 'buffer'
import { HDKey } from '@scure/bip32'
import { generateMnemonic, mnemonicToSeedSync, validateMnemonic } from '@scure/bip39'
import { wordlist } from '@scure/bip39/wordlists/english.js'
import { keccak_256 } from '@noble/hashes/sha3.js'
import { hmac } from '@noble/hashes/hmac.js'
import { sha512 as slipSha512 } from '@noble/hashes/sha2.js'
import { bytesToHex, hexToBytes, concatBytes, utf8ToBytes } from '@noble/hashes/utils.js'
import { secp256k1 } from '@noble/curves/secp256k1.js'
import { ed25519 } from '@noble/curves/ed25519.js'
import { base58check } from '@scure/base'
import { sha256 } from '@noble/hashes/sha2.js'
import { beginCell, Cell, contractAddress } from '@ton/core'
export const GRAM_MASTER='EQC47093oX5Xhb0xuk2lCr2RhS8rj-vul61u4W2UH5ORmG_O'
export const TON_PATH="m/44'/607'/0'"
const V4R2_BOC='te6ccgECFAEAAtQAART/APSkE/S88sgLAQIBIAIDAgFIBAUE+PKDCNcYINMf0x/THwL4I7vyZO1E0NMf0x/T//QE0VFDuvKhUVG68qIF+QFUEGT5EPKj+AAkpMjLH1JAyx9SMMv/UhD0AMntVPgPAdMHIcAAn2xRkyDXSpbTB9QC+wDoMOAhwAHjACHAAuMAAcADkTDjDQOkyMsfEssfy/8QERITAubQAdDTAyFxsJJfBOAi10nBIJJfBOAC0x8hghBwbHVnvSKCEGRzdHK9sJJfBeAD+kAwIPpEAcjKB8v/ydDtRNCBAUDXIfQEMFyBAQj0Cm+hMbOSXwfgBdM/yCWCEHBsdWe6kjgw4w0DghBkc3RyupJfBuMNBgcCASAICQB4AfoA9AQw+CdvIjBQCqEhvvLgUIIQcGx1Z4MesXCAGFAEywUmzxZY+gIZ9ADLaRfLH1Jgyz8gyYBA+wAGAIpQBIEBCPRZMO1E0IEBQNcgyAHPFvQAye1UAXKwjiOCEGRzdHKDHrFwgBhQBcsFUAPPFiP6AhPLassfyz/JgED7AJJfA+ICASAKCwBZvSQrb2omhAgKBrkPoCGEcNQICEekk30pkQzmkD6f+YN4EoAbeBAUiYcVnzGEAgFYDA0AEbjJftRNDXCx+AA9sp37UTQgQFA1yH0BDACyMoHy//J0AGBAQj0Cm+hMYAIBIA4PABmtznaiaEAga5Drhf/AABmvHfaiaEAQa5DrhY/AAG7SB/oA1NQi+QAFyMoHFcv/ydB3dIAYyMsFywIizxZQBfoCFMtrEszMyXP7AMhAFIEBCPRR8qcCAHCBAQjXGPoA0z/IVCBHgQEI9FHyp4IQbm90ZXB0gBjIywXLAlAGzxZQBPoCFMtqEssfyz/Jc/sAAgBsgQEI1xj6ANM/MFIkgQEI9Fnyp4IQZHN0cnB0gBjIywXLAlAFzxZQA/oCE8tqyx8Syz/Jc/sAAAr0AMntVA=='
const code=Cell.fromBoc(Buffer.from(V4R2_BOC,'base64'))[0]
function checkIndex(i){if(!Number.isInteger(i)||i<0||i>2147483647)throw new Error('DERIVATION_INDEX_RANGE')}
export function checksum(tail){const lower=bytesToHex(tail),hash=bytesToHex(keccak_256(utf8ToBytes(lower)));return '0x'+[...lower].map((c,i)=>parseInt(hash[i],16)>=8?c.toUpperCase():c).join('')}
export function secpAddress(xpub,index,network){
 checkIndex(index)
 if(!xpub?.startsWith('xpub'))throw new Error('PUBLIC_XPUB_REQUIRED')
 const account=HDKey.fromExtendedKey(xpub)
 if(account.privateKey||account.depth!==3||account.index!==0x80000000)throw new Error('ACCOUNT_XPUB_REQUIRED')
 const branch=account.deriveChild(0),child=branch.deriveChild(index)
 if(branch.index!==0||child.index!==index)throw new Error('INVALID_BIP32_CHILD')
 const uncompressed=secp256k1.Point.fromBytes(child.publicKey).toBytes(false)
 const tail=keccak_256(uncompressed.subarray(1)).slice(-20)
 if(network==='bep20')return checksum(tail)
 if(network==='trc20')return base58check(sha256).encode(concatBytes(new Uint8Array([0x41]),tail))
 throw new Error('UNKNOWN_HD_NETWORK')
}
export function normalizeTonKey(input){
 const bytes=/^[0-9a-fA-F]{64}$/.test(input)?hexToBytes(input):new Uint8Array(Buffer.from(input,'base64'))
 if(bytes.length!==32)throw new Error('TON_PUBLIC_KEY_REQUIRED')
 const point=ed25519.Point.fromBytes(bytes)
 if(point.isSmallOrder()||!point.isTorsionFree())throw new Error('TON_PUBLIC_KEY_REQUIRED')
 return bytesToHex(bytes)
}
export function tonAddress(key,index){
 checkIndex(index);const pub=hexToBytes(normalizeTonKey(key))
 const data=beginCell().storeUint(0,32).storeUint(698983191+index,32).storeBuffer(Buffer.from(pub)).storeBit(0).endCell()
 return contractAddress(0,{code,data}).toString({bounceable:false,testOnly:false,urlSafe:true})
}
export function preview(keys){return [0,1,2].map(index=>({index,trc20:secpAddress(keys.trc20_xpub,index,'trc20'),bep20:secpAddress(keys.bep20_xpub,index,'bep20'),ton:tonAddress(keys.ton_public_key,index)}))}
// BIP39 English, empty passphrase; TON uses explicit SLIP-0010 hardened path, not TON-native mnemonics.
export function fromMnemonic(phrase){
 if(!validateMnemonic(phrase,wordlist))throw new Error('INVALID_BIP39_MNEMONIC')
 const seed=mnemonicToSeedSync(phrase,'');const root=HDKey.fromMasterSeed(seed);let trc,bep,slip
 try{
  trc=root.derive("m/44'/195'/0'");bep=root.derive("m/44'/60'/0'")
  slip=hmac(slipSha512,utf8ToBytes('ed25519 seed'),seed)
  for(const index of [44,607,0]){
   const i=new Uint8Array(4);new DataView(i.buffer).setUint32(0,index+0x80000000,false)
   const next=hmac(slipSha512,slip.subarray(32),concatBytes(new Uint8Array([0]),slip.subarray(0,32),i));slip.fill(0);slip=next
  }
  return {trc20_xpub:trc.publicExtendedKey,bep20_xpub:bep.publicExtendedKey,ton_public_key:bytesToHex(ed25519.getPublicKey(slip.subarray(0,32)))}
 }finally{seed.fill(0);root.wipePrivateData();trc?.wipePrivateData();bep?.wipePrivateData();slip?.fill(0)}
}
export function generateKeys(){let phrase=generateMnemonic(wordlist,128);try{const keys=fromMnemonic(phrase);return {mnemonic:phrase,keys,addresses:preview(keys),ton_path:TON_PATH}}finally{phrase=''}}
