import { useEffect } from 'react'
import * as THREE from 'three'
import siteHtml from '../home.html?raw'

export default function Home() {
  useEffect(() => {
    // home uses the vw-based rem scale defined in styles.css
    document.documentElement.style.fontSize = ''

    const reduceMotion = window.matchMedia('(prefers-reduced-motion:reduce)').matches
    const isDesktop = () => window.innerWidth >= 1024
    let alive = true
    const cleanups = []
    const addWin = (ev, fn) => { window.addEventListener(ev, fn); cleanups.push(() => window.removeEventListener(ev, fn)) }

    /* ---------- text splitting ---------- */
    function splitLetters(el, start) {
      el.setAttribute('aria-label', el.textContent)
      const frag = document.createDocumentFragment()
      let i = 0
      const walk = (node, accent) => {
        node.childNodes.forEach((ch) => {
          if (ch.nodeType === 3) {
            [...ch.textContent].forEach((c) => {
              const s = document.createElement('span')
              s.className = 'unit' + (accent ? ' accent' : '')
              s.textContent = c === ' ' ? ' ' : c
              s.style.transitionDelay = (start + i * 16) + 'ms'
              i++; frag.appendChild(s)
            })
          } else if (ch.nodeType === 1) { walk(ch, ch.classList.contains('accent')) }
        })
      }
      walk(el, false); el.textContent = ''; el.appendChild(frag)
    }
    function splitWords(el, start, stagger) {
      const text = el.textContent.trim(); el.textContent = ''
      text.split(/\s+/).forEach((w, idx) => {
        const s = document.createElement('span')
        s.className = 'unit word'; s.textContent = w
        s.style.transitionDelay = (start + idx * stagger) + 'ms'; el.appendChild(s)
      })
    }
    function reveal() {
      document.querySelectorAll('#site .anim').forEach((el) => {
        el.style.transitionDelay = (el.dataset.delay ? parseInt(el.dataset.delay, 10) : 0) + 'ms'
        el.classList.add('in')
      })
      document.querySelectorAll('#site .unit').forEach((u) => u.classList.add('in'))
    }

    /* ---------- preloader ---------- */
    const LOAD_MS = 2200, COLLAPSE_MS = 850
    const easeInOutCubic = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2)
    function runPreloader() {
      const preloader = document.getElementById('preloader')
      const fill = document.getElementById('fill')
      const counter = document.getElementById('counter')
      if (reduceMotion || !isDesktop()) { if (preloader) preloader.remove(); reveal(); return }
      let startT = null, phase = 'load', collapseStart = 0
      function tick(now) {
        if (!alive) return
        if (startT === null) startT = now
        if (phase === 'load') {
          const t = Math.min((now - startT) / LOAD_MS, 1), e = easeInOutCubic(t)
          fill.style.bottom = '0'; fill.style.top = 'auto'; fill.style.height = (e * 100) + '%'
          counter.textContent = Math.round(e * 100) + '%'
          const p = Math.min(e, 0.9)
          counter.style.bottom = `calc(${p} * (100dvh - 7rem) + 1.5rem)`
          counter.style.opacity = e <= 0.9 ? 1 : (1 - (e - 0.9) / 0.1)
          if (t >= 1) { phase = 'collapse'; collapseStart = now }
        } else {
          const t = Math.min((now - collapseStart) / COLLAPSE_MS, 1), e = easeInOutCubic(t)
          fill.style.top = '0'; fill.style.bottom = 'auto'; fill.style.height = ((1 - e) * 100) + '%'
          counter.style.opacity = 0
          if (t >= 1) { if (preloader) preloader.remove(); reveal(); return }
        }
        requestAnimationFrame(tick)
      }
      requestAnimationFrame(tick)
    }

    /* ---------- WebGL field ----------
       A single full-screen fragment shader, no models and no external assets.
       It layers what the brand plates are made of: one soft airbrushed black
       mass, a halftone screen breaking its mid-tones, an anamorphic acid
       flare, vertical striation slicing through the smudge, and grain. */
    const pointer = { x: 0, y: 0 }
    if (!reduceMotion) {
      addWin('mousemove', (ev) => {
        pointer.x = (ev.clientX / window.innerWidth) * 2 - 1
        pointer.y = (ev.clientY / window.innerHeight) * 2 - 1
      })
    }

    const VERT = `
      varying vec2 vUv;
      void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }
    `

    const FRAG = `
      precision highp float;
      uniform vec2  uRes;
      uniform float uTime;
      uniform vec2  uPointer;
      uniform vec2  uFlow;
      varying vec2  vUv;

      const vec3 PAPER = vec3(0.925, 0.921, 0.894);   /* #ecebe4 */
      const vec3 INK   = vec3(0.043, 0.043, 0.035);   /* #0b0b09 */
      const vec3 ACID  = vec3(0.886, 0.980, 0.235);   /* #e2fa3c */

      float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123); }

      float noise(vec2 p){
        vec2 i = floor(p), f = fract(p);
        vec2 u = f * f * (3.0 - 2.0 * f);
        return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x),
                   mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x), u.y);
      }

      float fbm(vec2 p){
        float v = 0.0, a = 0.5;
        for (int i = 0; i < 5; i++){ v += a * noise(p); p *= 2.02; a *= 0.5; }
        return v;
      }

      /* one airbrushed mass: an ellipse whose edge is chewed up by fbm so it
         reads as a smudge rather than a blob. flow advects the noise domain,
         so recent pointer movement smears the ink instead of just sliding it. */
      float mass(vec2 p, vec2 c, vec2 r, float seed, float t, vec2 flow){
        vec2 q = (p - c) / r;
        float d = length(q);
        d += (fbm(q * 1.15 + vec2(seed, t * 0.045) + flow) - 0.5) * 0.9;
        return 1.0 - smoothstep(0.22, 1.06, d);
      }

      void main(){
        float aspect = uRes.x / max(uRes.y, 1.0);
        /* p stays pointer-free: the flare, halftone and striation must not
           wander, so only the masses below react to the cursor */
        vec2 p = (vUv - 0.5) * vec2(aspect, 1.0);
        float t = uTime;

        /* --- a single airbrushed mass, centred on the panel and a touch
               larger than the old top-right smudge. It rides the pointer and
               shares the advected noise domain, which is what reads as flow. --- */
        vec2 pm = p + uPointer * 0.05;
        vec2 flow = uFlow;

        float m = mass(pm + uPointer * 0.030, vec2(0.0, 0.0), vec2(0.40, 0.27), 1.3, t, flow);
        m = clamp(m, 0.0, 1.0);

        /* --- halftone screen through the mid-tones --- */
        float a = 0.42;
        mat2 rot = mat2(cos(a), -sin(a), sin(a), cos(a));
        vec2 cell = fract(rot * (vUv * uRes) / 3.4) - 0.5;
        float radius = sqrt(m) * 0.62;
        float ht = 1.0 - smoothstep(radius - 0.07, radius + 0.07, length(cell));
        float band = smoothstep(0.04, 0.34, m) * (1.0 - smoothstep(0.54, 0.86, m));
        float ink = mix(m, ht, band * 0.82);

        /* --- vertical striation, the fluted-glass slice --- */
        float stri = fract(vUv.x * uRes.x / 4.0);
        float rule = smoothstep(0.80, 0.94, stri) * (1.0 - smoothstep(0.94, 1.0, stri));
        ink += rule * m * 0.12;
        ink = clamp(ink, 0.0, 1.0);

        /* --- anamorphic acid flare --- */
        vec2 f = p - vec2(-0.03, 0.0);
        float horiz = exp(-abs(f.y) * 140.0) * exp(-abs(f.x) * 3.0);
        float vert  = exp(-abs(f.x) * 160.0) * exp(-abs(f.y) * 3.4);
        float core  = exp(-length(f) * 26.0);
        float bloom = exp(-length(f) * 6.5) * 0.28;
        float flare = (horiz + vert + core * 1.4 + bloom) * (0.86 + 0.14 * sin(t * 0.7));

        /* --- composite --- */
        vec3 col = PAPER;
        col = mix(col, INK, ink * 0.94);
        /* acid bleeds around the rim of every mass, as it does in the plates */
        col = mix(col, ACID, m * (1.0 - m) * 4.0 * 0.10);
        col += ACID * flare * 0.85;
        col += vec3(1.0) * core * 0.55;

        float g = hash(gl_FragCoord.xy + floor(t * 10.0));
        col += (g - 0.5) * 0.05;

        gl_FragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
      }
    `

    const RES_SCALE = 0.8 // render soft and cheap, let CSS scale it back up
    let renderer = null, canvasEl = null, material = null

    function buildScene(hostEl) {
      if (!hostEl) return
      let W = hostEl.clientWidth, H = hostEl.clientHeight
      if (W === 0 || H === 0) { if (alive) setTimeout(() => buildScene(hostEl), 120); return }

      try {
        renderer = new THREE.WebGLRenderer({ antialias: false, alpha: false })
      } catch (e) {
        return // no WebGL -- the paper background and CSS marginalia still stand on their own
      }
      renderer.setPixelRatio(1)
      renderer.setSize(Math.round(W * RES_SCALE), Math.round(H * RES_SCALE), false)
      renderer.outputColorSpace = THREE.SRGBColorSpace
      canvasEl = renderer.domElement
      hostEl.appendChild(canvasEl)

      const scene = new THREE.Scene()
      const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1)
      material = new THREE.ShaderMaterial({
        vertexShader: VERT,
        fragmentShader: FRAG,
        uniforms: {
          uRes: { value: new THREE.Vector2(W * RES_SCALE, H * RES_SCALE) },
          uTime: { value: 0 },
          uPointer: { value: new THREE.Vector2(0, 0) },
          uFlow: { value: new THREE.Vector2(0, 0) },
        },
      })
      scene.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), material))

      const clock = new THREE.Clock()
      const draw = () => renderer.render(scene, camera)

      if (reduceMotion) {
        draw()
      } else {
        const animate = () => {
          if (!alive) return
          requestAnimationFrame(animate)
          if (document.hidden) return
          material.uniforms.uTime.value = clock.getElapsedTime()

          // The pointer is chased with a lag so the masses drift rather than
          // snap. Whatever distance it covered this frame is fed into uFlow,
          // which decays -- a quick sweep smears the ink and then settles.
          const pv = material.uniforms.uPointer.value
          const px = pv.x, py = pv.y
          pv.x += (pointer.x - pv.x) * 0.035
          pv.y += (-pointer.y - pv.y) * 0.035

          const fl = material.uniforms.uFlow.value
          fl.x = fl.x * 0.94 + (pv.x - px) * 2.0
          fl.y = fl.y * 0.94 + (pv.y - py) * 2.0

          draw()
        }
        animate()
      }

      addWin('resize', () => {
        W = hostEl.clientWidth; H = hostEl.clientHeight
        if (W === 0 || H === 0) return
        renderer.setSize(Math.round(W * RES_SCALE), Math.round(H * RES_SCALE), false)
        material.uniforms.uRes.value.set(W * RES_SCALE, H * RES_SCALE)
        if (reduceMotion) draw()
      })
    }

    /* ---------- init ---------- */
    document.querySelectorAll('#site [data-letters]').forEach((el) => splitLetters(el, parseInt(el.dataset.start, 10)))
    document.querySelectorAll('#site .words').forEach((el) => splitWords(el, parseInt(el.dataset.start, 10), parseInt(el.dataset.stagger, 10)))
    const io = new IntersectionObserver((entries) => {
      entries.forEach((en) => { if (en.isIntersecting) { en.target.classList.add('in'); io.unobserve(en.target) } })
    }, { threshold: 0.18 })
    if (reduceMotion) { document.querySelectorAll('#site .reveal').forEach((el) => el.classList.add('in')) }
    else {
      document.querySelectorAll('#site .reveal').forEach((el) => {
        const sibs = [...el.parentElement.querySelectorAll(':scope > .reveal')]
        const idx = Math.max(0, sibs.indexOf(el))
        el.style.transitionDelay = (idx * 80) + 'ms'; io.observe(el)
      })
    }
    buildScene(isDesktop() ? document.getElementById('panel') : document.getElementById('mpanel'))
    runPreloader()

    return () => {
      alive = false
      io.disconnect()
      cleanups.forEach((fn) => fn())
      if (renderer) { try { renderer.dispose() } catch (e) {} }
      if (canvasEl && canvasEl.parentNode) canvasEl.parentNode.removeChild(canvasEl)
    }
  }, [])

  return <div dangerouslySetInnerHTML={{ __html: siteHtml }} />
}
