// @ts-check
const UNSTARTED = -1
const ENDED = 0
const PLAYING = 1
const PAUSED = 2
const BUFFERING = 3
const CUED = 5

/** @param {Required<YT.PlayerOptions>} options */
function getEmbedUrl (options) {
  const params = new URLSearchParams(
    Object.entries(options.playerVars)
      .filter(([, value]) => value != null)
  )
  params.set('enablejsapi', '1')
  return `${options.host}/embed/${options.videoId}?${params}`
}

/** @param {Required<YT.PlayerOptions & { title: string }>} options */
function createIframe (options) {
  const iframe = document.createElement('iframe')
  iframe.setAttribute('frameborder', '0')
  iframe.setAttribute('allowfullscreen', '1')
  iframe.setAttribute('title', `YouTube ${options.title}`)
  if (options.width) {
    iframe.setAttribute('width', String(options.width))
  }
  if (options.height) {
    iframe.setAttribute('height', String(options.height))
  }
  iframe.src = getEmbedUrl(options)
  return iframe
}

const messageHandlers = new Map()
const attachedListeners = new Set()

/** @param {string} host */
function attachGlobalListener (host) {
  const hasListener = attachedListeners.size > 0
  attachedListeners.add(host)
  if (hasListener) {
    return
  }
  window.addEventListener('message', (event) => {
    if (attachedListeners.has(event.origin)) {
      let data
      try {
        data = JSON.parse(event.data)
      } catch {
        return
      }
      messageHandlers.get(data.id)?.(data)
    }
  })
}

class PlayerEvent {
  constructor (target, type, data) {
    this.target = target
    this.type = type
    this.data = data
  }
}

let id = 0
class Player {
  #originalElement
  #iframe
  #messageQueue = []
  #ready = false
  #pollReadiness = null
  #info = {}
  #events = new Map()

  /**
   * @param {HTMLElement|string} target
   * @param {YT.PlayerOptions} options
   */
  constructor (target, options) {
    /** @type {Required<YT.PlayerOptions & { id: string, title: string }>} */
    const defaults = {
      id: `c${id++}`,
      videoId: '',
      width: 640,
      height: 390,
      title: 'video player',
      host: 'https://www.youtube.com',
      events: {},
      playerVars: {},
    }
    this.options = { ...defaults, ...options }

    // Defaults
    Object.entries(defaults).forEach(([key, value]) => {
      this.options[key] ??= value
    })

    this.id = this.options.id

    const element = typeof target === 'string' ? document.getElementById(target) : target
    if (!element) {
      throw new Error('target must be an element')
    }
    const iframe = element.tagName === 'IFRAME' ? /** @type {HTMLIFrameElement} */ (element) : createIframe(this.options)
    iframe.setAttribute('id', `widget${this.id}`)

    if (iframe !== element) {
      element.parentNode?.replaceChild(iframe, element)
    }
    this.#iframe = iframe
    this.#originalElement = element

    // Bombard it with listening events until we get a reply.
    const emitListening = () => this.#sendMessage({ event: 'listening' })
    emitListening()
    this.#pollReadiness = setInterval(emitListening, 100)
    iframe.addEventListener('load', emitListening)

    Object.entries(this.options.events).forEach(([name, handler]) => {
      this.addEventListener(name, handler)
    })

    attachGlobalListener(this.options.host)
    if (messageHandlers.has(this.id)) {
      throw new Error(`Duplicate player id: ${this.id}`)
    }
    messageHandlers.set(this.id, (data) => {
      this.#handleMessage(data)
    })
  }

  #stopPolling () {
    if (this.#pollReadiness !== null) {
      clearInterval(this.#pollReadiness)
      this.#pollReadiness = null
    }
  }

  destroy () {
    this.#stopPolling()
    if (this.#iframe !== this.#originalElement) {
      this.#iframe.parentNode.replaceChild(this.#originalElement, this.#iframe)
    }
    messageHandlers.delete(this.id)
  }

  #sendMessage (data) {
    const payload = { ...data, id: this.id, channel: 'widget' }
    if (!this.#iframe.contentWindow) {
      return console.log(this.#iframe)
    }
    this.#iframe.contentWindow.postMessage(JSON.stringify(payload), this.options.host)
  }

