import { randomBytes } from 'crypto'
import { RLPx as Devp2pRLPx, Peer as Devp2pRLPxPeer, DPT as Devp2pDPT } from '@ethereumjs/devp2p'
import { RlpxPeer } from '../peer/rlpxpeer'
import { Server, ServerOptions } from './server'

export interface RlpxServerOptions extends ServerOptions {
  /* Local port to listen on (default: 30303) */
  port?: number

  /* List of supported clients */
  clientFilter?: string[]
}

const ignoredErrors = new RegExp(
  [
    'EPIPE',
    'ECONNRESET',
    'ETIMEDOUT',
    'NetworkId mismatch',
    'Timeout error: ping',
    'Genesis block mismatch',
    'Handshake timed out',
    'Invalid address buffer',
    'Invalid MAC',
    'Invalid timestamp buffer',
    'Hash verification failed',
  ].join('|')
)

/**
 * DevP2P/RLPx server
 * @emits connected
 * @emits disconnected
 * @emits error
 * @memberof module:net/server
 */
export class RlpxServer extends Server {
  private peers: Map<string, RlpxPeer> = new Map()

  public port: number
  private clientFilter: string[]

  public rlpx: Devp2pRLPx | null = null
  public dpt: Devp2pDPT | null = null
  public ip: string = '::'

  /**
   * Create new DevP2P/RLPx server
   * @param {RlpxServerOptions}
   */
  constructor(options: RlpxServerOptions) {
    super(options)

    // TODO: get the external ip from the upnp service
    this.ip = '::'
    this.port = options.port ?? 30303
    this.clientFilter = options.clientFilter ?? [
      'go1.5',
      'go1.6',
      'go1.7',
      'quorum',
      'pirl',
      'ubiq',
      'gmc',
      'gwhale',
      'prichain',
    ]
  }

  /**
   * Server name
   * @type {string}
   */
  get name() {
    return 'rlpx'
  }

  /**
   * Return Rlpx info
   */
  getRlpxInfo() {
    // TODO: return undefined? note that this.rlpx might be undefined if called before initRlpx
    if (!this.rlpx) {
      return {
        enode: undefined,
        id: undefined,
        ip: this.ip,
        listenAddr: `[${this.ip}]:${this.port}`,
        ports: { discovery: this.port, listener: this.port },
      }
    }
    const id = this.rlpx._id.toString('hex')
    return {
      enode: `enode://${id}@[${this.ip}]:${this.port}`,
      id: id,
      ip: this.ip,
      listenAddr: `[${this.ip}]:${this.port}`,
      ports: { discovery: this.port, listener: this.port },
    }
  }

  /**
   * Start Devp2p/RLPx server. Returns a promise that resolves once server has been started.
   * @return Resolves with true if server successfully started
   */
  async start(): Promise<boolean> {
    if (this.started) {
      return false
    }
    await super.start()
    this.initDpt()
    this.initRlpx()
    await this.bootstrap()
    this.started = true

    return true
  }

  /**
   * Bootstrap bootnode peers from the network
   */
  async bootstrap(): Promise<void> {
    const promises = this.bootnodes.map((node) => {
      const bootnode = {
        address: node.ip!,
        udpPort: node.port,
        tcpPort: node.port,
      }
      return this.dpt!.bootstrap(bootnode)
    })
    try {
      await Promise.all(promises)
    } catch (e) {
      this.error(e)
    }
  }

  /**
   * Stop Devp2p/RLPx server. Returns a promise that resolves once server has been stopped.
   */
  async stop(): Promise<boolean> {
    if (this.started) {
      this.rlpx!.destroy()
      this.dpt!.destroy()
      await super.stop()
      this.started = false
    }
    return this.started
  }

  /**
   * Ban peer for a specified time
   * @param  peerId id of peer
   * @param  [maxAge] how long to ban peer
   * @return True if ban was successfully executed
   */
  ban(peerId: string, maxAge = 60000): boolean {
    if (!this.started) {
      return false
    }
    this.dpt!.banPeer(peerId, maxAge)
    return true
  }

  /**
   * Handles errors from server and peers
   * @private
   * @param  error
   * @param  {Peer} peer
   * @emits  error
   */
  error(error: Error, peer?: RlpxPeer) {
    if (ignoredErrors.test(error.message)) {
      return
    }
    if (peer) {
      peer.emit('error', error)
    } else {
      this.emit('error', error)
    }
  }

  /**
   * Initializes DPT for peer discovery
   * @private
   */
  initDpt() {
    this.dpt = new Devp2pDPT(this.key ?? randomBytes(32), {
      refreshInterval: this.refreshInterval,
      endpoint: {
        address: '0.0.0.0',
        udpPort: null,
        tcpPort: null,
      },
    })

    this.dpt.on('error', (e: Error) => this.error(e))

    if (this.port) {
      this.dpt.bind(this.port, '0.0.0.0')
    }
  }

  /**
   * Initializes RLPx instance for peer management
   * @private
   */
  initRlpx() {
    this.rlpx = new Devp2pRLPx(this.key ?? randomBytes(32), {
      dpt: this.dpt!,
      maxPeers: this.config.maxPeers,
      capabilities: RlpxPeer.capabilities(Array.from(this.protocols)),
      remoteClientIdFilter: this.clientFilter,
      listenPort: this.port,
      common: this.config.chainCommon,
    })

    this.rlpx.on('peer:added', async (rlpxPeer: Devp2pRLPxPeer) => {
      const peer = new RlpxPeer({
        config: this.config,
        id: rlpxPeer.getId()!.toString('hex'),
        host: rlpxPeer._socket.remoteAddress!,
        port: rlpxPeer._socket.remotePort!,
        protocols: Array.from(this.protocols),
        // @ts-ignore: Property 'server' does not exist on type 'Socket'.
        // TODO: check this error
        inbound: !!rlpxPeer._socket.server,
      })
      try {
        await peer.accept(rlpxPeer, this)
        this.peers.set(peer.id, peer)
        this.config.logger.debug(`Peer connected: ${peer}`)
        this.emit('connected', peer)
      } catch (error) {
        this.error(error)
      }
    })

    this.rlpx.on('peer:removed', (rlpxPeer: Devp2pRLPxPeer, reason: any) => {
      const id = (rlpxPeer.getId() as Buffer).toString('hex')
      const peer = this.peers.get(id)
      if (peer) {
        this.peers.delete(peer.id)
        this.config.logger.debug(
          `Peer disconnected (${rlpxPeer.getDisconnectPrefix(reason)}): ${peer}`
        )
        this.emit('disconnected', peer)
      }
    })

    this.rlpx.on('peer:error', (rlpxPeer: any, error: Error) => {
      const peerId = rlpxPeer && rlpxPeer.getId()
      if (!peerId) {
        return this.error(error)
      }
      const id = peerId.toString('hex')
      const peer = this.peers.get(id)
      this.error(error, peer)
    })

    this.rlpx.on('error', (e: Error) => this.error(e))

    this.rlpx.on('listening', () => {
      this.emit('listening', {
        transport: this.name,
        url: this.getRlpxInfo().enode,
      })
    })

    if (this.port) {
      this.rlpx.listen(this.port, '0.0.0.0')
    }
  }
}
