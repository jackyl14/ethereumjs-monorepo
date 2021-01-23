import Common from '@ethereumjs/common'
import {
  Address,
  BN,
  bnToHex,
  ecrecover,
  KECCAK256_RLP_ARRAY,
  KECCAK256_RLP,
  rlp,
  rlphash,
  toBuffer,
  unpadBuffer,
  zeros,
  bufferToInt,
} from 'ethereumjs-util'
import { HeaderData, JsonHeader, BlockHeaderBuffer, Blockchain, BlockOptions } from './types'

const DEFAULT_GAS_LIMIT = new BN(Buffer.from('ffffffffffffff', 'hex'))

const CLIQUE_EXTRA_VANITY = 32
const CLIQUE_EXTRA_SEAL = 65

/**
 * An object that represents the block header.
 */
export class BlockHeader {
  public readonly parentHash: Buffer
  public readonly uncleHash: Buffer
  public readonly coinbase: Address
  public readonly stateRoot: Buffer
  public readonly transactionsTrie: Buffer
  public readonly receiptTrie: Buffer
  public readonly bloom: Buffer
  public readonly difficulty: BN
  public readonly number: BN
  public readonly gasLimit: BN
  public readonly gasUsed: BN
  public readonly timestamp: BN
  // no readonly for extraData to ease signature addition for PoA blocks
  public extraData: Buffer
  public readonly mixHash: Buffer
  public readonly nonce: Buffer

  public readonly _common: Common

  public static fromHeaderData(headerData: HeaderData = {}, opts?: BlockOptions) {
    const {
      parentHash,
      uncleHash,
      coinbase,
      stateRoot,
      transactionsTrie,
      receiptTrie,
      bloom,
      difficulty,
      number,
      gasLimit,
      gasUsed,
      timestamp,
      extraData,
      mixHash,
      nonce,
    } = headerData

    return new BlockHeader(
      parentHash ? toBuffer(parentHash) : zeros(32),
      uncleHash ? toBuffer(uncleHash) : KECCAK256_RLP_ARRAY,
      coinbase ? new Address(toBuffer(coinbase)) : Address.zero(),
      stateRoot ? toBuffer(stateRoot) : zeros(32),
      transactionsTrie ? toBuffer(transactionsTrie) : KECCAK256_RLP,
      receiptTrie ? toBuffer(receiptTrie) : KECCAK256_RLP,
      bloom ? toBuffer(bloom) : zeros(256),
      difficulty ? new BN(toBuffer(difficulty)) : new BN(0),
      number ? new BN(toBuffer(number)) : new BN(0),
      gasLimit ? new BN(toBuffer(gasLimit)) : DEFAULT_GAS_LIMIT,
      gasUsed ? new BN(toBuffer(gasUsed)) : new BN(0),
      timestamp ? new BN(toBuffer(timestamp)) : new BN(0),
      extraData ? toBuffer(extraData) : Buffer.from([]),
      mixHash ? toBuffer(mixHash) : zeros(32),
      nonce ? toBuffer(nonce) : zeros(8),
      opts
    )
  }

  public static fromRLPSerializedHeader(serialized: Buffer, opts?: BlockOptions) {
    const values = rlp.decode(serialized)

    if (!Array.isArray(values)) {
      throw new Error('Invalid serialized header input. Must be array')
    }

    return BlockHeader.fromValuesArray(values, opts)
  }

  public static fromValuesArray(values: BlockHeaderBuffer, opts?: BlockOptions) {
    if (values.length > 15) {
      throw new Error('invalid header. More values than expected were received')
    }

    const [
      parentHash,
      uncleHash,
      coinbase,
      stateRoot,
      transactionsTrie,
      receiptTrie,
      bloom,
      difficulty,
      number,
      gasLimit,
      gasUsed,
      timestamp,
      extraData,
      mixHash,
      nonce,
    ] = values

    return new BlockHeader(
      toBuffer(parentHash),
      toBuffer(uncleHash),
      new Address(toBuffer(coinbase)),
      toBuffer(stateRoot),
      toBuffer(transactionsTrie),
      toBuffer(receiptTrie),
      toBuffer(bloom),
      new BN(toBuffer(difficulty)),
      new BN(toBuffer(number)),
      new BN(toBuffer(gasLimit)),
      new BN(toBuffer(gasUsed)),
      new BN(toBuffer(timestamp)),
      toBuffer(extraData),
      toBuffer(mixHash),
      toBuffer(nonce),
      opts
    )
  }

