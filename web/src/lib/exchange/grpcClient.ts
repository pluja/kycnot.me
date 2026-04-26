import { credentials, Metadata, type ChannelCredentials } from '@grpc/grpc-js'
import { AGGREGATOR_GRPC_TOKEN, AGGREGATOR_GRPC_URL } from 'astro:env/server'

import {
  AggregatorServiceClient,
  type GetQuotesRequest,
  type GetQuotesResponse,
  type ListCurrenciesResponse,
  type ListSupportedProvidersResponse,
} from '../../generated/aggregator/v1/aggregator'

// Keep this strictly longer than the server's max_wait_ms. If the client
// cancels first the server's partial response is discarded and the caller
// gets CANCELLED instead of usable outcomes.
const DEFAULT_DEADLINE_MS = 25_000

let cachedClient: AggregatorServiceClient | null = null

// Plaintext: the aggregator runs on a private docker network. Switch to
// credentials.createSsl() if that ever changes.
function makeCredentials(): ChannelCredentials {
  return credentials.createInsecure()
}

function getClient(): AggregatorServiceClient {
  cachedClient ??= new AggregatorServiceClient(AGGREGATOR_GRPC_URL, makeCredentials())
  return cachedClient
}

function authMetadata(): Metadata {
  const md = new Metadata()
  if (AGGREGATOR_GRPC_TOKEN) {
    md.set('authorization', `Bearer ${AGGREGATOR_GRPC_TOKEN}`)
  }
  return md
}

export function getQuotes(request: GetQuotesRequest): Promise<GetQuotesResponse> {
  const client = getClient()
  const options = { deadline: Date.now() + DEFAULT_DEADLINE_MS }
  return new Promise<GetQuotesResponse>((resolve, reject) => {
    client.getQuotes(request, authMetadata(), options, (error, response) => {
      if (error) { reject(error); return; }
      resolve(response)
    })
  })
}

export function listCurrencies(): Promise<ListCurrenciesResponse> {
  const client = getClient()
  const options = { deadline: Date.now() + DEFAULT_DEADLINE_MS }
  return new Promise<ListCurrenciesResponse>((resolve, reject) => {
    client.listCurrencies({}, authMetadata(), options, (error, response) => {
      if (error) { reject(error); return; }
      resolve(response)
    })
  })
}

export function listSupportedProviders(): Promise<ListSupportedProvidersResponse> {
  const client = getClient()
  const options = { deadline: Date.now() + DEFAULT_DEADLINE_MS }
  return new Promise<ListSupportedProvidersResponse>((resolve, reject) => {
    client.listSupportedProviders({}, authMetadata(), options, (error, response) => {
      if (error) { reject(error); return; }
      resolve(response)
    })
  })
}
