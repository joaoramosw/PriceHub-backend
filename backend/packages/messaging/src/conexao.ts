import { type ChannelModel, type ConfirmChannel, connect, type Options } from 'amqplib'
import type { Logger } from 'pino'

export type OpcoesDeConexao = {
  url: string
  nome: string
  logger: Logger
  atrasoMaximoDeReconexaoMs?: number
}

type AoConectar = (conexao: ChannelModel) => Promise<void>

export class ConexaoRabbitMq {
  private conexao: ChannelModel | undefined
  private canalDePublicacao: ConfirmChannel | undefined
  private readonly aoConectar: AoConectar[] = []
  private drenos: (() => Promise<void>)[] = []
  private encerrada = false
  private tentativas = 0
  private reconectando: Promise<void> | undefined

  constructor(private readonly opcoes: OpcoesDeConexao) {}

  get conectada(): boolean {
    return this.conexao !== undefined && this.canalDePublicacao !== undefined
  }

  get logger(): Logger {
    return this.opcoes.logger
  }

  async conectar(): Promise<void> {
    this.encerrada = false
    await this.conectarComRetentativa()
  }

  registrarAoConectar(callback: AoConectar): void {
    this.aoConectar.push(callback)
  }

  async executarAgora(callback: AoConectar): Promise<void> {
    this.registrarAoConectar(callback)
    if (this.conexao) await callback(this.conexao)
  }

  canalDePublicacaoAtivo(): ConfirmChannel {
    if (!this.canalDePublicacao) throw new Error('broker indisponível: sem canal de publicação')
    return this.canalDePublicacao
  }

  async verificar(): Promise<void> {
    if (!this.conectada) throw new Error('broker desconectado')
  }

  registrarDreno(dreno: () => Promise<void>): void {
    this.drenos.push(dreno)
  }

  async fechar(): Promise<void> {
    this.encerrada = true
    const drenos = this.drenos
    this.drenos = []
    await Promise.allSettled(drenos.map((dreno) => dreno()))
    const conexao = this.conexao
    this.conexao = undefined
    this.canalDePublicacao = undefined
    await conexao?.close().catch(() => undefined)
  }

  private async conectarComRetentativa(): Promise<void> {
    while (!this.encerrada) {
      try {
        await this.abrir()
        this.tentativas = 0
        return
      } catch (erro) {
        this.tentativas += 1
        const atraso = Math.min(500 * 2 ** this.tentativas, this.opcoes.atrasoMaximoDeReconexaoMs ?? 10_000)
        this.opcoes.logger.warn(
          { err: erro, tentativa: this.tentativas, atrasoMs: atraso },
          'falha ao conectar no RabbitMQ',
        )
        await new Promise((resolver) => setTimeout(resolver, atraso))
      }
    }
  }

  private async abrir(): Promise<void> {
    const opcoesDeSocket: Options.Connect = { heartbeat: 10 }
    const conexao = await connect(this.opcoes.url, {
      ...opcoesDeSocket,
      clientProperties: { connection_name: this.opcoes.nome },
    })
    conexao.on('error', (erro) => this.opcoes.logger.error({ err: erro }, 'erro na conexão com o RabbitMQ'))
    conexao.on('close', () => this.aoFechar(conexao))
    const canal = await conexao.createConfirmChannel()
    canal.on('error', (erro) => this.opcoes.logger.error({ err: erro }, 'erro no canal de publicação'))
    this.conexao = conexao
    this.canalDePublicacao = canal
    this.drenos = []
    for (const callback of this.aoConectar) await callback(conexao)
    this.opcoes.logger.info({ conexao: this.opcoes.nome }, 'conectado ao RabbitMQ')
  }

  private aoFechar(conexao: ChannelModel): void {
    if (this.conexao !== conexao) return
    this.conexao = undefined
    this.canalDePublicacao = undefined
    if (this.encerrada) return
    this.opcoes.logger.warn('conexão com o RabbitMQ perdida; reconectando')
    this.reconectando ??= this.conectarComRetentativa().finally(() => {
      this.reconectando = undefined
    })
  }
}
