import React from 'react';
import { Composition } from 'remotion';
import { SkyLanes } from './SkyLanes';
import timeline from './timeline.json';
import { FPS, H, W } from './theme';

export const Root: React.FC = () => (
  <Composition id="SkyLanes" component={SkyLanes} durationInFrames={timeline.total} fps={FPS} width={W} height={H} />
);
