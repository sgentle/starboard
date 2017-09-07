// Generated by CoffeeScript 1.12.5
(function() {
  var $, BPM, HIGHLIGHT, INVERSE_HIGHLIGHT, KEYCOUNT, KEYS, NOTE_OFFSETS, NOTE_TIMES, OCTAVE, STARS, SvgEl, animating, canvas, context, createImpulse, createInverter, createInverterCurve, createMaster, createPulseOscillator, createScreenKeys, createSequencer, ctx, currentNotes, inverterCurve, isBlackKey, makeStar, master, mouseIsDown, noteToFreq, screenKeys, sequencers, setupStarfield, shouldAnimate, starfield, startAnimating, startNote, startSequencer, stopAnimating, stopAnimationTimeout, stopNote, stopSequencer, stopStarfieldTimeout, svg;

  $ = document.querySelector.bind(document);

  context = new (window.AudioContext || window.webkitAudioContext);

  noteToFreq = function(n) {
    return 440 * Math.pow(2, (n - 69) / 12);
  };

  OCTAVE = 60;

  BPM = 125;

  createImpulse = function(length, decay) {
    var i, impulse, impulseL, impulseR, j, ref, samples;
    samples = length * context.sampleRate;
    impulse = context.createBuffer(2, samples, context.sampleRate);
    impulseL = impulse.getChannelData(0);
    impulseR = impulse.getChannelData(1);
    for (i = j = 0, ref = samples; 0 <= ref ? j < ref : j > ref; i = 0 <= ref ? ++j : --j) {
      impulseL[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / samples, decay);
      impulseR[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / samples, decay);
    }
    return impulse;
  };

  createMaster = function() {
    var compressor, dry, masterGain, reverb, wet;
    compressor = context.createDynamicsCompressor();
    reverb = context.createConvolver();
    reverb.buffer = createImpulse(2, 2);
    compressor.connect(reverb);
    dry = context.createGain();
    dry.gain.value = 0.75;
    compressor.connect(dry);
    wet = context.createGain();
    wet.gain.value = 0.25;
    reverb.connect(wet);
    masterGain = context.createGain();
    masterGain.gain.value = 0.75;
    wet.connect(masterGain);
    dry.connect(masterGain);
    masterGain.connect(context.destination);
    return compressor;
  };

  master = createMaster();

  (function() {
    var data, i, j, oneBuffer, ref;
    if (!context.createConstantSource) {
      oneBuffer = context.createBuffer(1, 128, context.sampleRate);
      data = oneBuffer.getChannelData(0);
      for (i = j = 0, ref = data.length; 0 <= ref ? j < ref : j > ref; i = 0 <= ref ? ++j : --j) {
        data[i] = 1;
      }
      return context.createConstantSource = function() {
        var gain, source;
        source = context.createBufferSource();
        source.buffer = oneBuffer;
        source.loop = true;
        gain = context.createGain();
        source.connect(gain);
        return {
          start: source.start.bind(source),
          stop: source.stop.bind(source),
          connect: gain.connect.bind(gain),
          disconnect: gain.disconnect.bind(gain),
          offset: gain.gain
        };
      };
    }
  })();

  createInverterCurve = function(n) {
    var curve, i, j, ref;
    curve = new Float32Array(n);
    for (i = j = 0, ref = n; 0 <= ref ? j < ref : j > ref; i = 0 <= ref ? ++j : --j) {
      curve[i] = 1 / (2 * i - n);
    }
    return curve;
  };

  inverterCurve = createInverterCurve(context.sampleRate);

  createInverter = function() {
    var gain, shaper;
    shaper = context.createWaveShaper();
    shaper.curve = inverterCurve;
    gain = context.createGain();
    gain.gain.value = 1 / context.sampleRate;
    gain.connect(shaper);
    gain.connect = shaper.connect.bind(shaper);
    gain.disconnect = shaper.disconnect.bind(shaper);
    return gain;
  };

  createPulseOscillator = function(width, f) {
    var delay, dutyCycle, freq, negative, offset, osc, output, wavelength;
    osc = context.createOscillator();
    osc.type = 'sawtooth';
    osc.frequency.value = 0;
    freq = context.createConstantSource();
    freq.offset.value = 0;
    freq.connect(osc.frequency);
    wavelength = createInverter();
    freq.connect(wavelength);
    dutyCycle = context.createGain();
    dutyCycle.gain.value = width;
    wavelength.connect(dutyCycle);
    negative = context.createGain();
    negative.gain = -1;
    osc.connect(negative);
    delay = context.createDelay();
    negative.connect(delay);
    dutyCycle.connect(delay.delayTime);
    output = context.createGain();
    osc.connect(output);
    delay.connect(output);
    offset = context.createConstantSource();
    offset.offset.value = 1.7 * (0.5 - width);
    offset.connect(output);
    return {
      connect: output.connect.bind(output),
      disconnect: output.disconnect.bind(output),
      start: function(t) {
        osc.start(t);
        offset.start(t);
        return freq.start(t);
      },
      stop: function(t) {
        osc.stop(t);
        offset.stop(t);
        return freq.stop(t);
      },
      frequency: freq.offset
    };
  };

  currentNotes = {};

  startNote = function(note) {
    var at, freq, gain, lfo, lfogain, osc, ref;
    if (currentNotes[note]) {
      return;
    }
    if ((ref = screenKeys[note - OCTAVE]) != null) {
      ref.activate();
    }
    freq = noteToFreq(note);
    at = context.currentTime;
    osc = createPulseOscillator(0.3, freq);
    osc.frequency.value = freq;
    osc.start();
    lfo = context.createOscillator();
    lfo.frequency.value = 6;
    lfo.start();
    lfogain = context.createGain();
    lfogain.gain.value = 0;
    lfogain.gain.setValueAtTime(0, at);
    lfogain.gain.linearRampToValueAtTime(freq / 100, at + 1);
    lfo.connect(lfogain);
    lfogain.connect(osc.frequency);
    gain = context.createGain();
    gain.gain.value = 0;
    gain.gain.setValueAtTime(0, at);
    gain.gain.linearRampToValueAtTime(1, at + 0.01);
    osc.connect(gain);
    gain.connect(master);
    return currentNotes[note] = {
      gain: gain,
      osc: osc,
      lfo: lfo
    };
  };

  stopNote = function(note) {
    var at, current, freq, ref;
    if (!(current = currentNotes[note])) {
      return;
    }
    if ((ref = screenKeys[note - OCTAVE]) != null) {
      ref.deactivate();
    }
    freq = noteToFreq(note);
    at = context.currentTime;
    current.gain.gain.linearRampToValueAtTime(0, at + 0.01);
    current.osc.stop(at + 0.2);
    current.lfo.stop(at + 0.2);
    setTimeout(function() {
      return current.gain.disconnect();
    }, 200);
    return delete currentNotes[note];
  };

  NOTE_OFFSETS = [-1, -0.5, 0, null, 0, null, 1, null, -4, -7, -1, -0.5, 0, null, 0, null, 1, null, -4, -7, -1, -0.5, 0, null, 0, null, 1, null, -4, -7, -1, -0.5, 0, null, 0, null, 1, 0, -4, -7];

  NOTE_TIMES = [0.04, 0.04, 1.42, 1 / 8 + 1 / 16, 1 / 4, 1 / 4, 1 / 2, 1 / 2, 1 / 2, 1 / 4];

  shouldAnimate = false;

  createSequencer = function(initialNote) {
    var currentNote, i, nextNote, timer;
    i = 0;
    timer = null;
    currentNote = null;
    nextNote = function() {
      var offset;
      offset = NOTE_OFFSETS[i];
      currentNote = initialNote + offset;
      if (offset != null) {
        startNote(currentNote);
      }
      return timer = setTimeout(function() {
        if (offset != null) {
          stopNote(currentNote);
        }
        i = (i + 1) % NOTE_OFFSETS.length;
        if (!shouldAnimate && i === 0) {
          shouldAnimate = true;
          startAnimating();
        }
        return nextNote();
      }, 60 * 1000 / BPM * NOTE_TIMES[i % NOTE_TIMES.length]);
    };
    nextNote();
    return {
      stop: function() {
        stopNote(currentNote);
        return clearTimeout(timer);
      }
    };
  };

  sequencers = {};

  startSequencer = function(note) {
    if (sequencers[note] == null) {
      sequencers[note] = createSequencer(note);
    }
    if (shouldAnimate && Object.keys(sequencers).length > 0) {
      return startAnimating();
    }
  };

  stopSequencer = function(note) {
    var ref;
    if ((ref = sequencers[note]) != null) {
      ref.stop();
    }
    delete sequencers[note];
    if (shouldAnimate && Object.keys(sequencers).length === 0) {
      return stopAnimating();
    }
  };

  KEYS = {
    KeyA: 0,
    KeyW: 1,
    KeyS: 2,
    KeyE: 3,
    KeyD: 4,
    KeyF: 5,
    KeyT: 6,
    KeyG: 7,
    KeyY: 8,
    KeyH: 9,
    KeyU: 10,
    KeyJ: 11,
    KeyK: 12,
    KeyO: 13,
    KeyL: 14,
    KeyP: 15,
    Semicolon: 16,
    Quote: 17,
    BracketRight: 18,
    Backslash: 19,
    Enter: 19
  };

  document.addEventListener('keydown', function(ev) {
    var note;
    if (ev.code === 'ArrowUp') {
      OCTAVE += 12;
    } else if (ev.code === 'ArrowDown') {
      OCTAVE -= 12;
    }
    if (ev.ctrlKey || ev.altKey || ev.metaKey) {
      return;
    }
    if ((note = KEYS[ev.code]) != null) {
      return startSequencer(note + OCTAVE);
    }
  });

  document.addEventListener('keyup', function(ev) {
    var note;
    if (ev.ctrlKey || ev.altKey || ev.metaKey) {
      return;
    }
    if ((note = KEYS[ev.code]) != null) {
      return stopSequencer(note + OCTAVE);
    }
  });

  SvgEl = function(name, attribs, content) {
    var el, k, v;
    if (attribs == null) {
      attribs = {};
    }
    el = document.createElementNS('http://www.w3.org/2000/svg', name);
    for (k in attribs) {
      v = attribs[k];
      el.setAttribute(k, v);
    }
    if (content) {
      el.textContent = content;
    }
    return el;
  };

  svg = $('#board');

  KEYCOUNT = 24;

  HIGHLIGHT = '#ffff22';

  INVERSE_HIGHLIGHT = '#ffffdd';

  isBlackKey = function(n) {
    return n % 2 === 0 ^ n % 12 < 5;
  };

  mouseIsDown = false;

  window.addEventListener('mousedown', function(ev) {
    if (ev.button === 0) {
      return mouseIsDown = true;
    }
  });

  window.addEventListener('mouseup', function(ev) {
    if (ev.button === 0) {
      return mouseIsDown = false;
    }
  });

  createScreenKeys = function() {
    var blackKeys, cx, highlightColor, i, j, ref, results, whiteKeys;
    whiteKeys = SvgEl('g', {
      fill: 'white'
    });
    blackKeys = SvgEl('g', {
      fill: 'black'
    });
    svg.appendChild(whiteKeys);
    svg.appendChild(blackKeys);
    cx = 4;
    highlightColor = HIGHLIGHT;
    results = [];
    for (i = j = 0, ref = KEYCOUNT; 0 <= ref ? j < ref : j > ref; i = 0 <= ref ? ++j : --j) {
      results.push((function(i) {
        var d, el, enter, g, leave, start, stop;
        d = isBlackKey(i) ? {
          offset: -50,
          width: 100,
          height: 600,
          container: blackKeys
        } : {
          offset: 0,
          width: 200,
          height: 900,
          container: whiteKeys
        };
        cx += d.offset;
        g = SvgEl('g');
        el = SvgEl('rect', {
          x: cx,
          y: 0,
          width: d.width,
          height: d.height
        });
        cx += d.width + d.offset;
        start = function(ev) {
          if (ev.button === 0 || ev.touches) {
            startSequencer(i + OCTAVE);
            return ev.preventDefault();
          }
        };
        stop = function(ev) {
          if (ev.button === 0 || ev.touches) {
            stopSequencer(i + OCTAVE);
            return ev.preventDefault();
          }
        };
        enter = function(ev) {
          if (mouseIsDown || ev.touches) {
            startSequencer(i + OCTAVE);
            return ev.preventDefault();
          }
        };
        leave = function(ev) {
          stopSequencer(i + OCTAVE);
          return ev.preventDefault();
        };
        el.addEventListener('mousemove', enter);
        el.addEventListener('mousedown', start);
        el.addEventListener('mouseup', stop);
        el.addEventListener('mouseout', leave);
        el.addEventListener('touchstart', start);
        el.addEventListener('touchend', stop);
        el.addEventListener('touchcancel', leave);
        g.appendChild(el);
        d.container.appendChild(g);
        return {
          activate: function() {
            return el.setAttribute('fill', highlightColor);
          },
          deactivate: function() {
            return el.removeAttribute('fill');
          },
          animate: function() {
            return g.style.animation = "cycle 7.68s linear " + (i / KEYCOUNT - 7.68) + "s infinite";
          },
          deanimate: function() {
            return g.style.animation = '';
          }
        };
      })(i));
    }
    return results;
  };

  screenKeys = createScreenKeys();

  canvas = $('#star');

  ctx = canvas.getContext('2d');

  STARS = 500;

  makeStar = function() {
    var d, dx, dy, z;
    dx = 0.5 - Math.random();
    dy = 0.5 - Math.random();
    z = Math.random();
    d = Math.sqrt(dx * dx + dy * dy);
    dx /= d;
    dy /= d;
    return {
      dx: dx,
      dy: dy,
      z: z
    };
  };

  setupStarfield = function() {
    var TIME, draw, drawing, h, resize, starData, w;
    starData = (function() {
      var j, ref, results;
      results = [];
      for (j = 1, ref = STARS; 1 <= ref ? j < ref : j > ref; 1 <= ref ? j++ : j--) {
        results.push(makeStar());
      }
      return results;
    })();
    w = h = null;
    resize = function() {
      w = canvas.width = canvas.offsetWidth;
      return h = canvas.height = canvas.offsetHeight;
    };
    TIME = 10000;
    drawing = false;
    draw = function(_t) {
      var j, len, s, size, t, v, x, y;
      t = _t + TIME * 10;
      ctx.globalAlpha = 1;
      ctx.fillStyle = 'black';
      ctx.fillRect(0, 0, w, h);
      ctx.fillStyle = 'white';
      for (j = 0, len = starData.length; j < len; j++) {
        s = starData[j];
        v = (s.z * t % TIME) / TIME;
        size = v * 5;
        ctx.globalAlpha = Math.min(s.z * 2, 1);
        x = (0.5 + s.dx * v) * w - size / 2;
        y = (0.5 + s.dy * v) * h - size / 2;
        ctx.fillRect(x, y, size, size);
      }
      if (drawing) {
        return requestAnimationFrame(draw);
      }
    };
    resize();
    window.addEventListener('resize', resize);
    return {
      start: function() {
        if (drawing) {
          return;
        }
        drawing = true;
        return requestAnimationFrame(draw);
      },
      stop: function() {
        return drawing = false;
      }
    };
  };

  starfield = setupStarfield();

  animating = false;

  startAnimating = function() {
    var highlightColor, j, key, len, results;
    clearTimeout(stopAnimationTimeout);
    clearTimeout(stopStarfieldTimeout);
    if (animating) {
      return;
    }
    animating = true;
    starfield.start();
    canvas.style.opacity = 1;
    canvas.style.transition = 'opacity 2s ease-out';
    highlightColor = INVERSE_HIGHLIGHT;
    svg.setAttribute('stroke', 'white');
    results = [];
    for (j = 0, len = screenKeys.length; j < len; j++) {
      key = screenKeys[j];
      results.push(key.animate());
    }
    return results;
  };

  stopAnimationTimeout = null;

  stopStarfieldTimeout = null;

  stopAnimating = function() {
    if (!animating) {
      return;
    }
    clearTimeout(stopStarfieldTimeout);
    clearTimeout(stopAnimationTimeout);
    return stopAnimationTimeout = setTimeout(function() {
      var highlightColor, j, key, len;
      animating = false;
      canvas.style.opacity = 0;
      canvas.style.transition = 'opacity 0.5s ease-out';
      highlightColor = HIGHLIGHT;
      svg.setAttribute('stroke', 'black');
      for (j = 0, len = screenKeys.length; j < len; j++) {
        key = screenKeys[j];
        key.deanimate();
      }
      return stopStarfieldTimeout = setTimeout(starfield.stop, 500);
    }, 1000);
  };

}).call(this);
