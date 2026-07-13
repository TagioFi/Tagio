import { useEffect } from 'react'
import * as THREE from 'three'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js'
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js'
import siteHtml from '../home.html?raw'

const ASSET_BASE = 'https://api.getlayers.ai/storage/v1/object/public/public/assets/dringle-84f8aed374'

export default function Home() {
  useEffect(() => {
    // home uses the vw-based rem scale defined in index.css
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
              s.textContent = c === ' ' ? '\u00A0' : c
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
          counter.style.bottom = `calc(${p} * (100dvh - 1.25rem - 4rem) + 0.625rem)`
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

    /* ---------- WebGL scene ---------- */
    const STAR_AXIS = new THREE.Vector3(0.42, 0.91, 0).normalize()
    const TARGET_SIZE = 6.6
    const pointer = { x: 0, y: 0 }
    addWin('mousemove', (ev) => { pointer.x = (ev.clientX / window.innerWidth) * 2 - 1; pointer.y = (ev.clientY / window.innerHeight) * 2 - 1 })

    let renderer = null, canvasEl = null
    function buildScene(panelEl) {
      if (!panelEl) return
      const getW = () => panelEl.clientWidth, getH = () => panelEl.clientHeight
      let W = getW(), H = getH()
      if (W === 0 || H === 0) { if (alive) setTimeout(() => buildScene(panelEl), 120); return }

      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true })
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
      renderer.setSize(W, H)
      renderer.outputColorSpace = THREE.SRGBColorSpace
      renderer.toneMapping = THREE.ACESFilmicToneMapping
      renderer.toneMappingExposure = 1.1
      canvasEl = renderer.domElement
      panelEl.appendChild(canvasEl)

      const scene = new THREE.Scene()
      const camera = new THREE.PerspectiveCamera(35, W / H, 0.1, 100)
      camera.position.set(0, 0, 6)

      const pmrem = new THREE.PMREMGenerator(renderer)
      scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture

      scene.add(new THREE.AmbientLight(0xffffff, 0.3))
      const key = new THREE.DirectionalLight(0xffffff, 1.1); key.position.set(3, 4, 5); scene.add(key)
      const rim = new THREE.DirectionalLight(0xc8e860, 0.6); rim.position.set(-4, 1, -2); scene.add(rim)

      const group = new THREE.Group(); scene.add(group)
      let star = null

      const draco = new DRACOLoader()
      draco.setDecoderPath('https://www.gstatic.com/draco/versioned/decoders/1.5.7/')
      const loader = new GLTFLoader(); loader.setDRACOLoader(draco)

      loader.load(`${ASSET_BASE}/hands.glb`, (gltf) => {
        if (!alive) return
        const model = gltf.scene
        const chrome = new THREE.MeshStandardMaterial({ color: 0xeef1f6, metalness: 1, roughness: 0.08, envMapIntensity: 1.3 })
        model.traverse((o) => { if (o.isMesh) { o.material = chrome; if (o.name === 'Curve') star = o } })
        if (star) {
          const g = star.geometry.clone(); g.computeBoundingBox()
          const c = new THREE.Vector3(); g.boundingBox.getCenter(c)
          g.translate(-c.x, -c.y, -c.z); star.geometry = g
          const offset = c.clone().multiply(star.scale).applyQuaternion(star.quaternion)
          star.position.add(offset)
        }
        const pivot = new THREE.Group(); pivot.add(model)
        const box = new THREE.Box3().setFromObject(model)
        const size = new THREE.Vector3(); box.getSize(size)
        const center = new THREE.Vector3(); box.getCenter(center)
        model.position.sub(center)
        pivot.scale.setScalar(TARGET_SIZE / Math.max(size.x, size.y, size.z))
        group.add(pivot)
      })

      const clock = new THREE.Clock()
      const spinQ = new THREE.Quaternion()
      function animate() {
        if (!alive) return
        requestAnimationFrame(animate)
        if (document.hidden) return
        const dt = clock.getDelta()
        if (star) { spinQ.setFromAxisAngle(STAR_AXIS, dt * 0.6); star.quaternion.premultiply(spinQ) }
        group.rotation.y += (pointer.x * 0.2 - group.rotation.y) * 0.06
        group.rotation.x += (pointer.y * 0.12 - group.rotation.x) * 0.06
        renderer.render(scene, camera)
      }
      animate()

      addWin('resize', () => {
        W = getW(); H = getH(); if (W === 0 || H === 0) return
        camera.aspect = W / H; camera.updateProjectionMatrix(); renderer.setSize(W, H)
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
