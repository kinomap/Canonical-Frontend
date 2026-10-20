export interface PublicKeys {trc20_xpub:string;bep20_xpub:string;ton_public_key:string}
export interface Preview {index:number;trc20:string;bep20:string;ton:string}
export const GRAM_MASTER:string; export const TON_PATH:string;
export function preview(keys:PublicKeys):Preview[];
export function normalizeTonKey(input:string):string;
export function secpAddress(xpub:string,index:number,network:string):string;
export function tonAddress(key:string,index:number):string;
export function fromMnemonic(phrase:string):PublicKeys;
export function generateKeys():{mnemonic:string;keys:PublicKeys;addresses:Preview[];ton_path:string};
