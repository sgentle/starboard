Starboard
=========

Starboard is a choose-your-own-key web version of the synth lead from
[Shooting Stars, by Bag Raiders](https://www.youtube.com/watch?v=feA64wXhbjo).

It uses Web Audio for synthesis, SVG for the on-screen keyboard, and Canvas
for additional spice.

Check out the live demo [here](https://demos.samgentle.com/starboard).


Audio Setup
-----------

Dollar store jQuery.

    $ = document.querySelector.bind(document)

The audio context we'll be using everywhere throughout the code.

    context = new (window.AudioContext or window.webkitAudioContext)

We use MIDI-compatible integer notation for numbers. Middle A is 69 and we
derive everything from that.

    noteToFreq = (n) -> 440 * Math.pow(2, (n - 69) / 12)

Our keyboard has much less than the available range, so here's the note we
start at (middle C).

    OCTAVE = 60
    BPM = 125

This creates a simple reverb impulse, which is way less work than using a real one.
Based on: https://github.com/web-audio-components/simple-reverb

    createImpulse = (length, decay) ->
      samples = length * context.sampleRate
      impulse = context.createBuffer 2, samples, context.sampleRate
      impulseL = impulse.getChannelData(0)
      impulseR = impulse.getChannelData(1)
      for i in [0...samples]
        impulseL[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / samples, decay)
        impulseR[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / samples, decay)
      impulse

For our mastering chain we want to apply compression, reverb and gain.

We set a gain lower than 1.0 because people probably have their
headphones/speakers turned up too high.

    createMaster = ->
      compressor = context.createDynamicsCompressor()

      reverb = context.createConvolver()
      reverb.buffer = createImpulse 2, 2
      compressor.connect reverb

      dry = context.createGain()
      dry.gain.value = 0.75
      compressor.connect dry

      wet = context.createGain()
      wet.gain.value = 0.25
      reverb.connect wet

      masterGain = context.createGain()
      masterGain.gain.value = 0.75
      wet.connect masterGain
      dry.connect masterGain

      masterGain.connect context.destination

      compressor

    master = createMaster()


Constant source node
--------------------

Safari doesn't support constant source nodes, but that's okay because we can
reimplement them with buffers and swearing.

    do ->
      if !context.createConstantSource
        oneBuffer = context.createBuffer 1, 128, context.sampleRate
        data = oneBuffer.getChannelData 0
        data[i] = 1 for i in [0...data.length]

        context.createConstantSource = ->
          source = context.createBufferSource()
          source.buffer = oneBuffer
          source.loop = true
          gain = context.createGain()
          source.connect gain

          start: source.start.bind source
          stop: source.stop.bind source
          connect: gain.connect.bind gain
          disconnect: gain.disconnect.bind gain
          offset: gain.gain


Pulse wave oscillator
---------------------

The kind of oscillator used to get that reed sound is a pulse wave, which is a
square wave with a variable duty cycle. Square waves are 50% on, 50% off, we
want 30% on, 70% off.

Unfortunately, there is no way to create a pulse wave in Web Audio without a
lot of bother. This was the least silly way to do it.

You can create a pulse wave by subtracting one sawtooth wave from another. The
ramps of the saws cancel out into flat lines, and their cliffs create the
pulses. This adds a DC offset that has to be canceled out, but it leaves the
band-limiting of the square waves intact, which is necessary for making it not
sound like hot garbage.


To figure out the phase offset, take the wavelength (1/frequency) and multiply
it by the width factor (ie 0.3). To make this automatically follow the
frequency, though, we have to invert and multiply using Web Audio nodes. You
can multiply using a gain node, but how do you invert?

The answer is to use a wave shaper, which can act as an arbitrary number
mapper. Unfortunately, it only applies from the domain -1..1, so we also have
to divide our input down into that range first using a gain node. There might
be some consequences for precision here but I don't know what they are and it
sounds okay so 🤷

    createInverterCurve = (n) ->
      curve = new Float32Array(n)
      for i in [0...n]
        curve[i] = 1 / (2 * i - n)
      curve

    inverterCurve = createInverterCurve context.sampleRate

    createInverter =  ->
      shaper = context.createWaveShaper()
      shaper.curve = inverterCurve

      gain = context.createGain()
      gain.gain.value = 1/context.sampleRate
      gain.connect shaper

      gain.connect = shaper.connect.bind(shaper)
      gain.disconnect = shaper.disconnect.bind(shaper)
      gain

With some help from https://webaudiodemos.appspot.com/oscilloscope/index.html

    createPulseOscillator = (width, f) ->
      osc = context.createOscillator()
      osc.type = 'sawtooth'
      osc.frequency.value = 0

      freq = context.createConstantSource()
      freq.offset.value = 0
      freq.connect osc.frequency

      wavelength = createInverter()
      freq.connect wavelength

      dutyCycle = context.createGain()
      dutyCycle.gain.value = width
      wavelength.connect dutyCycle

      negative = context.createGain()
      negative.gain = -1
      osc.connect negative

      delay = context.createDelay()
      negative.connect delay
      dutyCycle.connect delay.delayTime

      output = context.createGain()
      osc.connect output
      delay.connect output

      offset = context.createConstantSource()
      offset.offset.value = 1.7 * (0.5 - width)
      offset.connect output

      connect: output.connect.bind output
      disconnect: output.disconnect.bind output
      start: (t) ->
        osc.start t
        offset.start t
        freq.start t

      stop: (t) ->
        osc.stop t
        offset.stop t
        freq.stop t

      frequency: freq.offset

Now let's never speak of this again.


Notes
-----

Finally, we can start playing notes!

We store all the currently playing notes in this object.

    currentNotes = {}

Here we set up the actual synth sound. We have a pulse wave that we
painstakingly created above, and to get vibrato we add an LFO with a slow
attack.

Lastly we add a gain with a fast attack and release to avoid popping.

    startNote = (note) ->
      return if currentNotes[note]

      screenKeys[note - OCTAVE]?.activate()

      freq = noteToFreq note
      at = context.currentTime

      osc = createPulseOscillator 0.3, freq
      osc.frequency.value = freq
      osc.start()

      lfo = context.createOscillator()
      lfo.frequency.value = 6
      lfo.start()

      lfogain = context.createGain()
      lfogain.gain.value = 0
      lfogain.gain.setValueAtTime 0, at
      lfogain.gain.linearRampToValueAtTime freq / 100, at + 1
      lfo.connect lfogain
      lfogain.connect osc.frequency

      gain = context.createGain()
      gain.gain.value = 0
      gain.gain.setValueAtTime 0, at
      gain.gain.linearRampToValueAtTime 1, at + 0.01
      osc.connect gain

      gain.connect master

      currentNotes[note] = {gain, osc, lfo}

    stopNote = (note) ->
      return unless current = currentNotes[note]
      screenKeys[note - OCTAVE]?.deactivate()

      freq = noteToFreq note
      at = context.currentTime

      current.gain.gain.linearRampToValueAtTime 0, at + 0.01
      current.osc.stop at + 0.2
      current.lfo.stop at + 0.2
      setTimeout ->
        current.gain.disconnect()
      , 200

      delete currentNotes[note]


Sequencer
---------

The sequencer is how we go from individual notes to a bangin' tune. We need
the sequence of notes (or in this case, semitone offsets, since we want to
transpose based on the initial key), and a sequence of timing values.

    NOTE_OFFSETS = [
      -1, -0.5,
      0, null, 0, null, 1, null, -4, -7,
      -1, -0.5,
      0, null, 0, null, 1, null, -4, -7,
      -1, -0.5,
      0, null, 0, null, 1, null, -4, -7,
      -1, -0.5,
      0, null, 0, null, 1, 0, -4, -7
    ]

We don't need a full set of timings because they just repeat.

    NOTE_TIMES = [
      0.04, 0.04,
      1.42, 1/8 + 1/16, 1/4, 1/4, 1/2, 1/2, 1/2, 1/4
    ]

    shouldAnimate = false

The sequencer just loops through the above arrays, using setTimeouts to
trigger the next note. Normally you'd use the web audio scheduler for notes
but that's way more effort and sequencing doesn't need to be that precise.

    createSequencer = (initialNote) ->
      i = 0
      timer = null
      currentNote = null

      nextNote = ->
        offset = NOTE_OFFSETS[i]

        currentNote = initialNote + offset
        startNote currentNote if offset?

        timer = setTimeout ->
          stopNote currentNote if offset?
          i = (i + 1) % NOTE_OFFSETS.length

          if !shouldAnimate and i is 0
            shouldAnimate = true
            startAnimating()

          nextNote()
        , 60 * 1000 / BPM * NOTE_TIMES[i % NOTE_TIMES.length]

      nextNote()

      stop: ->
        stopNote currentNote
        clearTimeout timer

    sequencers = {}

    startSequencer = (note) ->
      sequencers[note] ?= createSequencer note
      startAnimating() if shouldAnimate and Object.keys(sequencers).length > 0

    stopSequencer = (note) ->
      sequencers[note]?.stop()
      delete sequencers[note]
      stopAnimating() if shouldAnimate and Object.keys(sequencers).length is 0


Keyboard control
----------------

To get key events, we use KeyboardEvent.code, which means it should follow the
key layout even if you're on AZERTY or something crazy like that. Minor
downside, it won't work on some versions of Safari, but Safari users are
probably best placed to appreciate the simple, understated elegance of not
being able to use a keyboard.

    KEYS =
      KeyA: 0
      KeyW: 1
      KeyS: 2
      KeyE: 3
      KeyD: 4
      KeyF: 5
      KeyT: 6
      KeyG: 7
      KeyY: 8
      KeyH: 9
      KeyU: 10
      KeyJ: 11
      KeyK: 12
      KeyO: 13
      KeyL: 14
      KeyP: 15
      Semicolon: 16
      Quote: 17
      BracketRight: 18
      Backslash: 19 # Left of the enter key on some layouts
      Enter: 19

Little easter egg here if you're paying attention!

    document.addEventListener 'keydown', (ev) ->
      if ev.code is 'ArrowUp'
        OCTAVE += 12
      else if ev.code is 'ArrowDown'
        OCTAVE -= 12

      return if ev.ctrlKey or ev.altKey or ev.metaKey

      if (note = KEYS[ev.code])?
        startSequencer note + OCTAVE

    document.addEventListener 'keyup', (ev) ->
      return if ev.ctrlKey or ev.altKey or ev.metaKey

      if (note = KEYS[ev.code])?
        stopSequencer note + OCTAVE


On-screen keyboard
------------------

For our mobile-wielding friends, an onscreen keyboard! We also do some fun
animations with this once the loop gets going. This ends up being a lot of the
code, because drawing keyboards is surprisingly tricky and touch + mouse
events are the worst.

    SvgEl = (name, attribs={}, content) ->
      el = document.createElementNS 'http://www.w3.org/2000/svg', name
      el.setAttribute k, v for k, v of attribs
      el.textContent = content if content
      el

    svg = $('#board')

    KEYCOUNT = 24
    HIGHLIGHT = '#ffff22'
    INVERSE_HIGHLIGHT = '#ffffdd'

Ever wanted to know whether an arbitrary MIDI note is a black or a white key?

    isBlackKey = (n) -> n % 2 == 0 ^ n % 12 < 5

We need this to know if the mouse button is already down when you slide onto a
note.

    mouseIsDown = false
    window.addEventListener 'mousedown', (ev) -> mouseIsDown = true if ev.button is 0
    window.addEventListener 'mouseup', (ev) -> mouseIsDown = false if ev.button is 0

    createScreenKeys = ->
      whiteKeys = SvgEl 'g', fill: 'white'
      blackKeys = SvgEl 'g', fill: 'black'
      svg.appendChild whiteKeys
      svg.appendChild blackKeys

      cx = 4
      highlightColor = HIGHLIGHT

      for i in [0...KEYCOUNT] then do (i) ->
        d =
          if isBlackKey i
            offset: -50
            width: 100
            height: 600
            container: blackKeys
          else
            offset: 0
            width: 200
            height: 900
            container: whiteKeys

        cx += d.offset

        g = SvgEl 'g'
        el = SvgEl 'rect',
          x: cx
          y: 0
          width: d.width
          height: d.height

        cx += d.width + d.offset

        start = (ev) ->
          if ev.button is 0 or ev.touches
            startSequencer i + OCTAVE
            ev.preventDefault()
        stop = (ev) ->
          if ev.button is 0 or ev.touches
            stopSequencer i + OCTAVE
            ev.preventDefault()
        enter = (ev) ->
          if mouseIsDown or ev.touches
            startSequencer i + OCTAVE
            ev.preventDefault()
        leave = (ev) ->
          stopSequencer i + OCTAVE
          ev.preventDefault()

        el.addEventListener 'mousemove', enter
        el.addEventListener 'mousedown', start
        el.addEventListener 'mouseup', stop
        el.addEventListener 'mouseout', leave

        el.addEventListener 'touchstart', start
        el.addEventListener 'touchend', stop
        el.addEventListener 'touchcancel', leave

        g.appendChild el
        d.container.appendChild g

        activate: -> el.setAttribute 'fill', highlightColor
        deactivate: -> el.removeAttribute 'fill'
        animate: -> g.style.animation = "cycle 7.68s linear #{i/KEYCOUNT - 7.68}s infinite"
        deanimate: -> g.style.animation = ''

    screenKeys = createScreenKeys()


Starfield
---------

To give us something nice to look at, here's a starfield!

    canvas = $('#star')
    ctx = canvas.getContext('2d')
    STARS = 500

Generate a star. dx and dy form a (1/2 length) unit vector to control motion,
z represents the depth and is used to set the size, brightness and scale the
motion speed.

    makeStar = ->
      dx = 0.5 - Math.random()
      dy = 0.5 - Math.random()
      z = Math.random()
      d = Math.sqrt(dx * dx + dy * dy)
      dx /= d
      dy /= d
      {dx, dy, z}

    setupStarfield = ->
      starData = (makeStar() for [1...STARS])

      w = h = null
      resize = ->
        w = canvas.width = canvas.offsetWidth
        h = canvas.height = canvas.offsetHeight


      TIME = 10000

This is doing something pretty fun: pure functional animation. Each star is
defined only by its initial configuration (dx, dy and z) and the current time
t.

      drawing = false
      draw = (_t) ->
        t = _t + TIME * 10

        ctx.globalAlpha = 1
        ctx.fillStyle = 'black'
        ctx.fillRect 0, 0, w, h
        ctx.fillStyle = 'white'

        for s in starData
          v = (s.z * t % TIME) / TIME
          size = v * 5
          ctx.globalAlpha = Math.min(s.z * 2, 1)
          x = (0.5 + s.dx * v) * w - size / 2
          y = (0.5 + s.dy * v) * h - size / 2
          ctx.fillRect x, y, size, size

        requestAnimationFrame draw if drawing

      resize()
      window.addEventListener 'resize', resize

      start: ->
        return if drawing
        drawing = true
        requestAnimationFrame draw
      stop: ->
        drawing = false

    starfield = setupStarfield()


Animation trigger
-----------------

This handles triggering the transition for the starfield and rainbow keyboard.
This requires a bit of carefulness because we want to sequence the canvas
animations, svg animations and opacity transitions in the right order, even
under intense key mashing.

    animating = false

    startAnimating = ->
      clearTimeout stopAnimationTimeout
      clearTimeout stopStarfieldTimeout
      return if animating

      animating = true

      starfield.start()

      canvas.style.opacity = 1
      canvas.style.transition = 'opacity 2s ease-out'

      highlightColor = INVERSE_HIGHLIGHT
      svg.setAttribute 'stroke', 'white'

      key.animate() for key in screenKeys

    stopAnimationTimeout = null
    stopStarfieldTimeout = null

    stopAnimating = ->
      return unless animating

      clearTimeout stopStarfieldTimeout
      clearTimeout stopAnimationTimeout
      stopAnimationTimeout = setTimeout ->
        animating = false

        canvas.style.opacity = 0
        canvas.style.transition = 'opacity 0.5s ease-out'

        highlightColor = HIGHLIGHT
        svg.setAttribute 'stroke', 'black'

        key.deanimate() for key in screenKeys

        stopStarfieldTimeout = setTimeout starfield.stop, 500
      , 1000
