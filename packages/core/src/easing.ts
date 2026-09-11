/** Named easing curves. All take and return 0..1. */
export type Easing = (t: number) => number;

const pow = (n: number): [Easing, Easing, Easing] => [
  (t) => t ** n,
  (t) => 1 - (1 - t) ** n,
  (t) => (t < 0.5 ? 2 ** (n - 1) * t ** n : 1 - (-2 * t + 2) ** n / 2),
];

const c1 = 1.70158, c2 = c1 * 1.525, c3 = c1 + 1, c4 = (2 * Math.PI) / 3, c5 = (2 * Math.PI) / 4.5;

export const EASINGS: Record<string, Easing> = {
  'linear': (t) => t,
  'quad.in': pow(2)[0], 'quad.out': pow(2)[1], 'quad.inOut': pow(2)[2],
  'cubic.in': pow(3)[0], 'cubic.out': pow(3)[1], 'cubic.inOut': pow(3)[2],
  'quart.in': pow(4)[0], 'quart.out': pow(4)[1], 'quart.inOut': pow(4)[2],
  'quint.in': pow(5)[0], 'quint.out': pow(5)[1], 'quint.inOut': pow(5)[2],
  'sine.in': (t) => 1 - Math.cos((t * Math.PI) / 2),
  'sine.out': (t) => Math.sin((t * Math.PI) / 2),
  'sine.inOut': (t) => -(Math.cos(Math.PI * t) - 1) / 2,
  'expo.in': (t) => (t === 0 ? 0 : 2 ** (10 * t - 10)),
  'expo.out': (t) => (t === 1 ? 1 : 1 - 2 ** (-10 * t)),
  'expo.inOut': (t) => t === 0 ? 0 : t === 1 ? 1 : t < 0.5 ? 2 ** (20 * t - 10) / 2 : (2 - 2 ** (-20 * t + 10)) / 2,
  'circ.in': (t) => 1 - Math.sqrt(1 - t ** 2),
  'circ.out': (t) => Math.sqrt(1 - (t - 1) ** 2),
  'circ.inOut': (t) => t < 0.5 ? (1 - Math.sqrt(1 - (2 * t) ** 2)) / 2 : (Math.sqrt(1 - (-2 * t + 2) ** 2) + 1) / 2,
  'back.in': (t) => c3 * t ** 3 - c1 * t ** 2,
  'back.out': (t) => 1 + c3 * (t - 1) ** 3 + c1 * (t - 1) ** 2,
  'back.inOut': (t) => t < 0.5 ? ((2 * t) ** 2 * ((c2 + 1) * 2 * t - c2)) / 2 : ((2 * t - 2) ** 2 * ((c2 + 1) * (t * 2 - 2) + c2) + 2) / 2,
  'elastic.out': (t) => (t === 0 ? 0 : t === 1 ? 1 : 2 ** (-10 * t) * Math.sin((t * 10 - 0.75) * c4) + 1),
  'elastic.inOut': (t) => t === 0 ? 0 : t === 1 ? 1 : t < 0.5 ? -(2 ** (20 * t - 10) * Math.sin((20 * t - 11.125) * c5)) / 2 : (2 ** (-20 * t + 10) * Math.sin((20 * t - 11.125) * c5)) / 2 + 1,
  'bounce.out': (t) => {
    const n1 = 7.5625, d1 = 2.75;
    if (t < 1 / d1) return n1 * t * t;
    if (t < 2 / d1) return n1 * (t -= 1.5 / d1) * t + 0.75;
    if (t < 2.5 / d1) return n1 * (t -= 2.25 / d1) * t + 0.9375;
    return n1 * (t -= 2.625 / d1) * t + 0.984375;
  },
  'step': (t) => (t < 1 ? 0 : 1),
};

export function ease(name: string | Easing | undefined, fallback = 'expo.out'): Easing {
  if (typeof name === 'function') return name;
  return EASINGS[name ?? fallback] ?? EASINGS[fallback] ?? EASINGS['linear']!;
}

/** Motion personality → default curve, used when taste.motion.ease is unset. */
export const PERSONALITY_EASE: Record<string, string> = {
  snappy: 'expo.out', smooth: 'cubic.inOut', bouncy: 'back.out', mechanical: 'linear',
};
