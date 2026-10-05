/**
 * Browser speech-to-text (Web Speech API). Microsoft Edge and Google Chrome
 * expose it as `SpeechRecognition` / `webkitSpeechRecognition`; the browser's
 * own speech service turns the rep's voice into text, then the note goes
 * through the AI compliance check like a typed note.
 */

export interface SpeechAlternative {
  transcript: string;
}

export interface SpeechResult {
  readonly isFinal: boolean;
  readonly length: number;
  [index: number]: SpeechAlternative;
}

export interface SpeechResultEvent {
  readonly resultIndex: number;
  readonly results: { readonly length: number; [index: number]: SpeechResult };
}

export interface SpeechErrorEvent {
  readonly error: string;
}

export interface SpeechRecognizer {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onresult: ((event: SpeechResultEvent) => void) | null;
  onerror: ((event: SpeechErrorEvent) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
  abort: () => void;
}

type RecognizerCtor = new () => SpeechRecognizer;

export const speechRecognizer = (): RecognizerCtor | null => {
  if (typeof window === 'undefined') return null;
  const w = window as unknown as { SpeechRecognition?: RecognizerCtor; webkitSpeechRecognition?: RecognizerCtor };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
};

/** Final results so far, plus the words still being recognised. */
export const transcriptOf = (event: SpeechResultEvent, finalSoFar: string): { final: string; text: string } => {
  let final = finalSoFar;
  let interim = '';
  for (let i = event.resultIndex; i < event.results.length; i += 1) {
    const result = event.results[i];
    const words = result?.[0]?.transcript ?? '';
    if (result?.isFinal) final += `${words} `;
    else interim += words;
  }
  return { final, text: `${final}${interim}` };
};

/** Turns raw speech into a note: single spaces, first letter capitalised, cut to the field limit. */
export const tidyTranscript = (text: string, maxLength: number): string => {
  const clean = text.replace(/\s+/g, ' ').trim();
  const cased = clean ? clean.charAt(0).toUpperCase() + clean.slice(1) : '';
  return cased.length > maxLength ? cased.slice(0, maxLength).trimEnd() : cased;
};
