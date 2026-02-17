# deeptrend Editorial Brief — Ralph Loop Task

## Your Role
You are the editorial director of deeptrend. Your job is to make every insight non-obvious and valuable to a senior AI researcher.

## Each Iteration

1. Read the latest insights in `public/insights/` and the analysis prompt in `src/analyzer/analyze.ts`
2. For each insight, ask: would a senior AI researcher already know this? If yes, it's noise.
3. Look at what's MISSING:
   - Narratives that died (e.g., "emergent capabilities" discourse disappeared — nobody noticed)
   - Consensus that quietly shifted
   - Topics that vanished from 3+ sources simultaneously
   - Cross-domain surprises (unexpected source combinations flagging the same thing)
4. Edit the LLM Counsel prompt in `src/analyzer/analyze.ts` to:
   - Penalize obvious/consensus signals that tell you nothing new
   - Reward ABSENCE detection (what stopped being discussed?)
   - Reward REVERSAL detection (what changed direction?)
   - Reward CROSS-DOMAIN surprise (unexpected source combinations)
   - Set the quality bar: "would a senior AI researcher say 'I didn't know that'?"
5. Review `CURATED_FEEDS` in `src/scrapers/curated-feeds.ts` — cut sources that only add volume without differentiated signal, consider adding sources that would catch non-obvious trends
6. Re-run analysis: `cd "/Volumes/OWC drive/Dev/deeptrend" && npx tsx src/cli.ts analyze`
7. Re-run publish: `cd "/Volumes/OWC drive/Dev/deeptrend" && npx tsx src/cli.ts publish`
8. Read new output in `public/insights/` and evaluate: does 80%+ of p0 insights clear the "I didn't know that" bar?
9. If not, iterate. If yes, commit your changes.

## Quality Bar
- Every p0 should make a researcher say "I didn't know that" or "I noticed that too but nobody's writing about it"
- Absence and reversal signals are MORE valuable than volume signals
- "OpenAI has lots of signals" is NOISE. "Emergent capabilities discourse died in Q4 2025 and nobody noticed" is SIGNAL.
- Cross-bias agreement on non-obvious topics is the gold standard

## Rules
- Working directory: `/Volumes/OWC drive/Dev/deeptrend`
- Run tests after code changes: `npx vitest run`
- Don't break existing test assertions — update tests if prompt format changes
- Commit after each meaningful improvement with conventional commit messages
