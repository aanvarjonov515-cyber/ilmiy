/* ================================================================
   OPTOLAB — COMPLETE INTERACTIVE LABORATORY
   HTML bilan mos: index.html + script.css + style.js
   Taxminiy o‘quv modeli. To‘liq SPICE elektr yechuvchisi emas.
   ================================================================ */

(() => {
  'use strict';

  /* ==============================================================
     1. YORDAMCHI FUNKSIYALAR
     ============================================================== */

  const $ = id => document.getElementById(id);

  const $$ = (selector, root = document) =>
    Array.from(root.querySelectorAll(selector));

  const SVG_NS = 'http://www.w3.org/2000/svg';

  const clamp = (n, min, max) =>
    Math.max(min, Math.min(max, Number(n) || 0));

  const num = (value, fallback = 0) => {
    const n = Number(value);
    return Number.isFinite(n) ? n : fallback;
  };

  const fmt = (value, digits = 2) =>
    Number.isFinite(value) ? value.toFixed(digits) : 'N/A';

  const setText = (id, value) => {
    const element = typeof id === 'string' ? $(id) : id;
    if (element) element.textContent = String(value);
  };

  const svg = (tag, attrs = {}, content = '') => {
    const el = document.createElementNS(SVG_NS, tag);

    for (const [key, value] of Object.entries(attrs)) {
      el.setAttribute(key, String(value));
    }

    if (content !== '') el.textContent = content;
    return el;
  };

  const escapeHTML = value =>
    String(value).replace(/[&<>"']/g, char => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;'
    })[char]);

  /* ==============================================================
     2. HTML ELEMENTLARI
     ============================================================== */

  const ui = {
    svg: $('circuitSvg'),
    viewport: $('svgViewport'),

    run: $('runButton'),
    pause: $('pauseButton'),
    restart: $('restartButton'),
    zoomIn: $('zoomInButton'),
    zoomOut: $('zoomOutButton'),
    fit: $('fitButton'),
    theme: $('themeButton'),

    source: $('sourceEnabled'),
    supply: $('supplyVoltage'),
    supplyRange: $('supplyVoltageRange'),
    currentLimit: $('currentLimit'),

    pot: $('potResistance'),
    potRange: $('potResistanceRange'),

    led1: $('led1Enabled'),
    led2: $('led2Enabled'),

    spectrum: $('spectrumGraph'),
    waveform: $('waveformGraph'),
    spectrumRange: $('spectrumRangeSelect'),

    simulationState: $('simulationState'),
    simulationTime: $('simulationTime'),
    appStatusText: $('appStatusText'),
    appStatusLed: $('appStatusLed'),
    runIndicator: $('runIndicator'),

    sourceVoltageReadout: $('sourceVoltageReadout'),
    sourceCurrentReadout: $('sourceCurrentReadout'),
    supplyVoltageOutput: $('supplyVoltageOutput'),
    currentLimitStatus: $('currentLimitStatus'),

    potResistanceChip: $('potResistanceChip'),
    potVoltageReadout: $('potVoltageReadout'),
    potRangeOutput: $('potRangeOutput'),

    led1Status: $('led1Status'),
    led2Status: $('led2Status'),
    led1Bar: $('led1BrightnessBar'),
    led2Bar: $('led2BrightnessBar'),

    led1Current: $('led1CurrentReading'),
    led2Current: $('led2CurrentReading'),
    fdVoltage: $('fdVoltageReading'),
    a1Voltage: $('a1VoltageReading'),
    a2Voltage: $('a2VoltageReading'),
    capCharge: $('capacitorChargeReading'),
    outputPower: $('outputPowerReading'),
    controlLevel: $('controlLevelReading'),

    spectrumStatus: $('spectrumScanStatus'),
    spectrumCount: $('spectrumSampleCount'),
    spectrumCursor: $('spectrumCursorValue'),

    waveformStatus: $('waveformStatus'),
    waveformCount: $('waveformSampleCount'),
    waveformLast: $('waveformLastValue'),

    componentCount: $('componentCount'),
    connectionCount: $('connectionCount'),
    verified: $('verifiedConnectionSummary'),
    assumed: $('assumedConnectionSummary'),

    selectMode: $('selectModeButton'),
    connectionMode: $('connectionModeButton'),
    showValues: $('showValuesButton')
  };

  /* ==============================================================
     3. UMUMIY HOLAT
     ============================================================== */

  const state = {
    initialized: false,
    running: false,
    hasRun: false,

    time: 0,
    lastFrame: 0,
    sampleClock: 0,

    speed: 1,

    sourceOn: true,
    supplyVoltage: 12,
    currentLimitMA: 100,

    potKOhm: 20,

    led1On: true,
    led2On: true,

    selectedId: null,
    selectedWire: null,

    zoom: 1,
    panX: 0,
    panY: 0,
    dragging: null,

    connectionMode: false,
    showValues: true,

    model: null,

    components: new Map(),
    paths: [],
    opticalParticles: [],
    capacitorParticles: [],
    nodePulses: [],

    world: null,
    flowLayer: null,
    nodeLayer: null,

    samples: [],
    sampleCount: 0,
    spectrumCount: 0,

    graphs: {},
    lastError: null
  };

  /* ==============================================================
     4. HAR BIR ELEMENT UCHUN SOZLANADIGAN PARAMETRLAR

     Maydon tartibi:
     [kalit, yorliq, birlik, minimum, maksimum, qadam, boshlang‘ich]
     ============================================================== */

  const definitions = {
    resistor: {
      title: 'Rezistor',
      fields: [
        ['resistance', 'Qarshilik', 'Ω', 1, 10000000, 100, 10000],
        ['tolerance', 'Tolerantlik', '%', 0, 20, 0.1, 5],
        ['temperatureC', 'Harorat', '°C', -40, 150, 1, 25],
        ['tempCoeff', 'Harorat koeffitsiyenti', 'ppm/°C', -5000, 5000, 10, 100]
      ]
    },

    capacitor: {
      title: 'Kondensator',
      fields: [
        ['capacitanceUF', 'Sig‘im', 'µF', 0.000001, 10000, 0.01, 0.1],
        ['esrOhm', 'ESR qarshiligi', 'Ω', 0, 10000, 0.1, 0.2],
        ['leakageKOhm', 'Oqish qarshiligi', 'kΩ', 1, 10000000, 10, 100000],
        ['initialVoltage', 'Boshlang‘ich kuchlanish', 'V', -50, 50, 0.1, 0]
      ]
    },

    amplifier: {
      title: 'Kuchaytirgich',
      fields: [
        ['gain', 'Kuchaytirish koeffitsiyenti', 'V/V', 0.1, 200, 0.1, 2.3],
        ['offset', 'Kirish siljishi', 'mV', -500, 500, 1, 0],
        ['bandwidthHz', 'Chastota polosasi', 'Hz', 1, 10000000, 10, 10000],
        ['outputLimitV', 'Chiqish chegarasi', 'V', 1, 24, 0.1, 11.5]
      ]
    },

    photodetector: {
      title: 'FD fotodetektor',
      fields: [
        ['responsivity', 'Sezgirlik', 'A/W', 0.001, 2, 0.01, 0.45],
        ['darkCurrentUA', 'Qorong‘ilik toki', 'µA', 0, 1000, 0.1, 0.5],
        ['alignmentPct', 'Optik moslashuv', '%', 0, 100, 1, 80],
        ['bandwidthHz', 'Chastota polosasi', 'Hz', 1, 10000000, 10, 10000]
      ]
    },

    'infrared-led': {
      title: 'Infraqizil LED',
      fields: [
        ['maxCurrentMA', 'Maksimal model toki', 'mA', 1, 100, 0.5, 25],
        ['efficiency', 'Optik samaradorlik', 'mW/mA', 0.001, 1, 0.001, 0.14],
        ['wavelengthNM', 'To‘lqin uzunligi', 'nm', 600, 2400, 5, 940],
        ['alignmentPct', 'Optik yo‘nalish', '%', 0, 100, 1, 80]
      ]
    },

    potentiometer: {
      title: 'O‘zgaruvchan rezistor',
      fields: [
        ['resistanceK', 'R_AW qarshiligi', 'kΩ', 1, 100, 0.5, 20],
        ['referenceV', 'Tayanch kuchlanish', 'V', 0, 12, 0.1, 5],
        ['positionPct', 'Surilgich holati', '%', 0, 100, 1, 80],
        ['controlCurve', 'Boshqaruv koeffitsiyenti', '×', 0.25, 3, 0.05, 1]
      ]
    },

    'logic-gate': {
      title: 'Mantiqiy element',
      fields: [
        ['inputA', 'A kirishi', '0/1', 0, 1, 1, 0],
        ['inputB', 'B kirishi', '0/1', 0, 1, 1, 1],
        ['logicHighV', 'HIGH kuchlanishi', 'V', 1, 12, 0.1, 5],
        ['delayMS', 'Kechikish', 'ms', 0, 1000, 1, 5]
      ]
    },

    'flip-flop': {
      title: 'Trigger',
      fields: [
        ['q', 'Q holati', '0/1', 0, 1, 1, 1],
        ['clockHz', 'Soat chastotasi', 'Hz', 0.1, 100000, 1, 1000],
        ['thresholdV', 'Mantiqiy chegara', 'V', 0.1, 12, 0.1, 2.5],
        ['delayMS', 'Kechikish', 'ms', 0, 1000, 1, 5]
      ]
    },

    transistor: {
      title: 'Tranzistor',
      fields: [
        ['enabled', 'Holat: 0=OFF, 1=ON', '0/1', 0, 1, 1, 1],
        ['beta', 'Tok kuchaytirish β', '×', 1, 500, 1, 100],
        ['vbe', 'V_BE', 'V', 0.1, 1.5, 0.01, 0.7],
        ['maxCurrentMA', 'Tok chegarasi', 'mA', 1, 200, 1, 30]
      ]
    },

    diode: {
      title: 'Diod',
      fields: [
        ['forwardV', 'To‘g‘ri kuchlanish tushuvi', 'V', 0.1, 2, 0.05, 0.7],
        ['seriesOhm', 'Ketma-ket qarshilik', 'Ω', 0, 10000, 1, 10],
        ['leakageUA', 'Teskari oqish toki', 'µA', 0, 1000, 0.1, 0.1],
        ['temperatureC', 'Harorat', '°C', -40, 150, 1, 25]
      ]
    },

    'analog-module': {
      title: 'A3 analog moduli',
      fields: [
        ['gain', 'Modul kuchaytirishi', 'V/V', 0.1, 50, 0.1, 1],
        ['offsetMV', 'Chiqish siljishi', 'mV', -500, 500, 1, 0],
        ['outputLimitV', 'Chiqish chegarasi', 'V', 1, 24, 0.1, 11.5],
        ['bandwidthHz', 'Chastota polosasi', 'Hz', 1, 10000000, 10, 10000]
      ]
    },

    'test-point': {
      title: 'O‘lchov nuqtasi',
      fields: [
        ['probeImpedanceMOhm', 'Proba qarshiligi', 'MΩ', 0.1, 1000, 1, 10],
        ['bandwidthHz', 'Proba polosasi', 'Hz', 1, 100000000, 100, 1000000],
        ['averageCount', 'O‘rtachalash', 'ta', 1, 1000, 1, 16],
        ['probeCapPF', 'Proba sig‘imi', 'pF', 0.1, 1000, 0.1, 10]
      ]
    }
  };

  const defaults = {
    ANALOG_R1: 10000,
    ANALOG_R2: 47000,
    ANALOG_R3: 4700,
    ANALOG_R4: 10000,
    ANALOG_R5: 10000,
    ANALOG_R6: 10000,

    DIGITAL_R1: 10000,
    DIGITAL_R2: 10000,
    DIGITAL_R3: 4700,
    DIGITAL_R4: 10000,
    DIGITAL_R5: 10000,
    DIGITAL_R6: 10000,
    DIGITAL_R7: 10000,
    DIGITAL_R8: 4700,
    DIGITAL_R9: 50000,
    DIGITAL_R10: 10000,
    DIGITAL_R11: 10000,
    DIGITAL_R12: 10000,
    DIGITAL_R13: 10000,
    DIGITAL_R14: 10000,
    DIGITAL_R15: 10000,
    DIGITAL_R16: 4700,
    DIGITAL_R17: 50000,

    ANALOG_C1: 0.1,
    ANALOG_C2: 0.1,
    ANALOG_C3: 0.1,
    ANALOG_C4: 0.1,
    ANALOG_C5: 0.1,
    ANALOG_C6: 1,

    DIGITAL_C1: 0.1,
    DIGITAL_C2: 0.1,
    DIGITAL_C3: 0.1,
    DIGITAL_C4: 0.1,
    DIGITAL_C5: 0.1,
    DIGITAL_C6: 0.1,
    DIGITAL_C7: 0.1,
    DIGITAL_C8: 0.1
  };

  /* ==============================================================
     5. XATO VA XABARLARNI KO‘RSATISH
     ============================================================== */

  let toastTimer = 0;

  function toast(message, kind = 'info') {
    let box = $('appToast');

    if (!box) {
      box = document.createElement('div');
      box.id = 'appToast';
      box.setAttribute('role', 'status');
      box.setAttribute('aria-live', 'polite');
      document.body.appendChild(box);
    }

    box.dataset.kind = kind;
    box.textContent = message;
    box.classList.add('visible');

    clearTimeout(toastTimer);

    toastTimer = setTimeout(() => {
      box.classList.remove('visible');
    }, 3500);
  }

  function reportError(error, where = 'Simulyatsiya') {
    state.lastError = error;

    console.error(`[OptoLab] ${where}:`, error);

    setText('appStatusText', 'XATO — CONSOLE NI TEKSHIRING');

    const status = $('simulationState');
    if (status) status.textContent = 'XATO / ERROR';

    toast(
      `${where}: ${error?.message || error}. F12 → Console oynasini tekshiring.`,
      'error'
    );
  }

  /* ==============================================================
     6. ANIMATSIYA CSS

     Bu CSS style.js tomonidan ham qo‘shiladi. Demak animatsiyaning
     asosiy effektlari faqat tashqi CSS ishlashiga bog‘liq emas.
     ============================================================== */

  function installMotionStyles() {
    if ($('optolabRuntimeMotion')) return;

    const style = document.createElement('style');
    style.id = 'optolabRuntimeMotion';

    style.textContent = `
      #appToast {
        position: fixed;
        right: 18px;
        bottom: 18px;
        z-index: 12000;
        max-width: min(450px, calc(100vw - 36px));
        padding: 12px 15px;
        color: #eaf7ff;
        background: #071524;
        border: 1px solid #315875;
        border-radius: 11px;
        box-shadow: 0 16px 44px #0008;
        font: 600 13px/1.5 system-ui, sans-serif;
        opacity: 0;
        transform: translateY(8px);
        pointer-events: none;
        transition: opacity .2s, transform .2s;
      }

      #appToast.visible { opacity: 1; transform: translateY(0); }
      #appToast[data-kind="error"] { border-color: #ef8787; }
      #appToast[data-kind="success"] { border-color: #52e2b7; }

      body.opto-js-ready .app-header .brand-mark span {
        animation: optoBars 1.1s ease-in-out infinite alternate;
      }
      body.opto-js-ready .app-header .brand-mark span:nth-child(2) {
        animation-delay: -.4s;
      }
      body.opto-js-ready .app-header .brand-mark span:nth-child(3) {
        animation-delay: -.7s;
      }

      body.opto-js-ready .kicker-dot {
        animation: optoDot 1.5s ease-in-out infinite;
      }

      body.opto-sim-running #appStatusLed,
      body.opto-sim-running #runIndicator {
        animation: optoStatus .9s ease-in-out infinite alternate;
      }

      body.opto-sim-running .button-primary {
        animation: optoButton 1.5s ease-in-out infinite;
      }

      .component-group {
        cursor: pointer;
        transition: filter .18s ease;
      }

      .component-group:hover {
        filter: drop-shadow(0 0 5px rgba(74,214,243,.42));
      }

      .component-group.is-selected {
        filter: drop-shadow(0 0 8px rgba(180,154,255,.7));
      }

      .wire-trail {
        fill: none;
        stroke: #72ffe0;
        stroke-width: 4.5;
        stroke-linecap: round;
        stroke-linejoin: round;
        stroke-dasharray: 3 24;
        pointer-events: none;
        opacity: 0;
        filter: drop-shadow(0 0 5px #48f9cf);
        vector-effect: non-scaling-stroke;
      }

      .wire-trail.flow-on {
        opacity: .96;
        animation: optoWire 0.68s linear infinite;
      }

      .flow-dot {
        fill: #b9fff0;
        stroke: #fff;
        stroke-width: .8;
        pointer-events: none;
        filter: drop-shadow(0 0 6px #5dffdc);
      }

      .optical-photon {
        fill: #fff0b5;
        stroke: #fff;
        stroke-width: .8;
        pointer-events: none;
        filter: drop-shadow(0 0 7px #ffdf6e);
      }

      .optical-photon.photon-two {
        fill: #7eeeff;
        filter: drop-shadow(0 0 7px #49ddff);
      }

      .charge-particle {
        fill: #64dff8;
        pointer-events: none;
        filter: drop-shadow(0 0 4px #64dff8);
      }

      .node-pulse {
        fill: #64fff0;
        pointer-events: none;
        filter: drop-shadow(0 0 5px #64fff0);
      }

      .component-group.runtime-active {
        animation: optoComponentPulse .8s ease-in-out infinite alternate;
      }

      .component-group[data-type="resistor"].runtime-active {
        animation-name: optoResistorPulse;
      }

      .component-group[data-type="capacitor"].runtime-active {
        animation-name: optoCapacitorPulse;
      }

      .component-group[data-type="amplifier"].runtime-active {
        animation-name: optoAmplifierPulse;
      }

      .component-group[data-type="logic-gate"].runtime-active {
        animation-name: optoLogicPulse;
      }

      .component-group[data-type="transistor"].runtime-active {
        animation-name: optoTransistorPulse;
      }

      .component-group[data-type="diode"].runtime-active {
        animation-name: optoDiodePulse;
      }

      .led-halo {
        fill: #ffbd58;
        opacity: 0;
        pointer-events: none;
        transform-box: fill-box;
        transform-origin: center;
      }

      .led-halo.hot { animation: optoLedHalo .8s ease-out infinite; }

      .led-inner-glow {
        fill: #ffcb5c;
        opacity: .04;
        pointer-events: none;
        transform-box: fill-box;
        transform-origin: center;
      }

      .led-inner-glow.hot {
        animation: optoLedGlow .45s ease-in-out infinite alternate;
      }

      .photo-ripple {
        fill: none;
        stroke: #65e9f6;
        stroke-width: 2;
        opacity: 0;
        pointer-events: none;
        transform-box: fill-box;
        transform-origin: center;
      }

      .photo-ripple.hot { animation: optoPhotoRipple .9s ease-out infinite; }

      .optical-beam {
        transition: opacity .15s, stroke-width .15s;
      }

      .optical-beam.active-beam {
        animation: optoBeam .7s linear infinite;
        filter: drop-shadow(0 0 6px currentColor);
      }

      .graph-svg .trace {
        fill: none;
        stroke-width: 2.4;
        stroke-linecap: round;
        stroke-linejoin: round;
        vector-effect: non-scaling-stroke;
      }

      body.opto-sim-running .graph-svg .trace {
        animation: optoTraceGlow 1.8s ease-in-out infinite;
      }

      body.opto-sim-running .graph-svg .trace-green {
        animation-delay: -.4s;
      }

      body.opto-sim-running .graph-svg .trace-blue {
        animation-delay: -.8s;
      }

      body.opto-sim-running .graph-svg .trace-gray {
        animation-delay: -1.2s;
      }

      .graph-stage { position: relative; }

      body.opto-sim-running .graph-stage::after {
        content: "LIVE";
        position: absolute;
        top: 9px;
        right: 10px;
        z-index: 2;
        padding: 3px 7px;
        color: #81f5d1;
        background: #06342e;
        border: 1px solid #286d5d;
        border-radius: 5px;
        font: 800 9px ui-monospace, monospace;
        letter-spacing: .14em;
        pointer-events: none;
        animation: optoLive 1.1s ease-in-out infinite alternate;
      }

      body.opto-sim-paused .graph-stage::after {
        content: "FROZEN";
        position: absolute;
        top: 9px;
        right: 10px;
        z-index: 2;
        padding: 3px 7px;
        color: #f7ca82;
        background: #38260b;
        border: 1px solid #79592b;
        border-radius: 5px;
        font: 800 9px ui-monospace, monospace;
        pointer-events: none;
      }

      #componentTooltip {
        display: none;
        position: fixed;
        z-index: 11000;
        max-width: 350px;
        padding: 10px 12px;
        color: #effaff;
        background: #071523;
        border: 1px solid #355777;
        border-radius: 9px;
        box-shadow: 0 12px 34px #0008;
        white-space: pre-line;
        pointer-events: none;
        font: 12px/1.55 system-ui, sans-serif;
      }

      #elementDrawer {
        position: fixed;
        z-index: 11010;
        top: 86px;
        right: 12px;
        bottom: 12px;
        width: min(440px, calc(100vw - 24px));
        overflow: auto;
        color: #eaf6ff;
        background: linear-gradient(155deg, #0d1d30, #06111f);
        border: 1px solid #294966;
        border-radius: 16px;
        box-shadow: 0 24px 80px #0009;
        transform: translateX(calc(100% + 24px));
        opacity: 0;
        visibility: hidden;
        pointer-events: none;
        transition: transform .28s ease, opacity .22s ease,
                    visibility .22s;
        font: 13px/1.55 system-ui, sans-serif;
        scrollbar-color: #35536f #071523;
      }

      #elementDrawer.open {
        transform: translateX(0);
        opacity: 1;
        visibility: visible;
        pointer-events: auto;
      }

      #elementDrawer .ed-head {
        position: sticky;
        top: 0;
        z-index: 3;
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 12px;
        padding: 16px;
        background: #0b1a2b;
        border-bottom: 1px solid #263e57;
      }

      #elementDrawer h3 { margin: 0; font-size: 18px; }
      #elementDrawer .ed-sub { margin-top: 4px; color: #90a9c4; font-size: 11px; }
      #elementDrawer .ed-body { padding: 14px 16px 24px; }

      #elementDrawer button {
        padding: 8px 11px;
        color: #eaf6ff;
        background: #102a40;
        border: 1px solid #315978;
        border-radius: 8px;
        cursor: pointer;
      }

      #elementDrawer button:hover {
        border-color: #50cfe8;
        box-shadow: 0 0 16px #34d8f41a;
      }

      #elementDrawer .ed-card {
        min-width: 0;
        margin: 9px 0;
        padding: 12px;
        background: #0c2032;
        border: 1px solid #243c54;
        border-radius: 10px;
      }

      #elementDrawer .ed-card h4 {
        margin: 0 0 8px;
        color: #79e6f5;
        font-size: 12px;
        letter-spacing: .06em;
        text-transform: uppercase;
      }

      #elementDrawer .ed-card p {
        margin: 5px 0;
        color: #c7d7e7;
        font-size: 12px;
        white-space: pre-line;
        overflow-wrap: anywhere;
      }

      #elementDrawer .ed-metrics {
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: 8px;
      }

      #elementDrawer .ed-metric {
        min-width: 0;
        padding: 11px;
        background: #071625;
        border: 1px solid #27415a;
        border-radius: 9px;
      }

      #elementDrawer .ed-metric small {
        display: block;
        color: #93abc3;
        font-size: 10px;
      }

      #elementDrawer .ed-metric strong {
        display: block;
        margin-top: 5px;
        font: 700 13px ui-monospace, monospace;
        overflow-wrap: anywhere;
      }

      #elementDrawer .ed-field {
        display: grid;
        grid-template-columns: minmax(0, 1fr) 126px;
        align-items: center;
        gap: 8px;
        margin: 10px 0;
      }

      #elementDrawer .ed-field label { color: #d7e6f5; font-size: 11px; }
      #elementDrawer .ed-unit { display: block; color: #7894b0; font-size: 10px; }

      #elementDrawer input {
        width: 100%;
        min-width: 0;
        box-sizing: border-box;
        padding: 9px;
        color: #effaff;
        background: #05111e;
        border: 1px solid #31516f;
        border-radius: 7px;
        font: inherit;
      }

      #elementDrawer input[aria-invalid="true"] {
        border-color: #ff657e;
        box-shadow: 0 0 0 3px #ff657e20;
      }

      #elementDrawer .ed-actions {
        display: flex;
        flex-wrap: wrap;
        gap: 8px;
        margin-top: 12px;
      }

      #elementDrawer .ed-note {
        margin-top: 13px;
        padding: 10px 12px;
        color: #f2dfbf;
        background: #282215;
        border-left: 3px solid #e0a252;
        border-radius: 4px;
        font-size: 11px;
        line-height: 1.65;
      }

      .simulation-speed-control {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        gap: 7px;
        margin-left: 8px;
        color: #a9c1d8;
        font-size: 10px;
      }

      .simulation-speed-control select {
        min-width: 110px;
        min-height: 32px;
        padding: 6px 8px;
        color: #eaf6ff;
        background: #071321;
        border: 1px solid #2a415c;
        border-radius: 8px;
        font-size: 10px;
      }

      .component-group.runtime-selected {
        filter: drop-shadow(0 0 8px #b49aff);
      }

      @keyframes optoBars {
        from { transform: scaleY(.68); opacity: .6; }
        to { transform: scaleY(1); opacity: 1; }
      }

      @keyframes optoDot {
        0%,100% { opacity: .55; transform: scale(.85); }
        50% { opacity: 1; transform: scale(1.18); }
      }

      @keyframes optoStatus {
        from { filter: brightness(.9); }
        to { filter: brightness(1.7); }
      }

      @keyframes optoButton {
        0%,100% { box-shadow: 0 0 0 rgba(52,216,244,0); }
        50% { box-shadow: 0 0 20px rgba(52,216,244,.24); }
      }

      @keyframes optoWire {
        to { stroke-dashoffset: -54; }
      }

      @keyframes optoComponentPulse {
        from { filter: drop-shadow(0 0 2px #38e9c488); }
        to { filter: drop-shadow(0 0 10px #38e9c4); }
      }

      @keyframes optoResistorPulse {
        from { filter: drop-shadow(0 0 1px #3fffc5); }
        to { filter: drop-shadow(0 0 8px #3fffc5); }
      }

      @keyframes optoCapacitorPulse {
        from { filter: drop-shadow(0 0 2px #38bbff); }
        to { filter: drop-shadow(0 0 10px #38bbff); }
      }

      @keyframes optoAmplifierPulse {
        from { filter: drop-shadow(0 0 2px #5bafff); }
        to { filter: drop-shadow(0 0 10px #5bafff); }
      }

      @keyframes optoLogicPulse {
        from { filter: drop-shadow(0 0 2px #b69aff); }
        to { filter: drop-shadow(0 0 9px #b69aff); }
      }

      @keyframes optoTransistorPulse {
        from { filter: drop-shadow(0 0 2px #48e7ad); }
        to { filter: drop-shadow(0 0 9px #48e7ad); }
      }

      @keyframes optoDiodePulse {
        from { filter: drop-shadow(0 0 2px #ffca66); }
        to { filter: drop-shadow(0 0 10px #ffca66); }
      }

      @keyframes optoLedHalo {
        0% { transform: scale(.9); opacity: .7; }
        80% { transform: scale(1.75); opacity: .1; }
        100% { transform: scale(2); opacity: 0; }
      }

      @keyframes optoLedGlow {
        from { opacity: .28; filter: drop-shadow(0 0 3px #ffb341); }
        to { opacity: .95; filter: drop-shadow(0 0 14px #ffb341); }
      }

      @keyframes optoPhotoRipple {
        0% { transform: scale(.5); opacity: .8; }
        100% { transform: scale(2.8); opacity: 0; }
      }

      @keyframes optoBeam {
        to { stroke-dashoffset: -48; }
      }

      @keyframes optoTraceGlow {
        0%,100% { filter: drop-shadow(0 0 1px currentColor); }
        50% { filter: drop-shadow(0 0 5px currentColor); }
      }

      @keyframes optoLive {
        from { opacity: .65; }
        to { opacity: 1; }
      }

      @media (max-width: 650px) {
        #elementDrawer {
          top: 74px;
          right: 8px;
          bottom: 8px;
          width: calc(100vw - 16px);
        }

        #elementDrawer .ed-metrics { grid-template-columns: 1fr; }
        .simulation-speed-control { flex: 1 1 100%; justify-content: space-between; }
      }
    `;

    document.head.appendChild(style);
  }

  /* ==============================================================
     7. KOMPONENTLARNI TOPISH VA RO‘YXATGA OLISH
     ============================================================== */

  function registerComponents() {
    state.components.clear();

    $$('.component-group[data-component-id]', ui.svg).forEach(group => {
      const id = group.dataset.componentId;
      const type = group.dataset.type || 'unknown';

      const definition = definitions[type] || { title: 'Element', fields: [] };
      const params = {};

      definition.fields.forEach(field => {
        params[field[0]] = field[6];
      });

      if (type === 'resistor' && defaults[id] !== undefined) {
        params.resistance = defaults[id];
      }

      if (type === 'capacitor' && defaults[id] !== undefined) {
        params.capacitanceUF = defaults[id];
      }

      if (id === 'ANALOG_A1') params.gain = 2.3;
      if (id === 'ANALOG_A2') params.gain = 1.5;
      if (id === 'ANALOG_A3_MODULE') params.gain = 1;

      if (id === 'DIGITAL_R9' || id === 'DIGITAL_R17') {
        params.resistanceK = (defaults[id] || 50000) / 1000;
      }

      if (id === 'POT_MASTER') {
        params.resistanceK = state.potKOhm;
        params.referenceV = 5;
        params.positionPct = 80;
        params.controlCurve = 1;
      }

      const label =
        group.querySelector('.component-label')?.textContent?.trim()
        || group.getAttribute('aria-label')
        || id;

      state.components.set(id, {
        id,
        type,
        label,
        group,
        params,
        initialParams: JSON.parse(JSON.stringify(params)),
        status: group.dataset.status || 'assumed'
      });
    });

    setText(
      ui.componentCount,
      `Komponentlar: ${state.components.size}`
    );

    setText(
      ui.connectionCount,
      `Ulanishlar: ${$$('.wire', ui.svg).length} ta sim segmenti`
    );

    setText(
      ui.verified,
      'Tugunlarning fizik tekshiruvi: mavjud emas'
    );

    setText(
      ui.assumed,
      `Taxminiy komponentlar: ${state.components.size}`
    );
  }

  function getParam(id, key, fallback) {
    return state.components.get(id)?.params?.[key] ?? fallback;
  }

  /* ==============================================================
     8. TAXMINIY ELEKTR VA OPTIK MODEL
     ============================================================== */

  function nand(id) {
    const p = state.components.get(id)?.params || {};
    return Number(!(Number(p.inputA ?? 0) && Number(p.inputB ?? 1)));
  }

  function simulate(time = state.time) {
    const sourceOn = state.sourceOn;
    const supplyV = sourceOn ? clamp(state.supplyVoltage, 0, 24) : 0;
    const currentLimit = clamp(state.currentLimitMA, 1, 1000);

    const potK = clamp(state.potKOhm, 1, 100);
    const pot = state.components.get('POT_MASTER')?.params || {};

    // Ushbu ko‘rgazmali modelda R_AW ko‘payganda LED toki kamayadi.
    const control = clamp((100 - potK) / 99, 0, 1);
    const curve = clamp(num(pot.controlCurve, 1), 0.25, 3);

    const wiperV = sourceOn
      ? num(pot.referenceV, 5) * Math.pow(control, curve)
      : 0;

    const diodeV1 = num(getParam('DIGITAL_VD1', 'forwardV', 0.7), 0.7);
    const diodeV2 = num(getParam('DIGITAL_VD2', 'forwardV', 0.7), 0.7);

    const supplyFactor1 = clamp((supplyV - diodeV1 - 0.8) / 11, 0, 1);
    const supplyFactor2 = clamp((supplyV - diodeV2 - 0.8) / 11, 0, 1);

    const r9 = Math.max(
      1,
      num(getParam('DIGITAL_R9', 'resistanceK', 50), 50)
    ) * 1000;

    const r17 = Math.max(
      1,
      num(getParam('DIGITAL_R17', 'resistanceK', 50), 50)
    ) * 1000;

    const attenuation1 = 50000 / (50000 + r9);
    const attenuation2 = 50000 / (50000 + r17);

    const gate1 = nand('DIGITAL_DA3_1');
    const gate2 = nand('DIGITAL_DA3_2');

    const transistorOn = id =>
      num(getParam(id, 'enabled', 1), 1) > 0;

    const led1Active =
      sourceOn && state.led1On &&
      Boolean(gate1) &&
      transistorOn('DIGITAL_T1') &&
      transistorOn('DIGITAL_T2');

    const led2Active =
      sourceOn && state.led2On &&
      Boolean(gate2) &&
      transistorOn('DIGITAL_T3') &&
      transistorOn('DIGITAL_T4');

    const led1 = state.components.get('DIGITAL_ID1')?.params || {};
    const led2 = state.components.get('DIGITAL_ID2')?.params || {};

    const maxI1 = num(led1.maxCurrentMA, 25);
    const maxI2 = num(led2.maxCurrentMA, 25);

    const requested1 = led1Active
      ? Math.min(maxI1, 22 * control * supplyFactor1 * attenuation1)
      : 0;

    const requested2 = led2Active
      ? Math.min(maxI2, 18 * control * supplyFactor2 * attenuation2)
      : 0;

    const idleCurrent = sourceOn ? 3.5 : 0;
    const remaining = Math.max(0, currentLimit - idleCurrent);
    const requestedLEDs = requested1 + requested2;

    const scale = requestedLEDs > 0
      ? Math.min(1, remaining / requestedLEDs)
      : 0;

    const led1Current = requested1 * scale;
    const led2Current = requested2 * scale;

    const totalCurrent = sourceOn
      ? Math.min(currentLimit, idleCurrent + led1Current + led2Current)
      : 0;

    const limitActive = sourceOn &&
      idleCurrent + requestedLEDs > currentLimit + 0.001;

    const align1 = clamp(num(led1.alignmentPct, 80) / 100, 0, 1);
    const align2 = clamp(num(led2.alignmentPct, 80) / 100, 0, 1);

    const brightness1 =
      clamp(led1Current / Math.max(maxI1, 0.01), 0, 1) * align1;

    const brightness2 =
      clamp(led2Current / Math.max(maxI2, 0.01), 0, 1) * align2;

    const optical1 = led1Current * num(led1.efficiency, 0.14);
    const optical2 = led2Current * num(led2.efficiency, 0.14);

    const modulationHz = 1.2;
    const modulation = 0.9 + 0.1 * Math.sin(
      2 * Math.PI * modulationHz * time
    );

    const fd = state.components.get('ANALOG_FD')?.params || {};
    const detectorAlignment = clamp(
      num(fd.alignmentPct, 80) / 100, 0, 1
    );

    const receivedOptical =
      (optical1 * 0.25 + optical2 * 0.22) *
      detectorAlignment * modulation;

    const responsivity = num(fd.responsivity, 0.45);
    const darkCurrentA = num(fd.darkCurrentUA, 0.5) / 1e6;

    const photoCurrentA = Math.max(
      0,
      receivedOptical / 1000 * responsivity + darkCurrentA
    );

    const transimpedance = Math.max(
      100,
      num(getParam('ANALOG_R1', 'resistance', 10000), 10000)
    );

    const fdVoltage = sourceOn
      ? clamp(photoCurrentA * transimpedance, 0, 11.5)
      : 0;

    const amp1 = state.components.get('ANALOG_A1')?.params || {};
    const amp2 = state.components.get('ANALOG_A2')?.params || {};

    const gain1 = num(amp1.gain, 2.3);
    const gain2Base = num(amp2.gain, 1.5);

    const r3 = Math.max(
      1, num(getParam('ANALOG_R3', 'resistance', 4700), 4700)
    );

    const r4 = Math.max(
      1, num(getParam('ANALOG_R4', 'resistance', 10000), 10000)
    );

    const gain2 = clamp(
      gain2Base * (r4 / r3) / (10000 / 4700),
      0.1,
      100
    );

    const c4 = Math.max(
      1e-9,
      num(getParam('ANALOG_C4', 'capacitanceUF', 0.1), 0.1) * 1e-6
    );

    const rcSeconds = r3 * c4;

    const filter = 1 / Math.sqrt(
      1 + Math.pow(2 * Math.PI * modulationHz * rcSeconds, 2)
    );

    const outLimit1 = num(amp1.outputLimitV, 11.5);
    const outLimit2 = num(amp2.outputLimitV, 11.5);

    const a1Voltage = sourceOn
      ? clamp(
          (fdVoltage + num(amp1.offset, 0) / 1000) * gain1 * filter,
          -outLimit1,
          outLimit1
        )
      : 0;

    const a2Voltage = sourceOn
      ? clamp(
          (a1Voltage + num(amp2.offset, 0) / 1000) * gain2,
          -outLimit2,
          outLimit2
        )
      : 0;

    const module = state.components.get('ANALOG_A3_MODULE')?.params || {};
    const moduleGain = num(module.gain, 1);
    const moduleLimit = num(module.outputLimitV, 11.5);

    const outA = clamp(
      a2Voltage * moduleGain,
      -moduleLimit,
      moduleLimit
    );

    const outB = clamp(
      a1Voltage * moduleGain,
      -moduleLimit,
      moduleLimit
    );

    return {
      time, sourceOn, supplyV, currentLimit, totalCurrent, limitActive,
      potK, control, wiperV,
      led1Active, led2Active, led1Current, led2Current,
      brightness1, brightness2, optical1, optical2, receivedOptical,
      responsivity, photoCurrentA, fdVoltage,
      gain1, gain2, a1Voltage, a2Voltage, outA, outB,
      rcSeconds, filter, modulationHz, attenuation1, attenuation2
    };
  }

  /* ==============================================================
     9. ELEMENTLARNING HISOBLANGAN QIYMATLARI
     ============================================================== */

  function getMetrics(item, model = state.model || simulate()) {
    const id = item.id;
    const p = item.params;
    const type = item.type;

    if (type === 'resistor' || type === 'potentiometer') {
      let resistance = num(p.resistance, 10000);

      if (id === 'POT_MASTER') resistance = state.potKOhm * 1000;

      if (id === 'DIGITAL_R9' || id === 'DIGITAL_R17') {
        resistance = num(p.resistanceK, 50) * 1000;
      }

      const temperature = num(p.temperatureC, 25);
      const coefficient = num(p.tempCoeff, 0);

      const effectiveResistance = type === 'resistor'
        ? resistance * (1 + coefficient * 1e-6 * (temperature - 25))
        : resistance;

      let voltage = 0;

      if (id === 'ANALOG_R1') voltage = model.fdVoltage;
      else if (id === 'ANALOG_R3') voltage = model.a1Voltage;
      else if (id === 'ANALOG_R4') voltage = model.a2Voltage;
      else if (id === 'POT_MASTER') voltage = model.wiperV;
      else if (id === 'DIGITAL_R9') voltage = model.led1Current / 1000 * resistance;
      else if (id === 'DIGITAL_R17') voltage = model.led2Current / 1000 * resistance;
      else voltage = model.sourceOn ? 5 : 0;

      const currentA = voltage / Math.max(1, effectiveResistance);
      const powerW = voltage * currentA;

      return {
        voltage, currentA, powerW, chargeC: null,
        lines: [
          `R ≈ ${fmt(effectiveResistance, 2)} Ω`,
          `U ≈ ${fmt(voltage, 4)} V (lokal taxmin)`,
          `I ≈ ${fmt(currentA * 1000, 5)} mA`,
          `P ≈ ${fmt(powerW * 1000, 5)} mW`,
          `Harorat: ${fmt(temperature, 1)} °C`,
          `Tolerantlik: ±${fmt(num(p.tolerance, 5), 1)}%`,
          'Bu lokal baholash; barcha tugunlar yechilmaydi.'
        ]
      };
    }

    if (type === 'capacitor') {
      const capacitance = Math.max(
        1e-9, num(p.capacitanceUF, 0.1) * 1e-6
      );

      let voltage = model.supplyOn ? model.supplyV : model.supplyV;

      if (id.includes('C1') || id.includes('C2') || id.includes('C3')) {
        voltage = model.fdVoltage;
      } else if (id.includes('C4')) {
        voltage = model.a1Voltage;
      } else if (id.includes('C5') || id.includes('C6')) {
        voltage = model.a2Voltage;
      } else {
        voltage = model.sourceOn ? 5 : 0;
      }

      const chargeC = capacitance * voltage;
      const energyJ = 0.5 * capacitance * voltage * voltage;
      const currentA = capacitance * 2 * Math.PI *
        model.modulationHz * Math.abs(voltage);

      return {
        voltage, currentA, powerW: null, chargeC,
        lines: [
          `C = ${fmt(capacitance * 1e6, 6)} µF`,
          `U ≈ ${fmt(voltage, 4)} V`,
          `Q = C × U ≈ ${fmt(chargeC * 1e6, 5)} µC`,
          `E = ½ C U² ≈ ${fmt(energyJ * 1e6, 5)} µJ`,
          `Sinusoidal baho I ≈ ${fmt(currentA * 1000, 6)} mA`,
          `ESR = ${fmt(num(p.esrOhm, 0.2), 3)} Ω`,
          `Oqish R = ${fmt(num(p.leakageKOhm, 100000), 1)} kΩ`
        ]
      };
    }

    if (type === 'amplifier' || type === 'analog-module') {
      const voltage = id === 'ANALOG_A1'
        ? model.a1Voltage
        : id === 'ANALOG_A2'
          ? model.a2Voltage
          : model.outA;

      return {
        voltage, currentA: null, powerW: null, chargeC: null,
        lines: [
          `Chiqish U ≈ ${fmt(voltage, 4)} V`,
          `Gain = ${fmt(num(p.gain, 1), 3)} V/V`,
          `Chiqish chegarasi ±${fmt(num(p.outputLimitV, 11.5), 2)} V`,
          `Polosa ≈ ${fmt(num(p.bandwidthHz, 10000), 0)} Hz`,
          `Offset = ${fmt(num(p.offset ?? p.offsetMV, 0), 3)}`
        ]
      };
    }

    if (type === 'photodetector') {
      return {
        voltage: model.fdVoltage,
        currentA: model.photoCurrentA,
        powerW: model.fdVoltage * model.photoCurrentA,
        chargeC: null,
        lines: [
          `Optik signal ≈ ${fmt(model.receivedOptical, 5)} mW`,
          `Fototok ≈ ${fmt(model.photoCurrentA * 1e6, 4)} µA`,
          `FD chiqishi ≈ ${fmt(model.fdVoltage, 4)} V`,
          `Sezgirlik = ${fmt(model.responsivity, 3)} A/W`,
          `Qorong‘ilik toki ≈ ${fmt(num(p.darkCurrentUA, 0.5), 3)} µA`,
          `Optik moslashuv = ${fmt(num(p.alignmentPct, 80), 1)}%`
        ]
      };
    }

    if (type === 'infrared-led') {
      const first = id.endsWith('ID1');
      const current = first ? model.led1Current : model.led2Current;
      const brightness = first ? model.brightness1 : model.brightness2;
      const optical = first ? model.optical1 : model.optical2;
      const active = first ? model.led1Active : model.led2Active;

      return {
        voltage: model.supplyV,
        currentA: current / 1000,
        powerW: model.supplyV * current / 1000,
        chargeC: null,
        lines: [
          `Holat: ${active ? 'FAOL' : 'NOFAOL'}`,
          `Taxminiy tok ≈ ${fmt(current, 4)} mA`,
          `Nisbiy yorqinlik = ${fmt(brightness * 100, 1)}%`,
          `Optik chiqish ≈ ${fmt(optical, 4)} mW (faraz)`,
          `To‘lqin uzunligi = ${fmt(num(p.wavelengthNM, 940), 0)} nm`
        ]
      };
    }

    if (type === 'logic-gate') {
      const output = nand(id);

      return {
        voltage: output ? num(p.logicHighV, 5) : 0,
        currentA: null, powerW: null, chargeC: null,
        lines: [
          `A = ${num(p.inputA, 0)}`,
          `B = ${num(p.inputB, 1)}`,
          `NAND chiqishi = ${output}`,
          `HIGH = ${fmt(num(p.logicHighV, 5), 2)} V`,
          `Kechikish = ${fmt(num(p.delayMS, 5), 1)} ms`
        ]
      };
    }

    if (type === 'flip-flop') {
      return {
        voltage: num(p.q, 1) ? 5 : 0,
        currentA: null, powerW: null, chargeC: null,
        lines: [
          `Q = ${num(p.q, 1)}`,
          `Q̅ = ${num(p.q, 1) ? 0 : 1}`,
          `CLK ≈ ${fmt(num(p.clockHz, 1000), 1)} Hz`,
          `Chegara = ${fmt(num(p.thresholdV, 2.5), 2)} V`,
          `Kechikish = ${fmt(num(p.delayMS, 5), 1)} ms`
        ]
      };
    }

    if (type === 'transistor') {
      const first = id === 'DIGITAL_T1' || id === 'DIGITAL_T2';
      const current = first ? model.led1Current : model.led2Current;

      return {
        voltage: null,
        currentA: current / 1000,
        powerW: null,
        chargeC: null,
        lines: [
          `Kalit: ${num(p.enabled, 1) ? 'ON' : 'OFF'}`,
          `Tarmoq toki ≈ ${fmt(current, 4)} mA`,
          `β farazi = ${fmt(num(p.beta, 100), 1)}`,
          `V_BE = ${fmt(num(p.vbe, 0.7), 3)} V`,
          `Tok chegarasi = ${fmt(num(p.maxCurrentMA, 30), 1)} mA`,
          'V_CE to‘liq hisoblanmaydi.'
        ]
      };
    }

    if (type === 'diode') {
      const first = id.endsWith('VD1');
      const current = first ? model.led1Current : model.led2Current;

      return {
        voltage: num(p.forwardV, 0.7),
        currentA: current / 1000,
        powerW: num(p.forwardV, 0.7) * current / 1000,
        chargeC: null,
        lines: [
          `Vf = ${fmt(num(p.forwardV, 0.7), 3)} V`,
          `Kanal toki ≈ ${fmt(current, 4)} mA`,
          `Ketma-ket R = ${fmt(num(p.seriesOhm, 10), 2)} Ω`,
          `Teskari oqish ≈ ${fmt(num(p.leakageUA, 0.1), 3)} µA`,
          `Harorat = ${fmt(num(p.temperatureC, 25), 1)} °C`
        ]
      };
    }

    if (type === 'test-point') {
      const values = {
        TP1: model.fdVoltage,
        TP2: model.a1Voltage,
        TP3: model.a1Voltage,
        TP4: model.a2Voltage,
        TP5: model.outA,
        TP6: model.outB
      };

      const voltage = values[id];

      return {
        voltage: Number.isFinite(voltage) ? voltage : null,
        currentA: null, powerW: null, chargeC: null,
        lines: [
          `Tugun kuchlanishi: ${Number.isFinite(voltage) ? fmt(voltage, 4) + ' V (taxmin)' : 'N/A'}`,
          `Proba R = ${fmt(num(p.probeImpedanceMOhm, 10), 1)} MΩ`,
          `Proba polosasi = ${fmt(num(p.bandwidthHz, 1000000), 0)} Hz`,
          `O‘rtachalash = ${fmt(num(p.averageCount, 16), 0)} namuna`,
          `Proba sig‘imi = ${fmt(num(p.probeCapPF, 10), 1)} pF`
        ]
      };
    }

    return {
      voltage: null, currentA: null, powerW: null, chargeC: null,
      lines: ['Ushbu element uchun hisoblash hali belgilanmagan.']
    };
  }

  /* ==============================================================
     10. O‘NG TOMON ELEMENT OYNASI
     ============================================================== */

  function ensureDrawer() {
    let drawer = $('elementDrawer');
    if (drawer) return drawer;

    drawer = document.createElement('aside');
    drawer.id = 'elementDrawer';
    drawer.setAttribute('aria-label', 'Komponent ma’lumotlari');

    drawer.innerHTML = `
      <div class="ed-head">
        <div>
          <h3 id="edTitle">Komponent</h3>
          <div class="ed-sub" id="edSub">Taxminiy model</div>
        </div>
        <button type="button" id="edClose">Yopish ✕</button>
      </div>
      <div class="ed-body" id="edBody"></div>
    `;

    document.body.appendChild(drawer);

    $('edClose').addEventListener('click', () => {
      drawer.classList.remove('open');
    });

    document.addEventListener('keydown', event => {
      if (event.key === 'Escape') drawer.classList.remove('open');
    });

    return drawer;
  }

  function componentPurpose(type) {
    const items = {
      resistor: [
        'Tokni cheklash yoki kuchlanishni taqsimlash.',
        'Qarshilik o‘zgarsa lokal tok va kuchlanish bahosi yangilanadi.'
      ],
      capacitor: [
        'Zaryad saqlash, signalni bog‘lash yoki filtr xususiyatini ifodalash.',
        'Sig‘im Q, E va RC filtr bahosiga ta’sir qiladi.'
      ],
      amplifier: [
        'Fotodetektor signalini kuchaytirish.',
        'Gain va chiqish chegarasi model natijasiga ta’sir qiladi.'
      ],
      photodetector: [
        'Optik nurni elektr signaliga aylantirish.',
        'Optik quvvat, sezgirlik va moslashuv fototokni o‘zgartiradi.'
      ],
      'infrared-led': [
        'Elektr tokidan infraqizil nur hosil qilish.',
        'Model toki oshganda nisbiy yorqinlik ham oshadi.'
      ],
      potentiometer: [
        'A, W va B uchlari bo‘lgan o‘zgaruvchan qarshilik.',
        'Bu modelda A–W qarshiligi oshsa LED xiralashadi.'
      ],
      'logic-gate': [
        'Kirishlardan raqamli mantiqiy signal hosil qilish.',
        'A yoki B qiymatlari mantiqiy chiqishga ta’sir qiladi.'
      ],
      'flip-flop': [
        'Raqamli holatni saqlashni ko‘rsatish.',
        'Q qiymati ko‘rgazmali raqamli holatdir.'
      ],
      transistor: [
        'Elektron kalit yoki drayver.',
        'ON/OFF holati tegishli LED kanalini boshqaradi.'
      ],
      diode: [
        'Tokning yo‘nalishiga sezgir yarimo‘tkazgich.',
        'Vf — modeldagi to‘g‘ri kuchlanish tushuvi.'
      ],
      'analog-module': [
        'Analog signalni keyingi chiqishlarga uzatuvchi model bloki.',
        'Gain va chiqish chegarasi natijaga ta’sir qiladi.'
      ],
      'test-point': [
        'Sxema signalini kuzatish nuqtasi.',
        'Modelda mavjud tugun kuchlanishi ko‘rsatiladi.'
      ]
    };

    return items[type] || [
      'Sxemadagi elektron element.',
      'Qiymatlar taxminiy o‘quv modelidan olinadi.'
    ];
  }

  function openComponent(item) {
    state.selectedId = item.id;
    state.selectedWire = null;

    $$('.component-group.is-selected', ui.svg)
      .forEach(group => group.classList.remove('is-selected'));

    item.group.classList.add('is-selected');

    const drawer = ensureDrawer();
    const model = state.model || simulate();
    const result = getMetrics(item, model);
    const purpose = componentPurpose(item.type);

    setText('edTitle', `${item.label} · ${item.id}`);

    setText(
      'edSub',
      `${definitions[item.type]?.title || item.type} · ` +
      (item.status === 'verified' ? 'Tasdiqlangan' : 'Taxminiy / tekshirilmagan')
    );

    const metricCard = (label, value) => `
      <div class="ed-metric">
        <small>${escapeHTML(label)}</small>
        <strong>${escapeHTML(value)}</strong>
      </div>`;

    const metricHTML = [
      metricCard('Kuchlanish', result.voltage == null ? 'N/A' : `${fmt(result.voltage, 4)} V`),
      metricCard('Tok', result.currentA == null ? 'N/A' : `${fmt(result.currentA * 1000, 4)} mA`),
      metricCard('Quvvat', result.powerW == null ? 'N/A' : `${fmt(result.powerW * 1000, 5)} mW`),
      metricCard('Zaryad', result.chargeC == null ? 'N/A' : `${fmt(result.chargeC * 1e6, 5)} µC`)
    ].join('');

    const fieldsHTML = (definitions[item.type]?.fields || []).map(field => {
      const [key, label, unit, min, max, step, initial] = field;
      const value = num(item.params[key], initial);

      return `
        <div class="ed-field">
          <label for="ed-${item.id}-${key}">
            ${escapeHTML(label)}
            <span class="ed-unit">${escapeHTML(unit)} · ${min}–${max}</span>
          </label>
          <input
            id="ed-${item.id}-${key}"
            data-param="${escapeHTML(key)}"
            type="number"
            min="${min}"
            max="${max}"
            step="${step}"
            value="${value}">
        </div>`;
    }).join('');

    let extraButtons = '';

    if (item.type === 'logic-gate') {
      extraButtons = `
        <div class="ed-actions">
          <button type="button" data-toggle-gate="inputA">A ni almashtirish</button>
          <button type="button" data-toggle-gate="inputB">B ni almashtirish</button>
        </div>`;
    }

    if (item.type === 'flip-flop') {
      extraButtons = `
        <div class="ed-actions">
          <button type="button" id="edToggleQ">Q holatini almashtirish</button>
        </div>`;
    }

    if (item.type === 'transistor') {
      extraButtons = `
        <div class="ed-actions">
          <button type="button" id="edToggleTransistor">
            ${num(item.params.enabled, 1) ? 'ON — o‘chirish' : 'OFF — yoqish'}
          </button>
        </div>`;
    }

    $('edBody').innerHTML = `
      <div class="ed-metrics">${metricHTML}</div>

      <div class="ed-card">
        <h4>Element vazifasi</h4>
        <p>${escapeHTML(purpose[0])}</p>
        <p><b>O‘zgartirish ta’siri:</b> ${escapeHTML(purpose[1])}</p>
      </div>

      <div class="ed-card">
        <h4>Joriy hisoblangan qiymatlar</h4>
        <p>${escapeHTML(result.lines.join('\n'))}</p>
      </div>

      <div class="ed-card">
        <h4>Parametrlar</h4>
        ${fieldsHTML}
        <div class="ed-actions">
          <button type="button" id="edApply">Qiymatlarni qo‘llash</button>
          <button type="button" id="edReset">Standart qiymatlar</button>
        </div>
        ${extraButtons}
      </div>

      <div class="ed-note">
        Bu ko‘rgazmali blok-model. Barcha sim va tugunlar uchun fizik
        SPICE hisoblash amalga oshirilmaydi. Hisoblab bo‘lmaydigan
        parametrlar N/A bo‘lib qoladi.
      </div>
    `;

    $('edApply').addEventListener('click', () => applyComponentParams(item));

    $('edReset').addEventListener('click', () => {
      item.params = JSON.parse(JSON.stringify(item.initialParams));

      if (item.id === 'POT_MASTER') {
        state.potKOhm = num(item.params.resistanceK, 20);

        if (ui.pot) ui.pot.value = String(state.potKOhm);
        if (ui.potRange) ui.potRange.value = String(state.potKOhm);
      }

      recalculate();
      openComponent(item);
      toast('Standart qiymatlar tiklandi.', 'success');
    });

    drawer.querySelectorAll('[data-toggle-gate]').forEach(button => {
      button.addEventListener('click', () => {
        const key = button.dataset.toggleGate;
        item.params[key] = num(item.params[key], 0) ? 0 : 1;
        recalculate();
        openComponent(item);
      });
    });

    $('edToggleQ')?.addEventListener('click', () => {
      item.params.q = num(item.params.q, 1) ? 0 : 1;
      recalculate();
      openComponent(item);
    });

    $('edToggleTransistor')?.addEventListener('click', () => {
      item.params.enabled = num(item.params.enabled, 1) ? 0 : 1;
      recalculate();
      openComponent(item);
    });

    drawer.classList.add('open');
  }

  function applyComponentParams(item) {
    const drawer = $('elementDrawer');

    const inputs = $$('[data-param]', drawer);
    const definition = definitions[item.type];

    for (const input of inputs) {
      const field = definition.fields.find(
        candidate => candidate[0] === input.dataset.param
      );

      const value = Number(input.value);

      if (
        !field ||
        input.value.trim() === '' ||
        !Number.isFinite(value) ||
        value < field[3] ||
        value > field[4]
      ) {
        input.setAttribute('aria-invalid', 'true');

        toast(
          'Noto‘g‘ri qiymat. Minimum va maksimum chegarani tekshir.',
          'error'
        );

        return;
      }
    }

    inputs.forEach(input => {
      item.params[input.dataset.param] = Number(input.value);
      input.removeAttribute('aria-invalid');
    });

    if (item.id === 'POT_MASTER') {
      state.potKOhm = num(item.params.resistanceK, state.potKOhm);

      if (ui.pot) ui.pot.value = String(state.potKOhm);
      if (ui.potRange) ui.potRange.value = String(state.potKOhm);
    }

    recalculate();
    openComponent(item);

    toast('Element parametrlari yangilandi.', 'success');
  }

  /* ==============================================================
     11. SVG ICHIDA ANIMATSIYA QATLAMLARI
     ============================================================== */

  function createWorld() {
    if (!ui.svg || state.world) return;

    const world = svg('g', { id: 'optoWorld' });

    const originalChildren = Array.from(ui.svg.children).filter(child => {
      const tag = child.tagName.toLowerCase();
      return !['defs', 'title', 'desc'].includes(tag);
    });

    ui.svg.appendChild(world);

    originalChildren.forEach(child => world.appendChild(child));

    state.world = world;

    state.flowLayer = svg('g', {
      id: 'optoFlowLayer',
      'pointer-events': 'none'
    });

    state.nodeLayer = svg('g', {
      id: 'optoNodeLayer',
      'pointer-events': 'none'
    });

    world.appendChild(state.flowLayer);
    world.appendChild(state.nodeLayer);

    updateWorldTransform();
  }

  function updateWorldTransform() {
    if (!state.world) return;

    state.world.setAttribute(
      'transform',
      `translate(${state.panX} ${state.panY}) scale(${state.zoom})`
    );
  }

  function setZoom(value) {
    state.zoom = clamp(value, 0.45, 2.8);
    updateWorldTransform();
  }

  function setupZoomAndPan() {
    if (!ui.viewport || !ui.svg) return;

    ui.viewport.addEventListener('wheel', event => {
      event.preventDefault();

      const factor = event.deltaY < 0 ? 1.1 : 1 / 1.1;
      setZoom(state.zoom * factor);
    }, { passive: false });

    ui.viewport.addEventListener('pointerdown', event => {
      if (event.button !== 0) return;

      const component = event.target.closest?.('[data-component-id]');
      const wire = event.target.closest?.('[data-wire-id], path.wire');

      if (component || wire) return;

      state.dragging = {
        startX: event.clientX,
        startY: event.clientY,
        panX: state.panX,
        panY: state.panY,
        moved: false
      };

      ui.viewport.classList.add('is-dragging');

      try {
        ui.viewport.setPointerCapture(event.pointerId);
      } catch (_) {}
    });

    ui.viewport.addEventListener('pointermove', event => {
      if (!state.dragging) return;

      const dx = event.clientX - state.dragging.startX;
      const dy = event.clientY - state.dragging.startY;

      if (Math.abs(dx) + Math.abs(dy) > 3) {
        state.dragging.moved = true;
      }

      const rect = ui.svg.getBoundingClientRect();

      const sx = 2300 / Math.max(1, rect.width);
      const sy = 1450 / Math.max(1, rect.height);

      state.panX = state.dragging.panX + dx * sx;
      state.panY = state.dragging.panY + dy * sy;

      updateWorldTransform();
    });

    const finishPan = () => {
      state.dragging = null;
      ui.viewport.classList.remove('is-dragging');
    };

    ui.viewport.addEventListener('pointerup', finishPan);
    ui.viewport.addEventListener('pointercancel', finishPan);

    ui.zoomIn?.addEventListener('click', () => setZoom(state.zoom * 1.18));
    ui.zoomOut?.addEventListener('click', () => setZoom(state.zoom / 1.18));

    ui.fit?.addEventListener('click', () => {
      state.panX = 0;
      state.panY = 0;

      setZoom(1);

      ui.viewport.scrollTo?.({
        left: 0,
        top: 0,
        behavior: 'smooth'
      });
    });
  }

  function setupLEDEffects() {
    for (const id of ['DIGITAL_ID1', 'DIGITAL_ID2']) {
      const item = state.components.get(id);
      if (!item) continue;

      const body = item.group.querySelector('.led-body');
      if (!body) continue;

      const cx = body.getAttribute('cx');
      const cy = body.getAttribute('cy');
      const radius = num(body.getAttribute('r'), 25);

      if (!item.group.querySelector('.led-halo')) {
        item.group.insertBefore(
          svg('circle', {
            cx, cy,
            r: radius + 8,
            class: 'led-halo'
          }),
          body
        );
      }

      if (!item.group.querySelector('.led-inner-glow')) {
        const triangle = item.group.querySelector('.led-triangle');

        item.group.insertBefore(
          svg('circle', {
            cx, cy,
            r: Math.max(5, radius - 5),
            class: 'led-inner-glow'
          }),
          triangle || null
        );
      }
    }

    const fd = state.components.get('ANALOG_FD');

    if (fd && !fd.group.querySelector('.photo-ripple')) {
      const body = fd.group.querySelector('.detector-body');

      if (body) {
        fd.group.insertBefore(
          svg('circle', {
            cx: body.getAttribute('cx'),
            cy: body.getAttribute('cy'),
            r: num(body.getAttribute('r'), 30) + 5,
            class: 'photo-ripple'
          }),
          body
        );
      }
    }
  }

  function setupWireParticles() {
    if (!state.flowLayer) return;

    state.paths = [];

    const wires = $$('.wire', ui.svg);

    wires.forEach((path, index) => {
      if (path.dataset.optoPrepared) return;
      path.dataset.optoPrepared = '1';

      let length = 0;

      try {
        length = path.getTotalLength();
      } catch (_) {}

      if (length < 12) return;

      const trail = svg('path', {
        d: path.getAttribute('d') || '',
        class: 'wire-trail',
        'stroke-dashoffset': 0
      });

      const dot = svg('circle', {
        r: index % 4 === 0 ? 3.2 : 2.5,
        class: 'flow-dot',
        opacity: 0
      });

      state.flowLayer.appendChild(trail);
      state.flowLayer.appendChild(dot);

      state.paths.push({
        path,
        trail,
        dot,
        length,
        phase: index * 0.618,
        index,
        componentId: path.closest('[data-component-id]')?.dataset.componentId || ''
      });
    });

    for (const [channel, id] of [
      [0, 'opticalPath1'],
      [1, 'opticalPath2']
    ]) {
      const path = $(id);
      if (!path) continue;

      let length = 0;

      try {
        length = path.getTotalLength();
      } catch (_) {}

      for (let i = 0; i < 14; i++) {
        const particle = svg('circle', {
          r: i % 3 === 0 ? 3.3 : 2.4,
          class: `optical-photon ${channel ? 'photon-two' : ''}`,
          opacity: 0
        });

        state.flowLayer.appendChild(particle);

        state.opticalParticles.push({
          path,
          particle,
          length,
          phase: i / 14,
          channel
        });
      }
    }

    const seen = new Set();

    $$('circle.terminal, circle.junction, .junction circle', ui.svg)
      .forEach((node, index) => {
        const x = num(node.getAttribute('cx'));
        const y = num(node.getAttribute('cy'));
        const key = `${Math.round(x)}:${Math.round(y)}`;

        if (seen.has(key)) return;
        seen.add(key);

        const pulse = svg('circle', {
          cx: x, cy: y, r: 3.1,
          class: 'node-pulse',
          opacity: 0
        });

        state.nodeLayer.appendChild(pulse);

        state.nodePulses.push({
          pulse,
          phase: index * 0.22
        });
      });

    $$('[data-type="capacitor"]', ui.svg).forEach((group, index) => {
      if (!group.querySelector('.capacitor-plate')) return;

      let bounds;

      try {
        bounds = group.getBBox();
      } catch (_) {
        return;
      }

      const particle = svg('circle', {
        cx: bounds.x + bounds.width / 2,
        cy: bounds.y + bounds.height / 2,
        r: 2.5,
        class: 'charge-particle',
        opacity: 0
      });

      state.flowLayer.appendChild(particle);

      state.capacitorParticles.push({
        group,
        particle,
        bounds,
        phase: index * 0.28
      });
    });
  }

  /* ==============================================================
     12. QAYSI ELEMENT FAOL?
     ============================================================== */

  function activityForComponent(id, model) {
    if (id === 'DIGITAL_ID1' ||
        id === 'DIGITAL_T1' ||
        id === 'DIGITAL_T2' ||
        id === 'DIGITAL_R9' ||
        id === 'DIGITAL_VD1') {
      return model.led1Current;
    }

    if (id === 'DIGITAL_ID2' ||
        id === 'DIGITAL_T3' ||
        id === 'DIGITAL_T4' ||
        id === 'DIGITAL_R17' ||
        id === 'DIGITAL_VD2') {
      return model.led2Current;
    }

    if (id === 'ANALOG_FD') return model.receivedOptical;
    if (id === 'ANALOG_A1') return Math.abs(model.a1Voltage);
    if (id === 'ANALOG_A2') return Math.abs(model.a2Voltage);
    if (id === 'ANALOG_A3_MODULE') return Math.abs(model.outA) + Math.abs(model.outB);

    if (id.startsWith('DIGITAL_DA')) {
      return model.sourceOn ? 1 : 0;
    }

    return model.sourceOn ? 0.25 : 0;
  }

  function animateVisuals() {
    const model = state.model || simulate();
    const live = state.running;

    /*
      Sxema simlari o‘quv animatsiyasi sifatida yoritiladi.
      Zarralar fizik tok taqsimotining SPICE hisoblangan natijasi emas.
    */

    state.paths.forEach(item => {
      const id = item.componentId;
      const activity = activityForComponent(id, model);

      const active = live && model.sourceOn;

      item.trail.classList.toggle('flow-on', active);

      item.trail.style.stroke = activity > 0.01
        ? '#65ffe1'
        : '#39c6e9';

      item.trail.style.opacity = active
        ? String(0.22 + 0.55 * Math.min(1, activity / 20))
        : '0';

      item.dot.setAttribute('opacity', active ? '1' : '0');

      if (active) {
        const distance = (
          state.time * (38 + Math.min(activity, 30) * 2) +
          item.phase * item.length
        ) % item.length;

        try {
          const point = item.path.getPointAtLength(distance);

          item.dot.setAttribute('cx', point.x);
          item.dot.setAttribute('cy', point.y);
        } catch (_) {}
      }

      item.trail.style.strokeDashoffset =
        String(-state.time * 42 - item.phase * 12);
    });

    state.opticalParticles.forEach(item => {
      const intensity = item.channel === 0
        ? model.brightness1
        : model.brightness2;

      const active = live && intensity > 0.005;

      item.particle.setAttribute(
        'opacity',
        active ? String(0.25 + 0.75 * intensity) : '0'
      );

      if (!active || item.length <= 0) return;

      const speed = 45 + intensity * 105;
      const distance = (
        state.time * speed +
        item.phase * item.length
      ) % item.length;

      try {
        const point = item.path.getPointAtLength(distance);

        item.particle.setAttribute('cx', point.x);
        item.particle.setAttribute('cy', point.y);
      } catch (_) {}
    });

    state.capacitorParticles.forEach(item => {
      const component = state.components.get(item.group.dataset.componentId);
      const result = component ? getMetrics(component, model) : null;
      const active = live && Math.abs(result?.voltage || 0) > 0.01;

      item.particle.setAttribute('opacity', active ? '0.95' : '0');

      if (!active) return;

      const radius = Math.max(
        4,
        Math.min(13, item.bounds.width / 3 || 7)
      );

      const angle = state.time * 4.5 + item.phase * Math.PI * 2;

      item.particle.setAttribute(
        'cx',
        item.bounds.x + item.bounds.width / 2 + Math.cos(angle) * radius
      );

      item.particle.setAttribute(
        'cy',
        item.bounds.y + item.bounds.height / 2 + Math.sin(angle) * radius
      );
    });

    state.nodePulses.forEach(item => {
      const opacity = live
        ? 0.3 + 0.6 * (
            0.5 + 0.5 * Math.sin(state.time * 5 + item.phase)
          )
        : 0;

      item.pulse.setAttribute('opacity', String(opacity));
    });

    /* LED halqalari va ichki yorug‘lik */
    for (const [id, brightness] of [
      ['DIGITAL_ID1', model.brightness1],
      ['DIGITAL_ID2', model.brightness2]
    ]) {
      const item = state.components.get(id);
      if (!item) continue;

      const halo = item.group.querySelector('.led-halo');
      const glow = item.group.querySelector('.led-inner-glow');
      const body = item.group.querySelector('.led-body');

      halo?.classList.toggle('hot', live && brightness > 0.01);
      glow?.classList.toggle('hot', live && brightness > 0.01);

      if (halo) {
        halo.style.opacity = String(
          live ? 0.1 + brightness * 0.7 : 0.02
        );

        halo.style.fill = id.endsWith('ID1') ? '#ffbd58' : '#57dcff';
      }

      if (glow) {
        glow.style.opacity = String(
          live ? 0.1 + brightness * 0.8 : 0.025
        );

        glow.style.fill = id.endsWith('ID1') ? '#ffc65c' : '#69e9ff';
      }

      if (body) {
        body.style.fill = brightness > 0.01
          ? (
              id.endsWith('ID1')
                ? `rgba(255, ${Math.round(75 + brightness * 150)}, 50, 1)`
                : `rgba(50, ${Math.round(125 + brightness * 125)}, 255, 1)`
            )
          : '#251b21';

        body.style.filter = live && brightness > 0.01
          ? `drop-shadow(0 0 ${4 + brightness * 18}px ${
              id.endsWith('ID1') ? '#ffb341' : '#49ddff'
            })`
          : '';
      }
    }

    /* FD fotodetektor javobi */
    const fd = state.components.get('ANALOG_FD');

    fd?.group.querySelector('.photo-ripple')?.classList.toggle(
      'hot',
      live && model.receivedOptical > 0.001
    );

    /* Elementlar holatiga qarab yaltiraydi */
    $$('.component-group[data-component-id]', ui.svg).forEach(group => {
      const id = group.dataset.componentId;
      const active = activityForComponent(id, model) > 0.01;

      group.classList.toggle(
        'runtime-active',
        live && active
      );
    });

    /* Ikki infraqizil nur ham model yorqinligiga mos ravishda ko‘rinadi */
    const beam1 = $('opticalPath1');
    const beam2 = $('opticalPath2');

    beam1?.classList.toggle(
      'active-beam',
      live && model.brightness1 > 0.01
    );

    beam2?.classList.toggle(
      'active-beam',
      live && model.brightness2 > 0.01
    );

    if (beam1) {
      beam1.style.opacity = live
        ? String(0.08 + model.brightness1 * 0.9)
        : '0.15';

      beam1.style.strokeWidth =
        `${1.5 + model.brightness1 * 3.5}px`;
    }

    if (beam2) {
      beam2.style.opacity = live
        ? String(0.08 + model.brightness2 * 0.9)
        : '0.15';

      beam2.style.strokeWidth =
        `${1.5 + model.brightness2 * 3.5}px`;
    }
  }

  /* ==============================================================
     13. O‘LCHOV KARTALARI VA SVG QIYMATLARI
     ============================================================== */

  function renderReadouts() {
    const model = state.model || simulate();

    setText(ui.sourceVoltageReadout, `${fmt(model.supplyV, 2)} V`);
    setText(ui.supplyVoltageOutput, `${fmt(state.supplyVoltage, 1)} V`);
    setText(ui.sourceCurrentReadout, `${fmt(model.totalCurrent, 3)} mA`);

    setText(
      ui.currentLimitStatus,
      model.limitActive ? 'Tok cheklovi faol' : 'Cheklovga yetmagan'
    );

    setText(ui.potResistanceChip, `${fmt(state.potKOhm, 1)} kΩ`);
    setText(ui.potRangeOutput, `${fmt(state.potKOhm, 1)} kΩ`);
    setText(ui.potVoltageReadout, `${fmt(model.wiperV, 3)} V`);

    setText(ui.controlLevel, `${fmt(model.control * 100, 1)}%`);

    setText(
      ui.led1Status,
      !model.sourceOn
        ? 'Manba o‘chiq'
        : !model.led1Active
          ? 'Drayver nofaol'
          : `${fmt(model.brightness1 * 100, 1)}% nisbiy yorqinlik`
    );

    setText(
      ui.led2Status,
      !model.sourceOn
        ? 'Manba o‘chiq'
        : !model.led2Active
          ? 'Drayver nofaol'
          : `${fmt(model.brightness2 * 100, 1)}% nisbiy yorqinlik`
    );

    if (ui.led1Bar) {
      ui.led1Bar.style.width = `${model.brightness1 * 100}%`;
    }

    if (ui.led2Bar) {
      ui.led2Bar.style.width = `${model.brightness2 * 100}%`;
    }

    setText(ui.led1Current, `${fmt(model.led1Current, 3)} mA`);
    setText(ui.led2Current, `${fmt(model.led2Current, 3)} mA`);
    setText(ui.fdVoltage, `${fmt(model.fdVoltage, 4)} V`);
    setText(ui.a1Voltage, `${fmt(model.a1Voltage, 4)} V`);
    setText(ui.a2Voltage, `${fmt(model.a2Voltage, 4)} V`);

    const capacitor = state.components.get('ANALOG_C1');

    const capacitorCharge = capacitor
      ? getMetrics(capacitor, model).chargeC
      : null;

    setText(
      ui.capCharge,
      capacitorCharge == null
        ? 'N/A'
        : `${fmt(capacitorCharge * 1e6, 4)} µC`
    );

    setText(
      ui.outputPower,
      `${fmt(model.a2Voltage * model.a2Voltage / 10000 * 1000, 5)} mW`
    );

    $$('[data-value-for]', ui.svg).forEach(element => {
      const id = element.dataset.valueFor;

      if (id === 'ANALOG_FD') {
        element.textContent =
          `Iphoto ≈ ${fmt(model.photoCurrentA * 1e6, 2)} µA`;
      }

      if (id === 'DIGITAL_ID1') {
        element.textContent =
          `I=${fmt(model.led1Current, 2)} mA · ` +
          `${fmt(model.brightness1 * 100, 0)}%`;
      }

      if (id === 'DIGITAL_ID2') {
        element.textContent =
          `I=${fmt(model.led2Current, 2)} mA · ` +
          `${fmt(model.brightness2 * 100, 0)}%`;
      }

      if (id === 'POT_MASTER') {
        element.textContent =
          `${fmt(state.potKOhm, 1)} kΩ · W=${fmt(model.wiperV, 2)} V`;
      }
    });
  }

  /* ==============================================================
     14. GRAFIKLAR
     ============================================================== */

  const G = {
    width: 900,
    height: 350,
    left: 64,
    top: 25,
    right: 875,
    bottom: 286,

    classes: [
      'trace-orange',
      'trace-green',
      'trace-blue',
      'trace-gray'
    ]
  };

  function graphRange(type) {
    if (type === 'spectrum') {
      const nir = ui.spectrumRange?.value === 'nir';

      return {
        xMin: nir ? 1800 : 600,
        xMax: nir ? 2400 : 1250,
        yMin: 60,
        yMax: 180
      };
    }

    return {
      xMin: Math.max(0, state.time - 6),
      xMax: Math.max(6, state.time),
      yMin: -12,
      yMax: 12
    };
  }

  function graphX(value, range) {
    return G.left +
      (value - range.xMin) / (range.xMax - range.xMin) *
      (G.right - G.left);
  }

  function graphY(value, range) {
    return G.bottom -
      (value - range.yMin) / (range.yMax - range.yMin) *
      (G.bottom - G.top);
  }

  function line(parent, x1, y1, x2, y2, className) {
    parent.appendChild(svg('path', {
      d: `M${x1} ${y1} L${x2} ${y2}`,
      class: className
    }));
  }

  function buildGraph(element, type) {
    if (!element) return;

    element.innerHTML = '';
    element.setAttribute('viewBox', `0 0 ${G.width} ${G.height}`);

    const defs = svg('defs');
    const clip = svg('clipPath', { id: `optoClip-${type}` });

    clip.appendChild(svg('rect', {
      x: G.left,
      y: G.top,
      width: G.right - G.left,
      height: G.bottom - G.top
    }));

    defs.appendChild(clip);
    element.appendChild(defs);

    element.appendChild(svg('rect', {
      x: G.left,
      y: G.top,
      width: G.right - G.left,
      height: G.bottom - G.top,
      class: 'plot-area'
    }));

    const grid = svg('g');

    for (let i = 0; i <= 6; i++) {
      const x = G.left + (G.right - G.left) * i / 6;
      const y = G.top + (G.bottom - G.top) * i / 6;

      line(grid, x, G.top, x, G.bottom, 'grid-line');
      line(grid, G.left, y, G.right, y, 'grid-line');
    }

    element.appendChild(grid);

    line(element, G.left, G.top, G.left, G.bottom, 'axis-line');
    line(element, G.left, G.bottom, G.right, G.bottom, 'axis-line');

    const xTicks = svg('g');
    const yTicks = svg('g');

    element.appendChild(xTicks);
    element.appendChild(yTicks);

    const dataGroup = svg('g', {
      'clip-path': `url(#optoClip-${type})`
    });

    const traces = G.classes.map(className => {
      const path = svg('path', {
        class: `trace ${className}`,
        d: ''
      });

      dataGroup.appendChild(path);
      return path;
    });

    const cursor = svg('path', {
      class: 'scan-cursor',
      d: ''
    });

    dataGroup.appendChild(cursor);
    element.appendChild(dataGroup);

    const hover = svg('g', { 'pointer-events': 'none' });

    const crosshair = svg('path', {
      class: 'hover-crosshair',
      d: ''
    });

    hover.appendChild(crosshair);

    const dots = G.classes.map((_, i) => {
      const dot = svg('circle', {
        cx: -20,
        cy: -20,
        r: 4,
        class: 'hover-point',
        fill: ['#ff7043', '#45e66f', '#38a9ff', '#a1a8b4'][i]
      });

      hover.appendChild(dot);
      return dot;
    });

    const hoverLabel = svg('text', {
      x: G.right - 4,
      y: G.top + 15,
      'text-anchor': 'end',
      class: 'tick-label'
    });

    hover.appendChild(hoverLabel);
    element.appendChild(hover);

    const xTitle = svg('text', {
      x: (G.left + G.right) / 2,
      y: 333,
      'text-anchor': 'middle',
      class: 'axis-label'
    });

    const yTitle = svg('text', {
      x: 17,
      y: (G.top + G.bottom) / 2,
      'text-anchor': 'middle',
      transform: `rotate(-90 17 ${(G.top + G.bottom) / 2})`,
      class: 'axis-label'
    });

    element.appendChild(xTitle);
    element.appendChild(yTitle);

    state.graphs[type] = {
      svg: element,
      xTicks, yTicks, traces, cursor,
      crosshair, dots, hoverLabel,
      xTitle, yTitle
    };

    element.addEventListener('pointermove', event => graphHover(type, event));

    element.addEventListener('pointerleave', () => {
      const graph = state.graphs[type];
      if (!graph) return;

      graph.crosshair.setAttribute('d', '');
      graph.hoverLabel.textContent = '';

      graph.dots.forEach(dot => {
        dot.setAttribute('cx', -20);
        dot.setAttribute('cy', -20);
      });
    });

    updateGraphAxes(type);
  }

  function updateGraphAxes(type) {
    const graph = state.graphs[type];
    if (!graph) return;

    const range = graphRange(type);

    graph.xTicks.innerHTML = '';
    graph.yTicks.innerHTML = '';

    for (let i = 0; i <= 6; i++) {
      const xv = range.xMin +
        (range.xMax - range.xMin) * i / 6;

      const x = graphX(xv, range);

      graph.xTicks.appendChild(svg('text', {
        x,
        y: G.bottom + 18,
        'text-anchor': 'middle',
        class: 'tick-label'
      }, type === 'spectrum' ? String(Math.round(xv)) : xv.toFixed(1)));

      const yv = type === 'spectrum'
        ? 60 + i * 20
        : range.yMin + (range.yMax - range.yMin) * i / 6;

      graph.yTicks.appendChild(svg('text', {
        x: G.left - 8,
        y: graphY(yv, range) + 4,
        'text-anchor': 'end',
        class: 'tick-label'
      }, type === 'spectrum' ? String(yv) : yv.toFixed(1)));
    }

    graph.xTitle.textContent =
      type === 'spectrum' ? 'Wavelength (nm)' : 'Time (s)';

    graph.yTitle.textContent =
      type === 'spectrum'
        ? 'Transmission / normalized response (%)'
        : 'Voltage (V)';
  }

  function gauss(x, center, width) {
    const z = (x - center) / width;
    return Math.exp(-0.5 * z * z);
  }

  function spectrumValues(fraction, time, model) {
    const nir = ui.spectrumRange?.value === 'nir';

    const shift = 0.012 * Math.sin(time * 0.8);
    const center1 = (nir ? 0.66 : 0.43) + shift;
    const center2 = (nir ? 0.34 : 0.73) - shift * 0.4;

    const light = model.brightness1 * 0.56 +
      model.brightness2 * 0.44;

    const dip1 = gauss(fraction, center1, 0.065);
    const dip2 = gauss(fraction, center2, 0.038);

    const variation =
      Math.sin(fraction * 18 + time * 1.2) * 1.1 +
      Math.sin(fraction * 6.5 - time * 0.7) * 0.7;

    const measurement =
      106 + 39 * light - 20 * dip1 - 4 * dip2 + variation;

    const reference =
      113 + 18 * light -
      7 * gauss(fraction, center1 * 0.92, 0.09) -
      3 * dip2 +
      Math.sin(fraction * 14 + time + 0.7) * 0.8;

    const filtered =
      measurement * 0.66 +
      reference * 0.34 +
      Math.sin(time * 0.5 + fraction * 4) * 0.3;

    const compensated =
      measurement - (1 - light) * 5 +
      dip1 * 4.2 +
      Math.sin(fraction * 9 + time * 0.55) * 0.4;

    return [
      measurement,
      reference,
      filtered,
      compensated
    ].map(value => clamp(value, 60.5, 179.5));
  }

  function paintSpectrum() {
    const graph = state.graphs.spectrum;
    if (!graph) return;

    updateGraphAxes('spectrum');

    const range = graphRange('spectrum');
    const model = state.model || simulate();
    const pathData = ['', '', '', ''];
    const count = 280;

    for (let i = 0; i < count; i++) {
      const f = i / (count - 1);
      const wavelength = range.xMin + f * (range.xMax - range.xMin);
      const x = graphX(wavelength, range);

      spectrumValues(f, state.time, model).forEach((value, index) => {
        pathData[index] +=
          `${i === 0 ? 'M' : 'L'}${x.toFixed(2)} ` +
          `${graphY(value, range).toFixed(2)} `;
      });
    }

    graph.traces.forEach((path, index) => {
      path.setAttribute('d', pathData[index]);
    });

    const scanFraction = (state.time % 8) / 8;
    const scanX = G.left + scanFraction * (G.right - G.left);

    graph.cursor.setAttribute('d', `M${scanX} ${G.top} V${G.bottom}`);

    setText(ui.spectrumCount, state.spectrumCount);

    setText(
      ui.spectrumCursor,
      `${Math.round(range.xMin + scanFraction * (range.xMax - range.xMin))} nm`
    );

    setText(
      ui.spectrumStatus,
      state.running
        ? 'Jonli skanerlash'
        : state.hasRun
          ? 'Natija muzlatilgan'
          : 'Tayyor'
    );
  }

  function sampleAt(time) {
    const model = simulate(time);
    const phase = 2 * Math.PI * model.modulationHz * time;

    return {
      time,
      input: model.sourceOn
        ? model.wiperV + 0.25 * Math.sin(phase)
        : 0,
      fd: model.sourceOn
        ? model.fdVoltage * (1 + 0.08 * Math.sin(phase - 0.2))
        : 0,
      a1: model.sourceOn
        ? model.a1Voltage * (1 + 0.05 * Math.sin(phase - 0.5))
        : 0,
      a2: model.sourceOn
        ? model.a2Voltage * (1 + 0.05 * Math.sin(phase - 0.8))
        : 0
    };
  }

  function seedSamples() {
    state.samples = [];

    for (let i = 0; i < 200; i++) {
      state.samples.push(sampleAt(6 * i / 199));
    }
  }

  function captureSample() {
    state.samples.push(sampleAt(state.time));

    if (state.samples.length > 650) {
      state.samples.splice(0, state.samples.length - 650);
    }

    state.sampleCount++;
    state.spectrumCount++;
  }

  function paintWaveform() {
    const graph = state.graphs.waveform;
    if (!graph) return;

    updateGraphAxes('waveform');

    const range = graphRange('waveform');
    const keys = ['input', 'fd', 'a1', 'a2'];

    graph.traces.forEach((path, index) => {
      let d = '';

      state.samples.forEach(sample => {
        if (sample.time < range.xMin || sample.time > range.xMax) return;

        d += `${d ? 'L' : 'M'}` +
          `${graphX(sample.time, range).toFixed(2)} ` +
          `${graphY(sample[keys[index]], range).toFixed(2)} `;
      });

      path.setAttribute('d', d);
    });

    const last = state.samples[state.samples.length - 1];

    if (last) setText(ui.waveformLast, `${fmt(last.a2, 3)} V`);

    setText(ui.waveformCount, state.sampleCount);

    setText(
      ui.waveformStatus,
      state.running
        ? 'Jonli yig‘ish'
        : state.hasRun
          ? 'Natija muzlatilgan'
          : 'Tayyor'
    );
  }

  function paintGraphs() {
    paintSpectrum();
    paintWaveform();
  }

  function interpolateSample(time) {
    const samples = state.samples;

    if (!samples.length) return null;
    if (time <= samples[0].time) return samples[0];

    for (let i = 1; i < samples.length; i++) {
      if (samples[i].time >= time) {
        const a = samples[i - 1];
        const b = samples[i];

        const f = (time - a.time) / Math.max(1e-9, b.time - a.time);

        return {
          time,
          input: a.input + (b.input - a.input) * f,
          fd: a.fd + (b.fd - a.fd) * f,
          a1: a.a1 + (b.a1 - a.a1) * f,
          a2: a.a2 + (b.a2 - a.a2) * f
        };
      }
    }

    return samples[samples.length - 1];
  }

  function graphHover(type, event) {
    const graph = state.graphs[type];
    if (!graph) return;

    const rect = graph.svg.getBoundingClientRect();

    const x = clamp(
      (event.clientX - rect.left) / Math.max(1, rect.width) * G.width,
      G.left,
      G.right
    );

    const range = graphRange(type);
    const fraction = (x - G.left) / (G.right - G.left);

    graph.crosshair.setAttribute(
      'd',
      `M${x} ${G.top} V${G.bottom}`
    );

    if (type === 'spectrum') {
      const values = spectrumValues(
        fraction,
        state.time,
        state.model || simulate()
      );

      values.forEach((value, index) => {
        graph.dots[index].setAttribute('cx', x);
        graph.dots[index].setAttribute('cy', graphY(value, range));
      });

      const wavelength = Math.round(
        range.xMin + fraction * (range.xMax - range.xMin)
      );

      graph.hoverLabel.textContent =
        `λ ${wavelength} nm · ${values.map(v => fmt(v, 1)).join(' / ')}`;

      return;
    }

    const sampleTime = range.xMin +
      fraction * (range.xMax - range.xMin);

    const sample = interpolateSample(sampleTime);
    if (!sample) return;

    const values = [sample.input, sample.fd, sample.a1, sample.a2];

    values.forEach((value, index) => {
      graph.dots[index].setAttribute('cx', x);
      graph.dots[index].setAttribute('cy', graphY(value, range));
    });

    graph.hoverLabel.textContent =
      `t ${fmt(sampleTime, 2)} s · ` +
      `${values.map(v => fmt(v, 2)).join(' / ')} V`;
  }

  /* ==============================================================
     15. SIMULYATSIYA TEZLIGI
     ============================================================== */

  function setupSpeedControl() {
    const toolbar = document.querySelector('.toolbar-tools');
    if (!toolbar || $('simulationSpeed')) return;

    const wrapper = document.createElement('label');
    wrapper.className = 'simulation-speed-control';
    wrapper.htmlFor = 'simulationSpeed';

    wrapper.innerHTML = `
      <span>Tezlik</span>
      <select id="simulationSpeed" aria-label="Simulyatsiya tezligi">
        <option value="0.2">0.2× · juda sekin</option>
        <option value="0.5">0.5× · sekin</option>
        <option value="1" selected>1× · normal</option>
        <option value="2">2×</option>
        <option value="3">3×</option>
        <option value="5">5×</option>
        <option value="10">10× · juda tez</option>
      </select>
    `;

    toolbar.appendChild(wrapper);

    $('simulationSpeed').addEventListener('change', event => {
      const speed = Number(event.target.value);

      if (![0.2, 0.5, 1, 2, 3, 5, 10].includes(speed)) return;

      state.speed = speed;

      toast(`Simulyatsiya tezligi: ${speed}×`, 'success');
    });
  }

  /* ==============================================================
     16. INPUTLAR VA BOSHQA BOSHQARUVLAR
     ============================================================== */

  function bindNumericInput(element, min, max, callback) {
    if (!element) return;

    let previous = num(element.value, min);

    element.addEventListener('input', () => {
      const value = Number(element.value);

      if (
        element.value.trim() === '' ||
        !Number.isFinite(value) ||
        value < min ||
        value > max
      ) {
        element.setAttribute('aria-invalid', 'true');
        return;
      }

      element.removeAttribute('aria-invalid');
      previous = value;

      callback(value);
    });

    element.addEventListener('change', () => {
      const value = Number(element.value);

      if (
        element.value.trim() === '' ||
        !Number.isFinite(value) ||
        value < min ||
        value > max
      ) {
        element.value = String(previous);
        element.removeAttribute('aria-invalid');

        toast(`Qiymat ${min} va ${max} oralig‘ida bo‘lsin.`, 'error');
      }
    });
  }

  function setupControls() {
    bindNumericInput(ui.supply, 0, 24, value => {
      state.supplyVoltage = value;
      if (ui.supplyRange) ui.supplyRange.value = String(value);
      recalculate();
    });

    bindNumericInput(ui.supplyRange, 0, 24, value => {
      state.supplyVoltage = value;
      if (ui.supply) ui.supply.value = String(value);
      recalculate();
    });

    bindNumericInput(ui.currentLimit, 1, 1000, value => {
      state.currentLimitMA = value;
      recalculate();
    });

    bindNumericInput(ui.pot, 1, 100, value => {
      state.potKOhm = value;

      const master = state.components.get('POT_MASTER');
      if (master) master.params.resistanceK = value;

      if (ui.potRange) ui.potRange.value = String(value);

      recalculate();
    });

    bindNumericInput(ui.potRange, 1, 100, value => {
      state.potKOhm = value;

      const master = state.components.get('POT_MASTER');
      if (master) master.params.resistanceK = value;

      if (ui.pot) ui.pot.value = String(value);

      recalculate();
    });

    ui.source?.addEventListener('change', () => {
      state.sourceOn = ui.source.checked;
      recalculate();
    });

    ui.led1?.addEventListener('change', () => {
      state.led1On = ui.led1.checked;
      recalculate();
    });

    ui.led2?.addEventListener('change', () => {
      state.led2On = ui.led2.checked;
      recalculate();
    });

    ui.run?.addEventListener('click', runSimulation);
    ui.pause?.addEventListener('click', pauseSimulation);
    ui.restart?.addEventListener('click', restartSimulation);

    ui.theme?.addEventListener('click', () => {
      const light = !document.body.classList.contains('theme-light');

      document.body.classList.toggle('theme-light', light);
      document.body.classList.toggle('light-theme', light);
      document.body.dataset.theme = light ? 'light' : 'dark';
    });

    ui.selectMode?.addEventListener('click', () => {
      state.connectionMode = false;

      document.body.classList.remove('connection-check');

      ui.selectMode.setAttribute('aria-pressed', 'true');
      ui.connectionMode?.setAttribute('aria-pressed', 'false');
    });

    ui.connectionMode?.addEventListener('click', () => {
      state.connectionMode = true;

      document.body.classList.add('connection-check');

      ui.connectionMode.setAttribute('aria-pressed', 'true');
      ui.selectMode?.setAttribute('aria-pressed', 'false');

      toast(
        'Ulanish rejimi: noaniq tugunlar taxminiy deb qaraladi.'
      );
    });

    ui.showValues?.addEventListener('click', () => {
      state.showValues = !state.showValues;

      document.body.classList.toggle(
        'hide-component-values',
        !state.showValues
      );

      ui.showValues.setAttribute(
        'aria-pressed',
        String(state.showValues)
      );
    });

    ui.spectrumRange?.addEventListener('change', paintSpectrum);
  }

  /* ==============================================================
     17. KOMPONENTNI TANLASH VA SIM TOOLTIP
     ============================================================== */

  function setupInteractions() {
    let tooltip = $('componentTooltip');

    if (!tooltip) {
      tooltip = document.createElement('div');
      tooltip.id = 'componentTooltip';
      tooltip.setAttribute('role', 'tooltip');
      document.body.appendChild(tooltip);
    }

    ui.svg.addEventListener('pointermove', event => {
      if (state.dragging) {
        tooltip.style.display = 'none';
        return;
      }

      const componentGroup = event.target.closest?.(
        '.component-group[data-component-id], .test-point[data-component-id]'
      );

      const wire = event.target.closest?.('[data-wire-id], path.wire');

      if (!componentGroup && !wire) {
        tooltip.style.display = 'none';
        return;
      }

      let message = '';

      if (componentGroup) {
        const item = state.components.get(componentGroup.dataset.componentId);
        if (!item) return;

        const result = getMetrics(item);

        message =
          `${item.label}\n` +
          `${definitions[item.type]?.title || item.type}\n` +
          result.lines.slice(0, 4).join('\n');
      } else {
        const id = wire.closest('[data-component-id]')?.dataset.componentId;
        const item = id ? state.components.get(id) : null;

        message =
          `${wire.dataset.wireId || 'Elektr simi'}\n` +
          `${wire.dataset.fromNode || 'Boshlang‘ich tugun'} → ` +
          `${wire.dataset.toNode || 'Oxirgi tugun'}\n` +
          `Holat: ${wire.dataset.connectionStatus || 'taxminiy'}\n` +
          `Aynan shu simdagi fizik tok: alohida hisoblanmagan`;
      }

      tooltip.textContent = message;
      tooltip.style.display = 'block';

      tooltip.style.left = `${
        Math.max(8, Math.min(event.clientX + 14, innerWidth - 365))
      }px`;

      tooltip.style.top = `${
        Math.max(8, Math.min(event.clientY + 14, innerHeight - 155))
      }px`;
    });

    ui.svg.addEventListener('pointerleave', () => {
      tooltip.style.display = 'none';
    });

    ui.svg.addEventListener('click', event => {
      if (state.dragging?.moved) return;

      const componentGroup = event.target.closest?.(
        '.component-group[data-component-id], .test-point[data-component-id]'
      );

      if (componentGroup) {
        const item = state.components.get(componentGroup.dataset.componentId);
        if (item) openComponent(item);
        return;
      }

      const wire = event.target.closest?.('[data-wire-id], path.wire');

      if (wire) openWire(wire);
    });

    ui.svg.addEventListener('keydown', event => {
      if (event.key !== 'Enter' && event.key !== ' ') return;

      const group = event.target.closest?.('[data-component-id]');
      if (!group) return;

      const item = state.components.get(group.dataset.componentId);
      if (!item) return;

      event.preventDefault();
      openComponent(item);
    });

    $('resetComponentButton')?.addEventListener('click', () => {
      if (!state.selectedId) return;

      const item = state.components.get(state.selectedId);
      if (!item) return;

      item.params = JSON.parse(JSON.stringify(item.initialParams));

      recalculate();
      openComponent(item);
    });
  }

  function openWire(wire) {
    state.selectedWire = wire;

    $$('.wire.is-selected', ui.svg).forEach(path => {
      path.classList.remove('is-selected');
    });

    wire.classList.add('is-selected');

    const drawer = ensureDrawer();

    const id = wire.dataset.wireId || 'WIRE';
    const from = wire.dataset.fromNode || 'Aniqlanmagan tugun';
    const to = wire.dataset.toNode || 'Aniqlanmagan tugun';

    setText('edTitle', `${id} · Elektr simi`);
    setText('edSub', wire.dataset.connectionStatus || 'Taxminiy ulanish');

    $('edBody').innerHTML = `
      <div class="ed-card">
        <h4>Ulanish ma’lumoti</h4>
        <p>Sim ID: ${escapeHTML(id)}</p>
        <p>${escapeHTML(from)} → ${escapeHTML(to)}</p>
        <p>Holat: ${escapeHTML(wire.dataset.connectionStatus || 'taxminiy')}</p>
      </div>

      <div class="ed-card">
        <h4>Elektr kattaliklari</h4>
        <p>Ideal sim farazida sim bo‘ylab kuchlanish tushuvi taxminan 0 V.</p>
        <p>Aynan ushbu simning toki alohida tugunli yechuvchida hisoblanmagan.</p>
        <p>Shuning uchun fizik tok qiymati: N/A.</p>
      </div>

      <div class="ed-note">
        Simning chizmada ko‘rinishi uning asl sxemada fizik jihatdan
        to‘g‘ri ulanganini o‘zi isbotlamaydi.
      </div>
    `;

    drawer.classList.add('open');
  }

  /* ==============================================================
     18. HOLATNI O‘ZGARTIRISH
     ============================================================== */

  function updateStatus(label, running) {
    setText(ui.simulationState, label);

    setText(
      ui.appStatusText,
      running ? 'RUNNING' : label.includes('PAUSE') ? 'PAUSED' : 'TAYYOR'
    );

    setText(
      ui.simulationTime,
      `t = ${fmt(state.time, 2)} s · ${state.speed}×`
    );

    if (ui.appStatusLed) {
      ui.appStatusLed.style.background = running ? '#4ce0a1' : '#ffad55';
    }

    if (ui.runIndicator) {
      ui.runIndicator.style.background = running ? '#4ce0a1' : '#ffad55';
    }
  }

  function runSimulation() {
    if (state.running) {
      toast('Simulyatsiya allaqachon ishlayapti.');
      return;
    }

    state.running = true;
    state.hasRun = true;
    state.lastFrame = 0;
    state.sampleClock = 0;

    document.body.classList.add('opto-sim-running');
    document.body.classList.remove('opto-sim-paused');

    updateStatus('RUNNING / SIMULYATSIYA ISHLAYAPTI', true);

    toast(
      'RUN: simlar, LED, fotonlar va grafiklar jonlanmoqda.',
      'success'
    );
  }

  function pauseSimulation() {
    if (!state.running) {
      toast('Simulyatsiya allaqachon to‘xtatilgan.');
      return;
    }

    state.running = false;

    document.body.classList.remove('opto-sim-running');
    document.body.classList.add('opto-sim-paused');

    updateStatus('PAUSED / NATIJA MUZLATILDI', false);

    animateVisuals();
    paintGraphs();

    toast('PAUSE: simulyatsiya muzlatildi.', 'success');
  }

  function restartSimulation() {
    state.running = false;
    state.hasRun = false;

    state.time = 0;
    state.lastFrame = 0;
    state.sampleClock = 0;
    state.sampleCount = 0;
    state.spectrumCount = 0;

    seedSamples();

    state.model = simulate();

    document.body.classList.remove('opto-sim-running', 'opto-sim-paused');

    renderReadouts();
    animateVisuals();
    paintGraphs();
    updateStatus('READY / TAYYOR', false);

    toast('Simulyatsiya qayta boshlandi.', 'success');
  }

  /* ==============================================================
     19. QAYTA HISOBLASH
     ============================================================== */

  function recalculate() {
    state.model = simulate();

    renderReadouts();
    animateVisuals();
    paintGraphs();

    if (state.running) {
      captureSample();
      paintWaveform();
    }
  }

  /* ==============================================================
     20. ASOSIY ANIMATSIYA SIKLI
     ============================================================== */

  function animationFrame(timestamp) {
    try {
      if (!state.lastFrame) state.lastFrame = timestamp;

      const deltaReal = clamp(
        (timestamp - state.lastFrame) / 1000,
        0,
        0.05
      );

      state.lastFrame = timestamp;

      if (state.running) {
        const delta = deltaReal * clamp(state.speed, 0.2, 10);

        state.time += delta;
        state.sampleClock += delta;

        state.model = simulate();

        while (state.sampleClock >= 0.05) {
          state.sampleClock -= 0.05;
          captureSample();
        }

        animateVisuals();
        renderReadouts();
        paintGraphs();

        setText(
          ui.simulationTime,
          `t = ${fmt(state.time, 2)} s · ${state.speed}×`
        );
      }
    } catch (error) {
      /*
        Xato yuz bersa ham, keyingi kadrni rejalashtirishga harakat
        qilamiz. Shu tariqa bitta vizual xato butun siklni jim
        to‘xtatib qo‘ymaydi.
      */
      reportError(error, 'Animation frame');
    }

    requestAnimationFrame(animationFrame);
  }

  /* ==============================================================
     21. DASTURNI ISHGA TUSHIRISH
     ============================================================== */

  function initialize() {
    if (state.initialized) return;
    state.initialized = true;

    try {
      if (!ui.svg) {
        throw new Error(
          'index.html ichida id="circuitSvg" topilmadi. HTML faylni tekshir.'
        );
      }

      installMotionStyles();

      registerComponents();
      createWorld();

      setupLEDEffects();
      setupWireParticles();

      setupZoomAndPan();
      setupInteractions();
      setupControls();
      setupSpeedControl();

      buildGraph(ui.spectrum, 'spectrum');
      buildGraph(ui.waveform, 'waveform');

      state.model = simulate();

      seedSamples();

      renderReadouts();
      animateVisuals();
      paintGraphs();

      document.body.classList.add('opto-js-ready');

      setText(
        ui.assumed,
        'Taxminiy model — fizik ulanishlar tekshirilmagan'
      );

      updateStatus('READY / TAYYOR', false);

      console.info(
        `[OptoLab] Tayyor. Komponentlar: ${state.components.size}; ` +
        `sim segmentlari: ${state.paths.length}; ` +
        'grafiklar, fotonlar va LED effektlari yaratildi.'
      );

      /*
        Simulyatsiyani avtomatik boshlaymiz: foydalanuvchi sahifani
        ochishi bilan jonli grafik va oqim animatsiyalari ko‘rinadi.
        PAUSE tugmasi orqali darhol to‘xtatish mumkin.
      */
      runSimulation();

      requestAnimationFrame(animationFrame);
    } catch (error) {
      reportError(error, 'Initialize');
      state.initialized = false;
    }
  }

  /* Agar tashqi skript ishga tushsa, initialize bir marta chaqiriladi. */
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initialize, { once: true });
  } else {
    initialize();
  }

})();