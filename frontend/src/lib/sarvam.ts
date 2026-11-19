import { api } from '../api/client'
import { canSpeak, speak, stopSpeaking } from './speech'

/** Indian-language speech and translation through the MedCord backend (Sarvam AI). The key never reaches the browser. */

export async function translateText(text: string, target: string, source?: string): Promise<string> {
  const { data } = await api.post<{ text: string }>('/ai/translate', { text, target, source })
  return data.text
}

let player: HTMLAudioElement | null = null
export function stopAudio() { player?.pause(); player = null; stopSpeaking() }

/** Reads text aloud in a natural Indian-language voice. Falls back to the browser's voice if the service is unavailable. */
export async function speakSmart(text: string, lang: string): Promise<void> {
  stopAudio()
  try {
    const { data } = await api.post<Blob>('/ai/text-to-speech', { text, language: lang }, { responseType: 'blob' })
    const url = URL.createObjectURL(data)
    player = new Audio(url)
    player.onended = () => URL.revokeObjectURL(url)
    await player.play()
  } catch {
    if (canSpeak()) speak(text, lang)
  }
}

export const canRecord = () => typeof navigator !== 'undefined' && !!navigator.mediaDevices?.getUserMedia && typeof MediaRecorder !== 'undefined'

export interface Recording { stop: () => Promise<Blob> }

export async function startRecording(): Promise<Recording> {
  const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
  const rec = new MediaRecorder(stream)
  const chunks: Blob[] = []
  rec.ondataavailable = (e) => { if (e.data.size) chunks.push(e.data) }
  rec.start()
  return {
    stop: () => new Promise<Blob>((resolve) => {
      rec.onstop = () => { stream.getTracks().forEach((t) => t.stop()); resolve(new Blob(chunks, { type: rec.mimeType || 'audio/webm' })) }
      if (rec.state !== 'inactive') rec.stop(); else resolve(new Blob(chunks))
    }),
  }
}

export async function transcribe(blob: Blob, lang: string): Promise<string> {
  const form = new FormData()
  form.append('audio', blob, blob.type.includes('ogg') ? 'speech.ogg' : blob.type.includes('mp4') ? 'speech.mp4' : 'speech.webm')
  const { data } = await api.post<{ text: string }>('/ai/speech-to-text', form, { params: { language: lang } })
  return data.text
}
