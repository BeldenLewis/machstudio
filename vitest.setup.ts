import "@testing-library/jest-dom/vitest";
import { vi } from "vitest";

// React Testing Library 16 still detects mocked timers through the Jest-compatible
// global. Point it at Vitest so its post-event microtask drain advances a 0ms fake
// timer instead of waiting forever. This keeps user-event and the autosave clock shared.
Object.assign(globalThis, { jest: vi });
