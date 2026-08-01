# CivicPulse Bharat

A free-resource prototype for India’s community-powered infrastructure operating system.

What this prototype demonstrates
- Citizen issue reporting intake with a React-driven UI
- AI classification of reports into category, severity, authenticity, and affected population
- Priority ranking of issues on the homepage
- Contractor allotment workflow and transparent repair tracking
- News and funding updates for patrons and authorities
- Interactive map using OpenStreetMap/Leaflet instead of paid map APIs

Technology choices used in the prototype
- Frontend: React + Vite
- Backend: Node.js + Express
- Data store: SQLite file-backed persistence using sql.js for a free local database alternative
- Cache layer: NodeCache for short-lived API caching to speed up dashboard and issue list access
- Maps: Leaflet + OpenStreetMap tiles
- Authentication: demo-local flow in the prototype (free alternative to Firebase Authentication)
- Storage: local app-side demo persistence (free alternative to cloud storage)



Open the app at https://civicpulsebharat.vercel.app



Prototype workflow
1. Citizen reports issue through the form
2. Backend classifies category/severity and estimates affected people   using ai
3. Priority queue ranks the issue on the homepage
4. Contractor and progress status are surfaced in the dashboard
5. News and funding sections show public transparency updates
