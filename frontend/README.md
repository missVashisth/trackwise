# Goal Tracker — Frontend

React 19 + Vite + Tailwind CSS v4 + React Router.

```bash
npm install
npm run dev      # http://localhost:5173
npm run build
```

## Four-layer architecture

Every feature lives in `src/features/<name>/` and is split into four layers.
Each layer only talks to the one below it, so any layer can be swapped or tested alone.

| Layer   | Folder        | Responsibility                                                     | Knows about        |
| ------- | ------------- | ------------------------------------------------------------------ | ------------------ |
| **UI**  | `components/`, `pages/` | Render props, raise events. No fetching, no business rules. | Hooks              |
| **Hooks** | `hooks/`    | Glue: call the API, dispatch to state, derive view data.            | API + State        |
| **State** | `state/`    | Reducer + context. Raw data and user preferences only.              | Nothing            |
| **API** | `api/`        | HTTP calls (or a mock adapter). Plain async functions.               | `src/lib/http.js`  |

Pure helpers that belong to no layer (`goals.selectors.js`, `goals.constants.js`) sit at the feature root.

### Goals feature map

```
src/features/goals/
├── api/
│   ├── goals.api.js       # real backend contract (documented at the top of the file)
│   ├── goals.mock.js      # in-browser adapter with seed data, persisted to localStorage
│   └── index.js           # picks mock vs real from VITE_USE_MOCK_API
├── state/goals.context.jsx   # GoalsProvider, reducer, action types, view prefs persistence
├── hooks/
│   ├── useGoals.js        # load / create / update / delete / favorite / complete
│   ├── useGoalsView.js    # filter → sort → group pipeline + view controls
│   ├── useGoalForm.js     # form state, validation, payload mapping
│   └── useGoalsStore.js   # typed access to the context
├── components/            # GoalsHeader, GoalsTable, GoalGroup, GoalRow, GoalFormModal, …
├── pages/GoalsPage.jsx    # composes the above
├── goals.selectors.js     # pure: getProgress, filterGoals, sortGoals, groupGoals
└── goals.constants.js     # impact levels, metric types, colors, columns
```

### Shared building blocks

- `src/components/ui/` — reusable primitives (Button, IconButton, Input, Select, Modal, Popover/MenuItem, Toggle, ProgressRing, Sparkline, Skeleton, EmptyState, Alert). Import from `components/ui/index.js`.
- `src/lib/` — `http.js` (fetch wrapper with cookies + error handling), `date.js`, `storage.js`, `cn.js`.
- `src/layouts/` — `AppLayout` (sidebar + content card) and the `Sidebar`.
- `src/app.navigation.js` — sidebar sections. Add an item here and a route in `app.routes.jsx` to add a screen.

### Adding a new feature (e.g. habits)

1. Copy the folder shape above into `src/features/habits/`.
2. Write `api/habits.api.js` against your backend, plus a mock if you want to build UI first.
3. Add a provider in `state/`, hooks in `hooks/`, and compose a page from `components/ui` primitives.
4. Register the route in `app.routes.jsx` and replace the placeholder entry in `app.navigation.js`.

## Environment

`.env.development` (committed) sets:

```
VITE_API_URL=http://localhost:3000/api
VITE_USE_MOCK_API=true   # set to "false" once /api/goals and /api/life-areas exist
```

Production builds ignore `.env.development`. Set `VITE_API_URL` (e.g. `https://api.example.com/api`)
when building for production; without it the build calls `/api` on its own origin, which only works
if a reverse proxy serves the API there. The API's `FRONTEND_URL` must match the site's origin (CORS).

## Browser tests

```bash
npm run test:e2e        # Playwright: builds the app, starts an isolated API (in-memory DB, fake AI)
```

Specs are in `e2e/`. Failures keep a screenshot and trace in `e2e/.results`; the HTML report is in
`e2e/.report`. Every test also fails on console errors, uncaught exceptions and unexpected API errors.
