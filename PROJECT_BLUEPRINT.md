# CivicPulse Bharat — Project Blueprint

## 1. Project purpose

CivicPulse Bharat is a community-powered civic-infrastructure reporting prototype. Citizens report visible public issues using photographs and a location; a local vision model classifies the issue so it can enter a severity-ordered public work queue.

The current prototype focuses on demonstrating the end-to-end reporting workflow rather than authentication, official government integrations, or production-grade operations.

## 2. What the application does today

- Lets a citizen attach **one to four** JPG, PNG, or WebP photos of a civic issue.
- Allows a citizen to remove any selected photo before submitting the report.
- Uses AI vision to classify the images into a civic category, confidence score, and severity.
- Lets the citizen search for an address and centre the map on that location.
- Persists the report and its images locally.
- Shows reported issues on an interactive map and in a severity-ranked priority queue.
- Displays an operational dashboard, civic funding information, patron advertisements, and news items.
- Lets any current user remove an issue entry. This is a demo capability and is not protected by authentication.

## 3. User journey

```text
Citizen
  │
  ├─ Selects 1–4 photos
  │      └─ Can remove any selection before continuing
  │
  ├─ Browser sends base64 image data to POST /api/analyze-image
  │      └─ Vision model classifies every photo
  │      └─ Highest-confidence classification becomes the report result
  │
  ├─ Selects / searches an address on the map
  │
  └─ Submits the report to POST /api/issues
         ├─ Server validates and analyzes the images again (cached when possible)
         ├─ Server saves the images in server/uploads/
         ├─ Server saves report metadata in SQLite
         └─ React reloads map, queue, and dashboard data
```

## 4. Architecture

```text
┌──────────────────────────────── Browser ────────────────────────────────┐
│ React + Vite UI                                                          │
│ - photo selection/removal and preview                                    │
│ - AI-result display                                                      │
│ - Leaflet/OpenStreetMap map                                              │
│ - dashboard, reports, news                                               │
└───────────────────────┬─────────────────────────────────────────────────┘
                        │ HTTP / JSON
                        ▼
┌──────────────────────── Node.js / Express API ──────────────────────────┐
│ GET  /api/issues       GET /api/dashboard       GET /api/news            │
│ POST /api/analyze-image  POST /api/issues       DELETE /api/issues/:id   │
│                                                                         │
│ AI: Transformers.js + CLIP zero-shot image classification               │
│ Cache: NodeCache                                                        │
└─────────────┬─────────────────────────────┬─────────────────────────────┘
              │                             │
              ▼                             ▼
     SQLite file: server/data/      Issue photos: server/uploads/
       civicpulse.sqlite              exposed at /uploads/<file>
```

The Express server can serve the compiled Vite frontend from `dist/`, but the current deployment uses a split frontend/API topology described in the deployment section below.

## 5. AI image-classification design

### Model

The feature uses `Xenova/clip-vit-base-patch32` through `@xenova/transformers` and the `zero-shot-image-classification` pipeline.

CLIP compares an image with supplied natural-language labels instead of relying on a custom-trained civic dataset. The first real image request initializes the model; if the model is not already cached, its model files must be downloaded from the model host. The cached files are reused on later requests.

### Candidate categories

| Civic category | Image prompt supplied to CLIP |
| --- | --- |
| Road Repair | A pothole, cracked road, or damaged pavement |
| Drainage | An overflowing drain, blocked gutter, or open sewer |
| Water Supply | A leaking pipe, water leak, or broken water supply |
| Public Safety | A broken streetlight, unsafe public space, or exposed hazard |
| Waste Management | Garbage, illegal dumping, or overflowing waste |
| Urban Greening | A fallen tree, damaged park, or neglected greenery |
| Traffic | A broken traffic signal, traffic obstruction, or damaged road sign |
| General Infrastructure | Damaged public infrastructure |

### Multi-image decision rule

Each selected image is classified separately. The category with the highest individual confidence score becomes the report's primary category. The response retains the analysis for every photo in `photoAnalyses`.

### Severity rule

Severity is a transparent application rule applied after category detection:

| Detected category | Severity |
| --- | --- |
| Drainage, Public Safety | High |
| Road Repair, Water Supply, Traffic, Waste Management | Medium |
| Urban Greening, General Infrastructure | Low |

This rule is an initial triage mechanism, not a safety guarantee. The current UI does not yet provide a citizen category-override or an authenticated staff-review workflow.

## 6. Frontend blueprint

### Main files

| File | Responsibility |
| --- | --- |
| `src/main.jsx` | React entry point. |
| `src/App.jsx` | Dashboard UI, report form, map, API calls, photo selection/removal, and local view state. |
| `src/styles.css` | Responsive visual system and components, including upload/image-gallery styling. |
| `src/config.js` | Builds API URLs from `VITE_API_BASE_URL`. |
| `vite.config.js` | Vite setup and local `/api` development proxy. |