  /**
   * Alias for Header.fromHeaderData() with initWithGenesisHeader set to true.
   */
  public static genesis(headerData: HeaderData = {}, opts?: BlockOptions) {
    opts = { ...opts, initWithGenesisHeader: true }
    return BlockHeader.fromHeaderData(headerData, opts)
  }

  /**
   * This constructor takes the values, validates them, assigns them and freezes the object.
   * Use the public static factory methods to assist in creating a Header object from
   * varying data types.
   * For a default empty header, use `BlockHeader.fromHeaderData()`.
   */
  constructor(
    parentHash: Buffer,
    uncleHash: Buffer,
    coinbase: Address,
    stateRoot: Buffer,
    transactionsTrie: Buffer,
    receiptTrie: Buffer,
    bloom: Buffer,
    difficulty: BN,
    number: BN,
    gasLimit: BN,
    gasUsed: BN,
    timestamp: BN,
    extraData: Buffer,
    mixHash: Buffer,
    nonce: Buffer,
    options: BlockOptions = {}
  ) {
    if (options.common) {
      this._common = options.common
    } else {
      const chain = 'mainnet' // default
      if (options.initWithGenesisHeader) {
        this._common = new Common({ chain, hardfork: 'chainstart' })
      } else {
        // This initializes on the Common default hardfork
        this._common = new Common({ chain })
      }
    }

    if (options.hardforkByBlockNumber) {
      this._common.setHardforkByBlockNumber(number.toNumber())
    }

    if (options.initWithGenesisHeader) {
      if (this._common.hardfork() !== 'chainstart') {
        throw new Error(
          'Genesis parameters can only be set with a Common instance set to chainstart'
        )
      }
      number = new BN(0)
      if (gasLimit.eq(DEFAULT_GAS_LIMIT)) {
        gasLimit = new BN(toBuffer(this._common.genesis().gasLimit))
      }
      if (timestamp.isZero()) {
        timestamp = new BN(toBuffer(this._common.genesis().timestamp))
      }
      if (difficulty.isZero()) {
        difficulty = new BN(toBuffer(this._common.genesis().difficulty))
      }
      if (extraData.length === 0) {
        extraData = toBuffer(this._common.genesis().extraData)
      }
      if (nonce.equals(zeros(8))) {
        nonce = toBuffer(this._common.genesis().nonce)
      }
      if (stateRoot.equals(zeros(32))) {
        stateRoot = toBuffer(this._common.genesis().stateRoot)
      }
    }

    this.parentHash = parentHash
    this.uncleHash = uncleHash
    this.coinbase = coinbase
    this.stateRoot = stateRoot
    this.transactionsTrie = transactionsTrie
    this.receiptTrie = receiptTrie
    this.bloom = bloom
    this.difficulty = difficulty
    this.number = number
    this.gasLimit = gasLimit
    this.gasUsed = gasUsed
    this.timestamp = timestamp
    this.extraData = extraData
    this.mixHash = mixHash
    this.nonce = nonce

    this._validateHeaderFields()
    this._checkDAOExtraData()

    // Now we have set all the values of this Header, we possibly have set a dummy
    // `difficulty` value (defaults to 0). If we have a `calcDifficultyFromHeader`
    // block option parameter, we instead set difficulty to this value.
    if (options.calcDifficultyFromHeader) {
      this.difficulty = this.canonicalDifficulty(options.calcDifficultyFromHeader)
    }

    const freeze = options?.freeze ?? true
    if (freeze) {
      Object.freeze(this)
    }
  }

