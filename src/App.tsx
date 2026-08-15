import { useEffect, useMemo, useRef, useState } from 'react'
import {
  ASPECT_PRESETS,
  MOTION_STYLES,
  type AspectRatio,
  type MotionStyle,
} from './lib/aspect'
import { estimateWords, formatDuration, splitIntoScenes } from './lib/script'
import { THEMES } from './lib/themes'
import {
  blobToBase64,
  createCaptionOverlay,
  estimateScriptMinutes,
  generateSceneImage,
  generateScriptFromTopic,
  IMAGE_STYLES,
  sceneCountForMinutes,
  TARGET_MINUTE_OPTIONS,
  wordTargetForMinutes,
  type ImageStyle,
} from './lib/textToVideo'
import {
  concatAudioBlobs,
  fetchVoices,
  previewSampleText,
  synthesizeSpeech,
  synthesizeSpeechBatch,
  type VoiceInfo,
} from './lib/tts'
import { loadImageFromFile, renderVideo } from './lib/videoRenderer'
import './App.css'

type SceneMedia = {
  imageFile?: File | null
  imageUrl?: string | null
  imageEl?: HTMLImageElement | null
  blob?: Blob | null
  aiGenerated?: boolean
  source?: 'remote' | 'local'
}

type ScriptMode = 'mine' | 'ai'

const SAMPLE = `Welcome to ReelForge — text to video for YouTube and social.

Switch between 16:9 for YouTube and 9:16 for Shorts, Reels, and TikTok.

Write your story in plain English. Blank lines create new scenes with motion and captions.

Then pick a voice, generate visuals, and export a longer multi-minute video.`

