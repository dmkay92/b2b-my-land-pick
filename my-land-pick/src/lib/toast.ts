type ToastType = 'success' | 'error' | 'info'

interface ToastEvent {
  message: string
  type: ToastType
  id: number
}

type Listener = (event: ToastEvent) => void

let listeners: Listener[] = []
let counter = 0

export function toast(message: string, type: ToastType = 'info') {
  const event: ToastEvent = { message, type, id: ++counter }
  listeners.forEach(l => l(event))
}

export function subscribe(listener: Listener) {
  listeners.push(listener)
  return () => { listeners = listeners.filter(l => l !== listener) }
}
