// Single import point for the rest of the feature. Swapping backends
// (mock <-> real) happens here and nowhere else.

import { goalsApi as realGoalsApi } from "./goals.api.js";
import { mockGoalsApi } from "./goals.mock.js";

export const USE_MOCK_API = import.meta.env.VITE_USE_MOCK_API === "true";

export const goalsApi = USE_MOCK_API ? mockGoalsApi : realGoalsApi;
