// src/lib/pipelines.ts — demo mode
import { DEMO_PIPELINE, DEMO_STAGES } from './mock-data';

export const PIPELINES_PATH = '/api/pipelines';

export type Pipeline = {
  id: string;
  name: string;
  isDefault: boolean;
  archivedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type PipelineStage = {
  id: string;
  pipelineId: string;
  name: string;
  position: number;
  isClosedWon: boolean;
  isClosedLost: boolean;
  archivedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

const DEMO_PIPELINE_FULL: Pipeline = {
  ...DEMO_PIPELINE,
  createdAt: '2024-01-01T00:00:00.000Z',
  updatedAt: '2024-01-01T00:00:00.000Z',
};

const DEMO_STAGES_FULL: PipelineStage[] = DEMO_STAGES.map(s => ({
  ...s,
  createdAt: '2024-01-01T00:00:00.000Z',
  updatedAt: '2024-01-01T00:00:00.000Z',
}));

export function listPipelines(_token: string): Promise<Pipeline[]> {
  return Promise.resolve([DEMO_PIPELINE_FULL]);
}

export function listPipelineStages(_token: string, _pipelineId: string): Promise<PipelineStage[]> {
  return Promise.resolve(DEMO_STAGES_FULL);
}