  #handleMessage (data) {
    if (this.#messageQueue.length > 0) {
      this.#messageQueue.forEach((message) => this.#sendMessage(message))
      this.#messageQueue = []
    }
    this.#stopPolling()
    this.#ready = true

    if (data.event === 'initialDelivery') {
      this.#info = data.info
    } else if (data.event === 'infoDelivery') {
      const oldInfo = this.#info
      this.#info = { ...oldInfo, ...data.info }
      // this.#emitChangeEvents(oldInfo, this.#info)
    } else if (data.event === 'apiInfoDelivery') {
      // ignore
    } else {
      this.#emit(data.event, data.info)
    }
  }

  #emit (type, data) {
    const list = this.#events.get(type)
    if (list) {
      const event = new PlayerEvent(this, type, data)
      list.forEach((handler) => {
        handler(event)
      })
    }
  }

  addEventListener (name, handler) {
    const list = this.#events.get(name)
    if (list) {
      list.push(handler)
    } else {
      this.#events.set(name, [handler])
      this.#sendCommand('addEventListener', [name])
    }
  }

  removeEventListener (name, handler) {
    const list = this.#events.get(name)
    if (!list) {
      return
    }
    const index = list.indexOf(handler)
    if (index !== -1) {
      list.splice(index, 1)
    }

    if (list.length === 0) {
      this.#sendCommand('removeEventListener', [name])
      this.#events.delete(name)
    }
  }

  #sendCommand (func, args) {
    if (this.#ready) {
      this.#sendMessage({ event: 'command', func, args })
    } else {
      this.#messageQueue.push({ event: 'command', func, args })
    }
  }

  getIframe () {
    return this.#iframe
  }

  getPlayerState () {
    return this.#info.playerState
  }

  loadVideoById (...args) {
    this.#sendCommand('loadVideoById', args)
  }

  cueVideoById (...args) {
    this.#sendCommand('cueVideoById', args)
  }

  loadVideoByUrl (...args) {
    this.#sendCommand('loadVideoByUrl', args)
  }

  cueVideoByUrl (...args) {
    this.#sendCommand('cueVideoByUrl', args)
  }

  playVideo () {
    this.#sendCommand('playVideo', [])
  }

  pauseVideo () {
    this.#sendCommand('pauseVideo', [])
  }

  stopVideo () {
    this.#sendCommand('stopVideo', [])
  }

  seekTo (seconds, allowSeekAhead) {
    this.#sendCommand('seekTo', [seconds, allowSeekAhead])
  }

  mute () {
    this.#sendCommand('mute')
  }

  unMute () {
    this.#sendCommand('unMute')
  }

  isMuted () {
    return this.#info.muted
  }

  setVolume (volume) {
    this.#sendCommand('setVolume', [volume])
  }

  getVolume () {
    return this.#info.volume
  }

  setSize (width, height) {
    this.#iframe.width = String(width)
    this.#iframe.height = String(height)
  }

  getAvailablePlaybackRates () {
    return this.#info.availablePlaybackRates
  }

  setPlaybackRate (suggestedRate) {
    this.#sendCommand('setPlaybackRate', [suggestedRate])
  }

  setLoop (loopPlaylists) {
    this.#sendCommand('setLoop', [loopPlaylists])
  }

  setShuffle (shufflePlaylist) {
    this.#sendCommand('setShuffle', [shufflePlaylist])
  }

  getAvailableQualityLevels () {
    return this.#info.availableQualityLevels
  }

  getPlaybackQuality () {
    return this.#info.playbackQuality
  }

  getDuration () {
    return this.#info.duration
  }

  getCurrentTime () {
    return this.#info.currentTime
  }

  getVideoLoadedFraction () {
    return this.#info.videoLoadedFraction
  }

  getVideoUrl () {
    return this.#info.videoUrl
  }

  getVideoEmbedCode () {
    return this.#info.videoEmbedCode
  }

  // Extensions

  getVideoId () {
    return this.#info.videoData?.video_id
  }
}

/** @type {typeof YT.PlayerState} */
const PlayerState = {
  UNSTARTED,
  ENDED,
  PLAYING,
  PAUSED,
  BUFFERING,
  CUED
}

function ready (callback) {
  callback()
}

export {
  Player,
  PlayerState,
  ready
}