  /**
   * Validates correct buffer lengths, throws if invalid.
   */
  _validateHeaderFields() {
    const { parentHash, stateRoot, transactionsTrie, receiptTrie, mixHash, nonce } = this
    if (parentHash.length !== 32) {
      throw new Error(`parentHash must be 32 bytes, received ${parentHash.length} bytes`)
    }
    if (stateRoot.length !== 32) {
      throw new Error(`stateRoot must be 32 bytes, received ${stateRoot.length} bytes`)
    }
    if (transactionsTrie.length !== 32) {
      throw new Error(
        `transactionsTrie must be 32 bytes, received ${transactionsTrie.length} bytes`
      )
    }
    if (receiptTrie.length !== 32) {
      throw new Error(`receiptTrie must be 32 bytes, received ${receiptTrie.length} bytes`)
    }
    if (mixHash.length !== 32) {
      throw new Error(`mixHash must be 32 bytes, received ${mixHash.length} bytes`)
    }

    if (nonce.length !== 8) {
      throw new Error(`nonce must be 8 bytes, received ${nonce.length} bytes`)
    }
  }

  /**
   * Returns the canonical difficulty for this block.
   *
   * @param parentBlockHeader - the header from the parent `Block` of this header
   */
  canonicalDifficulty(parentBlockHeader: BlockHeader): BN {
    if (this._common.consensusType() !== 'pow') {
      throw new Error('difficulty calculation is only supported on PoW chains')
    }
    if (this._common.consensusAlgorithm() !== 'ethash') {
      throw new Error('difficulty calculation currently only supports the ethash algorithm')
    }
    const hardfork = this._getHardfork()
    const blockTs = this.timestamp
    const { timestamp: parentTs, difficulty: parentDif } = parentBlockHeader
    const minimumDifficulty = new BN(
      this._common.paramByHardfork('pow', 'minimumDifficulty', hardfork)
    )
    const offset = parentDif.div(
      new BN(this._common.paramByHardfork('pow', 'difficultyBoundDivisor', hardfork))
    )
    let num = this.number.clone()

    // We use a ! here as TS cannot follow this hardfork-dependent logic, but it always gets assigned
    let dif!: BN

    if (this._common.hardforkGteHardfork(hardfork, 'byzantium')) {
      // max((2 if len(parent.uncles) else 1) - ((timestamp - parent.timestamp) // 9), -99) (EIP100)
      const uncleAddend = parentBlockHeader.uncleHash.equals(KECCAK256_RLP_ARRAY) ? 1 : 2
      let a = blockTs.sub(parentTs).idivn(9).ineg().iaddn(uncleAddend)
      const cutoff = new BN(-99)
      // MAX(cutoff, a)
      if (cutoff.gt(a)) {
        a = cutoff
      }
      dif = parentDif.add(offset.mul(a))
    }

    if (this._common.hardforkGteHardfork(hardfork, 'muirGlacier')) {
      // Istanbul/Berlin difficulty bomb delay (EIP2384)
      num.isubn(9000000)
      if (num.ltn(0)) {
        num = new BN(0)
      }
    } else if (this._common.hardforkGteHardfork(hardfork, 'constantinople')) {
      // Constantinople difficulty bomb delay (EIP1234)
      num.isubn(5000000)
      if (num.ltn(0)) {
        num = new BN(0)
      }
    } else if (this._common.hardforkGteHardfork(hardfork, 'byzantium')) {
      // Byzantium difficulty bomb delay (EIP649)
      num.isubn(3000000)
      if (num.ltn(0)) {
        num = new BN(0)
      }
    } else if (this._common.hardforkGteHardfork(hardfork, 'homestead')) {
      // 1 - (block_timestamp - parent_timestamp) // 10
      let a = blockTs.sub(parentTs).idivn(10).ineg().iaddn(1)
      const cutoff = new BN(-99)
      // MAX(cutoff, a)
      if (cutoff.gt(a)) {
        a = cutoff
      }
      dif = parentDif.add(offset.mul(a))
    } else {
      // pre-homestead
      if (
        parentTs.addn(this._common.paramByHardfork('pow', 'durationLimit', hardfork)).gt(blockTs)
      ) {
        dif = offset.add(parentDif)
      } else {
        dif = parentDif.sub(offset)
      }
    }

    const exp = num.divn(100000).isubn(2)
    if (!exp.isNeg()) {
      dif.iadd(new BN(2).pow(exp))
    }

    if (dif.lt(minimumDifficulty)) {
      dif = minimumDifficulty
    }

    return dif
  }

