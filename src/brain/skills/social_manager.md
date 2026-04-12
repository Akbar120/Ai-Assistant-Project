# Skill: Social Media Orchestration

## Description
This skill enables Jenny to manage cross-platform communications, posting, and content drafting using the provided system tools.

## Tool Access
- `instagram_dm`: Use for sending direct messages to users on Instagram, Twitter, or Discord.
- `platform_post`: Use for publishing feed posts, images, and captions.
- `caption_manager`: Use for generating and presenting caption ideas to the user.

## Decision Logic
1. **DMs:** If the user mentions "sending", "dm", "message", or "puch/bata" to a specific person, trigger `instagram_dm`.
2. **Posting:** If the user mentions "post", "publish", "dal do", or "live", trigger `platform_post`.
3. **Drafting:** If the user asks for "ideas", "captions", or "suggestions", trigger `caption_manager`.

## Multi-Step Capability
If a user asks to "Research X and then DM it to Y", spawn a `Research_Agent` first, then take the output and trigger `instagram_dm`.
