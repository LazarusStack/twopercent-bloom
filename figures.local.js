// Personal fan-art figure. Local only: *.local.js is gitignored and bloom.js
// loads this file only on localhost, so it never ships to the public site.
export default {
  shin: {
    icon: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4"><path d="M3.5 9.5C3.5 5.5 5.5 3 8 3s4.5 2.5 4.5 6.5c0 2.2-2 3.5-4.5 3.5s-4.5-1.3-4.5-3.5Z"/><path d="M5.2 6.6h1.6M9.2 6.6h1.6" stroke-width="2"/></svg>',
    style: {
      model: './shin.local.glb',                              // drop the downloaded GLB here; built-in body is the fallback
      modelChest: 0.38,                                       // where on the model to dive in (fraction of height)
      toon: true,                                             // flat anime shading + black outline
      yarn: '#e0302a', ground: '#e0302a', stripes: false,     // red tee
      shorts: '#f3e27a', shoe: '#f2c230', sole: '#e0a51f',    // pale yellow shorts, yellow shoes
      hair: '#111111', skin: '#f6c7a6',
      head: 'onigiri', headScale: 1.3, earSize: 1.25,         // huge rice-ball head, big round ears
      hairCap: [1.05, 0.05, 1],
      brows: 'bushy', browSize: 1.25,                         // heavy curved brows
      eyes: 'dark', eyeScale: 1.35, eyePitch: 0.05, glint: 0.042, eyeSpread: 0.25, // big black eyes, large highlight
      nose: false, mouth: 'smile', cheeks: false, tufts: false,
    },
  },
};