  /**
   * Checks that the block's `difficulty` matches the canonical difficulty.
   *
   * @param parentBlockHeader - the header from the parent `Block` of this header
   */
  validateDifficulty(parentBlockHeader: BlockHeader): boolean {
    if (this._common.consensusType() !== 'pow') {
      throw new Error('difficulty validation is currently only supported on PoW chains')
    }
    return this.canonicalDifficulty(parentBlockHeader).eq(this.difficulty)
  }

  /**
   * Validates if the block gasLimit remains in the
   * boundaries set by the protocol.
   *
   * @param parentBlockHeader - the header from the parent `Block` of this header
   */
  validateGasLimit(parentBlockHeader: BlockHeader): boolean {
    const parentGasLimit = parentBlockHeader.gasLimit
    const gasLimit = this.gasLimit
    const hardfork = this._getHardfork()

    const a = parentGasLimit.div(
      new BN(this._common.paramByHardfork('gasConfig', 'gasLimitBoundDivisor', hardfork))
    )
    const maxGasLimit = parentGasLimit.add(a)
    const minGasLimit = parentGasLimit.sub(a)

    return (
      gasLimit.lt(maxGasLimit) &&
      gasLimit.gt(minGasLimit) &&
      gasLimit.gte(this._common.paramByHardfork('gasConfig', 'minGasLimit', hardfork))
    )
  }

  /**
   * Validates the block header, throwing if invalid. It is being validated against the reported `parentHash`.
   * It verifies the current block against the `parentHash`:
   * - The `parentHash` is part of the blockchain (it is a valid header)
   * - Current block number is parent block number + 1
   * - Current block has a strictly higher timestamp
   * - Additional PoA -> Clique check: Current block has a timestamp diff greater or equal to PERIOD
   * - Current block has valid difficulty (only PoW, otherwise pass) and gas limit
   * - In case that the header is an uncle header, it should not be too old or young in the chain.
   * @param blockchain - validate against a @ethereumjs/blockchain
   * @param height - If this is an uncle header, this is the height of the block that is including it
   */
  async validate(blockchain: Blockchain, height?: BN): Promise<void> {
    if (this.isGenesis()) {
      return
    }
    const hardfork = this._getHardfork()
    if (this._common.consensusAlgorithm() !== 'clique') {
      if (
        this.extraData.length > this._common.paramByHardfork('vm', 'maxExtraDataSize', hardfork)
      ) {
        throw new Error('invalid amount of extra data')
      }
    } else {
      const minLength = CLIQUE_EXTRA_VANITY + CLIQUE_EXTRA_SEAL
      if (!this.cliqueIsEpochTransition()) {
        // ExtraData length on epoch transition
        if (this.extraData.length !== minLength) {
          throw new Error(
            `extraData must be ${minLength} bytes on non-epoch transition blocks, received ${this.extraData.length} bytes`
          )
        }
      } else {
        const signerLength = this.extraData.length - minLength
        if (signerLength % 20 !== 0) {
          throw new Error(
            `invalid signer list length in extraData, received signer length of ${signerLength} (not divisible by 20)`
          )
        }
        // coinbase (beneficiary) on epoch transition
        if (!this.coinbase.isZero()) {
          throw new Error(
            `coinbase must be filled with zeros on epoch transition blocks, received ${this.coinbase.toString()}`
          )
        }
      }
      // MixHash format
      if (!this.mixHash.equals(Buffer.alloc(32))) {
        throw new Error(`mixHash must be filled with zeros, received ${this.mixHash}`)
      }
    }

    const parentHeader = await this._getHeaderByHash(blockchain, this.parentHash)

    if (!parentHeader) {
      throw new Error('could not find parent header')
    }

    const { number } = this
    if (!number.eq(parentHeader.number.addn(1))) {
      throw new Error('invalid number')
    }

    if (this.timestamp.lte(parentHeader.timestamp)) {
      throw new Error('invalid timestamp')
    }

    if (this._common.consensusAlgorithm() == 'clique') {
      const period = this._common.consensusConfig().period
      // Timestamp diff between blocks is lower than PERIOD (clique)
      if (parentHeader.timestamp.addn(period).gt(this.timestamp)) {
        throw new Error('invalid timestamp diff (lower than period)')
      }
    }

    if (this._common.consensusType() === 'pow') {
      if (!this.validateDifficulty(parentHeader)) {
        throw new Error('invalid difficulty')
      }
    }

    if (!this.validateGasLimit(parentHeader)) {
      throw new Error('invalid gas limit')
    }

    if (height) {
      const dif = height.sub(parentHeader.number)
      if (!(dif.ltn(8) && dif.gtn(1))) {
        throw new Error('uncle block has a parent that is too old or too young')
      }
    }
  }

