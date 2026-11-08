# Contributing

## Build and test

Requirements are listed in the [README](README.md#requirements).

```sh
mvn -f fleet/pom.xml verify
mvn -f rentals/pom.xml verify
mvn -f tools/spoon-instrumenter/pom.xml verify
cd frontend && npm ci && npm test && npx ng build
```

CI runs the same commands on every push and pull request to `main`.

For changes that touch telemetry, also run the live checks from the README against a running stack: `scripts/verify-functional.mjs`, `scripts/browser.mjs`, `scripts/verify-telemetry.mjs` and `scripts/verify-privacy.mjs --logs logs`. Span names, attribute keys and log fields are read by these scripts; [docs/telemetry.md](docs/telemetry.md) lists them.

## Commit messages

Use [Conventional Commits](https://www.conventionalcommits.org/): `type(scope): summary`, for example `fix(rentals): return 404 for an unknown reference` or `docs: describe the Collector comparison`. Common types are `feat`, `fix`, `docs`, `test`, `refactor`, `build` and `ci`. Scopes are the top-level directories: `fleet`, `rentals`, `frontend`, `observability`, `scripts`, `instrumenter`.
