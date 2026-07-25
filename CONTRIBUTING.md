# Contributing to CivicPulse Bharat

Thanks for helping improve CivicPulse Bharat. This project is a community prototype for civic infrastructure reporting, and contributions of all sizes are welcome.

## Getting started

1. Fork the repository and clone your fork.
2. Install dependencies with `npm install`.
3. Run the prototype locally with `npm run start:prototype`.
4. Build the app with `npm run build` before opening a pull request.

## Project structure

- `src/` contains the React/Vite frontend.
- `server/` contains the Express API and demo persistence layer.
- `public/` stores static assets.

## Contribution guidelines

- Keep changes focused and easy to review.
- Prefer clear component names and descriptive commit messages.
- If you change UI behavior, include a short summary of the update in your pull request.
- Avoid introducing new paid dependencies unless the change clearly improves the prototype.

## Pull request checklist

- [ ] The app builds locally with `npm run build`.
- [ ] The change is documented if it affects setup or workflow.
- [ ] The pull request explains the motivation and expected impact.