  /**
   * Returns a Buffer Array of the raw Buffers in this header, in order.
   */
  raw(): BlockHeaderBuffer {
    return [
      this.parentHash,
      this.uncleHash,
      this.coinbase.buf,
      this.stateRoot,
      this.transactionsTrie,
      this.receiptTrie,
      this.bloom,
      unpadBuffer(toBuffer(this.difficulty)), // we unpadBuffer, because toBuffer(new BN(0)) == <Buffer 00>
      unpadBuffer(toBuffer(this.number)),
      unpadBuffer(toBuffer(this.gasLimit)),
      unpadBuffer(toBuffer(this.gasUsed)),
      unpadBuffer(toBuffer(this.timestamp)),
      this.extraData,
      this.mixHash,
      this.nonce,
    ]
  }

  /**
   * Returns the hash of the block header.
   */
  hash(): Buffer {
    const raw = this.raw()
    // Hash for PoA clique blocks is created without the seal
    if (this._common.consensusAlgorithm() === 'clique' && !this.isGenesis()) {
      raw[12] = this.extraData.slice(0, this.extraData.length - CLIQUE_EXTRA_SEAL)
    }
    return rlphash(raw)
  }

  /**
   * Checks if the block header is a genesis header.
   */
  isGenesis(): boolean {
    return this.number.isZero()
  }

  private _requireClique(name: string) {
    if (this._common.consensusAlgorithm() !== 'clique') {
      throw new Error(`BlockHeader.${name}() call only supported for clique PoA networks`)
    }
  }

  /**
   * Checks if the block header is an epoch transition
   * header (only clique PoA, throws otherwise)
   */
  cliqueIsEpochTransition(): boolean {
    this._requireClique('cliqueIsEpochTransition')
    const epoch = new BN(this._common.consensusConfig().epoch)
    // Epoch transition block if the block number has no
    // remainder on the division by the epoch length
    return this.number.mod(epoch).isZero()
  }

  /**
   * Returns extra vanity data
   * (only clique PoA, throws otherwise)
   */
  cliqueExtraVanity(): Buffer {
    this._requireClique('cliqueExtraVanity')
    return this.extraData.slice(0, CLIQUE_EXTRA_VANITY)
  }

  /**
   * Returns extra seal data
   * (only clique PoA, throws otherwise)
   */
  cliqueExtraSeal(): Buffer {
    this._requireClique('cliqueExtraSeal')
    return this.extraData.slice(-CLIQUE_EXTRA_SEAL)
  }

  /**
   * Returns a list of signers
   * (only clique PoA, throws otherwise)
   *
   * This function throws if not called on an epoch
   * transition block and should therefore be used
   * in conjunction with `cliqueIsEpochTransition()`
   */
  cliqueEpochTransitionSigners(): Buffer[] {
    this._requireClique('cliqueEpochTransitionSigners')
    if (!this.cliqueIsEpochTransition()) {
      throw new Error('Singers are only included in epoch transition blocks (clique)')
    }

    const start = CLIQUE_EXTRA_VANITY
    const end = this.extraData.length - CLIQUE_EXTRA_SEAL
    const signerBuffer = this.extraData.slice(start, end)

    const signerList: Buffer[] = []
    const signerLength = 20
    for (let start = 0; start <= signerBuffer.length - signerLength; start += signerLength) {
      signerList.push(signerBuffer.slice(start, start + signerLength))
    }
    return signerList
  }

