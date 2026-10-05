import { useCallback, useEffect, useMemo, useRef } from 'react';
import toast from 'react-hot-toast';
import { LABELS } from '../constants/labels';
import { recordingChanged } from '../redux/callSession/callSessionSlice';
import { useAppDispatch, useAppSelector } from '../redux/hooks';
import { speechRecognizer, tidyTranscript, transcriptOf, type SpeechRecognizer } from '../utils/speech';

export interface VoiceTarget {
  /** The note's form key; Submit waits while it records. */
  key: string;
  maxLength: number;
  /** Live text while the rep speaks (replaces the note). */
  onText: (text: string) => void;
  /** The finished note; the caller runs the AI compliance check on it. */
  onDone: (text: string) => void;
}

export interface VoiceNote {
  supported: boolean;
  recordingKey: string | null;
  /** Starts recording into `target`, or stops when that note is already recording. */
  toggle: (target: VoiceTarget) => void;
}

const P = LABELS.postCall;
const ERRORS: Record<string, string> = {
  'not-allowed': P.voiceBlocked,
  'service-not-allowed': P.voiceBlocked,
  'audio-capture': P.voiceBlocked,
  'no-speech': P.voiceNoSpeech,
};

/** One voice note at a time for the whole assessment (browser speech recognition, US English). */
export const useVoiceNote = (): VoiceNote => {
  const dispatch = useAppDispatch();
  const recordingKey = useAppSelector((s) => s.callSession.recordingKey);
  const active = useRef<SpeechRecognizer | null>(null);
  const Recognizer = speechRecognizer();

  const toggle = useCallback(
    (target: VoiceTarget) => {
      if (!Recognizer) {
        toast.error(P.voiceUnsupported, { id: 'voice' });
        return;
      }
      if (active.current) {
        const same = recordingKey === target.key;
        active.current.stop();
        if (same) return;
      }
      const rec = new Recognizer();
      rec.lang = 'en-US';
      rec.continuous = true;
      rec.interimResults = true;
      let final = '';
      let text = '';
      target.onText('');
      rec.onresult = (event) => {
        const next = transcriptOf(event, final);
        final = next.final;
        text = tidyTranscript(next.text, target.maxLength);
        target.onText(text);
      };
      rec.onerror = (event) => {
        if (event.error === 'aborted') return;
        toast.error(ERRORS[event.error] ?? P.voiceFailed, { id: 'voice' });
      };
      rec.onend = () => {
        if (active.current === rec) active.current = null;
        dispatch(recordingChanged(null));
        target.onDone(text);
      };
      active.current = rec;
      dispatch(recordingChanged(target.key));
      try {
        rec.start();
      } catch {
        active.current = null;
        dispatch(recordingChanged(null));
        toast.error(P.voiceFailed, { id: 'voice' });
      }
    },
    [Recognizer, dispatch, recordingKey],
  );

  // Leaving the assessment stops the microphone.
  useEffect(
    () => () => {
      const rec = active.current;
      if (!rec) return;
      rec.onend = null;
      rec.abort();
      active.current = null;
      dispatch(recordingChanged(null));
    },
    [dispatch],
  );

  const supported = Boolean(Recognizer);
  return useMemo(() => ({ supported, recordingKey, toggle }), [recordingKey, supported, toggle]);
};
