/*
 * Copyright 2018-2020 Jiří Janoušek <janousek.jiri@gmail.com>
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
  const PlaybackState = Nuvola.PlaybackState
  const PlayerAction = Nuvola.PlayerAction
  const _ = Nuvola.Translate.gettext
  const C_ = Nuvola.Translate.pgettext
  const THUMB_NEVER_TOGGLES = 'app.thumb_never_toggles'
  const ACTION_THUMBS_UP = 'thumbs-up'
  const ACTION_THUMBS_DOWN = 'thumbs-down'
  const THUMBS_ACTIONS = [ACTION_THUMBS_UP, ACTION_THUMBS_DOWN]

  const player = Nuvola.$object(Nuvola.MediaPlayer)
  const WebApp = Nuvola.$WebApp()

  WebApp._onInitAppRunner = function (emitter) {
    Nuvola.WebApp._onInitAppRunner.call(this, emitter)
    Nuvola.config.setDefaultAsync(THUMB_NEVER_TOGGLES, false).catch(Nuvola.logException)
    Nuvola.core.connect('PreferencesForm', this)
    Nuvola.actions.addAction('playback', 'win', ACTION_THUMBS_UP, C_('Action', 'Thumbs up'), null, null, null, true)
    Nuvola.actions.addAction('playback', 'win', ACTION_THUMBS_DOWN, C_('Action', 'Thumbs down'), null, null, null, true)
  }

  WebApp._onInitWebWorker = function (emitter) {
    Nuvola.WebApp._onInitWebWorker.call(this, emitter)
    this.thumbsUp = undefined
    this.thumbsDown = undefined
    this.state = PlaybackState.UNKNOWN
    player.addExtraActions(THUMBS_ACTIONS)

    const state = document.readyState
    if (state === 'interactive' || state === 'complete') {
      this._onPageReady()
    } else {
      document.addEventListener('DOMContentLoaded', this._onPageReady.bind(this))
    }
  }

  // Page is ready for magic
  WebApp._onPageReady = function () {
    Nuvola.actions.connect('ActionActivated', this)
    player.connect('RatingSet', this)
    Nuvola.config.connect('ConfigChanged', this)
    Nuvola.config.getAsync(THUMB_NEVER_TOGGLES).then((thumbNeverToggles) => {
      this.thumbNeverToggles = thumbNeverToggles
      this.update()
    }).catch(Nuvola.logException)
  }

  // Extract data from the web page
  WebApp.update = function () {
    const elms = this._getElements()
    let track = {
      artist: null,
      album: null,
      artLocation: null,
      rating: null,
      length: null
    }

    if (this.isAdPlaying()) {
      player.setTrack(track)
    } else {
      track = {
        title: Nuvola.queryText('.middle-controls .title'),
        artist: Nuvola.queryText('.middle-controls .byline', value => value.split('•')[0].trim() || null),
        artLocation: Nuvola.queryAttribute('.middle-controls img', 'src'),
        rating: null
      }

      const timeInfo = this._getTimeInfo()
      if (timeInfo) {
        track.length = timeInfo[1]
        player.setTrackPosition(timeInfo[0])
      }
      if (this._isButtonPressed(elms.like)) {
        track.rating = 1.0
      } else if (this._isButtonPressed(elms.dislike)) {
        track.rating = 0.20
      } else {
        track.rating = 0.0
      }
      player.setTrack(track)
    }

    let state
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
    player.setCanRate(!!elms.like || !elms.dislike)

    Nuvola.actions.updateStates({
      [ACTION_THUMBS_UP]: this._isButtonPressed(elms.like),
      [ACTION_THUMBS_DOWN]: this._isButtonPressed(elms.dislike)
    })
    Nuvola.actions.updateEnabledFlags({
      [ACTION_THUMBS_UP]: !!elms.like && !(this.thumbNeverToggles && this._isButtonPressed(elms.like)),
      [ACTION_THUMBS_DOWN]: !!elms.dislike && !(this.thumbNeverToggles && this._isButtonPressed(elms.dislike))
    })

    // Schedule the next update
    setTimeout(this.update.bind(this), 500)
  }

  WebApp._getElements = function () {
    // Interesting elements
    const elms = {
      play: document.querySelector('#left-controls .play-pause-button'),
      pause: null,
      next: document.querySelector('#left-controls .next-button'),
      prev: document.querySelector('#left-controls .previous-button'),
      progressbar: document.querySelector('#progress-bar #sliderBar'),
      volumebar: document.querySelector('#volume-slider #sliderBar'),
      expandingMenu: document.querySelector('#right-controls #expanding-menu'),
      like: document.querySelector('.middle-controls-buttons .like'),
      dislike: document.querySelector('.middle-controls-buttons .dislike')
    }

    // Ignore disabled buttons
    for (const key in elms) {
      if (elms[key] && elms[key].disabled) {
        elms[key] = null
      }
    }

    // Distinguish between play (M8) and pause (M6) actions
    if (elms.play && elms.play.querySelector('tp-yt-iron-icon svg g path[d~="M6"]')) {
      elms.pause = elms.play
      elms.play = null
    }
    return elms
  }

  WebApp._getTimeInfo = function () {
    let time = Nuvola.queryText('#left-controls .time-info')
    if (time && time.includes('/')) {
      time = time.split('/')
      return [time[0].trim(), time[1].trim()]
    }
    return null
  }

  WebApp._isButtonPressed = function (button) {
    return button && button.getAttribute('aria-pressed') === 'true'
  }

  // Handler of playback actions
  WebApp._onActionActivated = function (emitter, name, param) {
    const elms = this._getElements()
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
      case PlayerAction.SEEK: {
        const timeInfo = this._getTimeInfo()
        if (timeInfo) {
          const total = Nuvola.parseTimeUsec(timeInfo[1])
          if (param >= 0 && param <= total) {
            Nuvola.clickOnElement(elms.progressbar, param / total, 0.5)
          }
        }
        break
      }
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
      /* Custom actions */
      case ACTION_THUMBS_UP:
        Nuvola.clickOnElement(elms.like)
        break
      case ACTION_THUMBS_DOWN:
        Nuvola.clickOnElement(elms.dislike)
        break
    }
  }

  // Handler for rating
  WebApp._onRatingSet = function (emitter, rating) {
    Nuvola.log('Rating set: {1}', rating)
    const elms = this._getElements()
    if (rating < 0.01) { // Unset rating
      if (this._isButtonPressed(elms.like)) {
        Nuvola.clickOnElement(elms.like)
      } else if (this._isButtonPressed(elms.dislike)) {
        Nuvola.clickOnElement(elms.dislike)
      }
    } else if (rating <= 0.41) { // 0-2 stars
      if (!this._isButtonPressed(elms.dislike)) {
        Nuvola.clickOnElement(elms.dislike)
      }
    } else if (rating >= 0.79) { // 4-5 stars
      if (!this._isButtonPressed(elms.like)) {
        Nuvola.clickOnElement(elms.like)
      }
    } else { // three stars
      window.alert('Invalid rating: ' + rating + '.' +
        "Have you clicked the three-star button? It isn't supported.")
    }
  }

  WebApp._onConfigChanged = function (emitter, key) {
    if (key === THUMB_NEVER_TOGGLES) {
      Nuvola.config.getAsync(THUMB_NEVER_TOGGLES).then((thumbNeverToggles) => {
        this.thumbNeverToggles = thumbNeverToggles
      }).catch(Nuvola.logException)
    }
  }

  WebApp._onPreferencesForm = function (emitter, values, entries) {
    this.appendPreferences(values, entries)
  }

  WebApp.appendPreferences = function (values, entries) {
    values[THUMB_NEVER_TOGGLES] = Nuvola.config.get(THUMB_NEVER_TOGGLES)
    entries.push(['header', '\nYouTube Music'])
    entries.push(['bool', THUMB_NEVER_TOGGLES, _('Treat thumbs up or down selection as a one-way switch,\nnot a toggle.')])
  }

  WebApp.isAdPlaying = function () {
    const elm = document.querySelector('.middle-controls .advertisement')
    return !!(elm && !elm.hidden)
  }

  WebApp.start()
})(this) // function(Nuvola)