### Major UI areas

1. **Hero and view switcher** — changes between the home dashboard and news/patrons view.
2. **Statistics grid** — open issues, high severity count, verification count, and funding total.
3. **Map** — Leaflet map with OpenStreetMap tiles, issue markers, and searched-location marker.
4. **Photo-based report intake** — multi-file upload, previews, remove buttons, AI analysis result, address lookup, and submission.
5. **Priority queue** — issue cards, AI summary, saved photo gallery, status, and delete control.
6. **Progress/news panels** — top priority data, revenue channels, funding updates, and sponsor information.

### Client request sequence

| UI action | API request | Result |
| --- | --- | --- |
| First dashboard load | `GET /api/issues`, `GET /api/dashboard`, `GET /api/news` | Renders app data. |
| Address search | OpenStreetMap Nominatim request | Updates latitude, longitude, and map position. |
| Add/remove a photo | `POST /api/analyze-image` when one or more photos remain | Refreshes AI result. |
| Submit report | `POST /api/issues` | Saves report; then reloads dashboard data. |
| Remove issue | `DELETE /api/issues/:id` | Deletes database report and all saved image files. |

## 7. Backend blueprint

### Main file

`server/index.js` contains the complete Express application, local AI initialization, SQLite persistence, image storage, seeded demo content, cache management, API routes, and production static-file serving.

### API contract

| Route | Method | Purpose |
| --- | --- | --- |
| `/api/health` | `GET` | Reports service, database, cache, and vision-model state. |
| `/api/issues` | `GET` | Returns all saved issue reports. |
| `/api/analyze-image` | `POST` | Analyzes `images` (one to four base64 data URLs); returns primary analysis and per-photo analyses. |
| `/api/issues` | `POST` | Re-analyzes supplied images, stores them, creates and persists an issue. |
| `/api/issues/:id` | `DELETE` | Deletes a report and its associated stored photos. |
| `/api/dashboard` | `GET` | Returns counts, priority queue, and revenue data. |
| `/api/news` | `GET` | Returns seeded news, sponsor, and fund-allocation data. |
| `/uploads/<file>` | `GET` | Serves a previously stored issue image. |

### Image-upload constraints

- File types: `image/jpeg`, `image/png`, and `image/webp`.
- Maximum images per report: 4.
- Maximum size per source image: 5 MB.
- JSON request-body limit: 30 MB, to accommodate base64 encoding of several images.
- Images are written with generated UUID filenames, not the original filename.

### Caching

`node-cache` reduces repeated processing:

- General dashboard/issues/news cache: 300 seconds.
- Image analysis cache: 3,600 seconds, keyed using a SHA-256 hash of each image data URL.

## 8. Data model

The SQLite database is stored at `server/data/civicpulse.sqlite`.

### `issues` table

| Column | Meaning |
| --- | --- |
| `id` | Generated issue ID. |
| `title` | Generated from the detected category. |
| `description` | AI-generated detection summary. |
| `category` | Primary civic category selected by the vision model. |
| `location`, `lat`, `lng` | Citizen-provided/searched location. |
| `severity` | App-level priority classification. |
| `authenticity` | AI confidence note; manual review remains pending. |
| `affectedPeople` | Demo estimate based on category. |
| `status`, `contractor` | Demo work-order state. |
| `summary` | AI detection summary. |
| `photo_url` | First image path, retained for compatibility. |
| `photo_urls` | JSON array of all image paths. |
| `created_at` | Creation time in milliseconds. |

The app creates/migrates missing image columns during initialization and seeds three demo reports when the table is empty.

## 9. Detailed technology stack

| Layer | Technology | Current use |
| --- | --- | --- |
| Language/runtime | JavaScript, Node.js | Frontend build and Express backend. |
| Frontend framework | React 18.3.1 | Component-based interface and state management. |
| Frontend build tool | Vite 5.4.10 | Development server and optimized production build. |
| Mapping | Leaflet 1.9.4 + React Leaflet 4.2.1 | Interactive issue-location map and markers. |
| Map tiles | OpenStreetMap | Free basemap tiles. |
| Geocoding | OpenStreetMap Nominatim | Converts address search into coordinates. |
| Backend framework | Express 4.21.0 | REST API, static hosting, uploads access, and routing. |
| CORS | cors 2.8.5 | Allows frontend/API communication when separately hosted. |
| AI runtime | `@xenova/transformers` 2.17.2 | Runs the local JavaScript inference pipeline. |
| Vision model | `Xenova/clip-vit-base-patch32` | Zero-shot image classification against civic prompts. |
| Database engine | sql.js 1.14.1 | SQLite-compatible database in Node.js. |
| Persistence | File-backed SQLite export | Writes database bytes to `server/data/civicpulse.sqlite`. |
| Server cache | node-cache 5.1.2 | Caches response data and AI analysis results. |
| Development process runner | concurrently 9.0.0 | Starts Vite and Express together with `npm run dev`. |
| Frontend hosting | Vercel | Hosts the built React/Vite application at `https://civicpulsebharat.vercel.app/`. |
| Backend hosting | Render | Hosts the Express API configured as `https://backend-civicpulse.onrender.com`. |

