import { AddressLike, BN, BNLike, BufferLike } from 'ethereumjs-util'
import Common from '@ethereumjs/common'
import { UnsignedLegacyTransaction, SignedLegacyTransaction } from './unsignedLegacyTransaction'
import { UnsignedEIP2930Transaction, SignedEIP2930Transaction } from './unsignedEIP2930Transaction'

/**
 * The options for initializing a Transaction.
 */
export interface TxOptions {
  /**
   * A Common object defining the chain and hardfork for the transaction.
   *
   * Default: `Common` object set to `mainnet` and the default hardfork as defined in the `Common` class.
   *
   * Current default hardfork: `istanbul`
   */
  common?: Common
  /**
   * A transaction object by default gets frozen along initialization. This gives you
   * strong additional security guarantees on the consistency of the tx parameters.
   *
   * If you need to deactivate the tx freeze - e.g. because you want to subclass tx and
   * add aditional properties - it is strongly encouraged that you do the freeze yourself
   * within your code instead.
   *
   * Default: true
   */
  freeze?: boolean
}

/**
 * An object with an optional field with each of the transaction's values.
 */
export interface LegacyTxData {
  /**
   * The transaction's nonce.
   */
  nonce?: BNLike

  /**
   * The transaction's gas price.
   */
  gasPrice?: BNLike

  /**
   * The transaction's gas limit.
   */
  gasLimit?: BNLike

  /**
   * The transaction's the address is sent to.
   */
  to?: AddressLike

  /**
   * The amount of Ether sent.
   */
  value?: BNLike

  /**
   * This will contain the data of the message or the init of a contract.
   */
  data?: BufferLike

  /**
   * EC recovery ID.
   */
  v?: BNLike

  /**
   * EC signature parameter.
   */
  r?: BNLike

  /**
   * EC signature parameter.
   */
  s?: BNLike
}

/**
 * An object with an optional field with each of the transaction's values.
 */
export interface EIP2930TxData {
  /**
   * The transaction's chain ID
   */
  chainId?: BN

  /**
   * The transaction's nonce.
   */
  nonce?: BN

  /**
   * The transaction's gas price.
   */
  gasPrice?: BN

  /**
   * The transaction's gas limit.
   */
  gasLimit?: BN

  /**
   * The transaction's the address is sent to.
   */
  to?: AddressLike

  /**
   * The amount of Ether sent.
   */
  value?: BN

  /**
   * This will contain the data of the message or the init of a contract.
   */
  data?: Buffer

  /**
   * The access list which contains the addresses/storage slots which the transaction wishes to access
   */
  accessList?: any // TODO: typesafe this

  /**
   * Parity of the transaction
   */
  yParity?: number

  /**
   * EC signature parameter. (This is senderR in the EIP)
   */
  r?: BN

  /**
   * EC signature parameter. (This is senderS in the EIP)
   */
  s?: BN
}

export type TxData = LegacyTxData | EIP2930TxData

export type Transaction =
  | SignedLegacyTransaction
  | UnsignedLegacyTransaction
  | SignedEIP2930Transaction
  | UnsignedEIP2930Transaction
export type SignedTransaction = SignedLegacyTransaction | UnsignedEIP2930Transaction
export type LegacyTransaction = UnsignedLegacyTransaction | SignedLegacyTransaction

/**
 * An object with all of the transaction's values represented as strings.
 */
export interface JsonTx {
  nonce?: string
  gasPrice?: string
  gasLimit?: string
  to?: string
  data?: string
  v?: string
  r?: string
  s?: string
  value?: string
}

export const DEFAULT_COMMON = new Common({ chain: 'mainnet' })
