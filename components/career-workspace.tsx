'use client';

import { CareerWorkspaceView } from './workspace/career-workspace-view';
import { useCareerWorkspace } from './workspace/use-career-workspace';

export function CareerWorkspace() {
  return <CareerWorkspaceView controller={useCareerWorkspace()} />;
}
