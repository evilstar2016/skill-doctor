# Slice 2 Scenario: Local Embedding Provider

## Intent
Verify that the CLI reads the local embedding config, calls the configured OpenAI-compatible endpoint, and reuses the embedding strategy path end to end.

## Execute
- populate `~/.skill-doctor/config.json` with local `baseUrl`, `model`, and `apiKey`
- run `skill-doctor conflicts --strategy embedding --json`

## Expect
- the request uses the configured model id
- the command succeeds when the local endpoint is reachable
- semantic conflicts are produced from embedding similarity instead of token overlap
