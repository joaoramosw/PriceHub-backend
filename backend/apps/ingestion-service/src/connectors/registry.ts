import type { AmbienteDaIngestao } from '../config/env.js'
import { BioFarmaConnector } from './biofarma/biofarma.connector.js'
import { DrogaPopularConnector } from './drogapopular/drogapopular.connector.js'
import { FarmaAzulConnector } from './farmaazul/farmaazul.connector.js'
import { type BuscarJson, criarBuscarJson } from './http.js'
import type { PharmacyConnector } from './pharmacy-connector.js'

export type RegistroDeConnectors = {
  connectors: Map<string, PharmacyConnector>
  segredosDeWebhook: Map<string, string>
}

export function criarRegistroDeConnectors(
  ambiente: Pick<
    AmbienteDaIngestao,
    | 'BIOFARMA_URL'
    | 'FARMAAZUL_URL'
    | 'DROGAPOPULAR_URL'
    | 'WEBHOOK_SECRET_BIOFARMA'
    | 'WEBHOOK_SECRET_FARMAAZUL'
    | 'HTTP_TIMEOUT_MS'
  >,
  buscarJson: BuscarJson = criarBuscarJson(ambiente.HTTP_TIMEOUT_MS),
): RegistroDeConnectors {
  const lista: PharmacyConnector[] = [
    new BioFarmaConnector(ambiente.BIOFARMA_URL, buscarJson),
    new FarmaAzulConnector(ambiente.FARMAAZUL_URL, buscarJson),
    new DrogaPopularConnector(ambiente.DROGAPOPULAR_URL, buscarJson),
  ]
  return {
    connectors: new Map(lista.map((connector) => [connector.farmaciaId, connector])),
    segredosDeWebhook: new Map([
      ['biofarma', ambiente.WEBHOOK_SECRET_BIOFARMA],
      ['farmaazul', ambiente.WEBHOOK_SECRET_FARMAAZUL],
    ]),
  }
}