## 10. Running locally

### Prerequisites

- Node.js 18+ recommended.
- Internet access for the first CLIP model download, unless the model cache is already populated.

### Commands

```bash
npm install
npm run dev
```

Open `http://localhost:5173`.

Other useful commands:

```bash
npm run build       # creates the production frontend in dist/
npm start           # runs the Express server on port 3001 by default
npm run preview     # previews the built Vite frontend
```

The backend port can be changed using the `PORT` environment variable. For the deployed Vercel frontend, `VITE_API_BASE_URL` must be set at build time to `https://backend-civicpulse.onrender.com`; see `.env.example`.

## 11. Deployment blueprint

### Current deployed topology

```text
Browser
  │
  ▼
Vercel frontend: https://civicpulsebharat.vercel.app/
  │  VITE_API_BASE_URL
  ▼
Render backend: https://backend-civicpulse.onrender.com
  │
  ├─ Express API + CLIP image inference
  ├─ SQLite database: server/data/civicpulse.sqlite
  └─ Uploaded images: server/uploads/
```

Vercel serves the static React/Vite build. Render runs the stateful Express server, AI inference, SQLite persistence, and image-file serving. The backend enables CORS so the Vercel domain can make API requests.

### Vercel frontend configuration

| Setting | Value |
| --- | --- |
| Framework | Vite / React |
| Build command | `npm run build` |
| Output directory | `dist` |
| Production URL | `https://civicpulsebharat.vercel.app/` |
| Required build environment variable | `VITE_API_BASE_URL=https://backend-civicpulse.onrender.com` |

`VITE_API_BASE_URL` is embedded into the frontend during the Vercel build. After changing it, redeploy the Vercel project for the new API URL to take effect.

### Render backend configuration

```text
Build command: npm install && npm run build
Start command: npm start
Service type: long-running Node web service
Public API URL: https://backend-civicpulse.onrender.com
```

Render supplies the `PORT` environment variable used by Express. The backend's static `dist/` serving is harmless in this split topology, but Vercel is the public frontend host.

### Essential deployment requirements

1. **Persistent Render disk** — both `server/data` and `server/uploads` must survive backend restarts/redeployments. Configure a persistent disk or move these resources to managed database/object storage.
2. **First-model-download access** — the Render service needs outbound network access to obtain CLIP model files on first use, or a pre-warmed model cache/image must be supplied.
3. **Adequate Render resources** — vision-model loading needs materially more memory and disk space than a simple CRUD API.
4. **Vercel build environment** — set `VITE_API_BASE_URL=https://backend-civicpulse.onrender.com` in Vercel for Production (and Preview if required).
5. **HTTPS and upload limits** — confirm that Vercel, Render, and any proxy between them accept the app's 30 MB JSON request body.
6. **CORS restrictions** — `cors()` currently allows all origins. Restrict it to the Vercel frontend domain before a production launch.

### Current deployment limitations

- Vercel is correctly used only for the static frontend; the current Express + local-filesystem backend is not suitable for Vercel serverless functions.
- Render's default filesystem is ephemeral. Without a persistent disk, SQLite data and uploaded photos can disappear when the service restarts or is redeployed.
- The app has no login, authorization, abuse prevention, rate limiting, or moderation controls.
- CLIP classification can be inaccurate for civic edge cases; there is no in-product correction/appeal flow yet.
- Nominatim and public OpenStreetMap tiles have usage policies; a production implementation should review their policies and consider managed map/geocoding services.

## 12. Recommended next milestones

1. Add a citizen **“AI result is incorrect”** override with a selected category and reason.
2. Add authenticated roles for citizens, community reviewers, contractors, and administrators.
3. Add a staff verification q ueue and retain both AI and user-provided classifications for auditability.
4. Move photos to object storage and replace local SQLite with a managed database for production scale.
5. Add rate limiting, file-content scanning, image moderation, audit logs, and secure deletion policies.
6. Add tests for image validation, multi-photo analysis selection, issue creation/deletion, and API authorization.
7. Introduce status transitions, contractor assignment, citizen notifications, and SLA tracking.
