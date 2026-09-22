This directory exists only because Firebase Hosting requires a `public`
directory to deploy, even when every request is rewritten elsewhere.

It is deliberately empty otherwise. `firebase.json`'s `hosting.rewrites`
sends every request (`**`) straight to the `blaze-break` Cloud Run
service, so nothing in this directory is ever actually served — adding
a real file here (or pointing `public` at `dist/`) would let Firebase
Hosting serve its own, separately-deployed copy of a build for any
exact-path match, ahead of the rewrite. That reintroduces the same
"stale cached build" failure mode already fixed once for the service
worker (see `public/sw.js`), just at the Hosting layer instead — two
places serving the app's static assets on two different deploy
schedules is a real footgun, not a hypothetical one.

See `docs/DEPLOY.md` §8 for the full custom-domain setup this supports.