function App() {
  const [scriptMode, setScriptMode] = useState<ScriptMode>('mine')
  const [title, setTitle] = useState('My YouTube Video')
  const [script, setScript] = useState(SAMPLE)
  const [topic, setTopic] = useState('How AI is changing YouTube content creation in 2026')
  const [targetMinutes, setTargetMinutes] = useState(1)
  const [sceneCount, setSceneCount] = useState(() => sceneCountForMinutes(1))
  const [imageStyle, setImageStyle] = useState<ImageStyle>('cinematic')
  const [aspect, setAspect] = useState<AspectRatio>('16:9')
  const [captionsEnabled, setCaptionsEnabled] = useState(true)
  const [motion, setMotion] = useState<MotionStyle>('kenburns')
  const [preferFfmpeg, setPreferFfmpeg] = useState(true)
  const [ffmpegReady, setFfmpegReady] = useState(false)
  const [voice, setVoice] = useState('en-US-JennyNeural')
  const [featured, setFeatured] = useState<VoiceInfo[]>([])
  const [allVoices, setAllVoices] = useState<VoiceInfo[]>([])
  const [themeId, setThemeId] = useState(THEMES[0].id)
  const [status, setStatus] = useState('')
  const [busy, setBusy] = useState(false)
  const [progress, setProgress] = useState(0)
  const [audioUrl, setAudioUrl] = useState<string | null>(null)
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null)
  const [duration, setDuration] = useState(0)
  const [sceneDurations, setSceneDurations] = useState<number[]>([])
  const [videoUrl, setVideoUrl] = useState<string | null>(null)
  const [videoExt, setVideoExt] = useState<'webm' | 'mp4'>('webm')
  const [sceneMedia, setSceneMedia] = useState<Record<string, SceneMedia>>({})
  const [voicePreviewUrl, setVoicePreviewUrl] = useState<string | null>(null)
  const [previewingVoice, setPreviewingVoice] = useState(false)
  const previewRef = useRef<HTMLVideoElement>(null)
  const voicePreviewRef = useRef<HTMLAudioElement>(null)
  const audioUrlRef = useRef<string | null>(null)
  const videoUrlRef = useRef<string | null>(null)
  const voicePreviewUrlRef = useRef<string | null>(null)

  const scenes = useMemo(() => splitIntoScenes(script), [script])
  const theme = THEMES.find((t) => t.id === themeId) ?? THEMES[0]
  const preset = ASPECT_PRESETS[aspect]
  const englishVoices = useMemo(
    () => allVoices.filter((v) => v.locale.startsWith('en-')),
    [allVoices],
  )
  const aiImageCount = scenes.filter((s) => sceneMedia[s.id]?.imageEl).length
  const remoteImageCount = scenes.filter((s) => sceneMedia[s.id]?.source === 'remote').length
  const scriptMinutesEstimate = estimateScriptMinutes(script)
  const scriptWordCount = estimateWords(script)
  const longFormHint = targetMinutes >= 3 || scriptMinutesEstimate >= 3

  function onTargetMinutesChange(minutes: number) {
    setTargetMinutes(minutes)
    setSceneCount(sceneCountForMinutes(minutes))
  }

  useEffect(() => {
    fetchVoices()
      .then((data) => {
        setFeatured(data.featured)
        setAllVoices(data.voices)
      })
      .catch(() => setStatus('Voice server offline — run npm run dev'))

    fetch('/api/health')
      .then((r) => r.json())
      .then((data) => setFfmpegReady(Boolean(data.ffmpeg)))
      .catch(() => setFfmpegReady(false))
  }, [])

  useEffect(() => {
    audioUrlRef.current = audioUrl
  }, [audioUrl])

  useEffect(() => {
    videoUrlRef.current = videoUrl
  }, [videoUrl])

  useEffect(() => {
    voicePreviewUrlRef.current = voicePreviewUrl
  }, [voicePreviewUrl])

  useEffect(() => {
    return () => {
      if (audioUrlRef.current) URL.revokeObjectURL(audioUrlRef.current)
      if (videoUrlRef.current) URL.revokeObjectURL(videoUrlRef.current)
      if (voicePreviewUrlRef.current) URL.revokeObjectURL(voicePreviewUrlRef.current)
    }
  }, [])

  function replaceAudio(url: string, blob: Blob, nextDuration: number, durations: number[]) {
    if (audioUrlRef.current) URL.revokeObjectURL(audioUrlRef.current)
    setAudioUrl(url)
    setAudioBlob(blob)
    setDuration(nextDuration)
    setSceneDurations(durations)
  }

  function replaceVideo(url: string, ext: 'webm' | 'mp4') {
    if (videoUrlRef.current) URL.revokeObjectURL(videoUrlRef.current)
    setVideoUrl(url)
    setVideoExt(ext)
  }

  async function buildVoiceForScenes(
    nextScenes: ReturnType<typeof splitIntoScenes>,
    onStep?: (label: string, ratio: number) => void,
  ) {
    onStep?.(`Speaking ${nextScenes.length} scenes in parallel…`, 0.2)
    try {
      const batch = await synthesizeSpeechBatch({
        texts: nextScenes.map((s) => s.text),
        voice,
      })
      const durations =
        batch.durations.length === nextScenes.length
          ? batch.durations
          : nextScenes.map(() => Math.max(batch.duration / nextScenes.length, 1.2))
      replaceAudio(batch.url, batch.blob, batch.duration, durations)
      onStep?.('Voice merged', 1)
      return { merged: batch, durations }
    } catch {
      const parts: Blob[] = []
      const durations: number[] = []
      const concurrency = 3
      let done = 0
      const results = new Array<{ blob: Blob; duration: number }>(nextScenes.length)
      await Promise.all(
        Array.from({ length: Math.min(concurrency, nextScenes.length) }, async (_, worker) => {
          for (let i = worker; i < nextScenes.length; i += concurrency) {
            const result = await synthesizeSpeech({
              text: nextScenes[i].text,
              voice,
            })
            results[i] = { blob: result.blob, duration: Math.max(result.duration, 1.2) }
            URL.revokeObjectURL(result.url)
            done += 1
            onStep?.(
              `Speaking scene ${done} of ${nextScenes.length}…`,
              done / nextScenes.length,
            )
          }
        }),
      )
      for (const row of results) {
        parts.push(row.blob)
        durations.push(row.duration)
      }
      onStep?.('Merging audio…', 0.92)
      const merged = await concatAudioBlobs(parts)
      replaceAudio(merged.url, merged.blob, merged.duration, durations)
      return { merged, durations }
    }
  }

  async function buildAiImagesForScenes(
    nextScenes: ReturnType<typeof splitIntoScenes>,
    topicHint: string,
    onStep?: (label: string, ratio: number) => void,
  ) {
    const nextMedia: Record<string, SceneMedia> = { ...sceneMedia }
    let remote = 0
    let local = 0
    let done = 0
    const concurrency = 2
    await Promise.all(
      Array.from({ length: Math.min(concurrency, nextScenes.length) }, async (_, worker) => {
        for (let i = worker; i < nextScenes.length; i += concurrency) {
          const scene = nextScenes[i]
          const image = await generateSceneImage({
            sceneText: scene.text,
            style: imageStyle,
            topic: topicHint,
            index: i,
            allowLocalFallback: true,
            aspect,
          })
          if (nextMedia[scene.id]?.imageUrl) URL.revokeObjectURL(nextMedia[scene.id].imageUrl!)
          nextMedia[scene.id] = {
            imageFile: null,
            imageUrl: image.url,
            imageEl: image.imageEl,
            blob: image.blob,
            aiGenerated: true,
            source: image.source,
          }
          if (image.source === 'remote') remote += 1
          else local += 1
          done += 1
          setSceneMedia({ ...nextMedia })
          onStep?.(
            image.source === 'remote'
              ? `AI frame ${done} of ${nextScenes.length} ready`
              : `Local frame ${done} of ${nextScenes.length}…`,
            done / nextScenes.length,
          )
        }
      }),
    )
    setSceneMedia(nextMedia)
    onStep?.(
      remote === nextScenes.length
        ? `All ${remote} frames from AI`
        : `${remote} AI + ${local} local stylized frames`,
      1,
    )
    return nextMedia
  }

  async function renderWithFfmpeg(
    nextScenes: ReturnType<typeof splitIntoScenes>,
    durations: number[],
    media: Record<string, SceneMedia>,
    voiceBlob: Blob,
    videoTitle: string,
  ) {
    setStatus('Rendering MP4 with FFmpeg (Ken Burns + captions)…')
    const scenesPayload = await Promise.all(
      nextScenes.map(async (scene, i) => {
        const item = media[scene.id]
        let imageBase64: string | undefined
        let mimeType: string | undefined
        if (item?.blob) {
          imageBase64 = await blobToBase64(item.blob)
          mimeType = item.blob.type || 'image/jpeg'
        } else if (item?.imageUrl) {
          const res = await fetch(item.imageUrl)
          const blob = await res.blob()
          imageBase64 = await blobToBase64(blob)
          mimeType = blob.type || 'image/jpeg'
        }
        const captionBase64 =
          captionsEnabled
            ? await blobToBase64(
                await createCaptionOverlay({
                  text: scene.text,
                  width: preset.width,
                  height: preset.height,
                  captionColor: theme.captionColor,
                  captionBg: theme.captionBg,
                }),
              )
            : undefined
        return {
          text: scene.text,
          duration: durations[i] ?? 3,
          imageBase64,
          mimeType,
          captionBase64,
        }
      }),
    )

    const audioBase64 = await blobToBase64(voiceBlob)
    const res = await fetch('/api/render-video', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: videoTitle,
        aspect,
        captions: captionsEnabled,
        motion,
        scenes: scenesPayload,
        audioBase64,
        audioMimeType: voiceBlob.type || 'audio/wav',
        theme: {
          colors: theme.colors,
          captionColor: theme.captionColor,
          captionBg: theme.captionBg,
        },
      }),
    })
    const data = await res.json()
    if (!res.ok) throw new Error(data.error || 'FFmpeg render failed')

    const binary = atob(data.videoBase64 as string)
    const bytes = new Uint8Array(binary.length)
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
    const blob = new Blob([bytes], { type: data.mimeType || 'video/mp4' })
    replaceVideo(URL.createObjectURL(blob), 'mp4')
  }

  async function renderInBrowser(
    nextScenes: ReturnType<typeof splitIntoScenes>,
    durations: number[],
    media: Record<string, SceneMedia>,
    voiceUrl: string,
    videoTitle: string,
  ) {
    const renderScenes = nextScenes.map((scene, i) => ({
      text: scene.text,
      duration: durations[i] ?? 3,
      image: media[scene.id]?.imageEl ?? null,
    }))
    const blob = await renderVideo({
      scenes: renderScenes,
      theme,
      audioUrl: voiceUrl,
      title: videoTitle,
      width: preset.width,
      height: preset.height,
      captions: captionsEnabled,
      motion,
      onProgress: setProgress,
    })
    replaceVideo(URL.createObjectURL(blob), 'webm')
  }

  async function renderFromState(
    nextScenes: ReturnType<typeof splitIntoScenes>,
    durations: number[],
    media: Record<string, SceneMedia>,
    voiceUrl: string,
    voiceBlob: Blob,
    videoTitle: string,
  ) {
    const useFfmpeg = preferFfmpeg && ffmpegReady
    if (useFfmpeg) {
      await renderWithFfmpeg(nextScenes, durations, media, voiceBlob, videoTitle)
    } else {
      if (longFormHint && !ffmpegReady) {
        setStatus(
          'Rendering in browser (real-time). For multi-minute MP4s install FFmpeg: brew install ffmpeg',
        )
      }
      await renderInBrowser(nextScenes, durations, media, voiceUrl, videoTitle)
    }
  }

  async function previewVoice() {
    const sample = previewSampleText(scenes[0]?.text || title || topic)
    setPreviewingVoice(true)
    setStatus(`Previewing ${voice}…`)
    try {
      const result = await synthesizeSpeech({ text: sample, voice })
      if (voicePreviewUrlRef.current) URL.revokeObjectURL(voicePreviewUrlRef.current)
      setVoicePreviewUrl(result.url)
      setStatus(`Voice preview ready · ${voice}`)
      requestAnimationFrame(() => {
        const el = voicePreviewRef.current
        if (!el) return
        el.currentTime = 0
        void el.play()
      })
    } catch (err) {
      setStatus(err instanceof Error ? err.message : 'Voice preview failed')
    } finally {
      setPreviewingVoice(false)
    }
  }

  async function generateVoice() {
    if (!scenes.length) {
      setStatus('Add a script first.')
      return
    }
    setBusy(true)
    setProgress(0)
    setStatus('Generating neural voiceover…')
    try {
      const { merged } = await buildVoiceForScenes(scenes, (label, ratio) => {
        setStatus(label)
        setProgress(ratio)
      })
      setProgress(1)
      setStatus(`Voice ready · ${formatDuration(merged.duration)}`)
    } catch (err) {
      setStatus(err instanceof Error ? err.message : 'Voice generation failed')
    } finally {
      setBusy(false)
    }
  }

  async function generateAiScenes() {
    if (!scenes.length) {
      setStatus('Add a script first.')
      return
    }
    setBusy(true)
    setProgress(0)
    try {
      const media = await buildAiImagesForScenes(scenes, topic || title, (label, ratio) => {
        setStatus(label)
        setProgress(ratio)
      })
      const ready = scenes.filter((s) => media[s.id]?.imageEl).length
      const remote = scenes.filter((s) => media[s.id]?.source === 'remote').length
      setProgress(1)
      setStatus(
        remote === ready
          ? `AI visuals ready for ${ready} scenes (${aspect})`
          : `Frames ready: ${remote} AI + ${ready - remote} local stylized (${aspect})`,
      )
    } catch (err) {
      setStatus(err instanceof Error ? err.message : 'AI image generation failed')
    } finally {
      setBusy(false)
    }
  }

  async function generateVideo() {
    if (!audioUrl || !audioBlob || !sceneDurations.length) {
      setStatus('Generate a voiceover first.')
      return
    }
    setBusy(true)
    setProgress(0)
    setStatus(
      preferFfmpeg && ffmpegReady
        ? 'Rendering MP4…'
        : 'Rendering video — keep this tab open…',
    )
    try {
      await renderFromState(scenes, sceneDurations, sceneMedia, audioUrl, audioBlob, title)
      setStatus('Video ready — download for YouTube or social')
      setProgress(1)
    } catch (err) {
      setStatus(err instanceof Error ? err.message : 'Video render failed')
    } finally {
      setBusy(false)
    }
  }

  async function runFullVideoPipeline(
    nextScenes: ReturnType<typeof splitIntoScenes>,
    videoTitle: string,
    imageTopicHint: string,
    progressOffset = 0,
    progressScale = 1,
  ) {
    if (!nextScenes.length) throw new Error('Add at least one scene to your script.')

    setStatus('Generating AI frames for your script…')
    const media = await buildAiImagesForScenes(nextScenes, imageTopicHint, (label, ratio) => {
      setStatus(label)
      setProgress(progressOffset + ratio * 0.42 * progressScale)
    })

    const { merged, durations } = await buildVoiceForScenes(nextScenes, (label, ratio) => {
      setStatus(label)
      setProgress(progressOffset + (0.42 + ratio * 0.25) * progressScale)
    })

    setStatus(
      preferFfmpeg && ffmpegReady
        ? 'Assembling MP4 with motion + captions…'
        : 'Rendering video — keep this tab open…',
    )
    setProgress(progressOffset + 0.78 * progressScale)
    await renderFromState(nextScenes, durations, media, merged.url, merged.blob, videoTitle)
    setProgress(progressOffset + progressScale)
    setStatus(
      `Video ready · ${formatDuration(merged.duration)} · ${nextScenes.length} scenes · ${aspect}`,
    )
  }

  async function generateVideoFromMyScript() {
    if (!scenes.length) {
      setStatus('Write or paste your script first.')
      return
    }
    setBusy(true)
    setProgress(0)
    try {
      await runFullVideoPipeline(scenes, title, title.trim() || topic.trim() || 'video')
    } catch (err) {
      setStatus(err instanceof Error ? err.message : 'Video from script failed')
    } finally {
      setBusy(false)
    }
  }

  async function generateTextToVideoFromTopic() {
    const idea = topic.trim()
    if (!idea) {
      setStatus('Enter a topic or prompt first.')
      return
    }

    setBusy(true)
    setProgress(0)
    try {
      setStatus('Writing script from your topic…')
      setProgress(0.05)
      const generated = await generateScriptFromTopic(idea, {
        sceneCount,
        targetMinutes,
      })
      setTitle(generated.title)
      setScript(generated.script)
      const nextScenes = splitIntoScenes(generated.script)
      if (!nextScenes.length) throw new Error('Script generation returned no scenes')

      setStatus(
        generated.source === 'ai'
          ? `Script ready (~${targetMinutes} min) — generating frames…`
          : `Local script template (~${targetMinutes} min) — generating frames…`,
      )
      await runFullVideoPipeline(nextScenes, generated.title, idea, 0.08, 0.92)
    } catch (err) {
      setStatus(err instanceof Error ? err.message : 'Text-to-video failed')
    } finally {
      setBusy(false)
    }
  }

  async function writeScriptOnly() {
    const idea = topic.trim()
    if (!idea) {
      setStatus('Enter a topic first.')
      return
    }
    setBusy(true)
    setProgress(0.2)
    setStatus('Writing script…')
    try {
      const generated = await generateScriptFromTopic(idea, {
        sceneCount,
        targetMinutes,
      })
      setTitle(generated.title)
      setScript(generated.script)
      setProgress(1)
      setStatus(
        generated.source === 'ai'
          ? `Script ready (~${targetMinutes} min / ~${wordTargetForMinutes(targetMinutes)} words) — edit, then generate`
          : `Local script template (~${targetMinutes} min) — edit or run text-to-video`,
      )
    } catch (err) {
      setStatus(err instanceof Error ? err.message : 'Script generation failed')
    } finally {
      setBusy(false)
    }
  }

  async function onSceneImage(sceneId: string, file: File | null) {
    if (!file) {
      setSceneMedia((prev) => {
        if (prev[sceneId]?.imageUrl) URL.revokeObjectURL(prev[sceneId].imageUrl!)
        return {
          ...prev,
          [sceneId]: {
            imageFile: null,
            imageUrl: null,
            imageEl: null,
            blob: null,
            aiGenerated: false,
          },
        }
      })
      return
    }
    const imageEl = await loadImageFromFile(file)
    const imageUrl = URL.createObjectURL(file)
    setSceneMedia((prev) => {
      if (prev[sceneId]?.imageUrl) URL.revokeObjectURL(prev[sceneId].imageUrl!)
      return {
        ...prev,
        [sceneId]: {
          imageFile: file,
          imageUrl,
          imageEl,
          blob: file,
          aiGenerated: false,
        },
      }
    })
  }

  function download(blob: Blob | null, filename: string) {
    if (!blob) return
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = filename
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="app">
      <div className="atmosphere" aria-hidden="true" />
      <nav className="topbar">
        <div className="logo-lockup">
          <span className="logo-mark" aria-hidden="true" />
          <strong>ReelForge</strong>
        </div>
        <div className="top-chips">
          <span className="chip">{aspect}</span>
          <span className="chip">{captionsEnabled ? 'Captions on' : 'Captions off'}</span>
          <span className={`chip ${ffmpegReady ? 'live' : ''}`}>
            {ffmpegReady ? 'Studio ready' : 'Browser render'}
          </span>
        </div>
      </nav>
      <header className="hero">
        <p className="eyebrow">AI video studio</p>
        <h1 className="brand">
          Turn any idea into
          <em> cinematic video</em>
        </h1>
        <p className="tagline">
          Script, voice, motion, and captions in one workspace — {aspect} for YouTube or social,
          up to 12 minutes.
        </p>
      </header>

      <main className="workspace">
        <section className="panel format-panel">
          <div className="panel-head">
            <h2>Format</h2>
            <span>{preset.platform}</span>
          </div>

          <div className="aspect-toggle" role="group" aria-label="Aspect ratio">
            {(['16:9', '9:16'] as AspectRatio[]).map((id) => (
              <button
                key={id}
                type="button"
                className={`aspect-btn ${aspect === id ? 'active' : ''}`}
                onClick={() => setAspect(id)}
              >
                <span className={`aspect-frame ratio-${id === '16:9' ? 'wide' : 'tall'}`} />
                <strong>{ASPECT_PRESETS[id].label}</strong>
                <em>{ASPECT_PRESETS[id].name}</em>
              </button>
            ))}
          </div>

          <div className="ttv-controls">
            <label className="field compact">
              <span>Motion</span>
              <select
                value={motion}
                onChange={(e) => setMotion(e.target.value as MotionStyle)}
              >
                {MOTION_STYLES.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="check-field">
              <input
                type="checkbox"
                checked={captionsEnabled}
                onChange={(e) => setCaptionsEnabled(e.target.checked)}
              />
              <span>Burn-in captions</span>
            </label>
            <label className="check-field">
              <input
                type="checkbox"
                checked={preferFfmpeg}
                onChange={(e) => setPreferFfmpeg(e.target.checked)}
                disabled={!ffmpegReady}
              />
              <span>
                FFmpeg MP4 {ffmpegReady ? '(ready — best for long videos)' : '(install ffmpeg)'}
              </span>
            </label>
          </div>
          <p className="hint">
            {MOTION_STYLES.find((m) => m.id === motion)?.hint}. Pure generative video models top
            out at seconds; ReelForge scenes + TTS scale to minutes.
          </p>
        </section>

        <section className="panel script-source-panel">
          <div className="panel-head">
            <h2>Script &amp; text-to-video</h2>
            <span>{scenes.length} scenes · blank lines split scenes</span>
          </div>

          <div className="mode-tabs" role="tablist" aria-label="Script source">
            <button
              type="button"
              role="tab"
              aria-selected={scriptMode === 'mine'}
              className={`mode-tab ${scriptMode === 'mine' ? 'active' : ''}`}
              onClick={() => setScriptMode('mine')}
            >
              My script
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={scriptMode === 'ai'}
              className={`mode-tab ${scriptMode === 'ai' ? 'active' : ''}`}
              onClick={() => setScriptMode('ai')}
            >
              AI script
            </button>
          </div>

          {scriptMode === 'ai' ? (
            <>
              <label className="field">
                <span>Topic or prompt</span>
                <textarea
                  value={topic}
                  onChange={(e) => setTopic(e.target.value)}
                  rows={3}
                  placeholder="e.g. 5 morning habits that double your focus"
                />
              </label>
              <div className="ttv-controls">
                <label className="field compact">
                  <span>Target length</span>
                  <select
                    value={targetMinutes}
                    onChange={(e) => onTargetMinutesChange(Number(e.target.value))}
                  >
                    {TARGET_MINUTE_OPTIONS.map((opt) => (
                      <option key={opt.value} value={opt.value}>
                        {opt.label}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="field compact">
                  <span>Scenes (auto from length)</span>
                  <select
                    value={sceneCount}
                    onChange={(e) => setSceneCount(Number(e.target.value))}
                  >
                    {Array.from({ length: 38 }, (_, i) => i + 3).map((n) => (
                      <option key={n} value={n}>
                        {n}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="field compact">
                  <span>AI visual style</span>
                  <select
                    value={imageStyle}
                    onChange={(e) => setImageStyle(e.target.value as ImageStyle)}
                  >
                    {IMAGE_STYLES.map((style) => (
                      <option key={style.id} value={style.id}>
                        {style.name}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              <p className="hint">
                Target ~{targetMinutes} min · ~{wordTargetForMinutes(targetMinutes)} words ·{' '}
                {sceneCount} scenes · {aspect}. Use FFmpeg for 5–12 minute exports.
              </p>
            </>
          ) : (
            <>
              <div className="ttv-controls">
                <label className="field compact">
                  <span>AI visual style</span>
                  <select
                    value={imageStyle}
                    onChange={(e) => setImageStyle(e.target.value as ImageStyle)}
                  >
                    {IMAGE_STYLES.map((style) => (
                      <option key={style.id} value={style.id}>
                        {style.name}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              <p className="hint">
                Current script ≈ {scriptWordCount} words · ~{scriptMinutesEstimate.toFixed(1)} min
                spoken · {aspect}.
              </p>
            </>
          )}

          <label className="field">
            <span>Video title</span>
            <input value={title} onChange={(e) => setTitle(e.target.value)} />
          </label>
          <label className="field">
            <span>Narration script</span>
            <textarea
              value={script}
              onChange={(e) => setScript(e.target.value)}
              rows={12}
              placeholder={
                scriptMode === 'mine'
                  ? 'Paste or write your script. Separate scenes with a blank line.'
                  : 'Generated script appears here — edit before voice or video steps.'
              }
            />
          </label>

          {scriptMode === 'mine' ? (
            <>
              <p className="hint">
                Your script is never changed unless you switch to AI script. One click runs
                frames → voice → captioned motion video.
              </p>
              <div className="actions">
                <button
                  className="btn primary"
                  disabled={busy || !scenes.length}
                  onClick={generateVideoFromMyScript}
                >
                  Generate video from my script
                </button>
                <button
                  className="btn ghost"
                  disabled={busy || !scenes.length}
                  onClick={generateAiScenes}
                >
                  Generate AI scenes
                </button>
              </div>
            </>
          ) : (
            <>
              <p className="hint">
                AI writes a script sized to your target length. Edit, then generate — or one-click
                text-to-video. If the free image API is busy, local frames keep going.
              </p>
              <div className="actions">
                <button className="btn ghost" disabled={busy} onClick={writeScriptOnly}>
                  Generate AI script
                </button>
                <button
                  className="btn primary"
                  disabled={busy}
                  onClick={generateTextToVideoFromTopic}
                >
                  Generate text to video from topic
                </button>
                <button
                  className="btn ghost"
                  disabled={busy || !scenes.length}
                  onClick={generateAiScenes}
                >
                  Generate AI scenes
                </button>
              </div>
            </>
          )}
        </section>

        <section className="panel voice-panel">
          <div className="panel-head">
            <h2>Voice</h2>
            <span>Edge TTS · free · open</span>
          </div>
          <label className="field">
            <span>Voice</span>
            <select
              value={voice}
              onChange={(e) => {
                setVoice(e.target.value)
                if (voicePreviewUrlRef.current) URL.revokeObjectURL(voicePreviewUrlRef.current)
                setVoicePreviewUrl(null)
              }}
            >
              <optgroup label="Featured">
                {(featured.length ? featured : englishVoices.slice(0, 8)).map((v) => (
                  <option key={v.shortName} value={v.shortName}>
                    {v.shortName} ({v.gender})
                  </option>
                ))}
              </optgroup>
              <optgroup label="All English">
                {englishVoices.map((v) => (
                  <option key={`all-${v.shortName}`} value={v.shortName}>
                    {v.shortName} ({v.gender})
                  </option>
                ))}
              </optgroup>
            </select>
          </label>

          <p className="hint">
            Preview speaks the first lines of your script so you can pick a voice before the full
            render.
          </p>
          <div className="actions">
            <button
              className="btn ghost"
              disabled={previewingVoice || busy || !scenes.length}
              onClick={() => void previewVoice()}
            >
              {previewingVoice ? 'Previewing…' : 'Preview voice'}
            </button>
            <button className="btn primary" disabled={busy} onClick={generateVoice}>
              Generate voiceover
            </button>
            <button
              className="btn ghost"
              disabled={!audioBlob || busy}
              onClick={() =>
                download(
                  audioBlob,
                  `${slugify(title)}-voice.${audioBlob?.type.includes('wav') ? 'wav' : 'mp3'}`,
                )
              }
            >
              Download audio
            </button>
          </div>

          {voicePreviewUrl && (
            <div className="voice-preview">
              <span>Preview</span>
              <audio ref={voicePreviewRef} className="player" controls src={voicePreviewUrl} />
            </div>
          )}
          {audioUrl && (
            <div className="voice-preview">
              <span>Full voiceover</span>
              <audio className="player" controls src={audioUrl} />
            </div>
          )}
        </section>

        <section className="panel visual-panel">
          <div className="panel-head">
            <h2>Visuals</h2>
            <span>
              {aiImageCount}/{scenes.length} frames
              {remoteImageCount ? ` · ${remoteImageCount} AI` : ''}
              {aiImageCount - remoteImageCount > 0
                ? ` · ${aiImageCount - remoteImageCount} local`
                : ''}
            </span>
          </div>
          <div className="theme-grid">
            {THEMES.map((t) => (
              <button
                key={t.id}
                type="button"
                className={`theme-swatch ${themeId === t.id ? 'active' : ''}`}
                onClick={() => setThemeId(t.id)}
                style={{
                  background: `linear-gradient(135deg, ${t.colors[0]}, ${t.colors[2]})`,
                }}
              >
                {t.name}
              </button>
            ))}
          </div>

          <div className="scene-list">
            {scenes.map((scene, i) => (
              <article key={scene.id} className="scene-card">
                <header>
                  <strong>Scene {i + 1}</strong>
                  <span>
                    {sceneMedia[scene.id]?.source === 'remote'
                      ? 'AI'
                      : sceneMedia[scene.id]?.source === 'local'
                        ? 'Local'
                        : sceneDurations[i]
                          ? formatDuration(sceneDurations[i])
                          : '~auto'}
                  </span>
                </header>
                <p>{scene.text}</p>
                <label className="upload">
                  <span>
                    {sceneMedia[scene.id]?.imageEl ? 'Replace image' : 'Add image (optional)'}
                  </span>
                  <input
                    type="file"
                    accept="image/*"
                    onChange={(e) => void onSceneImage(scene.id, e.target.files?.[0] ?? null)}
                  />
                </label>
                {sceneMedia[scene.id]?.imageUrl && (
                  <img src={sceneMedia[scene.id].imageUrl!} alt="" className="thumb" />
                )}
              </article>
            ))}
          </div>

          <div className="actions">
            <button className="btn primary" disabled={busy || !audioUrl} onClick={generateVideo}>
              Generate video
            </button>
            <button
              className="btn ghost"
              disabled={!videoUrl || busy}
              onClick={() => {
                if (!videoUrl) return
                const a = document.createElement('a')
                a.href = videoUrl
                a.download = `${slugify(title)}.${videoExt}`
                a.click()
              }}
            >
              Download video ({videoExt})
            </button>
          </div>
        </section>

        <section className="panel preview-panel">
          <div className="panel-head">
            <h2>Preview</h2>
            <span>
              {duration ? formatDuration(duration) : '—'} · {aspect}
            </span>
          </div>
          <div className={`preview-stage aspect-${aspect === '9:16' ? 'vertical' : 'wide'}`}>
            {videoUrl ? (
              <video ref={previewRef} src={videoUrl} controls playsInline />
            ) : (
              <div
                className="preview-placeholder"
                style={{
                  background: `linear-gradient(135deg, ${theme.colors[0]}, ${theme.colors[2]})`,
                }}
              >
                <span>REELFORGE</span>
                <p>
                  {title || 'Your video preview appears here'} · {aspect}
                </p>
              </div>
            )}
          </div>

          {(busy || status) && (
            <div className="status-bar">
              <div className="progress">
                <div style={{ width: `${Math.round(progress * 100)}%` }} />
              </div>
              <p>{status}</p>
            </div>
          )}
        </section>
      </main>

      <footer className="footer">
        <strong>ReelForge</strong>
        <p>
          Local studio · Edge TTS · Flux frames · FFmpeg motion. Built for faceless YouTube,
          Shorts, and Reels.
        </p>
      </footer>
    </div>
  )
}

function slugify(value: string) {
  return (
    value
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-|-$)/g, '') || 'reelforge-video'
  )
}

export default App
