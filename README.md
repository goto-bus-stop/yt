# @goto-bus-stop/yt
A cheeky alternative YouTube Player API implementation.

This package is intended to be a drop-in replacement for the YouTube Player API. It does the same iframe embedding as the official API and talks to the embedded player using the same `postMessage` protocol.
That protocol is not documented and not officially supported, but it also hasn't changed in about 9 years, so who knows, it might be fine! Surely Google won't break backwards compatibility for no benefit? Right? …Right?

The nice thing about this package compared to the official API is that you don't need to load it asynchronously. After gzip, it's about 2kB of modern JS that you can just bundle directly.

## Install
```
npm install @goto-bus-stop/yt
```

## Usage
You can use the `/install` entry point to make it available under the `YT` global:
```js
import '@goto-bus-stop/yt/install'
```
If you use other packages that use the YouTube API, they should automatically detect this package and use it.

If you want to use the Player API directly yourself, you can do:
```js
import { Player, PlayerState } from '@goto-bus-stop/yt'
```

Afterward, the API is almost the same as the official version.

```js
const player = new Player(element, {
  videoId: 'lwkecoDAFZs',
  playerVars: {
    disablekb: 1,
  },
  events: {
    onReady(event) {
      event.target.playVideo()

      event.target.getIframe().requestFullscreen()
    }
  },
})

function unmount () {
  player.destroy()
}
```

## Differences
- This package does not implement a few obsolete methods from the YouTube API. It shouldn't matter since those do nothing anyway.
- This package adds a `player.getVideoId()` method that returns the currently playing video ID.
- This package does not call any `onYouTubeIframeAPIReady` callbacks, that is the whole point.
- In the official YouTube API, many methods _do not exist_ until the player is ready. In this package, they exist, but getters will return `undefined` until the player is ready.

## License
This package is available under the terms of the [Unlicense](./LICENSE).
