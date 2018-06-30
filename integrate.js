/*
 * Copyright 2018 Jiří Janoušek <janousek.jiri@gmail.com>
 *
 * Redistribution and use in source and binary forms, with or without
 * modification, are permitted provided that the following conditions are met:
 *
 * 1. Redistributions of source code must retain the above copyright notice, this
 *    list of conditions and the following disclaimer.
 * 2. Redistributions in binary form must reproduce the above copyright notice,
 *    this list of conditions and the following disclaimer in the documentation
 *    and/or other materials provided with the distribution.
 *
 * THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS" AND
 * ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE IMPLIED
 * WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE ARE
 * DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT OWNER OR CONTRIBUTORS BE LIABLE FOR
 * ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL DAMAGES
 * (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR SERVICES;
 * LOSS OF USE, DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER CAUSED AND
 * ON ANY THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY, OR TORT
 * (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE OF THIS
 * SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.
 */

'use strict';

(function (Nuvola) {
  // Create media player component
  var player = Nuvola.$object(Nuvola.MediaPlayer)

  // Handy aliases
  var PlaybackState = Nuvola.PlaybackState
  var PlayerAction = Nuvola.PlayerAction

  // Create new WebApp prototype
  var WebApp = Nuvola.$WebApp()

  // Initialization routines
  WebApp._onInitWebWorker = function (emitter) {
    Nuvola.WebApp._onInitWebWorker.call(this, emitter)

    var state = document.readyState
    if (state === 'interactive' || state === 'complete') {
      this._onPageReady()
    } else {
      document.addEventListener('DOMContentLoaded', this._onPageReady.bind(this))
    }
  }

  // Page is ready for magic
  WebApp._onPageReady = function () {
    // Connect handler for signal ActionActivated
    Nuvola.actions.connect('ActionActivated', this)

    // Start update routine
    this.update()
  }

  // Extract data from the web page
  WebApp.update = function () {
    var elms = this._getElements()
    if (elms.skipAd) {
      if (elms.skipAd.parentNode.style.display !== 'none') {
        Nuvola.clickOnElement(elms.skipAd)
      }
    } else {
      var track = {
        title: Nuvola.queryText('.middle-controls .title'),
        artist: Nuvola.queryText('.middle-controls .byline', value => value.split('•')[0]),
        album: null,
        artLocation: Nuvola.queryAttribute('.middle-controls img', 'src'),
        rating: null
      }

      var timeInfo = this._getTimeInfo()
      if (timeInfo) {
        track.length = timeInfo[1]
        player.setTrackPosition(timeInfo[0])
      }
      player.setTrack(track)
    }

    var state
    if (elms.pause) {
      state = PlaybackState.PLAYING
    } else if (elms.play) {
      state = PlaybackState.PAUSED
    } else {
      state = PlaybackState.UNKNOWN
    }
    player.setPlaybackState(state)
    player.setCanGoPrev(!!elms.prev)
    player.setCanGoNext(!!elms.next)
    player.setCanPlay(!!elms.play)
    player.setCanPause(!!elms.pause)
    player.setCanSeek(state !== PlaybackState.UNKNOWN && elms.progressbar)
    player.updateVolume(Nuvola.queryAttribute('#volume-slider', 'value', (volume) => volume / 100))
    player.setCanChangeVolume(!!elms.volumebar)

    // Schedule the next update
    setTimeout(this.update.bind(this), 500)
  }

  WebApp._getElements = function () {
    // Interesting elements
    var elms = {
      play: document.querySelector('#left-controls .play-pause-button'),
      pause: null,
      next: document.querySelector('#left-controls .next-button'),
      prev: document.querySelector('#left-controls .previous-button'),
      progressbar: document.querySelector('#progress-bar #sliderBar'),
      volumebar: document.querySelector('#volume-slider #sliderBar'),
      expandingMenu: document.querySelector('#right-controls #expanding-menu'),
      skipAd: document.querySelector('button.videoAdUiSkipButton')
    }

    // Ignore disabled buttons
    for (var key in elms) {
      if (elms[key] && elms[key].disabled) {
        elms[key] = null
      }
    }

    // Distinguish between play and pause action
    if (elms.play && elms.play.getAttribute('title') === 'Pause') {
      elms.pause = elms.play
      elms.play = null
    }
    return elms
  }

  WebApp._getTimeInfo = function () {
    var time = Nuvola.queryText('#left-controls .time-info')
    if (time && time.includes('/')) {
      time = time.split('/')
      return [time[0].trim(), time[1].trim()]
    }
    return null
  }

  // Handler of playback actions
  WebApp._onActionActivated = function (emitter, name, param) {
    var elms = this._getElements()
    switch (name) {
      case PlayerAction.TOGGLE_PLAY:
        if (elms.play) {
          Nuvola.clickOnElement(elms.play)
        } else {
          Nuvola.clickOnElement(elms.pause)
        }
        break
      case PlayerAction.PLAY:
        Nuvola.clickOnElement(elms.play)
        break
      case PlayerAction.PAUSE:
      case PlayerAction.STOP:
        Nuvola.clickOnElement(elms.pause)
        break
      case PlayerAction.PREV_SONG:
        Nuvola.clickOnElement(elms.prev)
        break
      case PlayerAction.NEXT_SONG:
        Nuvola.clickOnElement(elms.next)
        break
      case PlayerAction.SEEK:
        var timeInfo = this._getTimeInfo()
        if (timeInfo) {
          var total = Nuvola.parseTimeUsec(timeInfo[1])
          if (param >= 0 && param <= total) {
            Nuvola.clickOnElement(elms.progressbar, param / total, 0.5)
          }
        }
        break
      case PlayerAction.CHANGE_VOLUME:
        if (elms.expandingMenu) {
          elms.expandingMenu.style.display = 'block'
          elms.expandingMenu.style.opacity = 1
          Nuvola.clickOnElement(document.querySelector('#expand-volume-slider #sliderBar'), param, 0.5)
          elms.expandingMenu.style.display = 'none'
          elms.expandingMenu.style.opacity = 0
        } else {
          Nuvola.clickOnElement(elms.volumebar, param, 0.5)
        }
        break
    }
  }

  WebApp.start()
})(this)  // function(Nuvola)