  /**
   * Verifies the signature of the block (last 65 bytes of extraData field)
   * (only clique PoA, throws otherwise)
   *
   *  Method throws if signature is invalid
   */
  cliqueVerifySignature(signerList: Buffer[]): boolean {
    this._requireClique('cliqueVerifySignature')
    const signerAddress = this.cliqueSignatureToAddress()
    const signerFound = signerList.find((signer) => {
      return signer.equals(signerAddress.toBuffer())
    })
    if (signerFound) {
      return true
    }
    return false
  }

  /**
   * Returns the signer address
   */
  cliqueSignatureToAddress(): Address {
    this._requireClique('cliqueSignatureToAddress')
    const extraSeal = this.cliqueExtraSeal()
    const r = extraSeal.slice(0, 32)
    const s = extraSeal.slice(32, 64)
    const v = bufferToInt(extraSeal.slice(64, 65)) + 27
    const pubKey = ecrecover(this.hash(), v, r, s)
    return Address.fromPublicKey(pubKey)
  }

  /**
   * Returns the rlp encoding of the block header.
   */
  serialize(): Buffer {
    return rlp.encode(this.raw())
  }

  /**
   * Returns the block header in JSON format.
   */
  toJSON(): JsonHeader {
    return {
      parentHash: '0x' + this.parentHash.toString('hex'),
      uncleHash: '0x' + this.uncleHash.toString('hex'),
      coinbase: this.coinbase.toString(),
      stateRoot: '0x' + this.stateRoot.toString('hex'),
      transactionsTrie: '0x' + this.transactionsTrie.toString('hex'),
      receiptTrie: '0x' + this.receiptTrie.toString('hex'),
      bloom: '0x' + this.bloom.toString('hex'),
      difficulty: bnToHex(this.difficulty),
      number: bnToHex(this.number),
      gasLimit: bnToHex(this.gasLimit),
      gasUsed: bnToHex(this.gasUsed),
      timestamp: bnToHex(this.timestamp),
      extraData: '0x' + this.extraData.toString('hex'),
      mixHash: '0x' + this.mixHash.toString('hex'),
      nonce: '0x' + this.nonce.toString('hex'),
    }
  }

  private _getHardfork(): string {
    return this._common.hardfork() || this._common.activeHardfork(this.number.toNumber())
  }

  private async _getHeaderByHash(
    blockchain: Blockchain,
    hash: Buffer
  ): Promise<BlockHeader | undefined> {
    try {
      const header = (await blockchain.getBlock(hash)).header
      return header
    } catch (error) {
      if (error.type === 'NotFoundError') {
        return undefined
      } else {
        throw error
      }
    }
  }

  /**
   * Force extra data be DAO_ExtraData for DAO_ForceExtraDataRange blocks after DAO
   * activation block (see: https://blog.slock.it/hard-fork-specification-24b889e70703)
   */
  private _checkDAOExtraData() {
    const DAO_ExtraData = Buffer.from('64616f2d686172642d666f726b', 'hex')
    const DAO_ForceExtraDataRange = new BN(9)

    if (this._common.hardforkIsActiveOnChain('dao')) {
      // verify the extraData field.
      const blockNumber = this.number
      const DAOActivationBlock = new BN(this._common.hardforkBlock('dao'))
      if (blockNumber.gte(DAOActivationBlock)) {
        const drift = blockNumber.sub(DAOActivationBlock)
        if (drift.lte(DAO_ForceExtraDataRange)) {
          if (!this.extraData.equals(DAO_ExtraData)) {
            throw new Error("extraData should be 'dao-hard-fork'")
          }
        }
      }
    }
  }
}
