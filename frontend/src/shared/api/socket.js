import { io } from 'socket.io-client'
import { API_ORIGIN } from './config'

let socket = null

export function connectSocket() {
  // Reuse the existing socket unless it is genuinely closed. Treating a
  // CONNECTING or RECONNECTING socket as disposable would mint a new one and
  // silently drop the listeners the provider registered on the old instance.
  if (socket && !socket.disconnected) return socket

  socket = io(API_ORIGIN, {
    withCredentials: true,
    transports: ['websocket', 'polling'],
    reconnection: true,
    reconnectionDelay: 1000,
    reconnectionDelayMax: 10000,
  })

  return socket
}

export function getSocket() {
  return socket
}

export function disconnectSocket() {
  if (socket) {
    socket.removeAllListeners()
    socket.disconnect()
    socket = null
  }
}

export function socketEmit(event, payload) {
  if (socket?.connected) {
    socket.emit(event, payload)
  }
}