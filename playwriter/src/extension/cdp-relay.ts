import { Hono } from 'hono'
import { serve } from '@hono/node-server'
import { createNodeWebSocket } from '@hono/node-ws'
import type { WSContext } from 'hono/ws'
import type { Protocol } from '../cdp-types.js'
import type { CDPCommand, CDPResponse, CDPEvent } from '../cdp-types.js'
import type { ExtensionMessage, ExtensionEventMessage } from './protocol.js'
import chalk from 'chalk'

type ConnectedTarget = {
  sessionId: string
  targetId: string
  targetInfo: Protocol.Target.TargetInfo
}

type CDPEventWithSource = CDPEvent & {
  __serverGenerated?: boolean
}

export async function startRelayServer({ port = 9988 }: { port?: number } = {}) {
  const connectedTargets = new Map<string, ConnectedTarget>()

  let playwrightWs: WSContext | null = null
  let extensionWs: WSContext | null = null

  const extensionPendingRequests = new Map<number, {
    resolve: (result: any) => void
    reject: (error: Error) => void
  }>()
  let extensionMessageId = 0

  function logCdpMessage({
    direction,
    method,
    sessionId,
    params,
    id,
    source
  }: {
    direction: 'to-playwright' | 'from-playwright' | 'from-extension'
    method: string
    sessionId?: string
    params?: any
    id?: number
    source?: 'extension' | 'server'
  }) {
    const details: string[] = []

    if (id !== undefined) {
      details.push(`id=${id}`)
    }

    if (sessionId) {
      details.push(`sessionId=${sessionId}`)
    }

    if (params) {
      if (params.targetId) {
        details.push(`targetId=${params.targetId}`)
      }
      if (params.sessionId && params.sessionId !== sessionId) {
        details.push(`sessionIdParam=${params.sessionId}`)
      }
    }

    const detailsStr = details.length > 0 ? ` ${chalk.gray(details.join(', '))}` : ''

    if (direction === 'from-playwright') {
      console.log(chalk.cyan('← Playwright:'), method + detailsStr)
    } else if (direction === 'from-extension') {
      console.log(chalk.yellow('← Extension:'), method + detailsStr)
    } else if (direction === 'to-playwright') {
      const color = source === 'server' ? chalk.magenta : chalk.green
      const sourceLabel = source === 'server' ? chalk.gray(' (server-generated)') : ''
      console.log(color('→ Playwright:'), method + detailsStr + sourceLabel)
    }
  }

  function sendToPlaywright({ message, source = 'extension' }: { message: CDPResponse | CDPEvent; source?: 'extension' | 'server' }) {
    if (!playwrightWs) {
      return
    }

    const messageToSend = source === 'server' && 'method' in message
      ? { ...message, __serverGenerated: true }
      : message

    if ('method' in message) {
      logCdpMessage({
        direction: 'to-playwright',
        method: message.method,
        sessionId: 'sessionId' in message ? message.sessionId : undefined,
        params: 'params' in message ? message.params : undefined,
        source
      })
    }

    playwrightWs.send(JSON.stringify(messageToSend))
  }

  async function sendToExtension({ method, params }: { method: string; params?: any }) {
    if (!extensionWs) {
      throw new Error('Extension not connected')
    }

    const id = ++extensionMessageId
    const message = { id, method, params }

    extensionWs.send(JSON.stringify(message))

    return new Promise((resolve, reject) => {
      extensionPendingRequests.set(id, { resolve, reject })
    })
  }

  async function routeCdpCommand({ method, params, sessionId }: { method: string; params: any; sessionId?: string }) {
    switch (method) {
      case 'Browser.getVersion': {
        return {
          protocolVersion: '1.3',
          product: 'Chrome/Extension-Bridge',
          revision: '1.0.0',
          userAgent: 'CDP-Bridge-Server/1.0.0',
          jsVersion: 'V8'
        } satisfies Protocol.Browser.GetVersionResponse
      }

      case 'Browser.setDownloadBehavior': {
        return {}
      }

      case 'Target.setAutoAttach': {
        if (sessionId) {
          break
        }
        return {}
      }

      case 'Target.getTargetInfo': {
        const targetId = params?.targetId

        if (targetId) {
          for (const target of connectedTargets.values()) {
            if (target.targetId === targetId) {
              return { targetInfo: target.targetInfo }
            }
          }
        }

        if (sessionId) {
          const target = connectedTargets.get(sessionId)
          if (target) {
            return { targetInfo: target.targetInfo }
          }
        }

        const firstTarget = Array.from(connectedTargets.values())[0]
        return { targetInfo: firstTarget?.targetInfo }
      }

      case 'Target.getTargets': {
        return {
          targetInfos: Array.from(connectedTargets.values()).map((t) => ({
            ...t.targetInfo,
            attached: true
          }))
        }
      }

      case 'Target.closeTarget': {
        break
      }
    }

    return await sendToExtension({
      method: 'forwardCDPCommand',
      params: { sessionId, method, params }
    })
  }

  const app = new Hono()
  const { injectWebSocket, upgradeWebSocket } = createNodeWebSocket({ app })

  app.get('/', (c) => {
    return c.text('OK')
  })

  app.get('/cdp', upgradeWebSocket(() => {
      return {
        onOpen(_event, ws) {
          if (playwrightWs) {
            console.log('Rejecting second Playwright connection')
            ws.close(1000, 'Another CDP client already connected')
            return
          }

          playwrightWs = ws
          console.log('Playwright connected')
        },

        async onMessage(event, ws) {
          let message: CDPCommand

          try {
            message = JSON.parse(event.data.toString())
          } catch {
            return
          }

          const { id, sessionId, method, params } = message

          logCdpMessage({
            direction: 'from-playwright',
            method,
            sessionId,
            id
          })

          if (!extensionWs) {
            sendToPlaywright({
              message: {
                id,
                sessionId,
                error: { message: 'Extension not connected' }
              }
            })
            return
          }

          try {
            const result: any = await routeCdpCommand({ method, params, sessionId })

            if (method === 'Target.setAutoAttach' && !sessionId) {
              for (const target of connectedTargets.values()) {
                sendToPlaywright({
                  message: {
                    method: 'Target.attachedToTarget',
                    params: {
                      sessionId: target.sessionId,
                      targetInfo: {
                        ...target.targetInfo,
                        attached: true
                      },
                      waitingForDebugger: false
                    }
                  } satisfies CDPEvent,
                  source: 'server'
                })
              }
            }

            sendToPlaywright({ message: { id, sessionId, result } })
          } catch (e) {
            console.error('Error handling CDP command:', e)
            sendToPlaywright({
              message: {
                id,
                sessionId,
                error: { message: (e as Error).message }
              }
            })
          }
        },

        onClose() {
          if (playwrightWs) {
            console.log('Playwright disconnected')
            playwrightWs = null
          }
        },

        onError(event) {
          console.error('Playwright WebSocket error:', event)
        }
      }
    })
  )

  app.get('/extension', upgradeWebSocket(() => {
    return {
      onOpen(_event, ws) {
        if (extensionWs) {
          console.log('Rejecting second extension connection')
          ws.close(1000, 'Another extension connection already established')
          return
        }

        extensionWs = ws
        console.log('Extension connected')
      },

      async onMessage(event, ws) {
        let message: ExtensionMessage

        try {
          message = JSON.parse(event.data.toString())
        } catch {
          ws.close(1000, 'Invalid JSON')
          return
        }

        if ('id' in message) {
          const pending = extensionPendingRequests.get(message.id)
          if (!pending) {
            console.log('Unexpected response with id:', message.id)
            return
          }

          extensionPendingRequests.delete(message.id)

          if (message.error) {
            pending.reject(new Error(message.error))
          } else {
            pending.resolve(message.result)
          }
        } else {
          const extensionEvent = message as ExtensionEventMessage

          if (extensionEvent.method !== 'forwardCDPEvent') {
            return
          }

          const { method, params, sessionId } = extensionEvent.params

          logCdpMessage({
            direction: 'from-extension',
            method,
            sessionId,
            params
          })

          if (method === 'Target.attachedToTarget') {
            const targetParams = params as Protocol.Target.AttachedToTargetEvent
            connectedTargets.set(targetParams.sessionId, {
              sessionId: targetParams.sessionId,
              targetId: targetParams.targetInfo.targetId,
              targetInfo: targetParams.targetInfo
            })

            sendToPlaywright({
              message: {
                method: 'Target.attachedToTarget',
                params: targetParams
              } as CDPEvent,
              source: 'extension'
            })
          } else if (method === 'Target.detachedFromTarget') {
            const detachParams = params as Protocol.Target.DetachedFromTargetEvent
            connectedTargets.delete(detachParams.sessionId)

            sendToPlaywright({
              message: {
                method: 'Target.detachedFromTarget',
                params: detachParams
              } as CDPEvent,
              source: 'extension'
            })
          } else {
            sendToPlaywright({
              message: {
                sessionId,
                method,
                params
              } as CDPEvent,
              source: 'extension'
            })
          }
        }
      },

      onClose() {
        console.log('Extension disconnected')

        for (const pending of extensionPendingRequests.values()) {
          pending.reject(new Error('Extension connection closed'))
        }
        extensionPendingRequests.clear()

        extensionWs = null
        connectedTargets.clear()

        if (playwrightWs) {
          playwrightWs.close(1000, 'Extension disconnected')
          playwrightWs = null
        }
      },

      onError(event) {
        console.error('Extension WebSocket error:', event)
      }
    }
  }))

  const server = serve({ fetch: app.fetch, port })
  injectWebSocket(server)

  const wsHost = `ws://localhost:${port}`
  const cdpEndpoint = `${wsHost}/cdp`
  const extensionEndpoint = `${wsHost}/extension`

  console.log('CDP relay server started')
  console.log('Extension endpoint:', extensionEndpoint)
  console.log('CDP endpoint:', cdpEndpoint)

  return {
    cdpEndpoint,
    extensionEndpoint,
    close() {
      playwrightWs?.close(1000, 'Server stopped')
      extensionWs?.close(1000, 'Server stopped')
      server.close()
    }
  }
}
