import './browserPolyfills'
import { Address } from '@ton/core'
import type { SendTransactionRequest } from '@tonconnect/ui'

export function friendlyTonAddress(value: string): string {
  if (!value || typeof value !== 'string') throw new Error('TON_ADDRESS_INVALID')
  if (!value.includes(':') && Address.parseFriendly(value).isTestOnly) throw new Error('TON_MAINNET_REQUIRED')
  const address = Address.parse(value)
  if (address.workChain !== 0 && address.workChain !== -1) throw new Error('TON_ADDRESS_INVALID')
  return address.toString({ urlSafe: true, bounceable: false, testOnly: false })
}
export function compactTonAddress(value: string): string {
  const address = friendlyTonAddress(value)
  return address.slice(0, 6) + '…' + address.slice(-5)
}
export function validatedTransaction(input: SendTransactionRequest, wallet: string): SendTransactionRequest {
  if (!input || input.network !== '-239' || !input.from || friendlyTonAddress(input.from) !== friendlyTonAddress(wallet)) throw new Error('TON_WALLET_MISMATCH')
  const validUntil = Number(input.validUntil)
  if (!Number.isInteger(validUntil) || validUntil <= Date.now() / 1000 || validUntil > Date.now() / 1000 + 3600) throw new Error('PAYMENT_ORDER_EXPIRED')
  if (!input.messages || input.messages.length !== 1) throw new Error('PAYMENT_REQUEST_INVALID')
  const messages = input.messages.map(message => {
    if (!/^[1-9][0-9]*$/.test(message.amount) || BigInt(message.amount) > 10n ** 18n || !message.payload) throw new Error('PAYMENT_REQUEST_INVALID')
    return { ...message, address: friendlyTonAddress(message.address) }
  })
  return { ...input, validUntil, from: friendlyTonAddress(input.from), messages }
}
