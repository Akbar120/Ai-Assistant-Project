/**
 * POST ROUTER
 * Wraps existing /api/post endpoint for multi-platform publishing.
 * Does NOT rewrite logic — delegates to the existing route.
 */

export interface PostRouterInput {
  caption: string;
  hashtags?: string[];
  platforms: string[];
  schedule?: string | null;
  imageFilePath?: string; // server-side path if file was pre-saved
}

export interface PostRouterResult {
  success: boolean;
  results?: Record<string, { success: boolean; error?: string }>;
  error?: string;
}

/**
 * handlePost — called by the API route after orchestrator decides action="post".
 * Delegates to the existing /api/post route which handles Instagram + Twitter + Discord.
 */
export async function handlePost(input: PostRouterInput): Promise<PostRouterResult> {
  const { caption, hashtags = [], platforms, schedule } = input;

  try {
    const fullCaption = hashtags.length > 0
      ? `${caption}\n\n${hashtags.join(' ')}`
      : caption;

    const fd = new FormData();
    fd.append('caption', fullCaption);
    fd.append('platforms', JSON.stringify(platforms));
    fd.append('discordConfig', JSON.stringify(null));
    if (schedule) fd.append('schedule', schedule);

    const res = await fetch('http://localhost:3000/api/post', {
      method: 'POST',
      body: fd,
    });

    const data = await res.json();
    return {
      success: data.success ?? false,
      results: data.results,
      error: data.error,
    };
  } catch (err) {
    const error = err instanceof Error ? err.message : 'Unknown error';
    console.error('[Post Router]', error);
    return { success: false, error };
  }
}
