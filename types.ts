
export enum AppState {
  IDLE,
  REQUESTING_PERMISSION,
  RECORDING_STORY,
  PROCESSING_STORY,
  PRESENTING_QUESTION,
  RECORDING_ANSWER,
  PROCESSING_ANSWER,
  SUMMARY,
  ERROR,
}

export interface QnAPair {
  question: string;
  answer: string;
}
