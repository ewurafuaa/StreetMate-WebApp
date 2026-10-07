// Hands the journey the rider picked on the planner screen over to the live
// journey screen. Route params are strings only, and a journey carries every
// stop of every leg, so it travels through this tiny in-memory store instead.

import type { Journey } from '@/utils/journey-planner';

let active: Journey | null = null;

export const setActiveJourney = (journey: Journey | null) => {
  active = journey;
};

export const getActiveJourney = () => active;

// The route the rider tapped on the planner, shown on the Trip Overview screen before they commit.
let preview: Journey | null = null;

export const setPreviewJourney = (journey: Journey | null) => {
  preview = journey;
};

export const getPreviewJourney = () => preview;