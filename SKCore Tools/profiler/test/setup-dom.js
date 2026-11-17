/**
 * Test ortamı kurulumu (jsdom).
 *
 * jsdom'da canvas 2D bağlamı YOKTUR. Lightweight Charts çizim yapamadığında
 * grafik bileşeninin kod yolu hiç çalışmaz ve test bir şey doğrulamamış olur.
 * Bu yüzden "çağrıları yutan ama zincirlenebilir" bir 2D bağlam taklidi
 * kurulur: grafik oluşturma, seri ekleme, append-only güncelleme ve
 * yeniden kurma (rebuild) yolları GERÇEKTEN çalışır, hatalar yakalanır.
 */
import '@testing-library/react/dont-cleanup-after-each';

function makeContext2D(canvas) {
  const gradient = { addColorStop() {} };
  const base = {
    canvas,
    globalAlpha: 1, globalCompositeOperation: 'source-over',
    fillStyle: '#000', strokeStyle: '#000', lineWidth: 1, lineCap: 'butt', lineJoin: 'miter',
    miterLimit: 10, lineDashOffset: 0, font: '10px sans-serif', textAlign: 'left',
    textBaseline: 'alphabetic', direction: 'ltr', shadowBlur: 0, shadowColor: 'transparent',
    shadowOffsetX: 0, shadowOffsetY: 0, imageSmoothingEnabled: true, imageSmoothingQuality: 'low',
    filter: 'none',
    measureText: (t) => ({
      width: String(t).length * 6,
      actualBoundingBoxAscent: 8, actualBoundingBoxDescent: 2,
      actualBoundingBoxLeft: 0, actualBoundingBoxRight: String(t).length * 6,
    }),
    getLineDash: () => [],
    createLinearGradient: () => gradient,
    createRadialGradient: () => gradient,
    createConicGradient: () => gradient,
    createPattern: () => null,
    getImageData: (x, y, w, h) => ({ data: new Uint8ClampedArray(Math.max(4, w * h * 4)), width: Math.max(1, w), height: Math.max(1, h) }),
    createImageData: (w, h) => ({ data: new Uint8ClampedArray(Math.max(4, w * h * 4)), width: Math.max(1, w), height: Math.max(1, h) }),
    isPointInPath: () => false,
    isPointInStroke: () => false,
  };
  // Bilinmeyen her metot için otomatik no-op (arcTo, roundRect, ellipse, …)
  return new Proxy(base, {
    get(t, k) {
      if (k in t) return t[k];
      if (typeof k === 'symbol') return undefined;
      const fn = () => fn;
      t[k] = fn;
      return fn;
    },
    set(t, k, v) { t[k] = v; return true; },
  });
}

HTMLCanvasElement.prototype.getContext = function (type) {
  if (type && type !== '2d') return null;
  return makeContext2D(this);
};

// jsdom'da tüm ölçüler 0'dır; grafik/panel yerleşimi 0x0 ile yanlış yolları seçer.
Object.defineProperty(HTMLElement.prototype, 'clientWidth', { configurable: true, get() { return Number(this.dataset?.w ?? 900); } });
Object.defineProperty(HTMLElement.prototype, 'clientHeight', { configurable: true, get() { return Number(this.dataset?.h ?? 220); } });
Object.defineProperty(HTMLElement.prototype, 'offsetWidth', { configurable: true, get() { return Number(this.dataset?.w ?? 900); } });
Object.defineProperty(HTMLElement.prototype, 'offsetHeight', { configurable: true, get() { return Number(this.dataset?.h ?? 220); } });
Object.defineProperty(HTMLElement.prototype, 'scrollTop', { configurable: true, writable: true, value: 0 });
Object.defineProperty(HTMLElement.prototype, 'scrollHeight', { configurable: true, get() { return 20000; } });

if (typeof globalThis.devicePixelRatio === 'undefined') {
  Object.defineProperty(globalThis, 'devicePixelRatio', { value: 1, configurable: true });
}
if (typeof globalThis.ResizeObserver === 'undefined') {
  globalThis.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} };
}
if (typeof globalThis.matchMedia === 'undefined') {
  globalThis.matchMedia = () => ({ matches: false, addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {} });
}
if (typeof window !== 'undefined' && !window.localStorage) {
  const store = new Map();
  Object.defineProperty(window, 'localStorage', {
    value: {
      getItem: (k) => (store.has(k) ? store.get(k) : null),
      setItem: (k, v) => store.set(k, String(v)),
      removeItem: (k) => store.delete(k),
      clear: () => store.clear(),
    },
    configurable: true,
  });
}
