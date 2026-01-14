import { LOG_FILE_PATH } from './utils.js'

/**
 * Base error class for playwriter relay server errors.
 */
export class RelayServerError extends Error {
  readonly port: number

  constructor(message: string, port: number) {
    super(`[Playwriter] ${message} (port ${port})`)
    this.name = 'RelayServerError'
    this.port = port
  }
}

/**
 * Error thrown when extension doesn't connect within timeout.
 */
export class ExtensionNotConnectedError extends RelayServerError {
  constructor(port: number) {
    super(
      'Extension not connected. Please click the Playwriter extension icon on a Chrome tab.',
      port
    )
    this.name = 'ExtensionNotConnectedError'
  }
}

/**
 * Error thrown when relay server fails to start.
 */
export class RelayServerStartError extends RelayServerError {
  constructor(port: number) {
    super(
      `Failed to start relay server. Check logs at: ${LOG_FILE_PATH}`,
      port
    )
    this.name = 'RelayServerStartError'
  }
}
