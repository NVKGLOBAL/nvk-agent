/**
 * NVK Agent — voice command path (Sprint 7 / slice 9, 2026-11-23).
 *
 * The voice path is a COMMAND path, not a transcription novelty: a
 * spoken command (the transcript from browser SpeechRecognition)
 * reaches the SAME pipeline as a typed one — the same tool contract,
 * the same permission gate, the same evidence store. The confirmation
 * is spoken back (browser SpeechSynthesis, free, the default — a
 * natural-voice TTS provider is a paid step for NvK's call, not
 * designed in here).
 *
 * The orb state trace is the sequence of orb states from the REAL
 * pipeline stage events (listening → thinking → planning →
 * executing → verifying → complete / blocked). Every state cites a
 * real stage event; a state with no event behind it is not a state.
 *
 * The caller (the UI) is responsible for the actual STT (listening)
 * and TTS (speaking) — this module is the command path between them.
 * It is deliberately free of any window/speechSynthesis dependency so
 * it is testable in Node.
 */
import { runPipeline, type PipelineOptions, type PipelineResult } from './pipeline';
import { orbStateForStageEvent, type OrbActivityState } from '../experience/orb/orb-state';

export interface VoiceCommandResult {
  /** The transcript that was handled. */
  transcript: string;
  /** The pipeline's answer (the same answer a typed command would get). */
  answer: string;
  /** The text to speak back via SpeechSynthesis (the confirmation). */
  speakText: string;
  /** The orb states from the real pipeline stage events, in order. */
  orbStates: OrbActivityState[];
  /** Whether the run was blocked (a denied permission / a kill switch). */
  blocked: boolean;
  /** The full pipeline result (stages, evidence, judge) for the caller. */
  pipeline: PipelineResult;
}

export async function handleVoiceCommand(
  transcript: string,
  options: PipelineOptions = {},
): Promise<VoiceCommandResult> {
  const text = transcript.trim();
  if (!text) {
    return {
      transcript,
      answer: 'I did not hear a command.',
      speakText: 'I did not hear a command.',
      orbStates: ['idle'],
      blocked: false,
      pipeline: await runPipeline(''),
    };
  }
  const pipeline = await runPipeline(text, options);
  const orbStates = pipeline.stages.map((event) => orbStateForStageEvent(event));
  const blocked = pipeline.blocked || orbStates.includes('blocked');
  // The spoken confirmation is the answer itself, shortened to the
  // first sentence when the answer is long — a spoken reply should be
  // brief. The full answer stays in `answer` for the screen.
  const firstSentence = pipeline.answer.split(/(?<=[.!?])\s+/)[0] ?? pipeline.answer;
  const speakText = blocked
    ? 'That needs your approval first. I have not run it.'
    : firstSentence;
  return {
    transcript: text,
    answer: pipeline.answer,
    speakText,
    orbStates,
    blocked,
    pipeline,
  };
}
