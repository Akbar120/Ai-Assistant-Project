# Skill: Web Research Strategy

## Description
This skill teaches a standard AI agent how to perform deep web analysis without falling into infinite loops.

## Tool Access Required
- `search_web`
- `scrape_page`

## Execution Steps
1. Take the user's primary goal and break it down into 3-4 distinct search queries.
2. Execute `search_web` for each query.
3. If search results mention a highly authoritative link, use `scrape_page` to read the full content.
4. Provide a synthesized summarization of findings in JSON format.
5. Identify areas lacking info and do 1 final targeted search.

## Limits
- Do not exceed 5 searches per invocation.
- Ignore pages with heavy paywalls.
